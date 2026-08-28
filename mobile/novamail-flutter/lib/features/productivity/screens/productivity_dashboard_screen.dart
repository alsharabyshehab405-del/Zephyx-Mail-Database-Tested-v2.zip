import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/offline/offline_foundation.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../l10n/app_localizations.dart';

class ProductivityDashboardScreen extends ConsumerStatefulWidget {
  const ProductivityDashboardScreen({super.key, this.loadWorkspace});

  final Future<Map<String, dynamic>> Function()? loadWorkspace;

  @override
  ConsumerState<ProductivityDashboardScreen> createState() =>
      _ProductivityDashboardScreenState();
}

class _ProductivityDashboardScreenState
    extends ConsumerState<ProductivityDashboardScreen> {
  _WorkspaceData? _data;
  Object? _error;
  bool _loading = true;
  bool _offline = false;
  List<_WorkspaceAccount> _accounts = const [];
  String _accountId = 'all';
  String _focusMode = 'focus';
  final _workspaceCache = OfflineWorkspaceCacheStore();
  final _mutationQueue = OfflineMutationQueue();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    final cached = widget.loadWorkspace == null
        ? await _workspaceCache.readWorkspace()
        : null;
    if (cached != null && mounted) {
      setState(() {
        _data = _WorkspaceData.fromJson(cached);
        _offline = true;
        _loading = false;
        _accountId = _data?.accountId ?? 'all';
        _focusMode = _data?.focusMode ?? 'focus';
      });
    }
    try {
      final dio = ref.read(dioProvider);
      final workspaceResponse = widget.loadWorkspace != null
          ? await widget.loadWorkspace!()
          : (await dio.get<dynamic>('/productivity/workspace')).data;
      if (workspaceResponse is! Map<String, dynamic>) {
        throw const FormatException('Invalid workspace response');
      }
      if (widget.loadWorkspace == null)
        await _workspaceCache.saveWorkspace(workspaceResponse);
      if (widget.loadWorkspace == null) {
        final accountsResponse =
            await dio.get<dynamic>('/productivity/accounts');
        final accounts = accountsResponse.data is Map
            ? (accountsResponse.data['accounts'] as List? ?? const [])
                .whereType<Map>()
                .map((item) =>
                    _WorkspaceAccount.fromJson(item.cast<String, dynamic>()))
                .toList()
            : const <_WorkspaceAccount>[];
        if (mounted) _accounts = accounts;
      }
      if (!mounted) return;
      setState(() {
        _data = _WorkspaceData.fromJson(workspaceResponse);
        _accountId = _data?.accountId ?? _accountId;
        _focusMode = _data?.focusMode ?? _focusMode;
        _error = null;
        _offline = false;
        _loading = false;
      });
      if (widget.loadWorkspace == null) {
        await _mutationQueue.load();
        await OfflineMutationReplayWorker(
          queue: _mutationQueue,
          executor: ApiOfflineMutationExecutor(dio),
          isOnline: () async => true,
          baseBackoff: const Duration(milliseconds: 250),
        ).replayOnce();
      }
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _error = cached == null ? error : null;
        _offline = true;
        _loading = false;
      });
    }
  }

  Future<void> _changeAccount(String accountId) async {
    setState(() => _accountId = accountId);
    try {
      await ref.read(dioProvider).patch('/productivity/accounts/active', data: {
        'accountId':
            accountId == 'all' || accountId == 'local' ? null : accountId
      });
      await _load();
    } catch (_) {
      _mutationQueue.enqueue(
          SafeOfflineOperation.updateFocusMode, 'account-context', 0,
          entityType: 'account', payload: {'accountId': accountId});
      if (mounted) setState(() => _offline = true);
    }
  }

  Future<void> _completeTask(_WorkspaceTask task) async {
    try {
      await ref.read(dioProvider).patch('/productivity/tasks/${task.id}',
          data: {'status': 'completed', 'expectedVersion': task.version});
      await _load();
    } catch (_) {
      _mutationQueue.enqueue(
          SafeOfflineOperation.completeTask, task.id, task.version,
          entityType: 'task');
      if (mounted) setState(() => _offline = true);
    }
  }

  Future<void> _snoozeFollowUp(_WorkspaceFollowUp followUp) async {
    final remindAt =
        DateTime.now().toUtc().add(const Duration(days: 1)).toIso8601String();
    try {
      await ref
          .read(dioProvider)
          .patch('/productivity/follow-ups/${followUp.id}', data: {
        'status': 'snoozed',
        'remindAt': remindAt,
        'expectedVersion': followUp.version
      });
      await _load();
    } catch (_) {
      _mutationQueue.enqueue(
          SafeOfflineOperation.snoozeFollowUp, followUp.id, followUp.version,
          entityType: 'follow_up', payload: {'remindAt': remindAt});
      if (mounted) setState(() => _offline = true);
    }
  }

  Future<void> _changeFocusMode(String mode) async {
    setState(() => _focusMode = mode);
    try {
      await ref
          .read(dioProvider)
          .patch('/productivity/focus', data: {'mode': mode});
      await _load();
    } catch (_) {
      _mutationQueue.enqueue(
          SafeOfflineOperation.updateFocusMode, 'workspace', 0,
          entityType: 'focus', payload: {'mode': mode});
      if (mounted) setState(() => _offline = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final resolvedLocale = Localizations.localeOf(context);
    final l10n =
        Localizations.of<AppLocalizations>(context, AppLocalizations) ??
            AppLocalizations(
              resolvedLocale,
              const {
                'productivityDashboard': 'Productivity workspace',
                'refresh': 'Refresh',
                'loading': 'Loading…',
                'loadError': 'Could not load productivity workspace.',
                'retry': 'Retry',
              },
            );
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.text('productivityDashboard')),
        actions: [
          IconButton(
            tooltip: l10n.text('privacyCenter'),
            onPressed: () => context.push('/privacy-center'),
            icon: const Icon(Icons.shield_outlined),
          ),
          IconButton(
            tooltip: l10n.text('refresh'),
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Directionality(
        textDirection: const {'ar', 'ur'}.contains(resolvedLocale.languageCode)
            ? TextDirection.rtl
            : TextDirection.ltr,
        child: RefreshIndicator(
          onRefresh: _load,
          child: _loading && _data == null
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(24),
                  children: [
                    const SizedBox(height: 80),
                    Semantics(
                      container: true,
                      liveRegion: true,
                      label: l10n.text('loading'),
                      child: const Center(child: CircularProgressIndicator()),
                    ),
                    const SizedBox(height: 16),
                    Semantics(
                      liveRegion: true,
                      label: l10n.text('loading'),
                      child: Center(child: Text(l10n.text('loading'))),
                    ),
                  ],
                )
              : _error != null && _data == null
                  ? _ErrorState(onRetry: _load, message: l10n.text('loadError'))
                  : _DashboardBody(
                      data: _data!,
                      l10n: l10n,
                      accounts: _accounts,
                      accountId: _accountId,
                      focusMode: _focusMode,
                      offline: _offline,
                      onAccountChange: _changeAccount,
                      onFocusModeChange: _changeFocusMode,
                      onCompleteTask: _completeTask,
                      onSnoozeFollowUp: _snoozeFollowUp),
        ),
      ),
    );
  }
}

