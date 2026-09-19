import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/procurement/procurement_providers.dart';
import '../widgets/procurement_widgets.dart';

class PurchaseRequestsPage extends ConsumerStatefulWidget {
  const PurchaseRequestsPage({super.key});

  @override
  ConsumerState<PurchaseRequestsPage> createState() => _PurchaseRequestsPageState();
}

class _PurchaseRequestsPageState extends ConsumerState<PurchaseRequestsPage> {
  Future<void> _refresh() async {
    ref.invalidate(purchaseRequestsProvider);
  }

  Future<void> _create(BuildContext context) async {
    final description = TextEditingController();
    final quantity = TextEditingController(text: '1');
    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New purchase request'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: description, decoration: const InputDecoration(labelText: 'Description')),
            const SizedBox(height: 12),
            TextField(
              controller: quantity,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Quantity'),
            ),
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
    final qty = double.tryParse(quantity.text) ?? 1;
    await runAction(
      context,
      () async {
        final repo = ref.read(procurementRepositoryProvider);
        await repo.createPurchaseRequest(items: [
          {'description': description.text.trim(), 'quantity': qty},
        ]);
        await _refresh();
      },
      success: 'Request created',
    );
  }

  Future<void> _transition(String id, String action, String success) => runAction(
        context,
        () async {
          final repo = ref.read(procurementRepositoryProvider);
          switch (action) {
            case 'submit':
              await repo.submitRequest(id);
            case 'approve':
              await repo.approveRequest(id);
            default:
              await repo.cancelRequest(id);
          }
          await _refresh();
        },
        success: success,
      );

  @override
  Widget build(BuildContext context) {
    final requests = ref.watch(purchaseRequestsProvider);
    return ProcListScaffold(
      title: 'Purchase Requests',
      asyncValue: requests,
      itemCount: requests.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New request',
      builder: (index) {
        final request = requests.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.request_page),
          title: Text(request.number ?? request.id),
          subtitle: Text('${request.itemCount} item(s) — ${request.notes ?? ''}'.trim()),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(request.status),
              if (request.status == 'DRAFT')
                _Action(
                  label: 'Submit',
                  onTap: () => _transition(request.id, 'submit', 'Submitted'),
                ),
              if (request.status == 'SUBMITTED') ...[
                _Action(
                  label: 'Approve',
                  onTap: () => _transition(request.id, 'approve', 'Approved'),
                ),
                _Action(
                  label: 'Cancel',
                  onTap: () => _transition(request.id, 'cancel', 'Cancelled'),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return TextButton(onPressed: onTap, child: Text(label));
  }
}