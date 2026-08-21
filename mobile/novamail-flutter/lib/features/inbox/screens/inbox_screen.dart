import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../auth/providers/auth_provider.dart';

class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'NovaMail',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(icon: const Icon(Icons.search), onPressed: () {}),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      drawer: _buildDrawer(context, ref),
      body: _InboxList(),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/compose'),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.edit_outlined),
        label: const Text('Compose'),
      ),
    );
  }

  Widget _buildDrawer(BuildContext context, WidgetRef ref) {
    return Drawer(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          DrawerHeader(
            decoration: const BoxDecoration(color: AppColors.primary),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                const CircleAvatar(
                  backgroundColor: Colors.white30,
                  radius: 24,
                  child: Icon(Icons.person, color: Colors.white),
                ),
                const SizedBox(height: 8),
                Text(
                  'NovaMail',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
          _DrawerItem(
            icon: Icons.inbox_outlined,
            label: 'Inbox',
            selected: true,
            onTap: () {},
          ),
          _DrawerItem(
            icon: Icons.star_border_outlined,
            label: 'Starred',
            onTap: () {},
          ),
          _DrawerItem(icon: Icons.send_outlined, label: 'Sent', onTap: () {}),
          _DrawerItem(
            icon: Icons.drafts_outlined,
            label: 'Drafts',
            onTap: () {},
          ),
          _DrawerItem(icon: Icons.delete_outline, label: 'Trash', onTap: () {}),
          const Divider(),
          _DrawerItem(
            icon: Icons.logout_outlined,
            label: 'Sign Out',
            onTap: () {
              ref.read(authStateNotifierProvider.notifier).logout();
              Navigator.pop(context);
            },
          ),
        ],
      ),
    );
  }
}

class _DrawerItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _DrawerItem({
    required this.icon,
    required this.label,
    this.selected = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: selected ? AppColors.primary : null),
      title: Text(
        label,
        style: TextStyle(
          color: selected ? AppColors.primary : null,
          fontWeight: selected ? FontWeight.w600 : null,
        ),
      ),
      selected: selected,
      onTap: onTap,
    );
  }
}

class _InboxList extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // TODO: wire up real email list from API
    return ListView.separated(
      itemCount: 0,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (_, index) => const SizedBox.shrink(),
    );
  }
}
