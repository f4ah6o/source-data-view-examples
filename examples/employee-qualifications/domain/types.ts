import type { MatrixViewModel } from "@f4ah6o/data-view";

/**
 * Source-neutral "社員アバター / 資格保有 Matrix / 資格期限管理" domain
 * model. None of these types are kintone-specific; `kintone.ts` is the
 * only file in this directory that knows kintone exists.
 */

export interface EmployeePhoto {
  readonly key: string;
  readonly name?: string;
  readonly contentType?: string;
}

/** `businessRoleIds` are stable role IDs, never display strings. */
export interface Employee {
  readonly id: string;
  readonly name: string;
  readonly departmentId: string;
  readonly departmentName: string;
  readonly businessRoleIds: readonly string[];
  readonly photo?: EmployeePhoto;
}

export interface QualificationDefinition {
  readonly id: string;
  readonly name: string;
  readonly category?: string;
  readonly grade?: string;
}

/**
 * `id` is required and stable, even though a real-world "acquisition
 * record" has no natural business key of its own - the kintone adapter
 * derives it from the record's own `$id` (see `kintone.ts`).
 */
export interface EmployeeQualification {
  readonly id: string;
  readonly employeeId: string;
  readonly qualificationId: string;
  readonly acquiredAt?: string;
  readonly expiresAt?: string;
  readonly credentialNumber?: string;
}

export type QualificationStatus = "missing" | "valid" | "expiring" | "expired" | "no-expiry";

export interface QualificationCellValue {
  readonly held: boolean;
  readonly status: QualificationStatus;
  readonly qualification?: EmployeeQualification;
}

/** Row-header metadata carried alongside the Matrix, not inside it. */
export interface EmployeeAvatar {
  readonly id: string;
  readonly name: string;
  readonly photo?: EmployeePhoto;
}

export interface QualificationDepartmentView {
  readonly departmentId: string;
  readonly departmentName: string;
  readonly employees: readonly EmployeeAvatar[];
  readonly qualifications: readonly QualificationDefinition[];
  readonly view: MatrixViewModel<string, string, QualificationCellValue>;
}

export interface ExpirationTableRow {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly departmentId: string;
  readonly departmentName: string;
  readonly qualificationId: string;
  readonly qualificationName: string;
  readonly expiresAt?: string;
  readonly status: QualificationStatus;
}

/** The subset of `ExpirationTableRow` columns `toExpirationTable()` renders. */
export type ExpirationTableFieldKey =
  | "employeeName"
  | "qualificationName"
  | "departmentName"
  | "expiresAt"
  | "status";
