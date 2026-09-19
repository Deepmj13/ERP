import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/sales/sales_providers.dart';
import '../../../../core/sales/sales_models.dart';
import '../../../../core/widgets/common.dart';
import '../widgets/sales_widgets.dart';

class PaymentsPage extends ConsumerStatefulWidget {
  const PaymentsPage({super.key});

  @override
  ConsumerState<PaymentsPage> createState() => _PaymentsPageState();
}

class _PaymentsPageState extends ConsumerState<PaymentsPage> {
  Future<void> _refresh() async {
    ref.invalidate(paymentsProvider);
  }

  Future<List<Invoice>> _openInvoices(String customerId) async {
    final all = await ref.read(salesRepositoryProvider).invoices(customerId: customerId);
    return all.where((i) => i.isOpenForAllocation).toList();
  }

  Future<({List<Map<String, dynamic>> allocations, double total})?> _allocate(
    BuildContext context, {
    required String customerId,
    required double amount,
  }) async {
    final ctx = context;
    final openInvoices = await _openInvoices(customerId);
    if (!ctx.mounted) return null;
    final result = await showDialog<({List<Map<String, dynamic>> allocations, double total})>(
      context: ctx,
      builder: (context) {
        var allocations = <Map<String, dynamic>>[];
        var total = 0.0;
        return StatefulBuilder(
          builder: (context, setLocal) => AlertDialog(
            title: Text('Allocate \$${amount.toStringAsFixed(2)}'),
            content: SizedBox(
              width: 480,
              child: SingleChildScrollView(
                child: AllocationEditor(
                  invoices: openInvoices,
                  amount: amount,
                  onChanged: (value) {
                    allocations = value;
                    total = value.fold<double>(0, (sum, a) => sum + (a['amount'] as double? ?? 0));
                    setLocal(() {});
                  },
                ),
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
              FilledButton(
                onPressed: () {
                  if (total > amount + 0.0001) return;
                  Navigator.pop(context, (allocations: allocations, total: total));
                },
                child: const Text('Confirm allocation'),
              ),
            ],
          ),
        );
      },
    );
    return result;
  }

  Future<void> _create(BuildContext context) async {
    final customers = await ref.read(customersProvider.future);
    if (!context.mounted) return;
    final customerId = ValueNotifier<String?>(null);
    final amountController = TextEditingController(text: '0');
    final method = ValueNotifier<String>('CASH');
    final reference = TextEditingController();
    const methods = ['CASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER'];

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New payment'),
        content: SizedBox(
          width: 480,
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
              TextField(
                controller: amountController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Amount'),
              ),
              const SizedBox(height: 12),
              ValueListenableBuilder<String>(
                valueListenable: method,
                builder: (context, selected, _) => DropdownButtonFormField<String>(
                  initialValue: selected,
                  items: methods.map((m) => DropdownMenuItem(value: m, child: Text(m))).toList(),
                  onChanged: (value) => method.value = value ?? 'CASH',
                ),
              ),
              const SizedBox(height: 12),
              TextField(controller: reference, decoration: const InputDecoration(labelText: 'Reference')),
            ],
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
    final amount = double.tryParse(amountController.text) ?? 0;
    if (amount <= 0) {
      showAppError(context, 'Amount must be positive');
      return;
    }
    await runAction(
      context,
      () async {
        await ref.read(salesRepositoryProvider).createPayment(
              customerId: customerId.value!,
              amount: amount,
              method: method.value,
              reference: reference.text.trim().isEmpty ? null : reference.text.trim(),
              allocations: const [],
            );
        await _refresh();
      },
      success: 'Payment created',
    );
  }

  Future<void> _capture(Payment payment) async {
    final ctx = context;
    final allocation = await _allocate(ctx, customerId: payment.customerId!, amount: payment.amount);
    if (allocation == null || !ctx.mounted) return;
    if (allocation.allocations.isEmpty) {
      showAppError(ctx, 'Allocate to at least one invoice');
      return;
    }
    await runAction(
      ctx,
      () async {
        await ref.read(salesRepositoryProvider).capturePayment(payment.id, allocations: allocation.allocations);
        await _refresh();
      },
      success: 'Payment captured',
    );
  }

  Future<void> _void(Payment payment) => runAction(
        context,
        () async {
          await ref.read(salesRepositoryProvider).voidPayment(payment.id);
          await _refresh();
        },
        success: 'Payment voided',
      );

  Future<void> _showDetail(Payment payment) async {
    final ctx = context;
    final doc = await ref.read(salesRepositoryProvider).payment(payment.id);
    if (!ctx.mounted) return;
    final allocations = doc['allocations'] as List<dynamic>? ?? const [];
    showModalBottomSheet(
      context: ctx,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Payment ${doc['number'] ?? ''}', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text('${payment.customerName ?? ''} — ${payment.method ?? ''} — \$${payment.amount.toStringAsFixed(2)}'),
              if (allocations.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text('Allocations', style: Theme.of(context).textTheme.titleMedium),
                for (final a in allocations)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text((a['invoice'] is Map<String, dynamic>
                        ? (a['invoice'] as Map<String, dynamic>)['number'] as String?
                        : null) ?? a['invoiceId'] as String? ?? ''),
                    trailing: Text('\$${(a['amount'] as num?)?.toDouble().toStringAsFixed(2) ?? ''}'),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final payments = ref.watch(paymentsProvider);
    return ListScaffold(
      title: 'Payments',
      asyncValue: payments,
      itemCount: payments.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New payment',
      builder: (index) {
        final payment = payments.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.payments_outlined),
          title: Text(payment.number ?? payment.id),
          subtitle: Text('${payment.customerName ?? ''} — \$${payment.amount.toStringAsFixed(2)}'.trim()),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(payment.status),
              if (payment.status == 'PENDING') ...[
                if (payment.customerId != null)
                  TextButton(onPressed: () => _capture(payment), child: const Text('Capture')),
                TextButton(onPressed: () => _void(payment), child: const Text('Void')),
              ],
            ],
          ),
          onTap: () => _showDetail(payment),
        );
      },
    );
  }
}