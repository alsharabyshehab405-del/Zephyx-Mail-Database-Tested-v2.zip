import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:novamail_flutter/core/theme/app_theme.dart';
import 'package:novamail_flutter/features/productivity/screens/productivity_dashboard_screen.dart';
import 'package:novamail_flutter/l10n/app_localizations.dart';

Map<String, dynamic> workspaceFixture() => {
      'smartInbox': {
        'emails': [
          {
            'email': {
              'id': 'email-1',
              'subject': 'Project meeting اجتماع проект',
              'fromEmail': 'team@example.test',
              'isRead': false,
            },
            'score': 94,
            'reasons': ['primary', 'unread'],
          },
        ],
      },
      'overdueTasks': [
        {'title': 'Review the project brief', 'dueAt': '2026-08-21T09:00:00Z'},
      ],
      'upcomingEvents': [
        {
          'id': 'event-1',
          'title': 'Planning session',
          'startsAt': '2026-08-23T09:00:00Z',
          'emailId': 'email-1',
        },
      ],
      'drafts': [
        {'id': 'draft-1', 'subject': 'Draft update'},
      ],
      'followUps': [
        {
          'emailId': 'email-1',
          'emailSubject': 'Awaiting your reply',
          'fromEmail': 'team@example.test',
          'remindAt': '2026-08-24T09:00:00Z',
          'status': 'open',
        },
      ],
    };

class _SynchronousAppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _SynchronousAppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) => AppLocalizations.supportedLocales.any(
        (candidate) => candidate.languageCode == locale.languageCode,
      );

  @override
  Future<AppLocalizations> load(Locale locale) => SynchronousFuture(
        AppLocalizations(locale, const {
          'productivityDashboard': 'Productivity workspace',
          'productivitySubtitle':
              'Email, tasks, meetings, drafts, and follow-ups in one place.',
          'importantMessages': 'Important messages',
          'overdueTasks': 'Overdue tasks',
          'upcomingMeetings': 'Upcoming meetings',
          'drafts': 'Drafts',
          'followUps': 'Follow-ups',
          'needsReply': 'Needs a reply',
          'smartInbox': 'Smart Inbox',
          'signalsNote': 'Signals from your inbox',
          'refresh': 'Refresh',
          'retry': 'Retry',
          'loading': 'Loading…',
          'loadError': 'Could not load productivity workspace.',
          'noData': 'Nothing to show yet.',
        }),
      );

  @override
  bool shouldReload(_SynchronousAppLocalizationsDelegate old) => false;
}

Widget synchronousDashboardHarness(
    {required Locale locale,
    required Future<Map<String, dynamic>> Function() loader}) {
  return ProviderScope(
    child: MaterialApp(
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        _SynchronousAppLocalizationsDelegate(),
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: AppTheme.light(),
      home: ProductivityDashboardScreen(loadWorkspace: loader),
    ),
  );
}

Widget dashboardHarness(
    {required Locale locale,
    required Future<Map<String, dynamic>> Function() loader}) {
  return ProviderScope(
    child: MaterialApp(
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: AppTheme.light(),
      home: ProductivityDashboardScreen(loadWorkspace: loader),
    ),
  );
}

void main() {
  for (final locale in AppLocalizations.supportedLocales) {
    testWidgets(
        'renders productivity dashboard for ${locale.toLanguageTag()} without overflow',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(340, 760));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      await tester.pumpWidget(dashboardHarness(
          locale: locale, loader: () async => workspaceFixture()));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.byType(ProductivityDashboardScreen), findsOneWidget);
      expect(find.text('Project meeting اجتماع проект'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('keeps Arabic and Urdu dashboards RTL on a narrow screen',
      (tester) async {
    for (final locale in [const Locale('ar'), const Locale('ur')]) {
      await tester.binding.setSurfaceSize(const Size(320, 760));
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      await tester.pumpWidget(synchronousDashboardHarness(
          locale: locale, loader: () async => workspaceFixture()));
      await tester.pumpAndSettle();
      final buildException = tester.takeException();
      expect(buildException, isNull);
      final direction =
          tester.widget<Directionality>(find.byType(Directionality).last);
      expect(direction.textDirection, TextDirection.rtl);
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('shows a real retry state when workspace API fails',
      (tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    await tester.pumpWidget(synchronousDashboardHarness(
        locale: const Locale('en'),
        loader: () async => throw StateError('offline')));
    await tester.pumpAndSettle();
    final buildException = tester.takeException();
    expect(buildException, isNull);
    expect(find.text('Could not load productivity workspace.'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });
}
