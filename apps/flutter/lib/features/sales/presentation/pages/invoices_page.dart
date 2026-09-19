import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/sales/sales_providers.dart';
import '../../../../core/sales/sales_models.dart';
import '../../../../core/widgets/common.dart';
import '../widgets/sales_widgets.dart';

class InvoicesPage extends ConsumerStatefulWidget {
  const InvoicesPage({super.key});

  @override
  ConsumerState<InvoicesPage> createState() => _InvoicesPageState();
}

class _InvoicesPageState extends ConsumerState<InvoicesPage> {
  Future<void> _refresh() async {
    ref.invalidate(invoicesProvider);
  }

  Future<void> _create(BuildContext context) async {
    final customers = await ref.read(customersProvider.future);
    final products = await ref.read(productsProvider.future);
    if (!context.mounted) return;
    final customerId = ValueNotifier<String?>(null);
    final issueDate = TextEditingController(text: DateTime.now().toIso8601String());
    final dueDate = TextEditingController();
    final notes = TextEditingController();
    var items = <Map<String, dynamic>>[];

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New invoice'),
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ValueListenableBuilder<String?>(
                  valueListenable: customerId,
                  builder: (context, selected, _) => DropdownButtonFormField<String>(
                    initialValue: selected,
                    hint: const Text('Customer'),
                    isExpanded: true,
                    items: customers
                        .map((c) => DropdownMenuItem(value: c.id, child: Text(c.name)))
                        .toList(),
                    onChanged: (value) => customerId.value = value,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(controller: issueDate, decoration: const InputDecoration(labelText: 'Issue date (ISO)')),
                const SizedBox(height: 12),
                TextField(controller: dueDate, decoration: const InputDecoration(labelText: 'Due date (ISO)')),
                const SizedBox(height: 12),
                TextField(controller: notes, decoration: const InputDecoration(labelText: 'Notes')),
                const SizedBox(height: 12),
                LineItemsEditor(
                  products: products,
                  onChanged: (value) => items = value,
                ),
              ],
            ),
          ),
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
    if (created != true || context.mounted != true || customerId.value == null) return;
    final cleaned = items.where((i) => (i['description'] as String? ?? '').isNotEmpty).toList();
    if (cleaned.isEmpty) {
      showAppError(context, 'Add at least one item');
      return;
    }
    await runAction(
      context,
      () async {
        await ref.read(salesRepositoryProvider).createInvoice(
              customerId: customerId.value!,
              issueDate: issueDate.text.trim(),
              dueDate: dueDate.text.trim().isEmpty ? null : dueDate.text.trim(),
              notes: notes.text.trim().isEmpty ? null : notes.text.trim(),
              items: cleaned,
            );
        await _refresh();
      },
      success: 'Invoice created',
    );
  }

  Future<void> _invoiceAction(String id, String action, String success) => runAction(
        context,
        () async {
          await ref.read(salesRepositoryProvider).invoiceAction(id, action);
          await _refresh();
        },
        success: success,
      );

  Future<void> _showDetail(Invoice invoice) async {
    final ctx = context;
    final doc = await ref.read(salesRepositoryProvider).invoice(invoice.id);
    if (!ctx.mounted) return;
    showModalBottomSheet(
      context: ctx,
      builder: (context) => DocDetailSheet(title: 'Invoice', doc: doc),
    );
  }

  @override
  Widget build(BuildContext context) {
    final invoices = ref.watch(invoicesProvider);
    return ListScaffold(
      title: 'Invoices',
      asyncValue: invoices,
      itemCount: invoices.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New invoice',
      builder: (index) {
        final invoice = invoices.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.receipt_long),
          title: Text(invoice.number ?? invoice.id),
          subtitle: Text(
            '${invoice.customerName ?? ''} — ${invoice.total.toStringAsFixed(2)} / balance ${invoice.balance.toStringAsFixed(2)}'
                .trim(),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(invoice.status),
              if (invoice.status == 'DRAFT')
                TextButton(onPressed: () => _invoiceAction(invoice.id, 'submit', 'Submitted'), child: const Text('Submit')),
              if (invoice.status == 'SUBMITTED')
                TextButton(onPressed: () => _invoiceAction(invoice.id, 'approve', 'Approved'), child: const Text('Approve')),
              if (invoice.status == 'APPROVED')
                TextButton(onPressed: () => _invoiceAction(invoice.id, 'post', 'Posted (A/R)'), child: const Text('Post')),
              if (invoice.status == 'DRAFT' || invoice.status == 'SUBMITTED')
                TextButton(onPressed: () => _invoiceAction(invoice.id, 'cancel', 'Cancelled'), child: const Text('Cancel')),
              if (invoice.status == 'POSTED' || invoice.status == 'PARTIALLY_PAID')
                TextButton(onPressed: () => _invoiceAction(invoice.id, 'pdf', 'PDF queued'), child: const Text('PDF')),
            ],
          ),
          onTap: () => _showDetail(invoice),
        );
      },
    );
  }
}