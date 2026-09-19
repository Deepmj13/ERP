import 'dart:convert';

import '../network/api_client.dart';
import '../network/idempotency.dart';
import 'finance_models.dart';

/// Talks to the `/accounts`, `/journal-entries`, `/fiscal-periods`,
/// `/bank-transactions` and `/reports` resources (apps/api/src/finance).
/// Every mutating call carries a fresh Idempotency-Key (plan §16a).
class FinanceRepository {
  FinanceRepository(this._api);

  final ApiClient _api;

  // ── Accounts ───────────────────────────────────────────────────────────────
  Future<List<Account>> accounts({String? type, String? groupId}) async =>
      _list(
        _api.get('/accounts', query: {
          'type': ?(type == null || type.isEmpty ? null : type),
          'groupId': ?groupId,
        }),
        Account.fromJson,
      );

  Future<List<AccountGroup>> accountGroups({String? type}) async =>
      _list(
        _api.get('/accounts/account-groups', query: {'type': ?(type == null || type.isEmpty ? null : type)}),
        AccountGroup.fromJson,
      );

  Future<Account> createAccount({
    required String code,
    required String name,
    required String type,
    String? groupId,
  }) async {
    final result = await _api.post(
      '/accounts',
      body: {'code': code, 'name': name, 'type': type, 'groupId': ?groupId},
      headers: idempotencyHeaders(),
    );
    return Account.fromJson(result.data);
  }

  Future<Account> updateAccount(String id, {String? name, bool? isActive}) async {
    final result = await _api.patch(
      '/accounts/$id',
      body: {'name': ?name, 'isActive': ?isActive},
      headers: idempotencyHeaders(),
    );
    return Account.fromJson(result.data);
  }

  // ── Journal ────────────────────────────────────────────────────────────────
  Future<List<JournalEntry>> journalEntries({String? status, String? from, String? to}) async =>
      _list(
        _api.get('/journal-entries', query: {
          'status': ?(status == null || status.isEmpty ? null : status),
          'from': ?from,
          'to': ?to,
        }),
        JournalEntry.fromJson,
      );

  Future<JournalEntry> journalEntry(String id) =>
      _single(_api.get('/journal-entries/$id'), JournalEntry.fromJson);

  Future<JournalEntry> createJournalEntry({
    required String entryDate,
    required List<JournalLine> lines,
    String? description,
  }) async {
    final result = await _api.post(
      '/journal-entries',
      body: {
        'entryDate': entryDate,
        'description': ?description,
        'lines': lines.map((l) => l.toPayload()).toList(),
      },
      headers: idempotencyHeaders(),
    );
    return JournalEntry.fromJson(result.data);
  }

  Future<void> postJournalEntry(String id) async {
    await _api.post('/journal-entries/$id/post', headers: idempotencyHeaders());
  }

  Future<void> reverseJournalEntry(String id) async {
    await _api.post('/journal-entries/$id/reverse', headers: idempotencyHeaders());
  }

  // ── Fiscal periods ─────────────────────────────────────────────────────────
  Future<List<FiscalPeriod>> fiscalPeriods() async =>
      _list(_api.get('/fiscal-periods'), FiscalPeriod.fromJson);

  Future<FiscalPeriod> createFiscalPeriod({
    required String name,
    required String startDate,
    required String endDate,
  }) async {
    final result = await _api.post(
      '/fiscal-periods',
      body: {'name': name, 'startDate': startDate, 'endDate': endDate},
      headers: idempotencyHeaders(),
    );
    return FiscalPeriod.fromJson(result.data);
  }

  Future<void> closeFiscalPeriod(String id) async {
    await _api.post('/fiscal-periods/$id/close', headers: idempotencyHeaders());
  }

  // ── Bank transactions ──────────────────────────────────────────────────────
  Future<List<BankTransaction>> bankTransactions({String? status, String? accountId}) async =>
      _list(
        _api.get('/bank-transactions', query: {
          'status': ?(status == null || status.isEmpty ? null : status),
          'accountId': ?accountId,
        }),
        BankTransaction.fromJson,
      );

  Future<int> importBankTransactions({
    required String accountId,
    required String dateFormat,
    required List<List<dynamic>> rows,
  }) async {
    final result = await _api.post(
      '/bank-transactions/import',
      body: {'accountId': accountId, 'dateFormat': dateFormat, 'rows': rows},
      headers: idempotencyHeaders(),
    );
    final count = result.raw;
    return count is num ? count.toInt() : 0;
  }

  Future<void> reconcileBankTransaction(String id) async {
    await _api.post('/bank-transactions/$id/reconcile', headers: idempotencyHeaders());
  }

  Future<void> matchBankTransaction(String id, {required String matchedWithId}) async {
    await _api.post(
      '/bank-transactions/$id/match',
      body: {'matchedWithId': matchedWithId},
      headers: idempotencyHeaders(),
    );
  }

  // ── Reports ────────────────────────────────────────────────────────────────
  Future<List<ReportRow>> trialBalance() async =>
      _list(_api.get('/reports/trial-balance'), ReportRow.fromJson);

  Future<List<ReportRow>> generalLedger({String? accountId, String? from, String? to}) async =>
      _list(
        _api.get('/reports/general-ledger', query: {
          'accountId': ?accountId,
          'from': ?from,
          'to': ?to,
        }),
        ReportRow.fromJson,
      );

  Future<List<ReportRow>> accountsReceivable() async =>
      _list(_api.get('/reports/accounts-receivable'), ReportRow.fromJson);

  Future<List<ReportRow>> accountsPayable() async =>
      _list(_api.get('/reports/accounts-payable'), ReportRow.fromJson);

  Future<List<TaxRow>> taxSummary({String? from, String? to}) async =>
      _list(
        _api.get('/reports/tax-summary', query: {'from': ?from, 'to': ?to}),
        TaxRow.fromJson,
      );

  /// Income statement / balance sheet return nested sections that depend on the
  /// account tree, so we surface the raw payload and let the page render it
  /// generically.
  Future<dynamic> incomeStatement({String? from, String? to}) async {
    final result = await _api.get('/reports/income-statement',
        query: {'from': ?from, 'to': ?to});
    return result.raw;
  }

  Future<dynamic> balanceSheet() async => (await _api.get('/reports/balance-sheet')).raw;

  // ── Helpers ────────────────────────────────────────────────────────────────
  Future<List<T>> _list<T>(Future<ApiResult> call, T Function(Map<String, dynamic>) fromJson) async {
    final result = await call;
    final raw = result.raw;
    if (raw is! List<dynamic>) return const [];
    return raw
        .whereType<Map>()
        .map((e) => fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<T> _single<T>(Future<ApiResult> call, T Function(Map<String, dynamic>) fromJson) async {
    final raw = (await call).raw;
    if (raw is! Map) throw const FormatException('Unexpected response shape');
    return fromJson(_asMap(raw));
  }

  Map<String, dynamic> _asMap(Map raw) {
    if (raw.isEmpty) return <String, dynamic>{};
    final first = raw.values.first;
    if (first is List && first.isNotEmpty) {
      final parsed = first.first;
      if (parsed is Map) return Map<String, dynamic>.from(parsed);
      if (parsed is String) {
        final decoded = jsonDecode(parsed);
        if (decoded is Map) return Map<String, dynamic>.from(decoded);
      }
    }
    return Map<String, dynamic>.from(raw);
  }
}