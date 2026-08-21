import 'package:flutter_test/flutter_test.dart';
import 'package:novamail_flutter/core/notifications/push_adapter.dart';

void main() {
  test('fake push adapter registers and unregisters a device', () async {
    final adapter = FakePushAdapter();
    final id = await adapter.register();
    expect(id, 'fake-device');
    expect(adapter.registered, contains('fake-device'));
    await adapter.unregister(id!);
    expect(adapter.registered, isEmpty);
  });

  test('not configured adapter does not pretend to deliver push', () async {
    const adapter = NotConfiguredPushAdapter();
    expect(await adapter.register(), isNull);
  });
}