class _DashboardBody extends StatelessWidget {
  const _DashboardBody(
      {required this.data,
      required this.l10n,
      required this.accounts,
      required this.accountId,
      required this.focusMode,
      required this.offline,
      required this.onAccountChange,
      required this.onFocusModeChange,
      required this.onCompleteTask,
      required this.onSnoozeFollowUp});

  final _WorkspaceData data;
  final AppLocalizations l10n;
  final List<_WorkspaceAccount> accounts;
  final String accountId;
  final String focusMode;
  final bool offline;
  final ValueChanged<String> onAccountChange;
  final ValueChanged<String> onFocusModeChange;
  final ValueChanged<_WorkspaceTask> onCompleteTask;
  final ValueChanged<_WorkspaceFollowUp> onSnoozeFollowUp;

  @override
  Widget build(BuildContext context) {
    final cards = [
      _MetricCard(
        icon: Icons.priority_high_rounded,
        color: AppColors.primary,
        value: data.importantCount,
        label: l10n.text('importantMessages'),
      ),
      _MetricCard(
        icon: Icons.task_alt_rounded,
        color: Colors.amber.shade700,
        value: data.overdueTasks.length,
        label: l10n.text('overdueTasks'),
      ),
      _MetricCard(
        icon: Icons.event_available_rounded,
        color: Colors.green.shade700,
        value: data.upcomingEvents.length,
        label: l10n.text('upcomingMeetings'),
      ),
      _MetricCard(
        icon: Icons.drafts_rounded,
        color: Colors.blue.shade700,
        value: data.drafts.length,
        label: l10n.text('drafts'),
      ),
      _MetricCard(
        icon: Icons.schedule_rounded,
        color: Colors.deepPurple.shade600,
        value: data.openFollowUps.length,
        label: l10n.text('needsReply'),
      ),
    ];

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        if (offline)
          Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(12)),
              child: Text(l10n.text('offlineWorkspace'))),
        if (accounts.isNotEmpty) ...[
          DropdownButtonFormField<String>(
            initialValue: accountId,
            decoration: InputDecoration(
                labelText: l10n.text('accountSwitcher'),
                prefixIcon: const Icon(Icons.account_circle_outlined)),
            items: [
              DropdownMenuItem(
                  value: 'all', child: Text(l10n.text('allAccounts'))),
              ...accounts.map((account) => DropdownMenuItem(
                  value: account.id,
                  child: Text(account.label, overflow: TextOverflow.ellipsis)))
            ],
            onChanged: (value) {
              if (value != null) onAccountChange(value);
            },
          ),
          const SizedBox(height: 12),
        ],
        Wrap(
          spacing: 4,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(l10n.text('focusMode'),
                style: Theme.of(context).textTheme.titleMedium),
            ...['focus', 'work', 'follow_up'].map((mode) => ChoiceChip(
                  label: Text(l10n.text('focus_$mode')),
                  selected: focusMode == mode,
                  onSelected: (_) => onFocusModeChange(mode),
                )),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          l10n.text('productivitySubtitle'),
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: 16),
        LayoutBuilder(
          builder: (context, constraints) {
            final columns = constraints.maxWidth >= 900
                ? 5
                : constraints.maxWidth >= 560
                    ? 3
                    : 2;
            final width = (constraints.maxWidth - (columns - 1) * 12) / columns;
            return Wrap(
              spacing: 12,
              runSpacing: 12,
              children: cards
                  .map((card) => SizedBox(width: width, child: card))
                  .toList(),
            );
          },
        ),
        const SizedBox(height: 20),
        _SectionCard(
          icon: Icons.auto_awesome_rounded,
          title: l10n.text('smartInbox'),
          subtitle: l10n.text('signalsNote'),
          child: data.smartInbox.isEmpty
              ? _EmptyLine(text: l10n.text('noData'))
              : Column(
                  children: data.smartInbox
                      .take(8)
                      .map(
                        (email) => _EmailTile(
                          email: email,
                          l10n: l10n,
                          onTap: email.id == null
                              ? null
                              : () => context.push('/email/${email.id}'),
                        ),
                      )
                      .toList(),
                ),
        ),
        const SizedBox(height: 16),
        _SectionCard(
          icon: Icons.task_alt_rounded,
          title: l10n.text('overdueTasks'),
          child: data.overdueTasks.isEmpty
              ? _EmptyLine(text: l10n.text('noData'))
              : Column(
                  children: data.overdueTasks
                      .take(8)
                      .map(
                        (task) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.error_outline_rounded),
                          title: Text(task.title,
                              maxLines: 2, overflow: TextOverflow.ellipsis),
                          subtitle: task.dueAt == null
                              ? null
                              : Text(l10n.formatDateTime(task.dueAt!)),
                          trailing: IconButton(
                              tooltip: l10n.text('completeTask'),
                              icon: const Icon(Icons.check_circle_outline),
                              onPressed: () => onCompleteTask(task)),
                        ),
                      )
                      .toList(),
                ),
        ),
        const SizedBox(height: 16),
        _SectionCard(
          icon: Icons.event_available_rounded,
          title: l10n.text('upcomingMeetings'),
          child: data.upcomingEvents.isEmpty
              ? _EmptyLine(text: l10n.text('noData'))
              : Column(
                  children: data.upcomingEvents
                      .take(8)
                      .map(
                        (event) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.calendar_today_rounded),
                          title: Text(event.title,
                              maxLines: 2, overflow: TextOverflow.ellipsis),
                          subtitle: Text(l10n.formatDateTime(event.startsAt)),
                          onTap: event.emailId == null
                              ? null
                              : () => context.push('/email/${event.emailId}'),
                        ),
                      )
                      .toList(),
                ),
        ),
        const SizedBox(height: 16),
        _SectionCard(
          icon: Icons.drafts_rounded,
          title: l10n.text('drafts'),
          child: data.drafts.isEmpty
              ? _EmptyLine(text: l10n.text('noData'))
              : Column(
                  children: data.drafts
                      .take(6)
                      .map((draft) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.drafts_outlined),
                          title: Text(draft.subject,
                              maxLines: 2, overflow: TextOverflow.ellipsis),
                          onTap: draft.id == null
                              ? null
                              : () => context.push('/email/${draft.id}')))
                      .toList()),
        ),
        const SizedBox(height: 16),
        _SectionCard(
          icon: Icons.schedule_rounded,
          title: l10n.text('followUps'),
          child: data.followUps.isEmpty
              ? _EmptyLine(text: l10n.text('noData'))
              : Column(
                  children: data.followUps
                      .take(8)
                      .map(
                        (followUp) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.reply_rounded),
                          title: Text(followUp.subject,
                              maxLines: 2, overflow: TextOverflow.ellipsis),
                          subtitle: Text(
                              '${followUp.fromEmail} · ${l10n.formatDateTime(followUp.remindAt)}'),
                          trailing: IconButton(
                              tooltip: l10n.text('snoozeFollowUp'),
                              icon: const Icon(Icons.snooze_outlined),
                              onPressed: () => onSnoozeFollowUp(followUp)),
                          onTap: () =>
                              context.push('/email/${followUp.emailId}'),
                        ),
                      )
                      .toList(),
                ),
        ),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard(
      {required this.icon,
      required this.color,
      required this.value,
      required this.label});

  final IconData icon;
  final Color color;
  final int value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Semantics(
          container: true,
          label: '$label: $value',
          child: Row(
          children: [
            Icon(icon, color: color),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$value',
                      style: Theme.of(context).textTheme.headlineSmall),
                  Text(label, maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          ],
        ),
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard(
      {required this.icon,
      required this.title,
      required this.child,
      this.subtitle});

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
        child: Semantics(
          container: true,
          label: subtitle == null ? title : '$title. $subtitle',
          child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Expanded(
                    child: Text(title,
                        style: Theme.of(context).textTheme.titleLarge)),
              ],
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 4),
              Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
            ],
            const SizedBox(height: 8),
            child,
          ],
        ),
        ),
      ),
    );
  }
}

