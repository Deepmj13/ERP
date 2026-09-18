import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:erp/app/app.dart';
import 'package:erp/core/auth/auth_providers.dart';
import 'package:erp/core/auth/token_store.dart';

/// In-memory token store so widget tests never touch platform plugins
/// (flutter_secure_storage has no host in the test VM).
class _MemoryTokenStore extends TokenStore {
  String? access;
  String? refresh;

  @override
  Future<String?> currentAccessToken() async => access;

  @override
  void setAccessToken(String? token) => access = token;

  @override
  Future<String?> refreshToken() async => refresh;

  @override
  Future<void> saveRefreshToken(String token) async => refresh = token;

  @override
  Future<void> clear() async {
    access = null;
    refresh = null;
  }
}

void main() {
  testWidgets('ERP app boots to the sign-in screen when unauthenticated', (tester) async {
    final store = _MemoryTokenStore();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [tokenStoreProvider.overrideWithValue(store)],
        child: const ErpApp(),
      ),
    );
    // Session restore resolves (no stored session) → router redirects to login.
    await tester.pumpAndSettle();

    expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
  });
}