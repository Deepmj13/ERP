import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:erp/app/app.dart';

void main() {
  testWidgets('ERP app boots and shows the dashboard route', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: ErpApp()));
    await tester.pumpAndSettle();

    expect(find.text('Dashboard'), findsOneWidget);
  });
}