import 'package:dio/dio.dart';

abstract interface class PushAdapter {
  Future<String?> register();
  Future<void> unregister(String deviceId);
}

class NotConfiguredPushAdapter implements PushAdapter {
  const NotConfiguredPushAdapter();
  @override
  Future<String?> register() async => null;
  @override
  Future<void> unregister(String deviceId) async {}
}

class ApiPushAdapter implements PushAdapter {
  final Dio client;
  final Future<String> Function() tokenProvider;
  const ApiPushAdapter({required this.client, required this.tokenProvider});

  @override
  Future<String?> register() async {
    final token = await tokenProvider();
    if (token.isEmpty) return null;
    final response = await client.post(
      '/notifications/devices',
      data: {'platform': 'android', 'pushToken': token},
    );
    return response.data['id'] as String?;
  }

  @override
  Future<void> unregister(String deviceId) async {
    await client.delete('/notifications/devices/$deviceId');
  }
}

class FakePushAdapter implements PushAdapter {
  final List<String> registered = [];
  @override
  Future<String?> register() async {
    const id = 'fake-device';
    registered.add(id);
    return id;
  }

  @override
  Future<void> unregister(String deviceId) async => registered.remove(deviceId);
}
