import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'auth_models.dart';
import 'auth_providers.dart';
import 'session_state.dart';
import '../network/api_exception.dart';

part 'session_controller.g.dart';

/// UI source of truth for the sign-in session (G-5).
///
/// On boot it restores a persisted refresh token from secure storage and
/// rotates it (ADR-0005). All state transitions here are idempotent so the
/// ApiClient 401-refresh hook can safely drive `refreshTokens`/`sessionExpired`.
@riverpod
class SessionController extends _$SessionController {
  @override
  SessionState build() {
    _restore();
    return const SessionState.restoring();
  }

  Future<void> login({required String email, required String password}) {
    final repo = ref.read(authRepositoryProvider);
    return _authenticate(() => repo.login(email: email, password: password));
  }

  Future<void> register({
    required String tenantName,
    required String name,
    required String email,
    required String password,
  }) {
    final repo = ref.read(authRepositoryProvider);
    return _authenticate(
      () => repo.register(
        tenantName: tenantName,
        name: name,
        email: email,
        password: password,
      ),
    );
  }

  Future<void> logout() async {
    await ref.read(authRepositoryProvider).logout();
    state = const SessionState.unauthenticated();
  }

  /// Rotates tokens (boot restore or ApiClient 401 hook).
  Future<void> refreshTokens() async {
    final store = ref.read(tokenStoreProvider);
    final token = await store.refreshToken();
    if (token == null) {
      state = const SessionState.unauthenticated();
      return;
    }
    final repo = ref.read(authRepositoryProvider);
    try {
      final context = await repo.refresh(token);
      state = SessionState.authenticated(context);
    } on ApiException {
      await repo.clearSession();
      state = const SessionState.unauthenticated();
      rethrow;
    }
  }

  /// Forces sign-out (refresh rejected / token revoked server-side).
  Future<void> sessionExpired() async {
    await ref.read(authRepositoryProvider).clearSession();
    state = const SessionState.unauthenticated();
  }

  Future<void> _restore() async {
    try {
      await refreshTokens();
    } on ApiException {
      state = const SessionState.unauthenticated();
    } catch (_) {
      state = const SessionState.unauthenticated();
    }
  }

  Future<void> _authenticate(Future<AuthContext> Function() request) async {
    state = const SessionState.authenticating();
    try {
      final context = await request();
      state = SessionState.authenticated(context);
    } on ApiException catch (e) {
      state = SessionState.error(e.message);
      rethrow;
    } catch (_) {
      state = const SessionState.error('Unable to reach the server');
      rethrow;
    }
  }
}