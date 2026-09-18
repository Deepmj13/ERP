import '../auth/auth_models.dart';
import '../auth/token_store.dart';
import '../network/api_client.dart';

/// Talks to the `/auth/*` endpoints. Session state is the repository-owned
/// [TokenStore]; UI state lives in `SessionController`.
class AuthRepository {
  AuthRepository(this._api, this._tokenStore);

  final ApiClient _api;
  final TokenStore _tokenStore;

  Future<AuthContext> register({
    required String tenantName,
    required String name,
    required String email,
    required String password,
  }) async {
    final result = await _api.post(
      '/auth/register',
      body: {
        'tenantName': tenantName,
        'name': name,
        'email': email,
        'password': password,
      },
    );
    return _accept(result.data);
  }

  Future<AuthContext> login({required String email, required String password}) async {
    final result = await _api.post('/auth/login', body: {'email': email, 'password': password});
    return _accept(result.data);
  }

  Future<void> logout() async {
    final refreshToken = await _tokenStore.refreshToken();
    if (refreshToken != null) {
      try {
        await _api.post(
          '/auth/logout',
          body: {'refreshToken': refreshToken},
          extra: {apiSkipAuthRefreshKey: true},
        );
      } catch (_) {
        // Best-effort: always clear local credentials regardless of the
        // server response (refresh-reuse already revokes server-side).
      }
    }
    await _tokenStore.clear();
  }

  /// Rotates the session and persists the NEW refresh token (ADR-0005).
  Future<AuthContext> refresh(String refreshToken) async {
    final result = await _api.post(
      '/auth/refresh',
      body: {'refreshToken': refreshToken},
      extra: {apiSkipAuthRefreshKey: true},
    );
    return _accept(result.data);
  }

  /// Validates the current access token; returns the caller identity.
  Future<({String userId, String email, String tenantId})> me() async {
    final result = await _api.get('/auth/me');
    final data = result.data;
    final user = data['user'] as Map<String, dynamic>;
    return (
      userId: user['id'] as String,
      email: user['email'] as String,
      tenantId: data['tenantId'] as String,
    );
  }

  Future<void> clearSession() => _tokenStore.clear();

  AuthContext _accept(Map<String, dynamic> data) {
    final context = AuthContext.fromJson(data);
    _tokenStore.setAccessToken(context.accessToken);
    _tokenStore.saveRefreshToken(context.refreshToken);
    return context;
  }
}