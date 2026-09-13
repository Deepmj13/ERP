import 'package:flutter/material.dart';

class AppTheme {
  const AppTheme._();

  static ThemeData get light {
    final base = ThemeData(
      useMaterial3: true,
      colorSchemeSeed: const Color(0xFF1F6FEB),
      brightness: Brightness.light,
    );
    return base;
  }

  static ThemeData get dark {
    final base = ThemeData(
      useMaterial3: true,
      colorSchemeSeed: const Color(0xFF1F6FEB),
      brightness: Brightness.dark,
    );
    return base;
  }
}