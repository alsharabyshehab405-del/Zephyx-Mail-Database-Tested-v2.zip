import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/api_client.dart';

part 'auth_provider.g.dart';

const _storage = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);

// ── Auth State ────────────────────────────────────────────────────────────────
class AuthState {
  final bool isAuthenticated;
  final Map<String, dynamic>? user;

  const AuthState({this.isAuthenticated = false, this.user});
}

@riverpod
class AuthStateNotifier extends _$AuthStateNotifier {
  @override
  AuthState build() {
    _init();
    return const AuthState();
  }

  Future<void> _init() async {
    final token = await _storage.read(key: 'access_token');
    if (token != null) {
      state = const AuthState(isAuthenticated: true);
    }
  }

  Future<void> setTokens({
    required String accessToken,
    required String refreshToken,
    required Map<String, dynamic> user,
  }) async {
    await _storage.write(key: 'access_token', value: accessToken);
    await _storage.write(key: 'refresh_token', value: refreshToken);
    state = AuthState(isAuthenticated: true, user: user);
  }

  Future<void> logout() async {
    await _storage.deleteAll();
    state = const AuthState();
  }
}

// ignore: library_private_types_in_public_api
final authStateProvider = authStateNotifierProvider;

// ── Theme Mode ────────────────────────────────────────────────────────────────
@riverpod
class ThemeModeNotifier extends _$ThemeModeNotifier {
  @override
  ThemeMode build() {
    _loadTheme();
    return ThemeMode.system;
  }

  Future<void> _loadTheme() async {
    final prefs = await SharedPreferences.getInstance();
    final theme = prefs.getString('theme') ?? 'system';
    state = _parse(theme);
  }

  Future<void> setTheme(ThemeMode mode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('theme', mode.name);
    state = mode;
  }

  ThemeMode _parse(String value) {
    return switch (value) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }
}

final themeModeProvider = themeModeNotifierProvider;

// ── Locale ────────────────────────────────────────────────────────────────────
@riverpod
class LocaleNotifier extends _$LocaleNotifier {
  @override
  Locale build() {
    _loadLocale();
    return const Locale('en');
  }

  static const _supportedLocaleCodes = {
    'en', 'ar', 'es', 'fr', 'de', 'pt', 'it', 'tr', 'ru', 'zh-CN',
    'ja', 'ko', 'hi', 'id', 'ur',
  };

  Future<void> _loadLocale() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('locale');
    if (saved != null && _supportedLocaleCodes.contains(saved)) {
      state = _parseLocale(saved);
      return;
    }

    try {
      final response = await ref.read(dioProvider).get('/users/me');
      final remote = response.data['locale'] as String?;
      if (remote != null && _supportedLocaleCodes.contains(remote)) {
        await prefs.setString('locale', remote);
        state = _parseLocale(remote);
      }
    } catch (_) {
      // Offline or unauthenticated: keep the English default.
    }
  }

  Future<void> setLocale(Locale locale) async {
    final code = _localeCode(locale);
    if (!_supportedLocaleCodes.contains(code)) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('locale', code);
    state = locale;
    try {
      await ref.read(dioProvider).patch('/users/me', data: {'locale': code});
    } catch (_) {
      // Local preference remains available if the account sync is offline.
    }
  }

  Locale _parseLocale(String value) {
    final parts = value.split('-');
    return parts.length == 2 ? Locale(parts[0], parts[1]) : Locale(parts[0]);
  }

  String _localeCode(Locale locale) {
    return locale.countryCode == null
        ? locale.languageCode
        : '${locale.languageCode}-${locale.countryCode}';
  }
}

final localeProvider = localeNotifierProvider;
