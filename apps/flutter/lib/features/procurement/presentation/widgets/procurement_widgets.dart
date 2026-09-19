/// Small shared UI helpers for the procurement feature screens.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

const Map<String, Color> _statusColors = {
  'DRAFT': Colors.blueGrey,
  'SUBMITTED': Colors.orange,
  'APPROVED': Colors.teal,
  'ORDERED': Colors.lightBlue,
  'PARTIALLY_RECEIVED': Colors.indigo,
  'RECEIVED': Colors.teal,
  'POSTED': Colors.green,
  'PARTIALLY_PAID': Colors.deepPurple,
  'PAID': Colors.green,
  'CANCELLED': Colors.red,
  'VOID': Colors.red,
  'PENDING': Colors.orange,
  'CAPTURED': Colors.green,
};

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});

  final String status;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(status),
      labelStyle: const TextStyle(fontSize: 11, color: Colors.white),
      backgroundColor: _statusColors[status] ?? Colors.blueGrey,
      visualDensity: VisualDensity.compact,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
  }
}

class ProcListScaffold extends StatelessWidget {
  const ProcListScaffold({
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

void showProcError(BuildContext context, Object error) {
  final message = error is String ? error : '$error';
  ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text('Error: $message'), backgroundColor: Colors.red.shade700));
}

Future<T?> Function() createForm<T>(BuildContext context, Widget form) =>
    () => showDialog<T>(context: context, builder: (_) => form);

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
    if (context.mounted) showProcError(context, e);
  }
}