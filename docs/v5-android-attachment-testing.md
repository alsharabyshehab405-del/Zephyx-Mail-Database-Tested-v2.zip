# v5 Android Attachment Testing

The Flutter attachment path uses `AttachmentPlatformAdapter` and the `novamail/attachments` MethodChannel. Production code provides `MethodChannelAttachmentPlatformAdapter` with a Dart `path_provider`/`share_plus` fallback when native handlers are unavailable.

CI executes the injected adapter contract tests in `mobile/novamail-flutter/test/email_attachment_test.dart`. Those tests verify sanitized filenames, downloaded bytes, save-path propagation, share-path propagation, network failure, empty attachment IDs, and permission failure propagation without using credentials or a real account.

The current GitHub Actions Linux runner does not start an Android emulator for this project. Consequently, CI does not claim a real Android MethodChannel or Android permission-dialog test. A device/emulator test remains a release-environment validation item and must run on an Android-capable runner before claiming native platform coverage.

No FCM, WebPush, ClamAV, Gmail OAuth, SMTP, or other external credential is used by these tests.
