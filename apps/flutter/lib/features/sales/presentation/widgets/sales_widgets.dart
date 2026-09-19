/// Shared widgets for the sales feature screens: a multi-line item editor, a
/// read-only document detail sheet, and an invoice allocation editor for
/// payments.
library;

import 'package:flutter/material.dart';

import '../../../../core/sales/sales_models.dart';

class SalesItemRow {
  SalesItemRow({ProductRef? product})
      : _product = product,
        description = TextEditingController(text: product?.name ?? ''),
        quantity = TextEditingController(text: '1'),
        unitPrice = TextEditingController(text: product != null ? '${product.salePrice}' : '0'),
        discountPct = TextEditingController(text: '0');

  ProductRef? _product;
  final TextEditingController description;
  final TextEditingController quantity;
  final TextEditingController unitPrice;
  final TextEditingController discountPct;

  ProductRef? get product => _product;

  void setProduct(ProductRef value) {
    _product = value;
    description.text = value.name;
    unitPrice.text = value.salePrice > 0 ? '${value.salePrice}' : '0';
  }

  Map<String, dynamic> toJson({bool withPrice = true, bool withDiscount = true}) => {
        'productId': _product?.id,
        'description': description.text.trim(),
        'quantity': double.tryParse(quantity.text) ?? 0,
        if (withPrice) 'unitPrice': double.tryParse(unitPrice.text) ?? 0,
        if (withDiscount) 'discountPct': double.tryParse(discountPct.text) ?? 0,
      };
}

/// Editor for document line items. Rows carry product, description, quantity,
/// unit price and discount percent. Prices/discounts are omitted for delivery
/// items ([withPrice] = false).
class LineItemsEditor extends StatefulWidget {
  const LineItemsEditor({
    super.key,
    required this.products,
    required this.onChanged,
    this.withPrice = true,
    this.withDiscount = true,
  });

  final List<ProductRef> products;
  final ValueChanged<List<Map<String, dynamic>>> onChanged;
  final bool withPrice;
  final bool withDiscount;

  @override
  State<LineItemsEditor> createState() => _LineItemsEditorState();
}

class _LineItemsEditorState extends State<LineItemsEditor> {
  final List<SalesItemRow> _rows = [SalesItemRow()];

  void _emit() {
    widget.onChanged(_rows.map((r) => r.toJson(withPrice: widget.withPrice, withDiscount: widget.withDiscount)).toList());
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ..._rows.asMap().entries.map(
              (entry) => _ItemRowCard(
                key: ValueKey(entry.key),
                index: entry.key,
                row: entry.value,
                products: widget.products,
                withPrice: widget.withPrice,
                withDiscount: widget.withDiscount,
                canRemove: _rows.length > 1,
                onRemove: () => setState(() => _rows.removeAt(entry.key)),
                onChangedAny: _emit,
              ),
            ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(() => _rows.add(SalesItemRow())),
            icon: const Icon(Icons.add),
            label: const Text('Add item'),
          ),
        ),
      ],
    );
  }
}

class _ItemRowCard extends StatelessWidget {
  const _ItemRowCard({
    super.key,
    required this.index,
    required this.row,
    required this.products,
    required this.withPrice,
    required this.withDiscount,
    required this.canRemove,
    required this.onRemove,
    required this.onChangedAny,
  });

  final int index;
  final SalesItemRow row;
  final List<ProductRef> products;
  final bool withPrice;
  final bool withDiscount;
  final bool canRemove;
  final VoidCallback onRemove;
  final VoidCallback onChangedAny;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<ProductRef>(
                    initialValue: row.product,
                    hint: const Text('Product'),
                    isExpanded: true,
                    items: products.map((p) => DropdownMenuItem(value: p, child: Text(p.name))).toList(),
                    onChanged: (value) {
                      if (value == null) return;
                      row.setProduct(value);
                      onChangedAny();
                    },
                  ),
                ),
                if (canRemove)
                  IconButton(
                    icon: const Icon(Icons.close),
                    tooltip: 'Remove item',
                    onPressed: onRemove,
                  ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: row.description,
              onChanged: (_) => onChangedAny(),
              decoration: const InputDecoration(labelText: 'Description', isDense: true),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: row.quantity,
                    keyboardType: TextInputType.number,
                    onChanged: (_) => onChangedAny(),
                    decoration: const InputDecoration(labelText: 'Quantity', isDense: true),
                  ),
                ),
                if (withPrice) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: row.unitPrice,
                      keyboardType: TextInputType.number,
                      onChanged: (_) => onChangedAny(),
                      decoration: const InputDecoration(labelText: 'Unit price', isDense: true),
                    ),
                  ),
                ],
                if (withDiscount) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: row.discountPct,
                      keyboardType: TextInputType.number,
                      onChanged: (_) => onChangedAny(),
                      decoration: const InputDecoration(labelText: 'Discount %', isDense: true),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Read-only detail view for a sales document fetched via `GET /:<id>`.
