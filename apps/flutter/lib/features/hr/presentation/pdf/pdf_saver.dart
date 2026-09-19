/// Persists downloaded bytes to a user-savable location. Platform-specific
/// implementations are swapped by conditional import: dart:io writes to a
/// temp directory; on web the stub reports the download is not savable.
library;

export 'pdf_saver_stub.dart' if (dart.library.io) 'pdf_saver_io.dart';