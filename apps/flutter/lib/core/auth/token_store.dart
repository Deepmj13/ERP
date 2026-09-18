import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../network/api_client.dart';

/// Persists the rotating refresh token in secure storage and holds the current
/// access token in memory (plan §24, ADR-0005 session rotation).
class TokenStore implements AccessTokenSource {
  TokenStore({FlutterSecureStorage? storage}) : _storage = storage ?? const FlutterSecureStorage();

  static const _refreshKey = 'erp.refresh_token';

  final FlutterSecureStorage _storage;
  String? _accessToken;

  @override
  Future<String?> currentAccessToken() async => _accessToken;

  void setAccessToken(String? token) => _accessToken = token;

  Future<String?> refreshToken() => _storage.read(key: _refreshKey);

  Future<void> saveRefreshToken(String token) => _storage.write(key: _refreshKey, value: token);

  Future<void> clear() async {
    _accessToken = null;
    await _storage.delete(key: _refreshKey);
  }
}
