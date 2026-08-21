import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

class AppLocalizations {
  final Locale locale;
  final Map<String, String> _messages;

  const AppLocalizations(this.locale, this._messages);

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  static const List<Locale> supportedLocales = [
    Locale('en'),
    Locale('ar'),
    Locale('es'),
    Locale('fr'),
    Locale('de'),
    Locale('pt'),
    Locale('it'),
    Locale('tr'),
    Locale('ru'),
    Locale('zh', 'CN'),
    Locale('ja'),
    Locale('ko'),
    Locale('hi'),
    Locale('id'),
    Locale('ur'),
  ];

  static Future<AppLocalizations> load(Locale requested) async {
    final locale = _supportedLocale(requested);
    final assetName = _assetName(locale);
    Map<String, dynamic> raw;
    try {
      raw =
          jsonDecode(await rootBundle.loadString('assets/l10n/$assetName.json'))
              as Map<String, dynamic>;
    } catch (_) {
      raw = jsonDecode(await rootBundle.loadString('assets/l10n/en.json'))
          as Map<String, dynamic>;
    }
    Intl.defaultLocale = locale.toLanguageTag();
    return AppLocalizations(
      locale,
      raw.map((key, value) => MapEntry(key, value.toString())),
    );
  }

  static Locale _supportedLocale(Locale requested) {
    return supportedLocales.firstWhere(
      (candidate) =>
          candidate.languageCode == requested.languageCode &&
          (candidate.countryCode == null ||
              requested.countryCode == candidate.countryCode),
      orElse: () => const Locale('en'),
    );
  }

  static String _assetName(Locale locale) {
    return locale.countryCode == null
        ? locale.languageCode
        : '${locale.languageCode}-${locale.countryCode}';
  }

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  bool get isRtl => const {'ar', 'ur'}.contains(locale.languageCode);

  String text(String key, {Map<String, Object>? values}) {
    var message = _messages[key] ?? key;
    values?.forEach((name, value) {
      message = message.replaceAll('{$name}', value.toString());
    });
    return message;
  }

  String plural(String key, int count) {
    final message = text(key);
    final localeName = locale.toLanguageTag();
    final zero = _icuBranch(message, '=0') ?? _icuBranch(message, 'zero');
    final one = _icuBranch(message, 'one');
    final two = _icuBranch(message, 'two');
    final few = _icuBranch(message, 'few');
    final many = _icuBranch(message, 'many');
    final other = _icuBranch(message, 'other') ?? message;
    final selected = Intl.plural(
      count,
      zero: zero,
      one: one,
      two: two,
      few: few,
      many: many,
      other: other,
      locale: localeName,
    );
    return selected.replaceAll(
      '#',
      NumberFormat.decimalPattern(localeName).format(count),
    );
  }

  String? _icuBranch(String pattern, String branch) {
    final marker = '$branch {';
    final start = pattern.indexOf(marker);
    if (start < 0) return null;
    var depth = 0;
    final contentStart = start + marker.length;
    for (var index = contentStart; index < pattern.length; index++) {
      if (pattern[index] == '{') depth++;
      if (pattern[index] == '}') {
        if (depth == 0) return pattern.substring(contentStart, index);
        depth--;
      }
    }
    return null;
  }

  String get inbox => text('inbox');
  String get compose => text('compose');
  String get settings => text('settings');
  String get signIn => text('signIn');
  String get signOut => text('signOut');
  String get email => text('email');
  String get password => text('password');
  String inboxCount(int count) => plural('inboxCount', count);

  String formatDateTime(DateTime value, {String? timeZone}) {
    return DateFormat.yMMMd(
      locale.toLanguageTag(),
    ).add_jm().format(value.toLocal());
  }

  String formatNumber(num value) {
    return NumberFormat.decimalPattern(locale.toLanguageTag()).format(value);
  }
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) => AppLocalizations.supportedLocales.any(
        (candidate) => candidate.languageCode == locale.languageCode,
      );

  @override
  Future<AppLocalizations> load(Locale locale) => AppLocalizations.load(locale);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}
