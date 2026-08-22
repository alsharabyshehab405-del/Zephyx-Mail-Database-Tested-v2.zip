import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novamail_flutter/core/theme/app_theme.dart';
import 'package:novamail_flutter/shared/widgets/brand_mark.dart';
import 'package:novamail_flutter/l10n/app_localizations.dart';

void main() {
  test('brand theme exposes light and dark surfaces', () {
    expect(AppTheme.light().colorScheme.primary, AppColors.primary);
    expect(AppTheme.dark().brightness, Brightness.dark);
    expect(AppColors.cyan, isNot(equals(AppColors.primary)));
  });

  for (final locale in AppLocalizations.supportedLocales) {
    testWidgets(
        'brand mark fits ${locale.toLanguageTag()} on a compact surface',
        (tester) async {
      final direction =
          locale.languageCode == 'ar' || locale.languageCode == 'ur'
              ? TextDirection.rtl
              : TextDirection.ltr;
      await tester.pumpWidget(
        MaterialApp(
          locale: locale,
          theme: AppTheme.light(),
          home: Directionality(
            textDirection: direction,
            child: const Scaffold(
              body: SizedBox(
                width: 320,
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: BrandMark(),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Zephyx Mail'), findsOneWidget);
      final bounds = tester.getRect(find.byType(BrandMark));
      expect(bounds.width, lessThanOrEqualTo(288));
    });
  }
}
