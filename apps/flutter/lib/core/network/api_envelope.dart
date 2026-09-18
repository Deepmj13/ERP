/// API response envelope (ADR-0003). Success responses are `{ data, meta? }`.
class ApiEnvelope<T> {
  const ApiEnvelope({required this.data, this.meta});

  final T data;
  final Map<String, dynamic>? meta;
}

/// Parses the wire envelope shapes into typed Dart values.
///
/// - Success: `{ "data": ..., "meta": { ... }? }`
/// - Error:   `{ "error": { "code", "message", "details? } }`
class ApiEnvelopeParser {
  const ApiEnvelopeParser();

  bool isSuccess(Map<String, dynamic> body) => body.containsKey('data');
  bool isError(Map<String, dynamic> body) => body.containsKey('error');

  T dataOf<T>(Map<String, dynamic> body, T Function(dynamic json) fromJson) =>
      fromJson(body['data']);

  Map<String, dynamic>? metaOf(Map<String, dynamic> body) {
    final meta = body['meta'];
    return meta is Map<String, dynamic> ? meta : null;
  }

  ({String code, String message, Map<String, dynamic>? details}) errorOf(
    Map<String, dynamic> body,
  ) {
    final error = body['error'];
    if (error is! Map<String, dynamic>) {
      return (code: 'INVALID_ERROR', message: 'Unexpected error payload', details: null);
    }
    final code = error['code']?.toString() ?? 'UNKNOWN_ERROR';
    final message = error['message']?.toString() ?? 'An unexpected error occurred';
    final details = error['details'] is Map<String, dynamic>
        ? error['details'] as Map<String, dynamic>
        : null;
    return (code: code, message: message, details: details);
  }
}