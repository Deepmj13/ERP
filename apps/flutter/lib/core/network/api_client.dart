import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import 'api_envelope.dart';
import 'api_exception.dart';

/// Supplies the current access token for outgoing requests (null when signed out).
abstract class AccessTokenSource {
  Future<String?> currentAccessToken();
}

/// Rotates the session tokens. Implementations persist the NEW refresh token.
/// Throws (or rejects) when rotation fails so the caller lands on login.
typedef TokenRefresher = Future<void> Function();

/// Invoked when a refresh attempt fails — the session is no longer valid.
typedef SessionExpiredHandler = void Function();

const String _skipAuthRefreshKey = 'skipAuthRefresh';

/// Helper key for call sites to bypass the automatic 401-refresh retry
/// (used internally for the `/auth/refresh` call itself).
const String apiSkipAuthRefreshKey = _skipAuthRefreshKey;

/// Dio-backed HTTP client for the ERP API (plan §16, ADR-0003).
///
/// - Base URL includes the `/api/v1` prefix (versioned).
/// - Injects `Authorization: Bearer <token>` on every request when a token exists.
/// - Unwraps the `{ data, meta? }` envelope and throws [ApiException] on
///   `{ error }` payloads.
/// - Transparently handles a single-flight access-token refresh on 401 and retries
///   the original request once. When rotation fails, [SessionExpiredHandler] fires.
class ApiClient {
  ApiClient({
    required String baseUrl,
    AccessTokenSource? accessTokenSource,
    TokenRefresher? refreshTokens,
    SessionExpiredHandler? onSessionExpired,
    Dio? dio,
  }) : this._(
          accessTokenSource,
          refreshTokens,
          onSessionExpired,
          dio ??
              Dio(
                BaseOptions(
                  baseUrl: baseUrl,
                  connectTimeout: const Duration(seconds: 15),
                  receiveTimeout: const Duration(seconds: 30),
                  headers: {'Content-Type': 'application/json'},
                ),
              ),
        );

