/// Idempotency-Key helpers. Every mutating endpoint requires a client-generated
/// UUID in the `Idempotency-Key` header (plan §16a). Each call site generates a
/// fresh key so a replay-safe retry is never confused with the original.
library;

import 'dart:math';

final Random _random = Random.secure();

String randomUuid() {
  final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final h = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

Map<String, String> idempotencyHeaders() => {'Idempotency-Key': randomUuid()};