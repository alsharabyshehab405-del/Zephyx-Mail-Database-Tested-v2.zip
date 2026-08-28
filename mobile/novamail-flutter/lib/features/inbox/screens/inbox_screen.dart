import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/brand_mark.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/providers/auth_provider.dart';
import '../../email/data/email_repository.dart';
import '../../email/providers/email_providers.dart';

class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({super.key});
  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends ConsumerState<InboxScreen> {
  final searchController = TextEditingController();
  Timer? searchTimer;
  String folder = 'inbox';
  String? search;
  String? category;
  String? nextCursor;
  final List<EmailModel> moreEmails = [];
  @override
  void dispose() {
    searchTimer?.cancel();
    searchController.dispose();
    super.dispose();
  }

  void updateSearch(String value) {
    searchTimer?.cancel();
    searchTimer = Timer(
      const Duration(milliseconds: 350),
      () => setState(() {
        search = value.trim().isEmpty ? null : value.trim();
        nextCursor = null;
        moreEmails.clear();
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final request = EmailListRequest(folder: folder, search: search, category: category);
    final page = ref.watch(emailPageProvider(request));
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          children: [
            const BrandMark(compact: true),
            const SizedBox(width: 10),
            Text(l10n.text('inbox')),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: l10n.text('settings'),
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      drawer: _drawer(context, l10n),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
            child: TextField(
              controller: searchController,
              onChanged: updateSearch,
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search_rounded),
                  filled: true,
                  labelText: l10n.text('search'),
                  hintText: l10n.text('search'),
                suffixIcon: searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          searchController.clear();
                          setState(() => search = null);
                        },
                      )
                    : null,
              ),
            ),
          ),
          Expanded(
            child: page.when(
              data: (value) {
                final combined = EmailPage(
                  emails: [...value.emails, ...moreEmails],
                  nextCursor: nextCursor ?? value.nextCursor,
                  unreadCount: value.unreadCount,
                  total: value.total,
                  categoryCounts: value.categoryCounts,
                );
                return _EmailList(
                  page: combined,
                  onRefresh: () async =>
                      ref.invalidate(emailPageProvider(request)),
                  onAction: _action,
                  category: category,
                  onCategoryFilterChanged: (next) => setState(() {
                    category = next;
                    nextCursor = null;
                    moreEmails.clear();
                  }),
                  onCategoryChange: (next, email) async {
                    if (email.id.isEmpty) return;
                    await ref.read(emailRepositoryProvider).updateCategory(email.id, next);
                    if (mounted) ref.invalidate(emailPageProvider(request));
                  },
                  onLoadMore: (nextCursor ?? value.nextCursor) == null
                      ? null
                      : () async {
                          final next =
                              await ref.read(emailRepositoryProvider).list(
                                    folder: folder,
                                    cursor: nextCursor ?? value.nextCursor,
                                    search: search,
                                    category: category,
                                  );
                          if (mounted) {
                            setState(() {
                              moreEmails.addAll(next.emails);
                              nextCursor = next.nextCursor;
                            });
                          }
                        },
                );
              },
              loading: () => Semantics(
                    container: true,
                    liveRegion: true,
                    label: l10n.text('loading'),
                    child: const Center(child: CircularProgressIndicator()),
                  ),
              error: (error, _) => _ErrorState(
                message: l10n.text('offline'),
                onRetry: () => ref.invalidate(emailPageProvider(request)),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'compose-fab',
        onPressed: () => context.push('/compose'),
        icon: const Icon(Icons.edit_outlined),
        label: Text(l10n.text('compose')),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
    );
  }

  Drawer _drawer(BuildContext context, AppLocalizations l10n) => Drawer(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            DrawerHeader(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppColors.primary, AppColors.cyan],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: Align(
                alignment: Alignment.bottomLeft,
                child: Row(
                  children: [
                    const BrandMark(compact: true),
                    const SizedBox(width: 10),
                    Text(
                      'Zephyx Mail',
                      style: Theme.of(context)
                          .textTheme
                          .titleLarge
                          ?.copyWith(color: Colors.white),
                    ),
                  ],
                ),
              ),
            ),
            for (final item in const [
              ('inbox', Icons.inbox_outlined),
              ('starred', Icons.star_border_outlined),
              ('sent', Icons.send_outlined),
              ('drafts', Icons.drafts_outlined),
              ('trash', Icons.delete_outline),
            ])
              ListTile(
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                leading: Icon(item.$2),
                title: Text(l10n.text(item.$1)),
                selected: folder == item.$1,
                selectedColor: Theme.of(context).colorScheme.primary,
                selectedTileColor:
                    Theme.of(context).colorScheme.primary.withValues(alpha: .1),
                onTap: () {
                  setState(() {
                    folder = item.$1;
                    nextCursor = null;
                    moreEmails.clear();
                  });
                  Navigator.pop(context);
                },
              ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.dashboard_customize_outlined),
              title: Text(l10n.text('productivityDashboard')),
              onTap: () => context.go('/workspace'),
            ),
            ListTile(
              leading: const Icon(Icons.logout_outlined),
              title: Text(l10n.text('signOut')),
              onTap: () async {
                await ref.read(authStateNotifierProvider.notifier).logout();
                if (context.mounted) context.go('/login');
              },
            ),
          ],
        ),
      );
  Future<void> _action(String action, EmailModel email) async {
    final repo = ref.read(emailRepositoryProvider);
    if (action == 'star') await repo.toggleStar(email.id);
    if (action == 'read') await repo.setRead(email.id, !email.isRead);
    if (action == 'trash') await repo.trash(email.id);
    ref.invalidate(
      emailPageProvider(EmailListRequest(folder: folder, search: search, category: category)),
    );
  }
}

