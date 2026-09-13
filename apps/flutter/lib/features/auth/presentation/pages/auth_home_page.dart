import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AuthHomePage extends StatelessWidget {
  const AuthHomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Auth')),
      body: Center(
        child: TextButton(
          onPressed: () => context.go('/app/dashboard'),
          child: const Text('Continue to dashboard (placeholder)'),
        ),
      ),
    );
  }
}