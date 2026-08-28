import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:riverpod/riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'api_client.g.dart';

const _baseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: '');
const _isRelease = bool.fromEnvironment('dart.vm.product');

bool isBackendNotConfiguredError(Object? error) {
  if (error is StateError) {
    return error.message == 'Backend Not Configured';
  }
  if (error is DioException) {
    return isBackendNotConfiguredError(error.error);
  }
  return false;
}

String validateApiBaseUrl(String raw, {bool isRelease = _isRelease}) {
  final value = raw.trim();
  if (value.isEmpty) return '';
  final uri = Uri.tryParse(value);
  if (uri == null || uri.host.isEmpty || (uri.scheme != 'https' && uri.scheme != 'http')) {
    throw const FormatException('API_BASE_URL must be an absolute HTTP(S) URL');
  }
  final forbiddenHosts = {'localhost', '127.0.0.1', '::1', '10.0.2.2'};
  if (forbiddenHosts.contains(uri.host.toLowerCase())) {
    throw const FormatException('API_BASE_URL must not target a local host');
  }
  if (isRelease && uri.scheme != 'https') {
    throw const FormatException('Release builds require an HTTPS API_BASE_URL');
  }
  return value.replaceFirst(RegExp(r'/+$'), '');
}

const _storage = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);

@riverpod
Dio dio(Ref ref) {
  final configuredBaseUrl = validateApiBaseUrl(_baseUrl);
  final client = Dio(
    BaseOptions(
      baseUrl: configuredBaseUrl.isEmpty ? 'https://backend-not-configured.invalid' : configuredBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ),
  );

  Future<Response<dynamic>>? refreshFuture;

  Future<Response<dynamic>> refreshTokens() {
    if (configuredBaseUrl.isEmpty) throw StateError('Backend Not Configured');
    final existing = refreshFuture;
    if (existing != null) return existing;
    final future = () async {
      final refreshToken = await _storage.read(key: 'refresh_token');
      if (refreshToken == null) throw StateError('No refresh token');
      return Dio(
        BaseOptions(baseUrl: configuredBaseUrl),
      ).post('/auth/refresh', data: {'refreshToken': refreshToken});
    }();
    refreshFuture = future.whenComplete(() => refreshFuture = null);
    return refreshFuture!;
  }

  // Auth interceptor — attach Bearer token
  client.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        if (configuredBaseUrl.isEmpty) {
          return handler.reject(DioException(requestOptions: options, error: StateError('Backend Not Configured'), type: DioExceptionType.connectionError));
        }
        final token = await _storage.read(key: 'access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (error, handler) async {
        final request = error.requestOptions;
        final isRefreshRequest = request.path.endsWith('/auth/refresh');
        if (error.response?.statusCode == 401 &&
            !isRefreshRequest &&
            request.extra['retriedAfterRefresh'] != true) {
          try {
            final response = await refreshTokens();
            final newAccess = response.data['accessToken'] as String;
            final newRefresh = response.data['refreshToken'] as String;
            await _storage.write(key: 'access_token', value: newAccess);
            await _storage.write(key: 'refresh_token', value: newRefresh);
            request.extra['retriedAfterRefresh'] = true;
            request.headers['Authorization'] = 'Bearer $newAccess';
            return handler.resolve(await client.fetch(request));
          } catch (_) {
            await _storage.deleteAll();
          }
        }
        return handler.next(error);
      },
    ),
  );

  return client;
}
