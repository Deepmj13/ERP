import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/inventory/inventory_providers.dart';
import '../../../../core/widgets/common.dart';

class MovementsPage extends ConsumerStatefulWidget {
  const MovementsPage({super.key});

  @override
  ConsumerState<MovementsPage> createState() => _MovementsPageState();
}

class _MovementsPageState extends ConsumerState<MovementsPage> {
  Future<void> _refresh() async {
    ref.invalidate(stockMovementsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final movements = ref.watch(stockMovementsProvider);

    return ListScaffold(
      title: 'Inventory Movements',
      asyncValue: movements,
      itemCount: movements.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      builder: (index) {
        final m = movements.valueOrNull![index];
        final inbound = m.quantity >= 0;
        return ListTile(
          leading: Icon(
            inbound ? Icons.south_west : Icons.north_east,
            color: inbound ? Colors.green : Colors.red,
          ),
          title: Text('${m.productName ?? m.sku ?? m.productId} — ${m.warehouseName ?? ''}'),
          subtitle: Text(
            '${m.type} · ${m.referenceType ?? ''} · ${m.reason ?? ''} · ${(m.createdAt ?? '').substring(0, 10)}'
                .replaceAll(RegExp(r'\s+'), ' ')
                .trim(),
          ),
          trailing: Text(
            '${inbound ? '+' : ''}${m.quantity.toStringAsFixed(2)}',
            style: TextStyle(
              color: inbound ? Colors.green : Colors.red,
              fontWeight: FontWeight.bold,
            ),
          ),
        );
      },
    );
  }
}