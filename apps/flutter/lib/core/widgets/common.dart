/// Shared UI helpers for feature screens. Extracted from the procurement/HR
/// feature widgets so sales, inventory and finance screens can reuse one
/// implementation of the list scaffold, status chip and action helpers.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Stable colors for every status string the API surfaces. Unknown statuses
/// fall back to blue-grey.
const Map<String, Color> statusColors = {
  'DRAFT': Colors.blueGrey,
  'SUBMITTED': Colors.orange,
  'APPROVED': Colors.teal,
  'REJECTED': Colors.deepOrange,
  'CONVERTED': Colors.indigo,
  'ORDERED': Colors.lightBlue,
  'PARTIALLY_DELIVERED': Colors.indigo,
  'DELIVERED': Colors.teal,
  'PARTIALLY_RECEIVED': Colors.indigo,
  'RECEIVED': Colors.teal,
  'POSTED': Colors.green,
  'PARTIALLY_PAID': Colors.deepPurple,
  'PAID': Colors.green,
  'INVOICED': Colors.lightGreen,
  'CANCELLED': Colors.red,
  'VOID': Colors.red,
  'PENDING': Colors.orange,
  'CAPTURED': Colors.green,
  'REVERSED': Colors.blueGrey,
  'OPEN': Colors.teal,
  'CLOSED': Colors.blueGrey,
  'LOCKED': Colors.red,
  'ACTIVE': Colors.green,
  'INACTIVE': Colors.blueGrey,
};

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});

  final String status;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(status),
      labelStyle: const TextStyle(fontSize: 11, color: Colors.white),
      backgroundColor: statusColors[status] ?? Colors.blueGrey,
      visualDensity: VisualDensity.compact,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
  }
}

class ListScaffold extends StatelessWidget {
  const ListScaffold({
    super.key,
    required this.title,
    required this.asyncValue,
    required this.itemCount,
    required this.builder,
    this.onRefresh,
    this.onCreateLabel,
    this.onCreate,
    this.emptyHint = 'Nothing here yet — create the first record.',
  });

  final String title;
  final AsyncValue<Object?> asyncValue;
  final int itemCount;
  final Widget Function(int index) builder;
  final Future<void> Function()? onRefresh;
  final String? onCreateLabel;
  final Future<void> Function()? onCreate;
  final String emptyHint;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      floatingActionButton: onCreate != null
          ? FloatingActionButton.extended(
              onPressed: onCreate,
              icon: const Icon(Icons.add),
              label: Text(onCreateLabel ?? 'Create'),
            )
          : null,
      body: switch (asyncValue) {
        AsyncValue(:final error?) => _ErrorView(error: error, onRetry: onRefresh),
        AsyncValue(value: null) => const Center(child: CircularProgressIndicator()),
        _ when itemCount == 0 => _EmptyView(hint: emptyHint),
        _ => RefreshIndicator(
            onRefresh: onRefresh ?? () async {},
            child: ListView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(bottom: 96),
              itemCount: itemCount,
              itemBuilder: (context, index) => builder(index),
            ),
          ),
      },
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.hint});
  final String hint;

  @override
  Widget build(BuildContext context) {
    return Center(child: Text(hint, style: Theme.of(context).textTheme.bodyMedium));
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, this.onRetry});
  final Object error;
  final Future<void> Function()? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 40),
          const SizedBox(height: 8),
          Text('$error'),
          if (onRetry != null) ...[
            const SizedBox(height: 8),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ],
      ),
    );
  }
}

void showAppError(BuildContext context, Object error) {
  final message = error is String ? error : '$error';
  ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text('Error: $message'), backgroundColor: Colors.red.shade700));
}

Future<void> runAction(
  BuildContext context,
  Future<void> Function() action, {
  String success = 'Done',
}) async {
  try {
    await action();
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(success)));
    }
  } catch (e) {
    if (context.mounted) showAppError(context, e);
  }
}