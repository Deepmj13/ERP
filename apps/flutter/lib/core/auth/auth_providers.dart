import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'auth_models.dart';
import 'auth_repository.dart';
import 'session_controller.dart';
import 'token_store.dart';
import '../network/api_client.dart';

part 'auth_providers.g.dart';

/// Injected at build/run time, e.g.
/// `flutter run --dart-define=API_BASE_URL=https://api.example.com/api/v1`.
/// Defaults target local development (use `10.0.2.2` from the Android emulator).
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3000/api/v1',
);

final tokenStoreProvider = Provider<TokenStore>(
  (ref) => TokenStore(),
);

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(
    baseUrl: apiBaseUrl,
    accessTokenSource: ref.watch(tokenStoreProvider),
    refreshTokens: () async {
      await ref.read(sessionControllerProvider.notifier).refreshTokens();
    },
    onSessionExpired: () {
      ref.read(sessionControllerProvider.notifier).sessionExpired();
    },
  ),
);

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(
    ref.watch(apiClientProvider),
    ref.watch(tokenStoreProvider),
  ),
);

@riverpod
AuthContext? authContext(Ref ref) {
  final session = ref.watch(sessionControllerProvider);
  return session.context;
}