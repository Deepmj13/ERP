import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/inventory/inventory_providers.dart';
import '../../../../core/inventory/inventory_models.dart';
import '../../../../core/widgets/common.dart';

class StockPage extends ConsumerStatefulWidget {
  const StockPage({super.key});

  @override
  ConsumerState<StockPage> createState() => _StockPageState();
}

class _StockPageState extends ConsumerState<StockPage> {
  Future<void> _refresh() async {
    ref.invalidate(stockBalancesProvider);
  }

  Future<void> _showLedger(BuildContext context, StockBalance balance) async {
    final ctx = context;
    final movements = await ref.read(inventoryRepositoryProvider).movements(
          productId: balance.productId,
          warehouseId: balance.warehouseId,
        );
    if (!ctx.mounted) return;
    showModalBottomSheet(
      context: ctx,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${balance.productName ?? balance.sku ?? balance.productId} — ${balance.warehouseName}',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              Expanded(
                child: movements.isEmpty
                    ? const Center(child: Text('No movements'))
                    : ListView.builder(
                        itemCount: movements.length,
                        itemBuilder: (context, i) {
                          final m = movements[i];
                          return ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            leading: StatusChip(m.type),
                            title: Text(m.referenceType ?? m.reason ?? ''),
                            subtitle: Text((m.createdAt ?? '').substring(0, 10)),
                            trailing: Text(
                              '${m.quantity >= 0 ? '+' : ''}${m.quantity.toStringAsFixed(2)}',
                              style: TextStyle(
                                color: m.quantity >= 0 ? Colors.green : Colors.red,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final balances = ref.watch(stockBalancesProvider);
    final warehouses = ref.watch(warehousesProvider);
    final warehouseId = ref.watch(_warehouseFilterProvider);

    final rows = (balances.valueOrNull ?? const <StockBalance>[])
        .where((b) => warehouseId == null || b.warehouseId == warehouseId)
        .toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              Flexible(
                child: DropdownButton<String?>(
                  value: warehouseId,
                  hint: const Text('All warehouses'),
                  isExpanded: true,
                  items: [
                    const DropdownMenuItem<String?>(value: null, child: Text('All warehouses')),
                    ...(warehouses.valueOrNull ?? const <Warehouse>[])
                        .map((w) => DropdownMenuItem<String?>(value: w.id, child: Text(w.name))),
                  ],
                  onChanged: (v) => ref.read(_warehouseFilterProvider.notifier).state = v,
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListScaffold(
            title: 'Stock On Hand',
            asyncValue: balances,
            itemCount: rows.length,
            onRefresh: _refresh,
            builder: (index) {
              final b = rows[index];
              return ListTile(
                leading: const Icon(Icons.inventory_2_outlined),
                title: Text(b.productName ?? b.sku ?? b.productId),
                subtitle: Text('${b.warehouseName ?? ''} — ${b.sku ?? ''}'.trim()),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      b.available.toStringAsFixed(2),
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      'on hand ${b.quantity.toStringAsFixed(2)} / reserved ${b.reservedQty.toStringAsFixed(2)}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
                onTap: () => _showLedger(context, b),
              );
            },
          ),
        ),
      ],
    );
  }
}

final _warehouseFilterProvider = StateProvider<String?>((ref) => null);