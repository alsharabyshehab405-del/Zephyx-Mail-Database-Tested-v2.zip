import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../l10n/app_localizations.dart';
import '../../email/data/email_repository.dart';
import '../../email/providers/email_providers.dart';

class ComposeScreen extends ConsumerStatefulWidget {
  final String? draftId;
  final String? replyToId;
  final bool replyAll;
  final bool forward;
  const ComposeScreen(
      {super.key,
      this.draftId,
      this.replyToId,
      this.replyAll = false,
      this.forward = false});
  @override
  ConsumerState<ComposeScreen> createState() => _ComposeScreenState();
}

class _ComposeScreenState extends ConsumerState<ComposeScreen> {
  final to = TextEditingController();
  final subject = TextEditingController();
  final body = TextEditingController();
  Timer? draftTimer;
  String? currentDraftId;
  bool saving = false;
  bool sending = false;
  DateTime? scheduledAt;
  final List<EmailAttachmentModel> contextAttachments = [];

  @override
  void initState() {
    super.initState();
    currentDraftId = widget.draftId;
    unawaited(_loadContext());
    to.addListener(_scheduleDraft);
    subject.addListener(_scheduleDraft);
    body.addListener(_scheduleDraft);
  }

  @override
  void dispose() {
    draftTimer?.cancel();
    to.dispose();
    subject.dispose();
    body.dispose();
    super.dispose();
  }

  Future<void> _loadContext() async {
    if (widget.replyToId == null || widget.draftId != null) return;
    try {
      final source =
          await ref.read(emailRepositoryProvider).get(widget.replyToId!);
      if (!mounted) return;
      contextAttachments.addAll(source.attachments);
      if (widget.forward) {
        subject.text = source.subject.startsWith('Fwd:')
            ? source.subject
            : 'Fwd: ${source.subject}';
        body.text =
            '\n\n---------- Forwarded message ----------\nFrom: ${source.fromEmail}\nSubject: ${source.subject}\n\n${source.bodyText}';
      } else {
        final recipients = <String>{source.fromEmail};
        if (widget.replyAll)
          recipients.addAll(source.to.map((item) => item.email));
        to.text = recipients.where((item) => item.isNotEmpty).join(', ');
        subject.text = source.subject.startsWith('Re:')
            ? source.subject
            : 'Re: ${source.subject}';
        body.text =
            source.bodyText.split('\n').map((line) => '> $line').join('\n');
      }
    } catch (_) {
      // The compose surface remains usable if the source message cannot be loaded.
    }
  }

  bool get _dirty =>
      to.text.trim().isNotEmpty ||
      subject.text.trim().isNotEmpty ||
      body.text.trim().isNotEmpty;

  void _scheduleDraft() {
    if (!_dirty || sending) return;
    draftTimer?.cancel();
    draftTimer = Timer(const Duration(seconds: 1), _saveDraft);
  }

  List<EmailAddressModel> _recipients() => to.text
      .split(',')
      .map((value) => value.trim())
      .where((value) => value.contains('@'))
      .map((value) => EmailAddressModel(email: value))
      .toList(growable: false);

  Future<void> _saveDraft() async {
    if (!_dirty || saving || sending) return;
    setState(() => saving = true);
    try {
      final draft = await ref.read(emailRepositoryProvider).send(
            draftId: currentDraftId,
            to: _recipients(),
            subject: subject.text,
            bodyText: body.text,
            attachments: contextAttachments,
            isDraft: true,
          );
      currentDraftId = draft.id;
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _send({required bool scheduled}) async {
    if (sending || _recipients().isEmpty || (scheduled && scheduledAt == null))
      return;
    setState(() => sending = true);
    try {
      await ref.read(emailRepositoryProvider).send(
            draftId: currentDraftId,
            to: _recipients(),
            subject: subject.text,
            bodyText: body.text,
            attachments: contextAttachments,
            isDraft: false,
            scheduledAt:
                scheduled ? scheduledAt!.toUtc().toIso8601String() : null,
            replyToId: widget.replyToId,
          );
      if (mounted) context.pop();
    } catch (error) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$error')));
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  Future<void> _chooseSchedule() async {
    final selected = await showDatePicker(
      context: context,
      firstDate: DateTime.now().add(const Duration(minutes: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      initialDate: DateTime.now().add(const Duration(hours: 1)),
    );
    if (selected == null || !mounted) return;
    setState(() => scheduledAt = DateTime(
        selected.year, selected.month, selected.day, DateTime.now().hour + 1));
    await _send(scheduled: true);
  }

  Future<void> _closeSafely() async {
    if (_dirty) await _saveDraft();
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(_closeSafely());
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.text('newMessage')),
          leading: IconButton(
              icon: const Icon(Icons.close), onPressed: _closeSafely),
          actions: [
            TextButton.icon(
              onPressed: sending ? null : () => _send(scheduled: false),
              icon: const Icon(Icons.send_outlined),
              label: Text(l10n.text('send')),
              style: TextButton.styleFrom(foregroundColor: AppColors.primary),
            ),
          ],
        ),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            TextField(
                controller: to,
                decoration: InputDecoration(
                    labelText: l10n.text('to'), border: InputBorder.none),
                keyboardType: TextInputType.emailAddress),
            const Divider(),
            TextField(
                controller: subject,
                decoration: InputDecoration(
                    labelText: l10n.text('subject'), border: InputBorder.none)),
            const Divider(),
            Expanded(
                child: TextField(
                    controller: body,
                    decoration: InputDecoration(
                        hintText: l10n.text('writeMessage'),
                        border: InputBorder.none),
                    maxLines: null,
                    expands: true,
                    textAlignVertical: TextAlignVertical.top)),
            Row(children: [
              TextButton.icon(
                  onPressed: sending ? null : _chooseSchedule,
                  icon: const Icon(Icons.schedule),
                  label: Text(l10n.text('scheduleSend'))),
              if (saving)
                const Padding(
                    padding: EdgeInsets.all(8),
                    child: SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2)))
            ]),
          ]),
        ),
      ),
    );
  }
}
