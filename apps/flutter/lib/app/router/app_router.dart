import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/auth/session_state.dart';
import '../../features/auth/presentation/pages/login_page.dart';
import '../../features/auth/presentation/pages/register_page.dart';
import '../../features/dashboard/presentation/pages/dashboard_page.dart';

/// Route map (plan §4) — route names are the contract between the Flutter app
/// and its deep-linking/save-state needs. Auth-guarded (G-5): unauthenticated
/// users land on `/auth/login`; signed-in users cannot reach `/auth/*`.
final appRouterProvider = Provider<GoRouter>((ref) {
  final router = GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final session = ref.read(sessionControllerProvider);
      final location = state.matchedLocation;

      if (session.isRestoring) {
        return location == '/splash' ? null : '/splash';
      }
      if (!session.isAuthenticated) {
        return location.startsWith('/auth') ? null : '/auth/login';
      }
      if (location.startsWith('/auth')) return '/app/dashboard';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const SplashPage()),
      GoRoute(
        path: '/auth/login',
        name: 'auth',
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: '/auth/register',
        name: 'register',
        builder: (context, state) => const RegisterPage(),
      ),
      ShellRoute(
        builder: (context, state, child) => _AppShell(child: child),
        routes: [
          GoRoute(
            path: '/app/dashboard',
            name: 'dashboard',
            builder: (context, state) => const DashboardPage(),
          ),
        ],
      ),
    ],
  );

  // Re-run redirects on every session transition (restoring→auth→out, …).
  ref.listen<SessionState>(sessionControllerProvider, (_, _) {
    router.refresh();
  });
  return router;
});

class SplashPage extends StatelessWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}

/// App shell behind the `/app` guard; hosts the authenticated scaffold.
class _AppShell extends StatelessWidget {
  const _AppShell({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(child: child),
    );
  }
}