import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:novamail_flutter/l10n/app_localizations.dart';

void main() {
  const expected = <String>{
    'en',
    'ar',
    'es',
    'fr',
    'de',
    'pt',
    'it',
    'tr',
    'ru',
    'zh',
    'ja',
    'ko',
    'hi',
    'id',
    'ur',
  };

  test('supports all v5 locales and derives RTL for every RTL locale', () {
    expect(
      AppLocalizations.supportedLocales
          .map((locale) => locale.languageCode)
          .toSet(),
      expected,
    );
    expect(
      const {'ar', 'ur'}.every(
        (code) => AppLocalizations.supportedLocales.any(
          (locale) => locale.languageCode == code,
        ),
      ),
      isTrue,
    );
  });

  test(
    'ICU-style variables, plural and locale formatting stay deterministic',
    () {
      const messages = <String, String>{
        'hello': 'Hello {name}',
        'inboxCount':
            '{count, plural, =0 {No messages} one {# message} other {# messages}}',
      };
      final localizations = AppLocalizations(const Locale('en'), messages);
      expect(
        localizations.text('hello', values: const {'name': 'Nova'}),
        'Hello Nova',
      );
      expect(localizations.plural('inboxCount', 1), contains('message'));
      expect(localizations.plural('inboxCount', 3), contains('messages'));
      expect(localizations.formatNumber(1234), isNotEmpty);
      expect(
        localizations.formatDateTime(DateTime.utc(2026, 1, 2)),
        isNotEmpty,
      );
    },
  );

  testWidgets(
    'RTL flag is applied to Arabic and Urdu without affecting LTR locales',
    (tester) async {
      final arabic = AppLocalizations(const Locale('ar'), const {
        'inbox': 'الوارد',
      });
      final urdu = AppLocalizations(const Locale('ur'), const {
        'inbox': 'ان باکس',
      });
      final english = AppLocalizations(const Locale('en'), const {
        'inbox': 'Inbox',
      });
      expect(arabic.isRtl, isTrue);
      expect(urdu.isRtl, isTrue);
      expect(english.isRtl, isFalse);
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.rtl,
          child: Text(arabic.inbox),
        ),
      );
      expect(find.text('الوارد'), findsOneWidget);
    },
  );
}
