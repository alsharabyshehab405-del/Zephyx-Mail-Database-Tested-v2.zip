import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novamail_flutter/l10n/app_localizations.dart';

void main() {
  for (final locale in AppLocalizations.supportedLocales) {
    testWidgets(
        'renders ${locale.toLanguageTag()} long and Unicode text without overflow',
        (tester) async {
      final messages = {
        'inbox':
            'Inbox العربية English 日本語 한국어 हिन्दी اردو ${List.filled(8, 'pseudo-long ').join()}',
        'settings': 'Settings',
        'compose': 'Compose',
      };
      await tester.pumpWidget(MaterialApp(
        locale: locale,
        supportedLocales: [locale],
        localizationsDelegates: [
          GlobalMaterialLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          _TestLocalizationsDelegate(messages)
        ],
        home: Directionality(
          textDirection: const {'ar', 'ur'}.contains(locale.languageCode)
              ? TextDirection.rtl
              : TextDirection.ltr,
          child: Scaffold(
            appBar: AppBar(
              title: Text(messages['inbox']!,
                  maxLines: 2, overflow: TextOverflow.ellipsis),
            ),
            body: ListView(children: [
              Text(messages['settings']!),
              Text(messages['compose']!),
              Text(messages['inbox']!)
            ]),
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Settings'), findsOneWidget);
    });
  }

  testWidgets('Arabic and Urdu are RTL while English remains LTR',
      (tester) async {
    for (final locale in [
      const Locale('ar'),
      const Locale('ur'),
      const Locale('en')
    ]) {
      await tester.pumpWidget(MaterialApp(
        locale: locale,
        supportedLocales: [locale],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          _TestLocalizationsDelegate({'inbox': 'Inbox'})
        ],
        home: Builder(
            builder: (context) => Directionality(
                  textDirection: AppLocalizations.of(context).isRtl
                      ? TextDirection.rtl
                      : TextDirection.ltr,
                  child: Text(AppLocalizations.of(context).inbox),
                )),
      ));
      await tester.pumpAndSettle();
      final directionality =
          tester.widget<Directionality>(find.byType(Directionality).last);
      expect(
          directionality.textDirection,
          locale.languageCode == 'ar' || locale.languageCode == 'ur'
              ? TextDirection.rtl
              : TextDirection.ltr);
    }
  });
}

class _TestLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  final Map<String, String> messages;
  const _TestLocalizationsDelegate(this.messages);
  @override
  bool isSupported(Locale locale) => true;
  @override
  Future<AppLocalizations> load(Locale locale) async =>
      AppLocalizations(locale, messages);
  @override
  bool shouldReload(covariant _TestLocalizationsDelegate old) => false;
}
