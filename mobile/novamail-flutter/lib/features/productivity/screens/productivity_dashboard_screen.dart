import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

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

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final payload = widget.loadWorkspace != null
          ? await widget.loadWorkspace!()
          : (await ref
                  .read(dioProvider)
                  .get<dynamic>('/productivity/workspace'))
              .data;
      if (payload is! Map<String, dynamic>) {
        throw const FormatException('Invalid workspace response');
      }
      if (!mounted) return;
      setState(() {
        _data = _WorkspaceData.fromJson(payload);
        _error = null;
        _loading = false;
      });
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
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
                    const Center(child: CircularProgressIndicator()),
                    const SizedBox(height: 16),
                    Center(child: Text(l10n.text('loading'))),
                  ],
                )
              : _error != null && _data == null
                  ? _ErrorState(onRetry: _load, message: l10n.text('loadError'))
                  : _DashboardBody(data: _data!, l10n: l10n),
        ),
      ),
    );
  }
}

class _DashboardBody extends StatelessWidget {
  const _DashboardBody({required this.data, required this.l10n});

  final _WorkspaceData data;
  final AppLocalizations l10n;

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
    return ListTile(
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
    );
  }
}

class _EmptyLine extends StatelessWidget {
  const _EmptyLine({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
      );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry, required this.message});

  final VoidCallback onRetry;
  final String message;

  @override
  Widget build(BuildContext context) {
    return ListView(
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
    );
  }
}

class _WorkspaceData {
  _WorkspaceData(
      {required this.smartInbox,
      required this.overdueTasks,
      required this.upcomingEvents,
      required this.drafts,
      required this.followUps});

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
    );
  }

  final List<_WorkspaceEmail> smartInbox;
  final List<_WorkspaceTask> overdueTasks;
  final List<_WorkspaceEvent> upcomingEvents;
  final List<_WorkspaceDraft> drafts;
  final List<_WorkspaceFollowUp> followUps;

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
  _WorkspaceTask({required this.title, required this.dueAt});
  factory _WorkspaceTask.fromJson(Map<String, dynamic> json) => _WorkspaceTask(
      title: json['title'] as String? ?? '', dueAt: _date(json['dueAt']));
  final String title;
  final DateTime? dueAt;
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
      required this.status});
  factory _WorkspaceFollowUp.fromJson(Map<String, dynamic> json) =>
      _WorkspaceFollowUp(
          emailId: json['emailId'] as String? ?? '',
          subject: json['emailSubject'] as String? ?? '',
          fromEmail: json['fromEmail'] as String? ?? '',
          remindAt: _date(json['remindAt']) ?? DateTime.now(),
          status: json['status'] as String? ?? 'open');
  final String emailId;
  final String subject;
  final String fromEmail;
  final DateTime remindAt;
  final String status;
}

DateTime? _date(dynamic value) =>
    value is String ? DateTime.tryParse(value) : null;