class _EmailTile extends StatelessWidget {
  const _EmailTile({required this.email, required this.l10n, this.onTap});

  final _WorkspaceEmail email;
  final AppLocalizations l10n;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: onTap != null,
      label: '${email.subject.isEmpty ? l10n.text('email') : email.subject}. ${email.fromEmail}. ${email.score}',
      child: ListTile(
        contentPadding: EdgeInsets.zero,
      leading: Icon(
          email.isRead ? Icons.mail_outline : Icons.mark_email_unread_rounded),
      title: Text(email.subject.isEmpty ? l10n.text('email') : email.subject,
          maxLines: 2, overflow: TextOverflow.ellipsis),
      subtitle: Text('${email.fromEmail} · ${email.score}',
          maxLines: 2, overflow: TextOverflow.ellipsis),
        trailing:
            email.reasons.isEmpty ? null : Chip(label: Text(email.reasons.first)),
        onTap: onTap,
      ),
    );
  }
}

class _EmptyLine extends StatelessWidget {
  const _EmptyLine({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Semantics(
        container: true,
        label: text,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
        ),
      );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry, required this.message});

  final VoidCallback onRetry;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      liveRegion: true,
      label: message,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 70),
        const Icon(Icons.cloud_off_rounded, size: 48),
        const SizedBox(height: 12),
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 16),
          Center(
              child: FilledButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: Text(AppLocalizations.of(context).text('retry')))),
        ],
      ),
    );
  }
}

