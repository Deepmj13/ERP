import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:erp/core/network/api_client.dart';
import 'package:erp/core/network/api_envelope.dart';
import 'package:erp/core/network/api_exception.dart';

class _SimpleTokenStore implements AccessTokenSource {
  String? accessToken;

  @override
  Future<String?> currentAccessToken() async => accessToken;
}

typedef _Handler = Future<ResponseBody> Function(RequestOptions options);

class _ScriptedAdapter implements HttpClientAdapter {
  _ScriptedAdapter(this.handler);

  final _Handler handler;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Object body, int status) {
  final text = jsonEncode(body);
  return ResponseBody.fromString(
    text,
    status,
    headers: {
      Headers.contentLengthHeader: [utf8.encode(text).length.toString()],
      Headers.contentTypeHeader: ['application/json'],
    },
  );
}

void main() {
  group('ApiEnvelopeParser', () {
    const parser = ApiEnvelopeParser();

    test('detects success and unwraps data/meta', () {
      final body = {'data': {'id': 'abc'}, 'meta': {'page': 1}};
      expect(parser.isSuccess(body), isTrue);
      expect(parser.isError(body), isFalse);
      expect(parser.dataOf<String>(body, (json) => (json as Map<String, dynamic>)['id'] as String),
          'abc');
      expect(parser.metaOf(body), {'page': 1});
    });

    test('parses the error envelope', () {
      final error = parser.errorOf({
        'error': {'code': 'VALIDATION_ERROR', 'message': 'boom', 'details': {'field': 'email'}},
      });
      expect(error.code, 'VALIDATION_ERROR');
      expect(error.message, 'boom');
      expect(error.details, {'field': 'email'});
    });
  });

  group('ApiClient', () {
    test('injects the bearer token and unwraps the success envelope', () async {
      final store = _SimpleTokenStore()..accessToken = 'tok';
      final client = ApiClient(baseUrl: 'http://t/api/v1', accessTokenSource: store)
        ..dio.httpClientAdapter = _ScriptedAdapter((options) async {
          expect(options.headers['Authorization'], 'Bearer tok');
          return _json({'data': {'pong': true}, 'meta': {'page': 1}}, 200);
        });

      final result = await client.get('/ping');
      expect(result.data, {'pong': true});
      expect(result.meta, {'page': 1});
    });

    test('throws ApiException carrying code + message on error envelope', () async {
      final client = ApiClient(baseUrl: 'http://t/api/v1')
        ..dio.httpClientAdapter = _ScriptedAdapter(
          (options) async => _json({'error': {'code': 'NOT_FOUND', 'message': 'nope'}}, 404),
        );

      await expectLater(
        client.get('/x'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 404)
              .having((e) => e.code, 'code', 'NOT_FOUND')
              .having((e) => e.message, 'message', 'nope'),
        ),
      );
    });

    test('refreshes once on 401 and retries the request with the new token', () async {
      final store = _SimpleTokenStore()..accessToken = 'old';
      var refreshed = false;
      var sessionExpired = false;
      var protectedCalls = 0;
      final client = ApiClient(
        baseUrl: 'http://t/api/v1',
        accessTokenSource: store,
        refreshTokens: () async {
          refreshed = true;
          store.accessToken = 'new';
        },
        onSessionExpired: () => sessionExpired = true,
      )..dio.httpClientAdapter = _ScriptedAdapter((options) async {
          if (options.path.endsWith('/protected')) {
            protectedCalls += 1;
            if (options.headers['Authorization'] == 'Bearer old') {
              return _json({'error': {'code': 'UNAUTHORIZED', 'message': 'expired'}}, 401);
            }
            return _json({'data': {'lucky': protectedCalls}, 'meta': null}, 200);
          }
          return _json({'error': {'code': 'NOT_FOUND', 'message': 'nope'}}, 404);
        });

      final result = await client.get('/protected');
      expect(refreshed, isTrue);
      expect(result.data, {'lucky': 2});
      expect(protectedCalls, 2);
      expect(sessionExpired, isFalse);
    });

    test('fires onSessionExpired and rethrows when refresh fails', () async {
      final store = _SimpleTokenStore()..accessToken = 'old';
      var sessionExpired = false;
      final client = ApiClient(
        baseUrl: 'http://t/api/v1',
        accessTokenSource: store,
        refreshTokens: () async =>
            throw const ApiException(statusCode: 401, code: 'UNAUTHORIZED', message: 'bad'),
        onSessionExpired: () => sessionExpired = true,
      )..dio.httpClientAdapter = _ScriptedAdapter(
          (options) async => _json({'error': {'code': 'UNAUTHORIZED', 'message': 'expired'}}, 401),
        );

      await expectLater(client.get('/protected'), throwsA(isA<ApiException>()));
      expect(sessionExpired, isTrue);
    });

    test('coalesces concurrent 401s into a single refresh', () async {
      final store = _SimpleTokenStore()..accessToken = 'old';
      var refreshCalls = 0;
      var sessionExpired = false;
      final client = ApiClient(
        baseUrl: 'http://t/api/v1',
        accessTokenSource: store,
        refreshTokens: () async {
          refreshCalls += 1;
          await Future<void>.delayed(const Duration(milliseconds: 50));
          store.accessToken = 'new';
        },
        onSessionExpired: () => sessionExpired = true,
      )..dio.httpClientAdapter = _ScriptedAdapter((options) async {
          if (options.headers['Authorization'] == 'Bearer old') {
            return _json({'error': {'code': 'UNAUTHORIZED', 'message': 'expired'}}, 401);
          }
          return _json({'data': {'ok': true}, 'meta': null}, 200);
        });

      final results = await Future.wait([client.get('/a'), client.get('/b')]);
      expect(results, hasLength(2));
      expect(refreshCalls, 1);
      expect(sessionExpired, isFalse);
      for (final result in results) {
        expect(result.data, {'ok': true});
      }
    });
  });
}