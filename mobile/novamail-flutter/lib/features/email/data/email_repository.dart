import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

class EmailAddressModel {
  final String email;
  final String? name;
  const EmailAddressModel({required this.email, this.name});
  Map<String, dynamic> toJson() => {
        'email': email,
        if (name != null) 'name': name,
      };
}

class EmailAttachmentModel {
  final String id;
  final String filename;
  final String mimeType;
  final int size;
  final String scanStatus;
  const EmailAttachmentModel({
    required this.id,
    required this.filename,
    required this.mimeType,
    required this.size,
    this.scanStatus = 'not_scanned',
  });
  factory EmailAttachmentModel.fromJson(Map<String, dynamic> json) =>
      EmailAttachmentModel(
        id: '${json['id'] ?? ''}',
        filename: '${json['filename'] ?? ''}',
        mimeType: '${json['mimeType'] ?? 'application/octet-stream'}',
        size: (json['size'] as num?)?.toInt() ?? 0,
        scanStatus: '${json['scanStatus'] ?? 'not_scanned'}',
      );
}

class ThreatAnalysisModel {
  final String overallRisk;
  final String spoofingRisk;
  final int spamScore;
  final String spfResult;
  final String dkimResult;
  final String dmarcResult;
  final String malwareStatus;
  final List<String> reasons;
  const ThreatAnalysisModel({
    required this.overallRisk,
    required this.spoofingRisk,
    required this.spamScore,
    required this.spfResult,
    required this.dkimResult,
    required this.dmarcResult,
    required this.malwareStatus,
    this.reasons = const [],
  });
  factory ThreatAnalysisModel.fromJson(Map<String, dynamic> json) =>
      ThreatAnalysisModel(
        overallRisk: '${json['overallRisk'] ?? 'none'}',
        spoofingRisk: '${json['spoofingRisk'] ?? 'none'}',
        spamScore: (json['spamScore'] as num?)?.toInt() ?? 0,
        spfResult: '${json['spfResult'] ?? 'unknown'}',
        dkimResult: '${json['dkimResult'] ?? 'unknown'}',
        dmarcResult: '${json['dmarcResult'] ?? 'unknown'}',
        malwareStatus: '${json['malwareStatus'] ?? 'not_scanned'}',
        reasons: ((json['spamReasons'] as List?) ?? const [])
            .whereType<Map>()
            .map((x) => '${x['label'] ?? x['code'] ?? ''}')
            .where((x) => x.isNotEmpty)
            .toList(growable: false),
      );
}

const emailCategories = <String>[
  'primary',
  'work',
  'social',
  'promotions',
  'newsletters',
  'orders',
  'travel',
  'finance',
  'bills',
  'events',
  'security',
  'spam',
];

String normalizeEmailCategory(Object? value) {
  if (value is String && emailCategories.contains(value)) return value;
  if (value == 'promotional') return 'promotions';
  if (value == 'updates') return 'primary';
  return 'primary';
}

