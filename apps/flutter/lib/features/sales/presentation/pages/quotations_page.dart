import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/sales/sales_providers.dart';
import '../../../../core/sales/sales_models.dart';
import '../../../../core/widgets/common.dart';
import '../widgets/sales_widgets.dart';

class QuotationsPage extends ConsumerStatefulWidget {
  const QuotationsPage({super.key});

  @override
  ConsumerState<QuotationsPage> createState() => _QuotationsPageState();
}

class _QuotationsPageState extends ConsumerState<QuotationsPage> {
  Future<void> _refresh() async {
    ref.invalidate(quotationsProvider);
  }

  Future<void> _create(BuildContext context) async {
    final customers = await ref.read(customersProvider.future);
    final products = await ref.read(productsProvider.future);
    if (!context.mounted) return;
    final customerId = ValueNotifier<String?>(null);
    final currency = TextEditingController(text: 'USD');
    final notes = TextEditingController();
    var items = <Map<String, dynamic>>[];

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New quotation'),
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
                TextField(controller: currency, decoration: const InputDecoration(labelText: 'Currency')),
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
        await ref.read(salesRepositoryProvider).createQuotation(
              customerId: customerId.value!,
              currency: currency.text.trim().isEmpty ? null : currency.text.trim(),
              notes: notes.text.trim().isEmpty ? null : notes.text.trim(),
              items: cleaned,
            );
        await _refresh();
      },
      success: 'Quotation created',
    );
  }

  Future<void> _quoteAction(String id, String action, String success) => runAction(
        context,
        () async {
          await ref.read(salesRepositoryProvider).quoteAction(id, action);
          await _refresh();
        },
        success: success,
      );

  Future<void> _showDetail(Quotation q) async {
    final ctx = context;
    final doc = await ref.read(salesRepositoryProvider).quotation(q.id);
    if (!ctx.mounted) return;
    showModalBottomSheet(
      context: ctx,
      builder: (context) => DocDetailSheet(title: 'Quotation', doc: doc),
    );
  }

  @override
  Widget build(BuildContext context) {
    final quotes = ref.watch(quotationsProvider);
    return ListScaffold(
      title: 'Quotations',
      asyncValue: quotes,
      itemCount: quotes.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New quotation',
      builder: (index) {
        final q = quotes.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.description),
          title: Text(q.number ?? q.id),
          subtitle: Text('${q.customerName ?? ''} — ${q.total.toStringAsFixed(2)}'.trim()),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(q.status),
              if (q.status == 'DRAFT')
                TextButton(onPressed: () => _quoteAction(q.id, 'submit', 'Submitted'), child: const Text('Submit')),
              if (q.status == 'SUBMITTED') ...[
                TextButton(onPressed: () => _quoteAction(q.id, 'approve', 'Approved'), child: const Text('Approve')),
                TextButton(onPressed: () => _quoteAction(q.id, 'reject', 'Rejected'), child: const Text('Reject')),
              ],
              if (q.status == 'APPROVED')
                TextButton(onPressed: () => _quoteAction(q.id, 'convert', 'Converted to order'), child: const Text('Convert')),
              if (q.status == 'DRAFT' || q.status == 'SUBMITTED')
                TextButton(onPressed: () => _quoteAction(q.id, 'cancel', 'Cancelled'), child: const Text('Cancel')),
            ],
          ),
          onTap: () => _showDetail(q),
        );
      },
    );
  }
}