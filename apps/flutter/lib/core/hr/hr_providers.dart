import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_providers.dart';
import 'hr_models.dart';
import 'hr_repository.dart';

/// Repository → provider wiring for the HR module (mirrors the auth_providers
/// pattern; plain providers avoid the @riverpod codegen step).
final hrRepositoryProvider = Provider<HrRepository>(
  (ref) => HrRepository(ref.watch(apiClientProvider)),
);

final departmentsProvider = FutureProvider<List<Department>>(
  (ref) => ref.watch(hrRepositoryProvider).departments(),
);

final employeesProvider = FutureProvider<List<Employee>>(
  (ref) => ref.watch(hrRepositoryProvider).employees(),
);

final attendanceProvider = FutureProvider<List<AttendanceRecord>>(
  (ref) => ref.watch(hrRepositoryProvider).attendance(),
);

final leaveTypesProvider = FutureProvider<List<LeaveType>>(
  (ref) => ref.watch(hrRepositoryProvider).leaveTypes(),
);

final leavesProvider = FutureProvider<List<Leave>>(
  (ref) => ref.watch(hrRepositoryProvider).leaves(),
);

final myLeavesProvider = FutureProvider<List<Leave>>(
  (ref) => ref.watch(hrRepositoryProvider).myLeaves(),
);

final salaryStructuresProvider = FutureProvider<List<SalaryStructure>>(
  (ref) => ref.watch(hrRepositoryProvider).salaryStructures(),
);

final payrollRunsProvider = FutureProvider<List<PayrollRun>>(
  (ref) => ref.watch(hrRepositoryProvider).payrollRuns(),
);

final runDetailProvider = FutureProvider.family<PayrollRun, String>(
  (ref, id) => ref.watch(hrRepositoryProvider).payrollRun(id),
);