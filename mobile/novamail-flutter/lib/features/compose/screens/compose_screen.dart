import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../l10n/app_localizations.dart';
import '../../email/data/email_repository.dart';
import '../../email/providers/email_providers.dart';

class ComposeScreen extends ConsumerStatefulWidget {
  final String? draftId; final String? replyToId;
  const ComposeScreen({super.key, this.draftId, this.replyToId});
  @override ConsumerState<ComposeScreen> createState() => _ComposeScreenState();
}
class _ComposeScreenState extends ConsumerState<ComposeScreen> {
  final to = TextEditingController(), subject = TextEditingController(), body = TextEditingController();
  Timer? draftTimer; bool saving = false; bool sending = false; DateTime? scheduledAt;
  @override void initState() { super.initState(); to.addListener(_scheduleDraft); subject.addListener(_scheduleDraft); body.addListener(_scheduleDraft); }
  @override void dispose() { draftTimer?.cancel(); to.dispose(); subject.dispose(); body.dispose(); super.dispose(); }
  void _scheduleDraft() { if (widget.draftId == null) return; draftTimer?.cancel(); draftTimer = Timer(const Duration(seconds: 1), _saveDraft); }
  List<EmailAddressModel> _recipients() => to.text.split(',').map((x) => x.trim()).where((x) => x.contains('@')).map((x) => EmailAddressModel(email: x)).toList(growable: false);
  Future<void> _saveDraft() async { if (widget.draftId == null || saving || sending) return; setState(() => saving = true); try { await ref.read(emailRepositoryProvider).send(draftId: widget.draftId, to: _recipients(), subject: subject.text, bodyText: body.text, isDraft: true); } finally { if (mounted) setState(() => saving = false); } }
  Future<void> _send({bool schedule = false}) async { if (sending || _recipients().isEmpty) return; setState(() => sending = true); try { await ref.read(emailRepositoryProvider).send(draftId: widget.draftId, to: _recipients(), subject: subject.text, bodyText: body.text, isDraft: false, scheduledAt: schedule ? scheduledAt?.toUtc().toIso8601String() : null, replyToId: widget.replyToId); if (mounted) context.pop(); } catch (error) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$error'))); } finally { if (mounted) setState(() => sending = false); } }
  @override Widget build(BuildContext context) { final l10n = AppLocalizations.of(context); return PopScope(canPop: !(_dirty && widget.draftId == null), onPopInvokedWithResult: (didPop, _) { if (!didPop && _dirty) _saveAndPop(); }, child: Scaffold(appBar: AppBar(title: Text(l10n.text('newMessage')), leading: IconButton(icon: const Icon(Icons.close), onPressed: _saveAndPop), actions: [TextButton.icon(onPressed: sending ? null : () => _send(), icon: const Icon(Icons.send_outlined), label: Text(l10n.text('send')), style: TextButton.styleFrom(foregroundColor: AppColors.primary))]), body: Padding(padding: const EdgeInsets.all(16), child: Column(children: [TextField(controller: to, decoration: InputDecoration(labelText: l10n.text('to'), border: InputBorder.none), keyboardType: TextInputType.emailAddress), const Divider(), TextField(controller: subject, decoration: InputDecoration(labelText: l10n.text('subject'), border: InputBorder.none)), const Divider(), Expanded(child: TextField(controller: body, decoration: InputDecoration(hintText: l10n.text('writeMessage'), border: InputBorder.none), maxLines: null, expands: true, textAlignVertical: TextAlignVertical.top)), Row(children: [TextButton.icon(onPressed: () async { final selected = await showDatePicker(context: context, firstDate: DateTime.now().add(const Duration(minutes: 1)), lastDate: DateTime.now().add(const Duration(days: 365)), initialDate: DateTime.now().add(const Duration(hours: 1))); if (selected != null && mounted) setState(() => scheduledAt = DateTime(selected.year, selected.month, selected.day, DateTime.now().hour + 1)); }, icon: const Icon(Icons.schedule), label: Text(l10n.text('scheduleSend'))), if (saving) const Padding(padding: EdgeInsets.all(8), child: SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)))]))])))); }
  bool get _dirty => to.text.isNotEmpty || subject.text.isNotEmpty || body.text.isNotEmpty;
  Future<void> _saveAndPop() async { if (_dirty && widget.draftId != null) await _saveDraft(); if (mounted) context.pop(); }
}
