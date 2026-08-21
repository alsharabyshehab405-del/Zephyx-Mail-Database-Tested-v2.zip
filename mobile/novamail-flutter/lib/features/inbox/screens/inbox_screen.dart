import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/network/api_client.dart';
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
  @override
  void dispose() { searchTimer?.cancel(); searchController.dispose(); super.dispose(); }
  void updateSearch(String value) { searchTimer?.cancel(); searchTimer = Timer(const Duration(milliseconds: 350), () => setState(() => search = value.trim().isEmpty ? null : value.trim())); }
  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final request = EmailListRequest(folder: folder, search: search);
    final page = ref.watch(emailPageProvider(request));
    return Scaffold(
      appBar: AppBar(title: Text(l10n.text('inbox')), actions: [IconButton(icon: const Icon(Icons.settings_outlined), tooltip: l10n.text('settings'), onPressed: () => context.push('/settings'))]),
      drawer: _drawer(context, l10n),
      body: Column(children: [Padding(padding: const EdgeInsets.fromLTRB(12, 8, 12, 4), child: TextField(controller: searchController, onChanged: updateSearch, decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: l10n.text('search'), suffixIcon: searchController.text.isNotEmpty ? IconButton(icon: const Icon(Icons.clear), onPressed: () { searchController.clear(); setState(() => search = null); }) : null))), Expanded(child: page.when(data: (value) => _EmailList(page: value, onRefresh: () async => ref.invalidate(emailPageProvider(request)), onAction: _action, onLoadMore: value.nextCursor == null ? null : () {}), loading: () => const Center(child: CircularProgressIndicator()), error: (error, _) => _ErrorState(message: l10n.text('offline'), onRetry: () => ref.invalidate(emailPageProvider(request))))) ]),
      floatingActionButton: FloatingActionButton.extended(onPressed: () => context.push('/compose'), icon: const Icon(Icons.edit_outlined), label: Text(l10n.text('compose')), backgroundColor: AppColors.primary, foregroundColor: Colors.white),
    );
  }
  Drawer _drawer(BuildContext context, AppLocalizations l10n) => Drawer(child: ListView(padding: EdgeInsets.zero, children: [DrawerHeader(decoration: const BoxDecoration(color: AppColors.primary), child: Align(alignment: Alignment.bottomLeft, child: Text('NovaMail', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)))), for (final item in const [('inbox', Icons.inbox_outlined), ('starred', Icons.star_border_outlined), ('sent', Icons.send_outlined), ('drafts', Icons.drafts_outlined), ('trash', Icons.delete_outline)]) ListTile(leading: Icon(item.$2), title: Text(l10n.text(item.$1)), selected: folder == item.$1, onTap: () { setState(() => folder = item.$1); Navigator.pop(context); }), const Divider(), ListTile(leading: const Icon(Icons.logout_outlined), title: Text(l10n.text('signOut')), onTap: () async { await ref.read(authStateNotifierProvider.notifier).logout(); if (context.mounted) context.go('/login'); })]));
  Future<void> _action(String action, EmailModel email) async { final repo = ref.read(emailRepositoryProvider); if (action == 'star') await repo.toggleStar(email.id); if (action == 'read') await repo.setRead(email.id, !email.isRead); if (action == 'trash') await repo.trash(email.id); ref.invalidate(emailPageProvider(EmailListRequest(folder: folder, search: search))); }
}

class _EmailList extends StatelessWidget {
  final EmailPage page; final Future<void> Function() onRefresh; final Future<void> Function(String, EmailModel) onAction; final VoidCallback? onLoadMore;
  const _EmailList({required this.page, required this.onRefresh, required this.onAction, this.onLoadMore});
  @override Widget build(BuildContext context) { if (page.emails.isEmpty) return RefreshIndicator(onRefresh: onRefresh, child: ListView(children: [SizedBox(height: MediaQuery.sizeOf(context).height * .35), Center(child: Text(AppLocalizations.of(context).text('emptyInbox')))])); return RefreshIndicator(onRefresh: onRefresh, child: ListView.separated(itemCount: page.emails.length + (onLoadMore == null ? 0 : 1), separatorBuilder: (_, __) => const Divider(height: 1), itemBuilder: (context, index) { if (index == page.emails.length) return TextButton(onPressed: onLoadMore, child: Text(AppLocalizations.of(context).text('loadMore'))); final email = page.emails[index]; return ListTile(onTap: () => context.push('/email/${email.id}'), leading: CircleAvatar(child: Text(email.fromEmail.isEmpty ? '?' : email.fromEmail[0].toUpperCase())), title: Text(email.subject.isEmpty ? AppLocalizations.of(context).text('noSubject') : email.subject, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: email.isRead ? FontWeight.normal : FontWeight.bold)), subtitle: Text(email.fromName ?? email.fromEmail, maxLines: 1, overflow: TextOverflow.ellipsis), trailing: Wrap(spacing: 0, children: [IconButton(icon: Icon(email.isStarred ? Icons.star : Icons.star_border), onPressed: () => onAction('star', email)), IconButton(icon: Icon(email.isRead ? Icons.mark_email_unread_outlined : Icons.drafts_outlined), onPressed: () => onAction('read', email))])); })); }
}
class _ErrorState extends StatelessWidget { final String message; final VoidCallback onRetry; const _ErrorState({required this.message, required this.onRetry}); @override Widget build(BuildContext context) => Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [Text(message), const SizedBox(height: 8), OutlinedButton(onPressed: onRetry, child: Text(AppLocalizations.of(context).text('retry')))])); }
