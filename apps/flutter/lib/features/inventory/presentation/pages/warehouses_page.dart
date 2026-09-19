import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/inventory/inventory_providers.dart';
import '../../../../core/inventory/inventory_models.dart';
import '../../../../core/widgets/common.dart';

class WarehousesPage extends ConsumerStatefulWidget {
  const WarehousesPage({super.key});

  @override
  ConsumerState<WarehousesPage> createState() => _WarehousesPageState();
}

class _WarehousesPageState extends ConsumerState<WarehousesPage> {
  Future<void> _refresh() async {
    ref.invalidate(warehousesProvider);
  }

  Future<void> _create(BuildContext context) async {
    final code = TextEditingController();
    final name = TextEditingController();

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New warehouse'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: code, decoration: const InputDecoration(labelText: 'Code')),
            const SizedBox(height: 12),
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    if (created != true || context.mounted != true) return;
    if (code.text.trim().isEmpty || name.text.trim().isEmpty) {
      showAppError(context, 'Code and name are required');
      return;
    }
    await runAction(
      context,
      () async {
        await ref
            .read(inventoryRepositoryProvider)
            .createWarehouse(code: code.text.trim(), name: name.text.trim());
        await _refresh();
      },
      success: 'Warehouse created',
    );
  }

  Future<void> _toggleActive(Warehouse w) => runAction(
        context,
        () async {
          await ref
              .read(inventoryRepositoryProvider)
              .updateWarehouse(w.id, isActive: !w.isActive);
          await _refresh();
        },
        success: w.isActive ? 'Warehouse deactivated' : 'Warehouse activated',
      );

  @override
  Widget build(BuildContext context) {
    final warehouses = ref.watch(warehousesProvider);
    return ListScaffold(
      title: 'Warehouses',
      asyncValue: warehouses,
      itemCount: warehouses.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New warehouse',
      builder: (index) {
        final w = warehouses.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.warehouse),
          title: Text(w.name),
          subtitle: Text(w.code),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(w.isActive ? 'ACTIVE' : 'INACTIVE'),
              TextButton(onPressed: () => _toggleActive(w), child: const Text('Toggle')),
            ],
          ),
        );
      },
    );
  }
}