class DocDetailSheet extends StatelessWidget {
  const DocDetailSheet({super.key, required this.doc, required this.title, this.actions});

  final Map<String, dynamic> doc;
  final String title;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) {
    final items = doc['items'] as List<dynamic>? ?? const [];
    final number = doc['number'] as String?;
    final customer = (doc['customer'] as Map<String, dynamic>?)?['name'] as String?;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleLarge),
                Chip(
                  label: Text(doc['status'] as String? ?? ''),
                  labelStyle: const TextStyle(fontSize: 11, color: Colors.white),
                  backgroundColor: Colors.blueGrey,
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text('${number ?? 'No number'} — ${customer ?? ''}', style: Theme.of(context).textTheme.bodyMedium),
            if (items.isNotEmpty) ...[
              const SizedBox(height: 12),
              Flexible(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 320),
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: items.length,
                    itemBuilder: (context, i) {
                      final item = Map<String, dynamic>.from(items[i] as Map);
                      return ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: item['productId'] != null ? null : const Icon(Icons.inventory_2),
                        title: Text(item['description'] as String? ?? ''),
                        subtitle: Text('${item['quantity']} × ${item['unitPrice'] ?? 0}'),
                        trailing: Text(_money(item['lineTotal'])),
                      );
                    },
                  ),
                ),
              ),
              const Divider(),
              _TotalRow(label: 'Subtotal', value: _money(doc['subtotal'])),
              _TotalRow(label: 'Discount', value: _money(doc['discountTotal'])),
              _TotalRow(label: 'Tax', value: _money(doc['taxTotal'])),
              _TotalRow(label: 'Total', value: _money(doc['total']), bold: true),
              if (doc.containsKey('balance'))
                _TotalRow(label: 'Balance', value: _money(doc['balance']), bold: true),
            ],
            if (actions != null && actions!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Row(mainAxisAlignment: MainAxisAlignment.end, children: actions!),
            ],
          ],
        ),
      ),
    );
  }

  String _money(Object? value) {
    final amount = value is num
        ? value.toDouble()
        : double.tryParse('$value') ?? 0;
    return '\$${amount.toStringAsFixed(2)}';
  }
}

class _TotalRow extends StatelessWidget {
  const _TotalRow({required this.label, required this.value, this.bold = false});

  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: bold ? const TextStyle(fontWeight: FontWeight.bold) : null),
          Text(value, style: bold ? const TextStyle(fontWeight: FontWeight.bold) : null),
        ],
      ),
    );
  }
}

/// Editor for allocating a payment across the customer's open invoices.
/// Enforces that the allocation total does not exceed the payment amount.
class AllocationEditor extends StatefulWidget {
  const AllocationEditor({
    super.key,
    required this.invoices,
    required this.amount,
    required this.onChanged,
  });

  final List<Invoice> invoices;
  final double amount;
  final ValueChanged<List<Map<String, dynamic>>> onChanged;

  @override
  State<AllocationEditor> createState() => _AllocationEditorState();
}

class _AllocationEditorState extends State<AllocationEditor> {
  final Map<String, TextEditingController> _amounts = {};
  final Set<String> _selected = {};

  void _emit() {
    final allocations = <Map<String, dynamic>>[];
    for (final id in _selected) {
      allocations.add({'invoiceId': id, 'amount': double.tryParse(_amounts[id]!.text) ?? 0});
    }
    widget.onChanged(allocations);
  }

  @override
  Widget build(BuildContext context) {
    final open = widget.invoices.where((i) => i.isOpenForAllocation).toList();
    final allocated = _selected.fold<double>(0, (sum, id) => sum + (double.tryParse(_amounts[id]?.text ?? '') ?? 0));
    final remaining = widget.amount - allocated;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Payment: \$${widget.amount.toStringAsFixed(2)} — remaining \$${remaining.toStringAsFixed(2)}'),
        const Divider(),
        if (open.isEmpty)
          const Padding(
            padding: EdgeInsets.all(8),
            child: Text('No open invoices for this customer.'),
          ),
        for (final invoice in open)
          StatefulBuilder(
            builder: (context, setLocal) {
              final controller = _amounts.putIfAbsent(invoice.id, () => TextEditingController(text: '${invoice.balance}'));
              final checked = _selected.contains(invoice.id);
              return CheckboxListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                value: checked,
                title: Text('${invoice.number ?? invoice.id} — balance \$${invoice.balance.toStringAsFixed(2)}'),
                controlAffinity: ListTileControlAffinity.leading,
                subtitle: checked
                    ? TextField(
                        controller: controller,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Amount', isDense: true),
                        onChanged: (_) => setState(() {}) ,
                      )
                    : null,
                onChanged: (value) {
                  setLocal(() {
                    if (value == true) {
                      _selected.add(invoice.id);
                    } else {
                      _selected.remove(invoice.id);
                    }
                  });
                  setState(() {});
                  _emit();
                },
              );
            },
          ),
      ],
    );
  }
}