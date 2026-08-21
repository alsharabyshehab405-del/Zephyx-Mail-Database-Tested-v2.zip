import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'api_client.g.dart';

const _baseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:5000/api', // Android emulator localhost
);

const _storage = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);

@riverpod
Dio dio(DioRef ref) {
  final client = Dio(
    BaseOptions(
      baseUrl: _baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ),
  );

  // Auth interceptor — attach Bearer token
  client.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: 'access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          // Attempt token refresh
          try {
            final refreshToken = await _storage.read(key: 'refresh_token');
            if (refreshToken == null) return handler.next(error);

            final response = await Dio(BaseOptions(baseUrl: _baseUrl)).post(
              '/auth/refresh',
              data: {'refreshToken': refreshToken},
            );

            final newAccess = response.data['accessToken'] as String;
            final newRefresh = response.data['refreshToken'] as String;

            await _storage.write(key: 'access_token', value: newAccess);
            await _storage.write(key: 'refresh_token', value: newRefresh);

            // Retry the original request
            error.requestOptions.headers['Authorization'] = 'Bearer $newAccess';
            final retryResponse = await client.fetch(error.requestOptions);
            return handler.resolve(retryResponse);
          } catch (_) {
            // Refresh failed — clear tokens
            await _storage.deleteAll();
          }
        }
        return handler.next(error);
      },
    ),
  );

  return client;
}