class EmailModel {
  final String id;
  final String subject;
  final String bodyText;
  final String bodyHtml;
  final String fromEmail;
  final String? fromName;
  final List<EmailAddressModel> to;
  final List<EmailAddressModel> cc;
  final List<EmailAddressModel> bcc;
  final List<EmailAttachmentModel> attachments;
  final String folder;
  final String category;
  final bool isRead;
  final bool isStarred;
  final bool isDraft;
  final String? scheduledAt;
  final String? status;
  final String? createdAt;
  final String? threadId;
  final ThreatAnalysisModel? threat;
  const EmailModel({
    required this.id,
    required this.subject,
    required this.bodyText,
    required this.bodyHtml,
    required this.fromEmail,
    this.fromName,
    this.to = const [],
    this.cc = const [],
    this.bcc = const [],
    this.attachments = const [],
    required this.folder,
    this.category = 'primary',
    required this.isRead,
    required this.isStarred,
    required this.isDraft,
    this.scheduledAt,
    this.status,
    this.createdAt,
    this.threadId,
    this.threat,
  });
  factory EmailModel.fromJson(Map<String, dynamic> json) {
    final from = (json['from'] as Map?)?.cast<String, dynamic>() ?? const {};
    return EmailModel(
      id: '${json['id'] ?? ''}',
      subject: '${json['subject'] ?? ''}',
      bodyText: '${json['bodyText'] ?? ''}',
      bodyHtml: '${json['bodyHtml'] ?? ''}',
      fromEmail: '${from['email'] ?? ''}',
      fromName: from['name'] as String?,
      to: ((json['to'] as List?) ?? const [])
          .whereType<Map>()
          .map(
            (x) => EmailAddressModel(
              email: '${x['email'] ?? ''}',
              name: x['name'] as String?,
            ),
          )
          .toList(growable: false),
      cc: ((json['cc'] as List?) ?? const [])
          .whereType<Map>()
          .map((x) => EmailAddressModel(
              email: '${x['email'] ?? ''}', name: x['name'] as String?))
          .toList(growable: false),
      bcc: ((json['bcc'] as List?) ?? const [])
          .whereType<Map>()
          .map((x) => EmailAddressModel(
              email: '${x['email'] ?? ''}', name: x['name'] as String?))
          .toList(growable: false),
      attachments: ((json['attachments'] as List?) ?? const [])
          .whereType<Map>()
          .map((x) => EmailAttachmentModel.fromJson(x.cast<String, dynamic>()))
          .toList(growable: false),
      folder: '${json['folder'] ?? 'inbox'}',
      category: normalizeEmailCategory(json['category']),
      isRead: json['isRead'] == true,
      isStarred: json['isStarred'] == true,
      isDraft: json['isDraft'] == true,
      scheduledAt: json['scheduledAt'] as String?,
      status: json['status'] as String?,
      createdAt: json['createdAt'] as String?,
      threadId: json['threadId'] as String?,
      threat: (json['threat'] as Map?) == null
          ? null
          : ThreatAnalysisModel.fromJson(
              (json['threat'] as Map).cast<String, dynamic>()),
    );
  }
}

class EmailPage {
  final List<EmailModel> emails;
  final String? nextCursor;
  final int unreadCount;
  final int total;
  final Map<String, int> categoryCounts;
  const EmailPage({
    required this.emails,
    this.nextCursor,
    this.unreadCount = 0,
    this.total = 0,
    this.categoryCounts = const <String, int>{},
  });
  factory EmailPage.fromJson(Map<String, dynamic> json) => EmailPage(
        emails: ((json['emails'] as List?) ?? const [])
            .whereType<Map>()
            .map((x) => EmailModel.fromJson(x.cast<String, dynamic>()))
            .toList(growable: false),
        nextCursor: json['nextCursor'] as String?,
        unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
        total: (json['total'] as num?)?.toInt() ?? 0,
        categoryCounts: ((json['categoryCounts'] as Map?) ?? const {})
            .map((key, value) => MapEntry('$key', (value as num?)?.toInt() ?? 0)),
      );
}

String sanitizeAttachmentFilename(String filename,
    {String fallback = 'attachment'}) {
  final cleaned = filename.replaceAll(RegExp(r'[^A-Za-z0-9._ -]'), '_').trim();
  final basename =
      cleaned.replaceAll('..', '_').replaceAll(RegExp(r'[/\\\\]'), '_');
  return basename.isEmpty ? fallback : basename;
}

class AttachmentSecurityException implements Exception {
  final String reason;
  const AttachmentSecurityException(this.reason);
  @override
  String toString() => reason;
}

class AttachmentPermissionException implements Exception {
  const AttachmentPermissionException();
  @override
  String toString() => 'Attachment platform permission denied';
}

abstract interface class AttachmentPlatformAdapter {
  Future<String> saveFile({required String filename, required List<int> bytes});
  Future<void> shareFile({required String path, required String filename});
}

