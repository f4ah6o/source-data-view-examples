import { table } from "@f4ah6o/data-view";

import { compareCalendarDates } from "./dates.ts";
import { qualificationStatus, type QualificationStatusOptions } from "./status.ts";
import type {
  Employee,
  EmployeeQualification,
  ExpirationTableFieldKey,
  ExpirationTableRow,
  QualificationDefinition,
} from "./types.ts";

export interface BuildExpirationRowsOptions extends QualificationStatusOptions {
  /**
   * Whether to include held, no-expiry credentials in the result.
   * Required, not defaulted - "does no-expiry show up in the expiry
   * table" is a real call this domain shouldn't make implicitly.
   */
  readonly includeNoExpiry: boolean;
}

/**
 * One row per current (already-deduped, see `selectCurrentQualifications`)
 * employee qualification that has an `expiresAt` (or, if
 * `includeNoExpiry`, one without). Sorted ascending by `expiresAt` - a
 * missing `expiresAt` (only possible when `includeNoExpiry` is true)
 * always sorts after every dated row; ties break deterministically by
 * (employeeId, qualificationId), never by insertion order.
 */
export function buildExpirationRows(
  currentQualifications: readonly EmployeeQualification[],
  employees: readonly Employee[],
  qualifications: readonly QualificationDefinition[],
  options: BuildExpirationRowsOptions,
): ExpirationTableRow[] {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const qualificationById = new Map(
    qualifications.map((qualification) => [qualification.id, qualification]),
  );

  const rows: ExpirationTableRow[] = [];
  for (const record of currentQualifications) {
    if (record.expiresAt === undefined && !options.includeNoExpiry) continue;

    const employee = employeeById.get(record.employeeId);
    const qualification = qualificationById.get(record.qualificationId);
    if (!employee || !qualification) continue; // out of scope for this view

    const row: ExpirationTableRow = {
      employeeId: employee.id,
      employeeName: employee.name,
      departmentId: employee.departmentId,
      departmentName: employee.departmentName,
      qualificationId: qualification.id,
      qualificationName: qualification.name,
      ...(record.expiresAt !== undefined ? { expiresAt: record.expiresAt } : {}),
      status: qualificationStatus(record, options),
    };
    rows.push(row);
  }

  return rows.sort(compareByExpirationOrder);
}

function compareByExpirationOrder(a: ExpirationTableRow, b: ExpirationTableRow): number {
  if (a.expiresAt === undefined && b.expiresAt === undefined) return compareCoordinate(a, b);
  if (a.expiresAt === undefined) return 1;
  if (b.expiresAt === undefined) return -1;
  const byDate = compareCalendarDates(a.expiresAt, b.expiresAt);
  return byDate !== 0 ? byDate : compareCoordinate(a, b);
}

function compareCoordinate(a: ExpirationTableRow, b: ExpirationTableRow): number {
  const byEmployee = a.employeeId.localeCompare(b.employeeId);
  return byEmployee !== 0 ? byEmployee : a.qualificationId.localeCompare(b.qualificationId);
}

const EXPIRATION_TABLE_FIELDS: readonly ExpirationTableFieldKey[] = [
  "employeeName",
  "qualificationName",
  "departmentName",
  "expiresAt",
  "status",
];

/** Renders already-sorted expiration rows via the existing, generic `table()` - no new data-view primitive needed. */
export function toExpirationTable(rows: readonly ExpirationTableRow[]) {
  return table(rows, { fields: EXPIRATION_TABLE_FIELDS });
}
