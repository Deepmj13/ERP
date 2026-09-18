import 'auth_models.dart';

enum SessionStatus { restoring, unauthenticated, authenticating, authenticated }

class SessionState {
  const SessionState.restoring() : this._(SessionStatus.restoring);
  const SessionState.unauthenticated() : this._(SessionStatus.unauthenticated);
  const SessionState.authenticating() : this._(SessionStatus.authenticating);
  const SessionState.authenticated(AuthContext context)
      : this._(SessionStatus.authenticated, context: context);
  const SessionState.error(String message) : this._(SessionStatus.unauthenticated, error: message);

  const SessionState._(this.status, {this.context, this.error});

  final SessionStatus status;
  final AuthContext? context;
  final String? error;

  bool get isAuthenticated => status == SessionStatus.authenticated;
  bool get isRestoring => status == SessionStatus.restoring;
}