class MethodChannelAttachmentPlatformAdapter
    implements AttachmentPlatformAdapter {
  final MethodChannel channel;
  const MethodChannelAttachmentPlatformAdapter(
      {this.channel = const MethodChannel('novamail/attachments')});

  @override
  Future<String> saveFile(
      {required String filename, required List<int> bytes}) async {
    try {
      final result =
          await channel.invokeMethod<String>('saveFile', <String, Object>{
        'filename': filename,
        'bytes': Uint8List.fromList(bytes),
      });
      if (result != null && result.isNotEmpty) return result;
    } on MissingPluginException {
      // Fall back to the Dart file adapter on platforms without native support.
    } on PlatformException {
      // Fall back so permission errors remain observable from the file adapter.
    }
    final directory = await getApplicationDocumentsDirectory();
    final file = File('${directory.path}/$filename');
    await file.writeAsBytes(bytes, flush: true);
    return file.path;
  }

  @override
  Future<void> shareFile(
      {required String path, required String filename}) async {
    try {
      await channel.invokeMethod<void>(
          'shareFile', <String, Object>{'path': path, 'filename': filename});
      return;
    } on MissingPluginException {
      // Fall back to share_plus when no native MethodChannel handler is installed.
    }
    await Share.shareXFiles([XFile(path)], text: filename);
  }
}

class OrderRecordModel {
  final String sourceEmailId;
  final String? orderNumber;
  final String? merchant;
  final String? total;
  final String? currency;
  final String deliveryState;
  final String? estimatedDelivery;
  final String providerState;
  const OrderRecordModel({required this.sourceEmailId, this.orderNumber, this.merchant, this.total, this.currency, required this.deliveryState, this.estimatedDelivery, required this.providerState});
  factory OrderRecordModel.fromJson(Map<String, dynamic> json) => OrderRecordModel(
        sourceEmailId: '${json['sourceEmailId'] ?? ''}',
        orderNumber: json['orderNumber'] as String?,
        merchant: json['merchant'] as String?,
        total: json['total'] as String?,
        currency: json['currency'] as String?,
        deliveryState: '${json['deliveryState'] ?? 'unknown'}',
        estimatedDelivery: json['estimatedDelivery'] as String?,
        providerState: '${json['providerState'] ?? 'NOT_CONFIGURED'}',
      );
}

class FinanceRecordModel {
  final String sourceEmailId;
  final String kind;
  final String? merchant;
  final String? amount;
  final String? currency;
  final String? dueDate;
  final String paymentStatus;
  final String providerState;
  const FinanceRecordModel({required this.sourceEmailId, required this.kind, this.merchant, this.amount, this.currency, this.dueDate, required this.paymentStatus, required this.providerState});
  factory FinanceRecordModel.fromJson(Map<String, dynamic> json) => FinanceRecordModel(
        sourceEmailId: '${json['sourceEmailId'] ?? ''}',
        kind: '${json['kind'] ?? 'finance'}',
        merchant: json['merchant'] as String?,
        amount: json['amount'] as String?,
        currency: json['currency'] as String?,
        dueDate: json['dueDate'] as String?,
        paymentStatus: '${json['paymentStatus'] ?? 'unknown'}',
        providerState: '${json['providerState'] ?? 'NOT_CONFIGURED'}',
      );
}

class SubscriptionRecordModel {
  final String sourceEmailId;
  final String sender;
  final List<String> manualLinks;
  final String state;
  const SubscriptionRecordModel({required this.sourceEmailId, required this.sender, required this.manualLinks, required this.state});
  factory SubscriptionRecordModel.fromJson(Map<String, dynamic> json) => SubscriptionRecordModel(
        sourceEmailId: '${json['sourceEmailId'] ?? ''}',
        sender: '${json['sender'] ?? ''}',
        manualLinks: ((json['manualLinks'] as List?) ?? const []).whereType<String>().toList(growable: false),
        state: '${json['state'] ?? 'NOT_CONFIGURED'}',
      );
}

class CatchUpModel {
  final int total;
  final bool undoRequiredForPermanentDelete;
  const CatchUpModel({required this.total, required this.undoRequiredForPermanentDelete});
  factory CatchUpModel.fromJson(Map<String, dynamic> json) => CatchUpModel(
        total: (json['total'] as num?)?.toInt() ?? 0,
        undoRequiredForPermanentDelete: json['undoRequiredForPermanentDelete'] == true,
      );
}

class StorageQuotaModel {
  final String state;
  final int usedBytes;
  final int? quotaBytes;
  final int? remainingBytes;
  final String enforcement;
  const StorageQuotaModel({required this.state, required this.usedBytes, this.quotaBytes, this.remainingBytes, required this.enforcement});
  factory StorageQuotaModel.fromJson(Map<String, dynamic> json) => StorageQuotaModel(
        state: '${json['state'] ?? 'NOT_CONFIGURED'}',
        usedBytes: (json['usedBytes'] as num?)?.toInt() ?? 0,
        quotaBytes: (json['quotaBytes'] as num?)?.toInt(),
        remainingBytes: (json['remainingBytes'] as num?)?.toInt(),
        enforcement: '${json['enforcement'] ?? 'NOT_CONFIGURED'}',
      );
}

