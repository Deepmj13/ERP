import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_providers.dart';
import 'finance_models.dart';
import 'finance_repository.dart';

/// Repository → provider wiring for the finance module (plain providers,
/// mirroring the procurement/sales pattern).
final financeRepositoryProvider = Provider<FinanceRepository>(
  (ref) => FinanceRepository(ref.watch(apiClientProvider)),
);

final accountsProvider = FutureProvider<List<Account>>(
  (ref) => ref.watch(financeRepositoryProvider).accounts(),
);

final accountGroupsProvider = FutureProvider<List<AccountGroup>>(
  (ref) => ref.watch(financeRepositoryProvider).accountGroups(),
);

final journalEntriesProvider = FutureProvider<List<JournalEntry>>(
  (ref) => ref.watch(financeRepositoryProvider).journalEntries(),
);

final fiscalPeriodsProvider = FutureProvider<List<FiscalPeriod>>(
  (ref) => ref.watch(financeRepositoryProvider).fiscalPeriods(),
);

final bankTransactionsProvider = FutureProvider<List<BankTransaction>>(
  (ref) => ref.watch(financeRepositoryProvider).bankTransactions(),
);

final trialBalanceProvider = FutureProvider<List<ReportRow>>(
  (ref) => ref.watch(financeRepositoryProvider).trialBalance(),
);

final accountsReceivableProvider = FutureProvider<List<ReportRow>>(
  (ref) => ref.watch(financeRepositoryProvider).accountsReceivable(),
);

final accountsPayableProvider = FutureProvider<List<ReportRow>>(
  (ref) => ref.watch(financeRepositoryProvider).accountsPayable(),
);

final taxSummaryProvider = FutureProvider<List<TaxRow>>(
  (ref) => ref.watch(financeRepositoryProvider).taxSummary(),
);

final incomeStatementProvider = FutureProvider<dynamic>(
  (ref) => ref.watch(financeRepositoryProvider).incomeStatement(),
);

final balanceSheetProvider = FutureProvider<dynamic>(
  (ref) => ref.watch(financeRepositoryProvider).balanceSheet(),
);