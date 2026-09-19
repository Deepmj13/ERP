import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/ops/ops_models.dart';
import '../../../../core/ops/ops_providers.dart';
import '../../../../core/widgets/common.dart';

class ApprovalsPage extends ConsumerStatefulWidget {
  const ApprovalsPage({super.key});

  @override
  ConsumerState<ApprovalsPage> createState() => _ApprovalsPageState();
}

class _ApprovalsPageState extends ConsumerState<ApprovalsPage> {
  String _scope = 'inbox';

  Future<void> _refresh() async {
    ref.invalidate(approvalsInboxProvider);
    ref.invalidate(kpisProvider);
  }

  Future<void> _decide(ApprovalRequest request, String action) async {
    final comment = TextEditingController();
    final proceed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${request.typeLabel} — ${request.objectNumber ?? ''}'),
        content: TextField(
          controller: comment,
          decoration: const InputDecoration(labelText: 'Comment (optional)'),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(action == 'approve' ? 'Approve' : 'Reject'),
          ),
        ],
      ),
    );
    if (proceed != true || !mounted) return;
    await runAction(
      context,
      () async {
        await ref.read(opsRepositoryProvider).decideApproval(
              request.id,
              action,
              comment: comment.text.trim().isEmpty ? null : comment.text.trim(),
            );
        await _refresh();
      },
      success: action == 'approve' ? 'Approved' : 'Rejected',
    );
  }

  @override
  Widget build(BuildContext context) {
    final approvals = ref.watch(approvalsInboxProvider);
    final items = approvals.valueOrNull ?? const <ApprovalRequest>[];
    final list = _scope == 'inbox'
        ? items.where((a) => a.status == 'PENDING').toList()
        : items.where((a) => a.status != 'PENDING').toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(_scope == 'inbox' ? 'Approvals — Inbox' : 'Approvals — History'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'inbox', label: Text('Awaiting me'), icon: Icon(Icons.inbox)),
                ButtonSegment(value: 'history', label: Text('Decided'), icon: Icon(Icons.history)),
              ],
              selected: {_scope},
              onSelectionChanged: (selection) => setState(() => _scope = selection.first),
            ),
          ),
          Expanded(
            child: switch (approvals) {
              AsyncValue(:final error?) => Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.error_outline, size: 40),
                      const SizedBox(height: 8),
                      Text('$error'),
                      const SizedBox(height: 8),
                      FilledButton(onPressed: _refresh, child: const Text('Retry')),
                    ],
                  ),
                ),
              AsyncValue(value: null) => const Center(child: CircularProgressIndicator()),
              _ when list.isEmpty => const Center(child: Text('No approvals here yet.')),
              _ => RefreshIndicator(
                  onRefresh: _refresh,
                  child: ListView.builder(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.only(bottom: 96),
                    itemCount: list.length,
                    itemBuilder: (context, index) {
                      final request = list[index];
                      return ListTile(
                        leading: Icon(
                          _typeIcon(request.objectType),
                          color: request.status == 'PENDING' ? Colors.orange : null,
                        ),
                        title: Text('${request.typeLabel} ${request.objectNumber ?? ''}'.trim()),
                        subtitle: Text(
                          _scope == 'inbox'
                              ? 'Requested ${request.createdAt ?? ''}'
                              : '${request.status.toLowerCase()}${request.comment != null ? ' — ${request.comment}' : ''}',
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            StatusChip(request.status),
                            if (_scope == 'inbox' && request.status == 'PENDING') ...[
                              TextButton(
                                onPressed: () => _decide(request, 'approve'),
                                child: const Text('Approve'),
                              ),
                              TextButton(
                                onPressed: () => _decide(request, 'reject'),
                                child: const Text('Reject'),
                              ),
                            ],
                          ],
                        ),
                      );
                    },
                  ),
                ),
            },
          ),
        ],
      ),
    );
  }

  IconData _typeIcon(String type) => switch (type) {
        'QUOTATION' => Icons.description_outlined,
        'SALES_ORDER' => Icons.shopping_cart_outlined,
        'PURCHASE_REQUEST' => Icons.request_page_outlined,
        'PURCHASE_ORDER' => Icons.receipt_outlined,
        'LEAVE' => Icons.event,
        'PAYROLL_RUN' => Icons.payments_outlined,
        _ => Icons.rule,
      };
}