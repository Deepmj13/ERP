import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/pages/auth_home_page.dart';
import '../../features/dashboard/presentation/pages/dashboard_page.dart';

/// Route map (plan §4) — route names are the contract between the Flutter
/// app and its deep-linking/save-state needs. Feature pages register here.
final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/app/dashboard',
    routes: [
      GoRoute(
        path: '/',
        redirect: (_, _) => '/app/dashboard',
      ),
      GoRoute(
        path: '/auth',
        name: 'auth',
        builder: (context, state) => const AuthHomePage(),
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
});

/// Placeholder authenticated shell; replaced when auth lands (Phase 1).
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