  ApiClient._(
    this._accessTokenSource,
    this._refreshTokens,
    this._onSessionExpired,
    this._dio,
  ) {
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: _onRequest,
      onError: _onError,
    ));
  }

  final Dio _dio;
  final AccessTokenSource? _accessTokenSource;
  final TokenRefresher? _refreshTokens;
  final SessionExpiredHandler? _onSessionExpired;

  /// Exposed so tests can script the adapter / capture requests.
  Dio get dio => _dio;

  static const ApiEnvelopeParser envelopeParser = ApiEnvelopeParser();

  Future<ApiResult> get(String path, {Map<String, dynamic>? query, Map<String, dynamic>? extra}) =>
      _send('GET', path, extra: extra, query: query);

  Future<ApiResult> post(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    Map<String, String>? headers,
    Map<String, dynamic>? extra,
  }) =>
      _send('POST', path, body: body, extra: extra, query: query, headers: headers);

  Future<ApiResult> patch(
    String path, {
    Object? body,
    Map<String, String>? headers,
    Map<String, dynamic>? extra,
  }) =>
      _send('PATCH', path, body: body, extra: extra, headers: headers);

  Future<ApiResult> delete(
    String path, {
    Object? body,
    Map<String, String>? headers,
    Map<String, dynamic>? extra,
  }) =>
      _send('DELETE', path, body: body, extra: extra, headers: headers);

  /// Fetches raw bytes (e.g. a generated PDF) without envelope parsing. The
  /// auth-injection/refresh interceptors still apply; error payloads that the
  /// server sends as bytes (e.g. a 400 on a binary route) are parsed back into
  /// [ApiException] here because dio cannot JSON-decode a bytes response.
  Future<Uint8List> downloadBytes(
    String path, {
    Map<String, dynamic>? query,
    Map<String, String>? headers,
  }) async {
    try {
      final response = await _dio.get<Uint8List>(
        path,
        queryParameters: query,
        options: Options(responseType: ResponseType.bytes, headers: headers),
      );
      return response.data ?? Uint8List(0);
    } on DioException catch (e) {
      final api = e.error;
      if (api is ApiException) throw api;
      var code = 'NETWORK_ERROR';
      var message = 'Unable to reach the server';
      Map<String, dynamic>? details;
      final bytes = e.response?.data;
      if (bytes is List<int>) {
        final encoded = utf8.decode(bytes, allowMalformed: true);
        final decoded = jsonDecode(encoded);
        if (decoded is Map<String, dynamic> && envelopeParser.isError(decoded)) {
          final error = envelopeParser.errorOf(decoded);
          code = error.code;
          message = error.message;
          details = error.details;
        }
      } else if (e.response?.data is Map<String, dynamic>) {
        final data = e.response?.data as Map<String, dynamic>;
        final error = data['error'];
        if (error is Map<String, dynamic>) {
          code = error['code'] as String? ?? code;
          message = error['message'] as String? ?? message;
          details = error['details'] as Map<String, dynamic>?;
        }
      }
      throw ApiException(
        statusCode: e.response?.statusCode ?? 0,
        code: code,
        message: message,
        details: details,
      );
    }
  }

  /// Decoded `{ data, meta? }` response.
  ({Map<String, dynamic> data, Object? raw, Map<String, dynamic>? meta}) _resultOf(
    Response<dynamic> response,
  ) {
    final body = response.data;
    if (body is! Map<String, dynamic>) {
      throw ApiException(
        statusCode: response.statusCode ?? 0,
        code: 'INVALID_RESPONSE',
        message: 'Unexpected response shape',
      );
    }
    if (envelopeParser.isSuccess(body)) {
      final raw = body['data'];
      final data = raw is Map<String, dynamic> ? raw : <String, dynamic>{};
      return (data: data, raw: raw, meta: envelopeParser.metaOf(body));
    }
    final error = envelopeParser.errorOf(body);
    throw ApiException(
      statusCode: response.statusCode ?? 0,
      code: error.code,
      message: error.message,
      details: error.details,
    );
  }

  Future<ApiResult> _send(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    Map<String, String>? headers,
    Map<String, dynamic>? extra,
  }) async {
    try {
      final response = await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: query,
        options: Options(method: method, extra: extra, headers: headers),
      );
      return ApiResult(_resultOf(response));
    } on DioException catch (e) {
      final api = e.error;
      if (api is ApiException) throw api;
      throw ApiException(
        statusCode: e.response?.statusCode ?? 0,
        code: 'NETWORK_ERROR',
        message: 'Unable to reach the server',
        details: e.response?.data is Map<String, dynamic>
            ? (e.response?.data as Map<String, dynamic>)['error'] as Map<String, dynamic>?
            : null,
      );
    }
  }

  Future<void> _onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _accessTokenSource?.currentAccessToken();
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  Future<void> _onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final request = err.requestOptions;
    if (_isAuth401(err) &&
        request.extra[_skipAuthRefreshKey] != true &&
        _refreshTokens != null) {
      final refreshed = await _initiateRefresh();
      if (refreshed) {
        final token = await _accessTokenSource?.currentAccessToken();
        if (token != null && token.isNotEmpty) {
          request.headers['Authorization'] = 'Bearer $token';
        }
        request.extra[_skipAuthRefreshKey] = true;
        try {
          final response = await _dio.fetch<dynamic>(request);
          final result = _resultOf(response);
          handler.resolve(
            Response<dynamic>(
              requestOptions: request,
              data: {"data": result.data, "meta": result.meta},
              statusCode: response.statusCode,
            ),
          );
          return;
        } on DioException catch (retryErr) {
          handler.reject(_asDioException(retryErr));
          return;
        } on ApiException catch (apiErr) {
          handler.reject(
            DioException(
              requestOptions: request,
              response: Response<dynamic>(
                requestOptions: request,
                statusCode: apiErr.statusCode,
                data: {'error': {'code': apiErr.code, 'message': apiErr.message}},
              ),
              type: DioExceptionType.badResponse,
            ),
          );
          return;
        }
      }
      _onSessionExpired?.call();
    }
    handler.reject(_asDioException(err));
  }

  Future<bool>? _refreshFuture;

  /// Single-flight refresh: concurrent 401s share one rotation attempt and the
  /// original requests are retried together against the new access token.
  Future<bool> _initiateRefresh() {
    return _refreshFuture ??= _doRefresh().whenComplete(() => _refreshFuture = null);
  }

  Future<bool> _doRefresh() async {
    try {
      await _refreshTokens?.call();
      return true;
    } catch (_) {
      return false;
    }
  }

  bool _isAuth401(DioException err) {
    if (err.type != DioExceptionType.badResponse || err.response == null) return false;
    if (err.response?.statusCode != 401) return false;
    return true;
  }

  DioException _asDioException(DioException err) {
    final response = err.response;
    final data = response?.data;
    if (data is Map<String, dynamic> && envelopeParser.isError(data)) {
      final error = envelopeParser.errorOf(data);
      return DioException(
        requestOptions: err.requestOptions,
        response: response,
        type: err.type,
        error: ApiException(
          statusCode: response?.statusCode ?? 0,
          code: error.code,
          message: error.message,
          details: error.details,
        ),
      );
    }
    return err;
  }
}

/// Holds the decoded envelope from a successful API call.
class ApiResult {
  const ApiResult(this._result);

  final ({Map<String, dynamic> data, Object? raw, Map<String, dynamic>? meta}) _result;

  Map<String, dynamic> get data => _result.data;
  Object? get raw => _result.raw;
  Map<String, dynamic>? get meta => _result.meta;
}