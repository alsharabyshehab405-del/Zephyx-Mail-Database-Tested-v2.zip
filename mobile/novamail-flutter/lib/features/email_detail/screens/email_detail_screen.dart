import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../l10n/app_localizations.dart';
import '../../email/providers/email_providers.dart';
import '../../email/data/email_repository.dart';

class EmailDetailScreen extends ConsumerWidget {
  final String emailId;
  const EmailDetailScreen({super.key, required this.emailId});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(emailDetailProvider(emailId));
    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        actions: [
          state.when(
            data: (email) => IconButton(
              icon: Icon(email.isStarred ? Icons.star : Icons.star_border),
              onPressed: () async {
                await ref.read(emailRepositoryProvider).toggleStar(email.id);
                ref.invalidate(emailDetailProvider(emailId));
              },
            ),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          state.when(
            data: (email) => IconButton(
              icon: const Icon(Icons.delete_outline),
              onPressed: () async {
                await ref.read(emailRepositoryProvider).trash(email.id);
                if (context.mounted) context.pop();
              },
            ),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
        ],
      ),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('$error')),
        data: (email) => _body(context, ref, email),
      ),
    );
  }

  Future<void> _showActionCenter(BuildContext context, WidgetRef ref, EmailModel email, AppLocalizations l10n) async {
    showDialog<void>(context: context, barrierDismissible: false, builder: (_) => AlertDialog(content: Row(children: [const CircularProgressIndicator(), const SizedBox(width: 16), Text(l10n.text('loading'))])));
    try {
      final actionsResult = await ref.read(emailRepositoryProvider).getActions(email.id);
      final priorityResult = await ref.read(emailRepositoryProvider).getPriority(email.id);
      if (context.mounted) Navigator.of(context).pop();
      if (!context.mounted) return;
      final rawActions = actionsResult['actions'];
      final actions = rawActions is List
          ? rawActions.whereType<Map>().map((item) => item.cast<String, dynamic>()).toList(growable: false)
          : const <Map<String, dynamic>>[];
      final priority = priorityResult['priority']?.toString();
      final score = priorityResult['score'];
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: Text(l10n.text('actionCenter')),
          content: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (priority != null) Text('${l10n.text('priority')}: $priority${score is num ? ' (${l10n.text('priorityScore')}: ${score.toStringAsFixed(2)})' : ''}'),
                const SizedBox(height: 8),
                Text(l10n.text('deterministicActionCenter')),
                const SizedBox(height: 12),
                if (actions.isEmpty) Text(l10n.text('noActions'))
                else ...actions.map((item) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text('${item['type'] ?? ''}\n${l10n.text('actionReason')}: ${item['reason'] ?? ''}\n${l10n.text('sourceSignal')}: ${item['sourceSignal'] ?? ''}'),
                )),
              ],
            ),
          ),
          actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.text('close')))],
        ),
      );
    } catch (_) {
      if (context.mounted) Navigator.of(context).pop();
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.text('aiComposeFailed'))));
    }
  }

  Future<void> _showSummary(BuildContext context, WidgetRef ref, EmailModel email, AppLocalizations l10n) async {
    showDialog<void>(context: context, barrierDismissible: false, builder: (_) => AlertDialog(content: Row(children: [const CircularProgressIndicator(), const SizedBox(width: 16), Text(l10n.text('loading'))])));
    try {
      final result = await ref.read(emailRepositoryProvider).summarize(email.id);
      if (context.mounted) Navigator.of(context).pop();
      if (!context.mounted) return;
      final notConfigured = result['state'] == 'NOT_CONFIGURED';
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: Text(l10n.text('smartSummary')),
          content: SingleChildScrollView(child: Text(notConfigured ? l10n.text('aiNotConfigured') : _summaryText(result, l10n))),
          actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.text('close')))],
        ),
      );
    } catch (error) {
      if (context.mounted) Navigator.of(context).pop();
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.text('summaryFailed'))));
    }
  }

  String _summaryText(Map<String, dynamic> result, AppLocalizations l10n) {
    final parts = <String>[];
    final summary = result['summary'];
    if (summary is String && summary.isNotEmpty) parts.add(summary);
    for (final entry in <String, String>{'keyPoints': l10n.text('keyPoints'), 'actionItems': l10n.text('actionItems'), 'importantDates': l10n.text('importantDates'), 'deadlines': l10n.text('deadlines'), 'amounts': l10n.text('amounts'), 'peopleAndOrganizations': l10n.text('peopleAndOrganizations')}.entries) {
      final values = result[entry.key];
      if (values is List && values.whereType<String>().isNotEmpty) parts.add('${entry.value}:\n${values.whereType<String>().join('\n')}');
    }
    final next = result['suggestedNextAction'];
    if (next is String && next.isNotEmpty) parts.add('${l10n.text('suggestedNextAction')}: $next');
    return parts.join('\n\n');
  }

  Widget _body(BuildContext context, WidgetRef ref, EmailModel email) {
    final l10n = AppLocalizations.of(context);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(emailDetailProvider(emailId)),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            email.subject.isEmpty ? l10n.text('noSubject') : email.subject,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              CircleAvatar(
                child: Text(
                  email.fromEmail.isEmpty
                      ? '?'
                      : email.fromEmail[0].toUpperCase(),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      email.fromName ?? email.fromEmail,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    Text(email.fromEmail),
                  ],
                ),
              ),
              IconButton(
                icon: Icon(
                  email.isRead
                      ? Icons.mark_email_unread_outlined
                      : Icons.drafts_outlined,
                ),
                onPressed: () async {
                  await ref
                      .read(emailRepositoryProvider)
                      .setRead(email.id, !email.isRead);
                  ref.invalidate(emailDetailProvider(emailId));
                },
              ),
            ],
          ),
          const Divider(height: 28),
          SelectableText(
            email.bodyText.isNotEmpty ? email.bodyText : email.bodyHtml,
          ),
          if (email.attachments.isNotEmpty) ...[
            const Divider(height: 28),
            Text(
              l10n.text('attachments'),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            ...email.attachments.map(
              (a) => ListTile(
                leading: const Icon(Icons.attach_file),
                title: Text(a.filename),
                subtitle: Text('${a.size} bytes'),
                onTap: () async {
                  try {
                    final file = await ref
                        .read(emailRepositoryProvider)
                        .downloadAttachment(a);
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                            content: Text(
                                '${l10n.text('downloaded')}: ${file.path}')),
                      );
                    }
                  } catch (error) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('$error')),
                      );
                    }
                  }
                },
                trailing: IconButton(
                  icon: const Icon(Icons.share_outlined),
                  onPressed: () =>
                      ref.read(emailRepositoryProvider).shareAttachment(a),
                ),
              ),
            ),
          ],
          const SizedBox(height: 24),
          Row(
            children: [
              OutlinedButton.icon(
                onPressed: () => _showSummary(context, ref, email, l10n),
                icon: const Icon(Icons.auto_awesome_outlined),
                label: Text(l10n.text('smartSummary')),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                onPressed: () => context.push('/compose?replyTo=${email.id}'),
                icon: const Icon(Icons.reply),
                label: Text(l10n.text('reply')),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                onPressed: () => context.push('/compose?replyAll=${email.id}'),
                icon: const Icon(Icons.reply_all),
                label: Text(l10n.text('replyAll')),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                onPressed: () => context.push('/compose?forward=${email.id}'),
                icon: const Icon(Icons.forward),
                label: Text(l10n.text('forward')),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: OutlinedButton.icon(
              onPressed: () => _showActionCenter(context, ref, email, l10n),
              icon: const Icon(Icons.list_alt_outlined),
              label: Text(l10n.text('actionCenter')),
            ),
          ),
        ],
      ),
    );
  }
}
