import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/finance/finance_providers.dart';
import '../../../../core/finance/finance_models.dart';
import '../../../../core/widgets/common.dart';
import '../widgets/finance_widgets.dart';

class JournalPage extends ConsumerStatefulWidget {
  const JournalPage({super.key});

  @override
  ConsumerState<JournalPage> createState() => _JournalPageState();
}

class _JournalPageState extends ConsumerState<JournalPage> {
  Future<void> _refresh() async {
    ref.invalidate(journalEntriesProvider);
  }

  Future<void> _create(BuildContext context) async {
    final accounts = await ref.read(accountsProvider.future);
    if (!context.mounted) return;
    final entryDate = TextEditingController(text: DateTime.now().toIso8601String());
    final description = TextEditingController();
    var draft = (lines: <JournalLine>[], debit: 0.0, credit: 0.0);

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New journal entry'),
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: entryDate, decoration: const InputDecoration(labelText: 'Entry date (ISO)')),
                const SizedBox(height: 12),
                TextField(controller: description, decoration: const InputDecoration(labelText: 'Description')),
                const SizedBox(height: 12),
                JournalLinesEditor(
                  accounts: accounts,
                  onChanged: (value) => draft = value,
                ),
                const SizedBox(height: 8),
                Text(
                  'Dr ${draft.debit.toStringAsFixed(2)}  /  Cr ${draft.credit.toStringAsFixed(2)}',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: (draft.debit - draft.credit).abs() < 0.0001 ? Colors.green : Colors.red,
                  ),
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
    if (created != true || context.mounted != true) return;
    if (draft.lines.isEmpty) {
      showAppError(context, 'Add at least one line');
      return;
    }
    if ((draft.debit - draft.credit).abs() > 0.0001) {
      showAppError(context, 'Entry must balance (Dr = Cr)');
      return;
    }
    await runAction(
      context,
      () async {
        await ref.read(financeRepositoryProvider).createJournalEntry(
              entryDate: entryDate.text.trim(),
              description: description.text.trim().isEmpty ? null : description.text.trim(),
              lines: draft.lines,
            );
        await _refresh();
      },
      success: 'Journal entry created',
    );
  }

  Future<void> _journalAction(String id, String action, String success) => runAction(
        context,
        () async {
          final repo = ref.read(financeRepositoryProvider);
          if (action == 'post') await repo.postJournalEntry(id);
          if (action == 'reverse') await repo.reverseJournalEntry(id);
          await _refresh();
        },
        success: success,
      );

  Future<void> _showDetail(JournalEntry entry) async {
    final ctx = context;
    final detail = await ref.read(financeRepositoryProvider).journalEntry(entry.id);
    if (!ctx.mounted) return;
    final lines = detail.lines.isNotEmpty ? detail.lines : entry.lines;
    final title = detail.entryNo.isNotEmpty ? detail.entryNo : entry.entryNo;
    final date = detail.entryDate ?? entry.entryDate;
    final desc = detail.description ?? entry.description;
    final dr = detail.totalDebit != 0 ? detail.totalDebit : entry.totalDebit;
    final cr = detail.totalCredit != 0 ? detail.totalCredit : entry.totalCredit;
    showModalBottomSheet(
      context: ctx,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                '${date ?? ''} — ${desc ?? ''} — '
                '${dr.toStringAsFixed(2)} = ${cr.toStringAsFixed(2)}'.trim(),
              ),
              const SizedBox(height: 12),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final l in lines)
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: Text('${l.accountCode ?? ''} ${l.accountName ?? ''}'.trim()),
                        subtitle: Text(l.narration ?? ''),
                        trailing: Text(
                          'Dr ${l.debit.toStringAsFixed(2)}  Cr ${l.credit.toStringAsFixed(2)}',
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final entries = ref.watch(journalEntriesProvider);
    return ListScaffold(
      title: 'Journal Entries',
      asyncValue: entries,
      itemCount: entries.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New entry',
      builder: (index) {
        final e = entries.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.menu_book_outlined),
          title: Text(e.entryNo),
          subtitle: Text(
            '${e.entryDate ?? ''} — ${e.description ?? ''}'.trim(),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(e.status),
              if (e.status == 'DRAFT')
                TextButton(onPressed: () => _journalAction(e.id, 'post', 'Posted'), child: const Text('Post')),
              if (e.status == 'POSTED')
                TextButton(onPressed: () => _journalAction(e.id, 'reverse', 'Reversed'), child: const Text('Reverse')),
            ],
          ),
          onTap: () => _showDetail(e),
        );
      },
    );
  }
}