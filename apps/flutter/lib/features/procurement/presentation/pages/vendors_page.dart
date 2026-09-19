import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/procurement/procurement_providers.dart';
import '../widgets/procurement_widgets.dart';

class VendorsPage extends ConsumerStatefulWidget {
  const VendorsPage({super.key});

  @override
  ConsumerState<VendorsPage> createState() => _VendorsPageState();
}

class _VendorsPageState extends ConsumerState<VendorsPage> {
  Future<void> _refresh() async {
    ref.invalidate(vendorsProvider);
  }

  Future<void> _create(BuildContext context) async {
    final name = TextEditingController();
    final email = TextEditingController();
    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New vendor'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
            const SizedBox(height: 12),
            TextField(controller: email, decoration: const InputDecoration(labelText: 'Email (optional)')),
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
    await runAction(
      context,
      () async {
        final repo = ref.read(procurementRepositoryProvider);
        await repo.createVendor(name: name.text.trim(), email: email.text.trim());
        await _refresh();
      },
      success: 'Vendor created',
    );
  }

  @override
  Widget build(BuildContext context) {
    final vendors = ref.watch(vendorsProvider);
    return ProcListScaffold(
      title: 'Vendors',
      asyncValue: vendors,
      itemCount: vendors.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New vendor',
      builder: (index) {
        final vendor = vendors.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.business),
          title: Text(vendor.name),
          subtitle: Text(vendor.email ?? vendor.taxId ?? vendor.currency ?? ''),
          trailing: StatusChip(vendor.isActive ? 'ACTIVE' : 'INACTIVE'),
        );
      },
    );
  }
}