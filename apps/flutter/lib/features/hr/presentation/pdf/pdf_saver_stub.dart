import 'dart:typed_data';

/// Web/unsupported implementation: there is no direct file-system access, so
/// the download reports the bytes were fetched but not persisted.
Future<String?> savePdfBytes(Uint8List bytes, String fileName) async => null;