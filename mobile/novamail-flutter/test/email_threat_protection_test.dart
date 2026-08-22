import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novamail_flutter/features/email/data/email_repository.dart';

void main() {
  test('parses explainable threat analysis from the API email contract', () {
    final email = EmailModel.fromJson({
      'id': 'email-1',
      'subject': 'Security alert',
      'bodyText': 'Review this message',
      'bodyHtml': '<p>Review this message</p>',
      'from': {'email': 'sender@example.test'},
      'folder': 'inbox',
      'isRead': false,
      'isStarred': false,
      'isDraft': false,
      'threat': {
        'overallRisk': 'high',
        'spoofingRisk': 'medium',
        'spamScore': 72,
        'spfResult': 'fail',
        'dkimResult': 'pass',
        'dmarcResult': 'fail',
        'malwareStatus': 'clean',
        'spamReasons': [
          {'code': 'urgent_language', 'label': 'Urgent language'},
        ],
      },
    });

    expect(email.threat?.overallRisk, 'high');
    expect(email.threat?.spoofingRisk, 'medium');
    expect(email.threat?.spamScore, 72);
    expect(email.threat?.spfResult, 'fail');
    expect(email.threat?.reasons, ['Urgent language']);
  });

  test('fails closed before network access for an unscanned attachment',
      () async {
    final repository = EmailRepository(Dio());
    await expectLater(
      repository.downloadAttachment(const EmailAttachmentModel(
        id: 'attachment-1',
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        size: 10,
      )),
      throwsA(isA<AttachmentSecurityException>()),
    );
  });

  test('rejects invalid security report types before sending a request',
      () async {
    final repository = EmailRepository(Dio());
    await expectLater(
      repository.reportSecurity('email-1', 'malware'),
      throwsA(isA<ArgumentError>()),
    );
  });
}