class EmailRepository {
  final Dio client;
  final AttachmentPlatformAdapter attachmentPlatform;
  EmailRepository(this.client, {AttachmentPlatformAdapter? attachmentPlatform})
      : attachmentPlatform = attachmentPlatform ??
            const MethodChannelAttachmentPlatformAdapter();
  Future<EmailPage> list({
    String folder = 'inbox',
    String? cursor,
    String? search,
    bool unreadOnly = false,
    String? category,
    int limit = 20,
  }) async {
    final response = await client.get(
      '/emails',
      queryParameters: {
        'folder': folder,
        'limit': limit,
        if (cursor != null) 'cursor': cursor,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (unreadOnly) 'unreadOnly': 'true',
        if (category != null && emailCategories.contains(category)) 'category': category,
      },
    );
    return EmailPage.fromJson((response.data as Map).cast<String, dynamic>());
  }

  Future<void> updateCategory(String id, String category) async {
    if (!emailCategories.contains(category)) {
      throw ArgumentError.value(category, 'category', 'Unsupported email category');
    }
    await client.patch('/emails/$id/category', data: {'category': category});
  }

  Future<Map<String, dynamic>> summarize(String id, {String mode = 'short'}) async {
    final response = await client.post('/ai/summary/$id', data: {'mode': mode, 'persist': false, 'consentGranted': true});
    return (response.data as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> compose({
    required String operation,
    String? instruction,
    String? context,
    String? threadText,
  }) async {
    const operations = {
      'draft',
      'rephrase',
      'shorten',
      'expand',
      'professional',
      'friendly',
      'formal',
      'casual',
      'polite',
      'direct',
      'grammar',
      'translate',
      'subject',
      'quick_reply',
    };
    if (!operations.contains(operation)) {
      throw ArgumentError.value(operation, 'operation', 'Unsupported AI write operation');
    }
    final response = await client.post('/ai/write', data: {
      'operation': operation,
      'consentGranted': true,
      if (instruction != null && instruction.trim().isNotEmpty) 'instruction': instruction.trim(),
      if (context != null && context.trim().isNotEmpty) 'context': context.trim(),
      if (threadText != null && threadText.trim().isNotEmpty) 'threadText': threadText.trim(),
    });
    return (response.data as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> getActions(String id) async {
    final response = await client.get('/emails/$id/actions');
    return (response.data as Map).cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> getPriority(String id) async {
    final response = await client.get('/emails/$id/priority');
    return (response.data as Map).cast<String, dynamic>();
  }

  Future<List<OrderRecordModel>> listOrders() async {
    final response = await client.get('/emails/orders');
    final data = (response.data as Map).cast<String, dynamic>();
    return ((data['orders'] as List?) ?? const []).whereType<Map>().map((item) => OrderRecordModel.fromJson(item.cast<String, dynamic>())).toList(growable: false);
  }

  Future<List<FinanceRecordModel>> listFinanceRecords() async {
    final response = await client.get('/emails/finance');
    final data = (response.data as Map).cast<String, dynamic>();
    return ((data['records'] as List?) ?? const []).whereType<Map>().map((item) => FinanceRecordModel.fromJson(item.cast<String, dynamic>())).toList(growable: false);
  }

  Future<List<SubscriptionRecordModel>> listSubscriptions() async {
    final response = await client.get('/emails/subscriptions');
    final data = (response.data as Map).cast<String, dynamic>();
    return ((data['subscriptions'] as List?) ?? const []).whereType<Map>().map((item) => SubscriptionRecordModel.fromJson(item.cast<String, dynamic>())).toList(growable: false);
  }

  Future<CatchUpModel> getCatchUp() async {
    final response = await client.get('/emails/catch-up');
    return CatchUpModel.fromJson((response.data as Map).cast<String, dynamic>());
  }

  Future<StorageQuotaModel> getStorageQuota() async {
    final response = await client.get('/emails/attachments/quota');
    return StorageQuotaModel.fromJson((response.data as Map).cast<String, dynamic>());
  }

  Future<ThreatAnalysisModel?> getThreat(String id) async {
    final response = await client.get('/security/emails/$id/threat');
    final analysis = (response.data as Map)['analysis'];
    if (analysis is! Map) return null;
    return ThreatAnalysisModel.fromJson(analysis.cast<String, dynamic>());
  }

  Future<void> reportSecurity(String id, String type,
      {String reason = ''}) async {
    if (type != 'spam' && type != 'phishing') {
      throw ArgumentError.value(type, 'type', 'Must be spam or phishing');
    }
    await client.post('/security/emails/$id/report',
        data: {'type': type, 'reason': reason});
  }

  Future<EmailModel> get(String id) async => EmailModel.fromJson(
        ((await client.get('/emails/$id')).data as Map).cast<String, dynamic>(),
      );
  Future<EmailModel> send({
    required List<EmailAddressModel> to,
    required String subject,
    required String bodyText,
    String? bodyHtml,
    List<EmailAddressModel> cc = const [],
    List<EmailAddressModel> bcc = const [],
    List<EmailAttachmentModel> attachments = const [],
    bool isDraft = false,
    String? draftId,
    String? scheduledAt,
    String? replyToId,
  }) async {
    final payload = {
      'to': to.map((x) => x.toJson()).toList(),
      'subject': subject,
      'cc': cc.map((x) => x.toJson()).toList(),
      'bcc': bcc.map((x) => x.toJson()).toList(),
      'attachments': attachments
          .map((x) => {
                'id': x.id,
                'filename': x.filename,
                'mimeType': x.mimeType,
                'size': x.size
              })
          .toList(),
      'bodyText': bodyText,
      'bodyHtml': bodyHtml ?? '<p>${bodyText.replaceAll('\n', '<br/>')}</p>',
      'isDraft': isDraft,
      if (scheduledAt != null) 'scheduledAt': scheduledAt,
      if (replyToId != null) 'replyToId': replyToId,
    };
    final response = draftId == null
        ? await client.post('/emails', data: payload)
        : await client.patch(
            '/emails/$draftId/draft',
            data: {...payload, 'sendNow': !isDraft},
          );
    return EmailModel.fromJson((response.data as Map).cast<String, dynamic>());
  }

  Future<EmailModel> toggleStar(String id) async => EmailModel.fromJson(
        ((await client.patch('/emails/$id/star')).data as Map)
            .cast<String, dynamic>(),
      );
  Future<EmailModel> setRead(String id, bool value) async =>
      EmailModel.fromJson(
        ((await client.patch('/emails/$id/read', data: {'isRead': value})).data
                as Map)
            .cast<String, dynamic>(),
      );
  Future<EmailModel> move(String id, String folder) async =>
      EmailModel.fromJson(
        ((await client.patch('/emails/$id/move', data: {'folder': folder})).data
                as Map)
            .cast<String, dynamic>(),
      );
  Future<void> trash(String id) async {
    await client.delete('/emails/$id');
  }

  Future<EmailModel> restore(String id) async => move(id, 'inbox');
  Future<File> downloadAttachment(EmailAttachmentModel attachment) async {
    if (attachment.id.isEmpty) throw StateError('Attachment id is required');
    if (attachment.scanStatus != 'clean') {
      throw AttachmentSecurityException(
          'Attachment is unavailable until malware scanning returns a clean verdict');
    }
    final response = await client.get<List<int>>(
      '/emails/attachments/${Uri.encodeComponent(attachment.id)}',
      queryParameters: {'download': '1'},
      options: Options(responseType: ResponseType.bytes),
    );
    final safeName = sanitizeAttachmentFilename(attachment.filename,
        fallback: attachment.id);
    final path = await attachmentPlatform.saveFile(
      filename: safeName.isEmpty ? attachment.id : safeName,
      bytes: response.data ?? const <int>[],
    );
    return File(path);
  }

  Future<void> shareAttachment(EmailAttachmentModel attachment) async {
    final file = await downloadAttachment(attachment);
    await attachmentPlatform.shareFile(
        path: file.path, filename: attachment.filename);
  }

  Future<void> logout() async {
    try {
      await client.post('/auth/logout');
    } catch (_) {}
  }
}