class _WorkspaceData {
  _WorkspaceData(
      {required this.smartInbox,
      required this.overdueTasks,
      required this.upcomingEvents,
      required this.drafts,
      required this.followUps,
      required this.accountId,
      required this.focusMode});

  factory _WorkspaceData.fromJson(Map<String, dynamic> json) {
    final smart = json['smartInbox'];
    final smartMap =
        smart is Map<String, dynamic> ? smart : <String, dynamic>{};
    return _WorkspaceData(
      smartInbox:
          _asList(smartMap['emails']).map(_WorkspaceEmail.fromJson).toList(),
      overdueTasks:
          _asList(json['overdueTasks']).map(_WorkspaceTask.fromJson).toList(),
      upcomingEvents: _asList(json['upcomingEvents'])
          .map(_WorkspaceEvent.fromJson)
          .toList(),
      drafts: _asList(json['drafts']).map(_WorkspaceDraft.fromJson).toList(),
      followUps:
          _asList(json['followUps']).map(_WorkspaceFollowUp.fromJson).toList(),
      accountId: json['accountId'] as String? ?? 'all',
      focusMode: json['focusMode'] as String? ?? 'focus',
    );
  }

  final List<_WorkspaceEmail> smartInbox;
  final List<_WorkspaceTask> overdueTasks;
  final List<_WorkspaceEvent> upcomingEvents;
  final List<_WorkspaceDraft> drafts;
  final List<_WorkspaceFollowUp> followUps;
  final String accountId;
  final String focusMode;

