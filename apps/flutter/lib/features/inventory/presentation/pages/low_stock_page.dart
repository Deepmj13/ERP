import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/inventory/inventory_providers.dart';
import '../../../../core/widgets/common.dart';

class LowStockPage extends ConsumerStatefulWidget {
  const LowStockPage({super.key});

  @override
  ConsumerState<LowStockPage> createState() => _LowStockPageState();
}

class _LowStockPageState extends ConsumerState<LowStockPage> {
  Future<void> _refresh() async {
    ref.invalidate(lowStockProvider);
  }

  @override
  Widget build(BuildContext context) {
    final low = ref.watch(lowStockProvider);
    return ListScaffold(
      title: 'Low Stock',
      asyncValue: low,
      itemCount: low.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      emptyHint: 'Nothing below reorder threshold',
      builder: (index) {
        final b = low.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.warning_amber, color: Colors.orange),
          title: Text(b.productName ?? b.sku ?? b.productId),
          subtitle: Text(b.warehouseName ?? ''),
          trailing: Text(
            b.available.toStringAsFixed(2),
            style: Theme.of(context).textTheme.titleMedium,
          ),
        );
      },
    );
  }
}