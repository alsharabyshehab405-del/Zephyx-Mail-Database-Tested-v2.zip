import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novamail_flutter/features/email/data/email_repository.dart';

void main() {
  test('sanitizes traversal, unicode separators, and empty attachment names',
      () {
    final unixSafe = sanitizeAttachmentFilename('../../secret.pdf');
    final windowsSafe = sanitizeAttachmentFilename(r'..\\private\\token.txt');
    expect(unixSafe, isNot(contains('..')));
    expect(unixSafe, isNot(contains('/')));
    expect(windowsSafe, isNot(contains('..')));
    expect(windowsSafe, isNot(contains('\\')));
    expect(sanitizeAttachmentFilename('   '), 'attachment');
  });

  test(
      'downloadAttachment propagates a network failure before touching file APIs',
      () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://e2e.invalid'));
    dio.httpClientAdapter = _FailingAdapter();
    final repository = EmailRepository(dio);
    await expectLater(
      repository.downloadAttachment(const EmailAttachmentModel(
          id: 'a1', filename: 'a.txt', mimeType: 'text/plain', size: 1)),
      throwsA(isA<DioException>()),
    );
  });

  test(
      'downloadAttachment uses the injected platform adapter with a safe filename and bytes',
      () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://e2e.invalid'));
    dio.httpClientAdapter = _BytesAdapter([37, 80, 68, 70]);
    final platform = _RecordingAttachmentAdapter();
    final repository = EmailRepository(dio, attachmentPlatform: platform);
    final file = await repository.downloadAttachment(const EmailAttachmentModel(
      id: 'a1',
      filename: '../../invoice.pdf',
      mimeType: 'application/pdf',
      size: 4,
    ));
    expect(file.path, startsWith('/fake/'));
    expect(platform.savedName, endsWith('invoice.pdf'));
    expect(platform.savedName, isNot(contains('..')));
    expect(platform.savedName, isNot(contains('/')));
    expect(platform.savedName, isNot(contains('\\')));
    expect(platform.savedBytes, [37, 80, 68, 70]);
  });

  test('shareAttachment uses the injected platform share contract', () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://e2e.invalid'));
    dio.httpClientAdapter = _BytesAdapter([1, 2, 3]);
    final platform = _RecordingAttachmentAdapter();
    final repository = EmailRepository(dio, attachmentPlatform: platform);
    await repository.shareAttachment(const EmailAttachmentModel(
      id: 'a2',
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      size: 3,
    ));
    expect(platform.sharedPath, '/fake/report.pdf');
    expect(platform.sharedName, 'report.pdf');
  });

  test('platform adapter permission failure is propagated', () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://e2e.invalid'));
    dio.httpClientAdapter = _BytesAdapter([1]);
    final repository =
        EmailRepository(dio, attachmentPlatform: _PermissionDeniedAdapter());
    await expectLater(
      repository.downloadAttachment(const EmailAttachmentModel(
        id: 'a3',
        filename: 'restricted.txt',
        mimeType: 'text/plain',
        size: 1,
      )),
      throwsA(isA<AttachmentPermissionException>()),
    );
  });

  test('downloadAttachment rejects empty attachment id', () async {
    final repository = EmailRepository(Dio());
    await expectLater(
      repository.downloadAttachment(const EmailAttachmentModel(
          id: '', filename: 'a.txt', mimeType: 'text/plain', size: 1)),
      throwsStateError,
    );
  });
}

class _RecordingAttachmentAdapter implements AttachmentPlatformAdapter {
  String? savedName;
  List<int>? savedBytes;
  String? sharedPath;
  String? sharedName;
  @override
  Future<String> saveFile(
      {required String filename, required List<int> bytes}) async {
    savedName = filename;
    savedBytes = bytes;
    return '/fake/$filename';
  }

  @override
  Future<void> shareFile(
      {required String path, required String filename}) async {
    sharedPath = path;
    sharedName = filename;
  }
}

class _PermissionDeniedAdapter implements AttachmentPlatformAdapter {
  @override
  Future<String> saveFile(
          {required String filename, required List<int> bytes}) async =>
      throw AttachmentPermissionException();
  @override
  Future<void> shareFile(
          {required String path, required String filename}) async =>
      throw AttachmentPermissionException();
}

class _BytesAdapter implements HttpClientAdapter {
  final List<int> bytes;
  _BytesAdapter(this.bytes);
  @override
  void close({bool force = false}) {}
  @override
  Future<ResponseBody> fetch(RequestOptions options,
          Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async =>
      ResponseBody.fromBytes(bytes, 200, headers: {
        Headers.contentTypeHeader: ['application/pdf']
      });
}

class _FailingAdapter implements HttpClientAdapter {
  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
        error: 'offline');
  }
}
