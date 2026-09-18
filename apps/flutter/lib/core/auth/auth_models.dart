/// Mirror of the API `AuthContext` payload (see `apps/api/src/auth/auth.types.ts`).
class AuthContext {
  const AuthContext({
    required this.accessToken,
    required this.refreshToken,
    required this.tenant,
    required this.user,
    required this.expiresAt,
  });

  factory AuthContext.fromJson(Map<String, dynamic> json) {
    return AuthContext(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      tenant: AuthTenant.fromJson(json['tenant'] as Map<String, dynamic>),
      user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );
  }

  final String accessToken;
  final String refreshToken;
  final AuthTenant tenant;
  final AuthUser user;
  final DateTime expiresAt;
}

class AuthTenant {
  const AuthTenant({required this.id, required this.name, required this.slug});

  factory AuthTenant.fromJson(Map<String, dynamic> json) => AuthTenant(
        id: json['id'] as String,
        name: json['name'] as String,
        slug: json['slug'] as String,
      );

  final String id;
  final String name;
  final String slug;
}

class AuthUser {
  const AuthUser({required this.id, required this.email, required this.name});

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as String,
        email: json['email'] as String,
        name: json['name'] as String,
      );

  final String id;
  final String email;
  final String name;
}