import 'package:flutter/material.dart';

/// Minimal localizations scaffold — extend with ARB files for production.
class AppLocalizations {
  final Locale locale;

  AppLocalizations(this.locale);

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  static const List<Locale> supportedLocales = [
    Locale('en'),
    Locale('ar'),
  ];

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  bool get isRtl => locale.languageCode == 'ar';

  String get inbox => locale.languageCode == 'ar' ? 'صندوق الوارد' : 'Inbox';
  String get compose => locale.languageCode == 'ar' ? 'إنشاء' : 'Compose';
  String get settings => locale.languageCode == 'ar' ? 'الإعدادات' : 'Settings';
  String get signIn => locale.languageCode == 'ar' ? 'تسجيل الدخول' : 'Sign In';
  String get signOut => locale.languageCode == 'ar' ? 'تسجيل الخروج' : 'Sign Out';
  String get email => locale.languageCode == 'ar' ? 'البريد الإلكتروني' : 'Email';
  String get password => locale.languageCode == 'ar' ? 'كلمة المرور' : 'Password';
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      AppLocalizations.supportedLocales
          .any((l) => l.languageCode == locale.languageCode);

  @override
  Future<AppLocalizations> load(Locale locale) async =>
      AppLocalizations(locale);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}
