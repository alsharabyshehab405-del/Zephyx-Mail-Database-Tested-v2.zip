import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/providers/auth_provider.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/register_screen.dart';
import '../../features/inbox/screens/inbox_screen.dart';
import '../../features/email_detail/screens/email_detail_screen.dart';
import '../../features/compose/screens/compose_screen.dart';
import '../../features/settings/screens/settings_screen.dart';
import '../../shared/screens/splash_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final isLoggedIn = authState.isAuthenticated;
      final isOnAuth =
          state.matchedLocation == '/login' ||
          state.matchedLocation == '/register';

      if (!isLoggedIn && !isOnAuth) return '/login';
      if (isLoggedIn && isOnAuth) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (ctx, _) => const InboxScreen()),
      GoRoute(path: '/login', builder: (ctx, _) => const LoginScreen()),
      GoRoute(path: '/register', builder: (ctx, _) => const RegisterScreen()),
      GoRoute(
        path: '/email/:id',
        builder: (ctx, state) =>
            EmailDetailScreen(emailId: state.pathParameters['id']!),
      ),
      GoRoute(path: '/compose', builder: (ctx, _) => const ComposeScreen()),
      GoRoute(path: '/settings', builder: (ctx, _) => const SettingsScreen()),
    ],
    errorBuilder: (ctx, state) => const SplashScreen(),
  );
});