  int get importantCount => smartInbox
      .where((email) => email.reasons.any((reason) =>
          reason == 'starred' || reason == 'primary' || reason == 'label'))
      .length;
  List<_WorkspaceFollowUp> get openFollowUps =>
      followUps.where((followUp) => followUp.status == 'open').toList();

  static List<Map<String, dynamic>> _asList(dynamic value) => value is List
      ? value.whereType<Map<String, dynamic>>().toList()
      : <Map<String, dynamic>>[];
}

class _WorkspaceEmail {
  _WorkspaceEmail(
      {required this.id,
      required this.subject,
      required this.fromEmail,
      required this.isRead,
      required this.score,
      required this.reasons});

  factory _WorkspaceEmail.fromJson(Map<String, dynamic> json) {
    final email = json['email'];
    final map = email is Map<String, dynamic> ? email : json;
    return _WorkspaceEmail(
      id: map['id'] as String?,
      subject: map['subject'] as String? ?? '',
      fromEmail: map['fromEmail'] as String? ?? '',
      isRead: map['isRead'] as bool? ?? true,
      score: (json['score'] as num?)?.toInt() ?? 0,
      reasons:
          (json['reasons'] as List?)?.whereType<String>().toList() ?? const [],
    );
  }

  final String? id;
  final String subject;
  final String fromEmail;
  final bool isRead;
  final int score;
  final List<String> reasons;
}

class _WorkspaceTask {
  _WorkspaceTask(
      {required this.id,
      required this.title,
      required this.dueAt,
      required this.version});
  factory _WorkspaceTask.fromJson(Map<String, dynamic> json) => _WorkspaceTask(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      dueAt: _date(json['dueAt']),
      version: (json['version'] as num?)?.toInt() ?? 1);
  final String id;
  final String title;
  final DateTime? dueAt;
  final int version;
}

class _WorkspaceEvent {
  _WorkspaceEvent(
      {required this.id,
      required this.title,
      required this.startsAt,
      required this.emailId});
  factory _WorkspaceEvent.fromJson(Map<String, dynamic> json) =>
      _WorkspaceEvent(
          id: json['id'] as String?,
          title: json['title'] as String? ?? '',
          startsAt: _date(json['startsAt']) ?? DateTime.now(),
          emailId: json['emailId'] as String?);
  final String? id;
  final String title;
  final DateTime startsAt;
  final String? emailId;
}

class _WorkspaceDraft {
  _WorkspaceDraft({required this.id, required this.subject});
  factory _WorkspaceDraft.fromJson(Map<String, dynamic> json) =>
      _WorkspaceDraft(
          id: json['id'] as String?, subject: json['subject'] as String? ?? '');
  final String? id;
  final String subject;
}

class _WorkspaceFollowUp {
  _WorkspaceFollowUp(
      {required this.emailId,
      required this.subject,
      required this.fromEmail,
      required this.remindAt,
      required this.status,
      required this.id,
      required this.version});
  factory _WorkspaceFollowUp.fromJson(Map<String, dynamic> json) =>
      _WorkspaceFollowUp(
          id: json['id'] as String? ?? '',
          emailId: json['emailId'] as String? ?? '',
          subject: json['emailSubject'] as String? ?? '',
          fromEmail: json['fromEmail'] as String? ?? '',
          remindAt: _date(json['remindAt']) ?? DateTime.now(),
          status: json['status'] as String? ?? 'open',
          version: (json['version'] as num?)?.toInt() ?? 1);
  final String id;
  final String emailId;
  final String subject;
  final String fromEmail;
  final DateTime remindAt;
  final String status;
  final int version;
}

class _WorkspaceAccount {
  const _WorkspaceAccount({required this.id, required this.label});
  factory _WorkspaceAccount.fromJson(Map<String, dynamic> json) =>
      _WorkspaceAccount(
          id: json['id'] as String? ?? 'local',
          label: (json['displayName'] as String?) ??
              (json['emailAddress'] as String? ?? ''));
  final String id;
  final String label;
}

DateTime? _date(dynamic value) =>
    value is String ? DateTime.tryParse(value) : null;
