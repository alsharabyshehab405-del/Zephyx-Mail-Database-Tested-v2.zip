import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/app_localizations.dart';
import '../../auth/providers/auth_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  static const supportedLocales = [
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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final themeMode = ref.watch(themeModeNotifierProvider);
    final locale = ref.watch(localeNotifierProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.text('settings'))),
      body: ListView(children: [
        _section(context, l10n.text('account')),
        ListTile(
            leading: const Icon(Icons.person_outline),
            title: Text(l10n.text('profile')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showMessage(context, l10n.text('profile'))),
        ListTile(
            leading: const Icon(Icons.lock_outline),
            title: Text(l10n.text('changePassword')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showMessage(context, l10n.text('changePassword'))),
        const Divider(),
        _section(context, l10n.text('preferences')),
        ListTile(
            leading: const Icon(Icons.brightness_6_outlined),
            title: Text(l10n.text('theme')),
            trailing: DropdownButton<ThemeMode>(
                value: themeMode,
                underline: const SizedBox.shrink(),
                items: [
                  for (final mode in ThemeMode.values)
                    DropdownMenuItem(
                        value: mode, child: Text(l10n.text(mode.name)))
                ],
                onChanged: (mode) {
                  if (mode != null)
                    ref.read(themeModeNotifierProvider.notifier).setTheme(mode);
                })),
        ListTile(
            leading: const Icon(Icons.language_outlined),
            title: Text(l10n.text('language')),
            trailing: DropdownButton<Locale>(
                value: supportedLocales.any((x) => x == locale)
                    ? locale
                    : const Locale('en'),
                underline: const SizedBox.shrink(),
                items: [
                  for (final item in supportedLocales)
                    DropdownMenuItem(
                        value: item, child: Text(item.toLanguageTag()))
                ],
                onChanged: (value) {
                  if (value != null)
                    ref.read(localeNotifierProvider.notifier).setLocale(value);
                })),
        const Divider(),
        ListTile(
            leading: const Icon(Icons.shopping_bag_outlined),
            title: Text(l10n.text('commerceTitle')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/commerce')),
        const Divider(),
        ListTile(
            leading: const Icon(Icons.logout_outlined, color: Colors.red),
            title: Text(l10n.text('signOut'),
                style: const TextStyle(color: Colors.red)),
            onTap: () async {
              await ref.read(authStateNotifierProvider.notifier).logout();
              if (context.mounted) context.go('/login');
            }),
      ]),
    );
  }

  Widget _section(BuildContext context, String title) => Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 6),
      child: Text(title,
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(fontWeight: FontWeight.bold)));
  Future<void> _showMessage(BuildContext context, String title) =>
      showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
                  title: Text(title),
                  content:
                      Text(AppLocalizations.of(context).text('availableSoon')),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: Text(AppLocalizations.of(context).text('close')))
                  ]));
}
