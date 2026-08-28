import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novamail_flutter/core/network/api_client.dart';

void main() {
  test('empty API base URL is treated as not configured', () {
    expect(validateApiBaseUrl(''), isEmpty);
  });

  test('local aliases are rejected', () {
    expect(() => validateApiBaseUrl('http://localhost:5000/api'), throwsFormatException);
    expect(() => validateApiBaseUrl('http://127.0.0.1:5000/api'), throwsFormatException);
    expect(() => validateApiBaseUrl('http://10.0.2.2:5000/api'), throwsFormatException);
  });

  test('release accepts only a non-local HTTPS endpoint', () {
    expect(() => validateApiBaseUrl('http://staging.example.invalid/api', isRelease: true), throwsFormatException);
    expect(validateApiBaseUrl('https://staging.example.invalid/api/', isRelease: true), 'https://staging.example.invalid/api');
  });

  test('backend not configured detection is narrow and recursive', () {
    expect(isBackendNotConfiguredError(StateError('Backend Not Configured')), isTrue);
    expect(
      isBackendNotConfiguredError(
        DioException(
          requestOptions: RequestOptions(path: '/auth/login'),
          error: StateError('Backend Not Configured'),
        ),
      ),
      isTrue,
    );
    expect(isBackendNotConfiguredError(StateError('other error')), isFalse);
  });
}