class _EmailList extends StatelessWidget {
  final EmailPage page;
  final Future<void> Function() onRefresh;
  final Future<void> Function(String, EmailModel) onAction;
  final String? category;
  final ValueChanged<String?> onCategoryFilterChanged;
  final Future<void> Function(String, EmailModel) onCategoryChange;
  final VoidCallback? onLoadMore;
  const _EmailList({
    required this.page,
    required this.onRefresh,
    required this.onAction,
    this.category,
    required this.onCategoryFilterChanged,
    required this.onCategoryChange,
    this.onLoadMore,
  });
  @override
  Widget build(BuildContext context) {
    if (page.emails.isEmpty)
      return RefreshIndicator(
        onRefresh: onRefresh,
        child: ListView(
          children: [
            _CategoryFilter(selected: category, counts: page.categoryCounts, onChanged: onCategoryFilterChanged),
            SizedBox(height: MediaQuery.sizeOf(context).height * .35),
            Semantics(
              container: true,
              label: AppLocalizations.of(context).text('emptyInbox'),
              child: Center(
                child: Text(AppLocalizations.of(context).text('emptyInbox')),
              ),
            ),
          ],
        ),
      );
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.separated(
        itemCount: page.emails.length + 1 + (onLoadMore == null ? 0 : 1),
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          if (index == 0) return _CategoryFilter(selected: category, counts: page.categoryCounts, onChanged: onCategoryFilterChanged);
          final emailIndex = index - 1;
          if (onLoadMore != null && emailIndex == page.emails.length)
            return TextButton(
              onPressed: onLoadMore,
              child: Text(AppLocalizations.of(context).text('loadMore')),
            );
          final email = page.emails[emailIndex];
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Card(
              clipBehavior: Clip.antiAlias,
              child: ListTile(
                onTap: () => context.push('/email/${email.id}'),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                leading: CircleAvatar(
                  child: Text(
                    email.fromEmail.isEmpty
                        ? '?'
                        : email.fromEmail[0].toUpperCase(),
                  ),
                ),
                title: Text(
                  email.subject.isEmpty
                      ? AppLocalizations.of(context).text('noSubject')
                      : email.subject,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight:
                        email.isRead ? FontWeight.normal : FontWeight.bold,
                  ),
                ),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(email.fromName ?? email.fromEmail, maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 3),
                    Text(_categoryLabel(AppLocalizations.of(context), email.category), style: Theme.of(context).textTheme.labelSmall),
                  ],
                ),
                trailing: Wrap(
                  spacing: 0,
                  children: [
                    PopupMenuButton<String>(
                      tooltip: AppLocalizations.of(context).text('correctCategory'),
                      icon: const Icon(Icons.label_outline),
                      onSelected: (value) async {
                        try {
                          await onCategoryChange(value, email);
                        } catch (_) {
                          if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context).text('categorySaveFailed'))));
                        }
                      },
                      itemBuilder: (_) => emailCategories.map((value) => PopupMenuItem<String>(value: value, child: Text(_categoryLabel(AppLocalizations.of(context), value)))).toList(),
                    ),
                    IconButton(
                      icon: Icon(
                          email.isStarred ? Icons.star : Icons.star_border),
                      onPressed: () => onAction('star', email),
                    ),
                    IconButton(
                      icon: Icon(
                        email.isRead
                            ? Icons.mark_email_unread_outlined
                            : Icons.drafts_outlined,
                      ),
                      onPressed: () => onAction('read', email),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

String _categoryLabel(AppLocalizations l10n, String category) {
  switch (category) {
    case 'primary': return l10n.text('categoryPrimary');
    case 'work': return l10n.text('categoryWork');
    case 'social': return l10n.text('categorySocial');
    case 'promotions': return l10n.text('categoryPromotions');
    case 'newsletters': return l10n.text('categoryNewsletters');
    case 'orders': return l10n.text('categoryOrders');
    case 'travel': return l10n.text('categoryTravel');
    case 'finance': return l10n.text('categoryFinance');
    case 'bills': return l10n.text('categoryBills');
    case 'events': return l10n.text('categoryEvents');
    case 'security': return l10n.text('categorySecurity');
    case 'spam': return l10n.text('categorySpam');
    default: return category;
  }
}

class _CategoryFilter extends StatelessWidget {
  final String? selected;
  final Map<String, int> counts;
  final ValueChanged<String?> onChanged;
  const _CategoryFilter({required this.selected, required this.counts, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final values = <String?>[null, ...emailCategories];
    return Semantics(
      container: true,
      label: l10n.text('categoryFilters'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
        child: Wrap(
          spacing: 6,
          runSpacing: 4,
          children: values.map((value) {
            final label = value == null ? l10n.text('categoryAll') : _categoryLabel(l10n, value);
            final count = value == null ? counts.values.fold<int>(0, (sum, item) => sum + item) : counts[value] ?? 0;
            return ChoiceChip(
              label: Text('$label ($count)'),
              selected: selected == value,
              onSelected: (_) => onChanged(value),
              labelStyle: Theme.of(context).textTheme.labelSmall,
            );
          }).toList(growable: false),
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorState({required this.message, required this.onRetry});
  @override
  Widget build(BuildContext context) => Semantics(
        container: true,
        liveRegion: true,
        label: message,
        child: Center(
          child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(message),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: onRetry,
              child: Text(AppLocalizations.of(context).text('retry')),
            ),
          ],
        ),
      ),
    );
}
