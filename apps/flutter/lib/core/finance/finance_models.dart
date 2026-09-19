/// Hand-written DTOs mirroring the Phase 5 finance resources
/// (apps/api/src/finance/*). Tolerant `fromJson` factories and decimal
/// normalization via [_asDouble].
library;

class Account {
  const Account({
    required this.id,
    required this.code,
    required this.name,
    this.type = '',
    this.groupId,
    this.isActive = true,
  });

  final String id;
  final String code;
  final String name;
  final String type;
  final String? groupId;
  final bool isActive;

  factory Account.fromJson(Map<String, dynamic> json) => Account(
        id: json['id'] as String? ?? '',
        code: json['code'] as String? ?? '',
        name: json['name'] as String? ?? '',
        type: json['type'] as String? ?? '',
        groupId: json['groupId'] as String?,
        isActive: json['isActive'] as bool? ?? true,
      );
}

class AccountGroup {
  const AccountGroup({
    required this.id,
    required this.code,
    required this.name,
    this.type = '',
  });

  final String id;
  final String code;
  final String name;
  final String type;

  factory AccountGroup.fromJson(Map<String, dynamic> json) => AccountGroup(
        id: json['id'] as String? ?? '',
        code: json['code'] as String? ?? '',
        name: json['name'] as String? ?? '',
        type: json['type'] as String? ?? '',
      );
}

class JournalLine {
  const JournalLine({
    required this.accountId,
    this.debit = 0,
    this.credit = 0,
    this.narration,
    this.accountCode,
    this.accountName,
  });

  final String accountId;
  final double debit;
  final double credit;
  final String? narration;
  final String? accountCode;
  final String? accountName;

  factory JournalLine.fromJson(Map<String, dynamic> json) => JournalLine(
        accountId: json['accountId'] as String? ?? '',
        debit: _asDouble(json['debit']),
        credit: _asDouble(json['credit']),
        narration: json['narration'] as String?,
        accountCode: json['accountCode'] as String?,
        accountName: json['account'] is Map<String, dynamic>
            ? (json['account'] as Map<String, dynamic>)['name'] as String?
            : json['accountName'] as String?,
      );

  Map<String, dynamic> toPayload() => {
        'accountId': accountId,
        'debit': debit > 0 ? debit : null,
        'credit': credit > 0 ? credit : null,
        'narration': narration,
      };
}

class JournalEntry {
  const JournalEntry({
    required this.id,
    required this.entryNo,
    this.entryDate,
    this.description,
    this.status = 'DRAFT',
    this.totalDebit = 0,
    this.totalCredit = 0,
    this.lines = const [],
  });

  final String id;
  final String entryNo;
  final String? entryDate;
  final String? description;
  final String status;
  final double totalDebit;
  final double totalCredit;
  final List<JournalLine> lines;

  factory JournalEntry.fromJson(Map<String, dynamic> json) => JournalEntry(
        id: json['id'] as String? ?? '',
        entryNo: json['entryNo'] as String? ?? '',
        entryDate: json['entryDate'] as String?,
        description: json['description'] as String?,
        status: json['status'] as String? ?? 'DRAFT',
        totalDebit: _asDouble(json['totalDebit']),
        totalCredit: _asDouble(json['totalCredit']),
        lines: (json['lines'] as List<dynamic>? ?? const [])
            .whereType<Map>()
            .map((e) => JournalLine.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
      );
}

class FiscalPeriod {
  const FiscalPeriod({
    required this.id,
    required this.name,
    this.startDate,
    this.endDate,
    this.status = 'OPEN',
  });

  final String id;
  final String name;
  final String? startDate;
  final String? endDate;
  final String status;

  factory FiscalPeriod.fromJson(Map<String, dynamic> json) => FiscalPeriod(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        startDate: json['startDate'] as String?,
        endDate: json['endDate'] as String?,
        status: json['status'] as String? ?? 'OPEN',
      );
}

class BankTransaction {
  const BankTransaction({
    required this.id,
    this.transactionDate,
    this.description,
    this.amount = 0,
    this.status = 'PENDING',
    this.matchedWithId,
    this.accountName,
    this.currency = 'USD',
    this.reference,
  });

  final String id;
  final String? transactionDate;
  final String? description;
  final double amount;
  final String status;
  final String? matchedWithId;
  final String? accountName;
  final String currency;
  final String? reference;

  factory BankTransaction.fromJson(Map<String, dynamic> json) => BankTransaction(
        id: json['id'] as String? ?? '',
        transactionDate: json['transactionDate'] as String?,
        description: json['description'] as String?,
        amount: _asDouble(json['amount']),
        status: json['status'] as String? ?? 'PENDING',
        matchedWithId: json['matchedWithId'] as String?,
        accountName: json['account'] is Map<String, dynamic>
            ? (json['account'] as Map<String, dynamic>)['name'] as String?
            : json['accountName'] as String?,
        currency: json['currency'] as String? ?? 'USD',
        reference: json['reference'] as String?,
      );
}

/// Generic row for flat reports (trial balance, AR/AP ageing, tax summary).
class ReportRow {
  const ReportRow({
    this.code,
    this.name,
    this.debit = 0,
    this.credit = 0,
    this.balance = 0,
  });

  final String? code;
  final String? name;
  final double debit;
  final double credit;
  final double balance;

  double get value => balance != 0 ? balance : debit - credit;

  factory ReportRow.fromJson(Map<String, dynamic> json) => ReportRow(
        code: json['code'] as String? ?? json['accountCode'] as String?,
        name: json['name'] as String? ?? json['accountName'] as String? ?? json['displayName'] as String?,
        debit: _asDouble(json['debit']),
        credit: _asDouble(json['credit']),
        balance: _asDouble(json['balance']),
      );
}

class TaxRow {
  const TaxRow({
    this.taxName,
    this.taxableAmount = 0,
    this.taxAmount = 0,
  });

  final String? taxName;
  final double taxableAmount;
  final double taxAmount;

  factory TaxRow.fromJson(Map<String, dynamic> json) => TaxRow(
        taxName: json['taxName'] as String? ?? json['name'] as String? ?? json['tax'] as String?,
        taxableAmount: _asDouble(json['taxableAmount']),
        taxAmount: _asDouble(json['taxAmount']),
      );
}

double _asDouble(dynamic value) => switch (value) {
      num n => n.toDouble(),
      String s => double.tryParse(s) ?? 0,
      _ => 0,
    };