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

  test('downloadAttachment rejects empty attachment id', () async {
    final repository = EmailRepository(Dio());
    await expectLater(
      repository.downloadAttachment(const EmailAttachmentModel(
          id: '', filename: 'a.txt', mimeType: 'text/plain', size: 1)),
      throwsStateError,
    );
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
