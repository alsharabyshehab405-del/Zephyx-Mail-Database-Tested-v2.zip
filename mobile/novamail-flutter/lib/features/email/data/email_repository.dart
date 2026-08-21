import 'dart:io';
import 'dart:typed_data';

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
  const EmailAttachmentModel({
    required this.id,
    required this.filename,
    required this.mimeType,
    required this.size,
  });
  factory EmailAttachmentModel.fromJson(Map<String, dynamic> json) =>
      EmailAttachmentModel(
        id: '${json['id'] ?? ''}',
        filename: '${json['filename'] ?? ''}',
        mimeType: '${json['mimeType'] ?? 'application/octet-stream'}',
        size: (json['size'] as num?)?.toInt() ?? 0,
      );
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
  final bool isRead;
  final bool isStarred;
  final bool isDraft;
  final String? scheduledAt;
  final String? status;
  final String? createdAt;
  final String? threadId;
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
    required this.isRead,
    required this.isStarred,
    required this.isDraft,
    this.scheduledAt,
    this.status,
    this.createdAt,
    this.threadId,
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
      isRead: json['isRead'] == true,
      isStarred: json['isStarred'] == true,
      isDraft: json['isDraft'] == true,
      scheduledAt: json['scheduledAt'] as String?,
      status: json['status'] as String?,
      createdAt: json['createdAt'] as String?,
      threadId: json['threadId'] as String?,
    );
  }
}

class EmailPage {
  final List<EmailModel> emails;
  final String? nextCursor;
  final int unreadCount;
  final int total;
  const EmailPage({
    required this.emails,
    this.nextCursor,
    this.unreadCount = 0,
    this.total = 0,
  });
  factory EmailPage.fromJson(Map<String, dynamic> json) => EmailPage(
        emails: ((json['emails'] as List?) ?? const [])
            .whereType<Map>()
            .map((x) => EmailModel.fromJson(x.cast<String, dynamic>()))
            .toList(growable: false),
        nextCursor: json['nextCursor'] as String?,
        unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
        total: (json['total'] as num?)?.toInt() ?? 0,
      );
}

String sanitizeAttachmentFilename(String filename,
    {String fallback = 'attachment'}) {
  final cleaned = filename.replaceAll(RegExp(r'[^A-Za-z0-9._ -]'), '_').trim();
  final basename =
      cleaned.replaceAll('..', '_').replaceAll(RegExp(r'[/\\\\]'), '_');
  return basename.isEmpty ? fallback : basename;
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
      },
    );
    return EmailPage.fromJson((response.data as Map).cast<String, dynamic>());
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
