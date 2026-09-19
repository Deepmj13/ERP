import 'dart:io';
import 'dart:typed_data';

/// Native (VM) implementation: writes the PDF into a fresh temp directory and
/// returns its absolute path, or `null` if the bytes could not be persisted.
Future<String?> savePdfBytes(Uint8List bytes, String fileName) async {
  try {
    final dir = await Directory.systemTemp.createTemp('erp_pdfs_');
    final file = File('${dir.path}/$fileName');
    await file.writeAsBytes(bytes, flush: true);
    return file.path;
  } catch (_) {
    return null;
  }
}