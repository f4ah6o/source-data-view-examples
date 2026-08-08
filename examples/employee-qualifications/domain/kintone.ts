import {
  createKintoneSource,
  type KintoneRuntime,
  type KintoneSourceSpec,
} from "@f4ah6o/data-source";
import { getPath } from "@f4ah6o/data-view";

import type {
  Employee,
  EmployeePhoto,
  EmployeeQualification,
  QualificationDefinition,
} from "./types.ts";

export interface QualificationAppIds {
  readonly employees: string | number;
  readonly qualificationDefinitions: string | number;
  readonly employeeQualifications: string | number;
}

export interface QualificationSourceSpecs {
  readonly employees: KintoneSourceSpec;
  readonly qualificationDefinitions: KintoneSourceSpec;
  readonly employeeQualifications: KintoneSourceSpec;
}

/**
 * Three independent, single-app specs - one per kintone app, no `joins`.
 * As with the visibility domain, the real relationship between employees /
 * qualification definitions / employee qualifications is a many-to-many
 * correlation by id (resolved in `matrix.ts` / `credentials.ts`), not a
 * row-level join, so a join chain here wouldn't be natural.
 */
export function qualificationSourceSpecs(app: QualificationAppIds): QualificationSourceSpecs {
  const singleApp = (id: string, appId: string | number, fields: string[]): KintoneSourceSpec => ({
    kind: "kintone",
    apps: [{ id, app: appId, fields }],
  });

  return {
    employees: singleApp("employees", app.employees, [
      "employee_id",
      "name",
      "department_id",
      "department_name",
      "business_role_ids",
      "photo",
    ]),
    qualificationDefinitions: singleApp("qualification_definitions", app.qualificationDefinitions, [
      "qualification_id",
      "name",
      "category",
      "grade",
    ]),
    employeeQualifications: singleApp("employee_qualifications", app.employeeQualifications, [
      // "$id" is requested explicitly: kintone-mock-server (like real
      // kintone) only returns the fields listed here, and this app has no
      // natural business key of its own - EmployeeQualification.id is
      // derived from the record's own $id.
      "$id",
      "employee_id",
      "qualification_id",
      "acquired_at",
      "expires_at",
      "credential_number",
    ]),
  };
}

export interface QualificationSourceData {
  readonly employees: readonly Employee[];
  readonly qualifications: readonly QualificationDefinition[];
  readonly history: readonly EmployeeQualification[];
}

/**
 * kintone apps -> @f4ah6o/data-source -> source-neutral domain data.
 *
 * As with visibility's `kintone.ts`, no spec has `joins`, so `composeData`
 * still namespaces each single source under its own id - `getPath` reads
 * straight through that one level of nesting instead of requiring a
 * `DataQuery.select` just to flatten one app's rows.
 */
export async function loadQualificationSourceData(
  specs: QualificationSourceSpecs,
  runtime: KintoneRuntime,
): Promise<QualificationSourceData> {
  const [employeesData, qualificationsData, historyData] = await Promise.all([
    createKintoneSource(specs.employees, runtime).load(),
    createKintoneSource(specs.qualificationDefinitions, runtime).load(),
    createKintoneSource(specs.employeeQualifications, runtime).load(),
  ]);

  return {
    employees: employeesData.rows.map(toEmployee),
    qualifications: qualificationsData.rows.map(toQualificationDefinition),
    history: historyData.rows.map(toEmployeeQualification),
  };
}

function toEmployee(row: Record<string, unknown>): Employee {
  const businessRoleIds = getPath(row, "employees.business_role_ids");
  const employee: Employee = {
    id: String(getPath(row, "employees.employee_id")),
    name: String(getPath(row, "employees.name")),
    departmentId: String(getPath(row, "employees.department_id")),
    departmentName: String(getPath(row, "employees.department_name")),
    businessRoleIds: Array.isArray(businessRoleIds) ? businessRoleIds.map(String) : [],
  };
  const photo = toPrimaryPhoto(getPath(row, "employees.photo"));
  return photo ? { ...employee, photo } : employee;
}

/**
 * kintone FILE fields can hold multiple attachments. Primary photo
 * selection is deterministic: the first file in field order, regardless
 * of name/content-type - never a "guess the photo" heuristic.
 */
function toPrimaryPhoto(value: unknown): EmployeePhoto | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const first = value[0] as Record<string, unknown> | undefined;
  if (!first || first.fileKey == null) return undefined;

  const photo: EmployeePhoto = { key: String(first.fileKey) };
  const withName = first.name != null ? { ...photo, name: String(first.name) } : photo;
  return first.contentType != null
    ? { ...withName, contentType: String(first.contentType) }
    : withName;
}

function toQualificationDefinition(row: Record<string, unknown>): QualificationDefinition {
  const definition: QualificationDefinition = {
    id: String(getPath(row, "qualification_definitions.qualification_id")),
    name: String(getPath(row, "qualification_definitions.name")),
  };
  const category = optionalString(getPath(row, "qualification_definitions.category"));
  const withCategory = category !== undefined ? { ...definition, category } : definition;
  const grade = optionalString(getPath(row, "qualification_definitions.grade"));
  return grade !== undefined ? { ...withCategory, grade } : withCategory;
}

function toEmployeeQualification(row: Record<string, unknown>): EmployeeQualification {
  const base: EmployeeQualification = {
    id: String(getPath(row, "employee_qualifications.$id")),
    employeeId: String(getPath(row, "employee_qualifications.employee_id")),
    qualificationId: String(getPath(row, "employee_qualifications.qualification_id")),
  };
  const acquiredAt = optionalString(getPath(row, "employee_qualifications.acquired_at"));
  const expiresAt = optionalString(getPath(row, "employee_qualifications.expires_at"));
  const credentialNumber = optionalString(
    getPath(row, "employee_qualifications.credential_number"),
  );
  return {
    ...base,
    ...(acquiredAt !== undefined ? { acquiredAt } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(credentialNumber !== undefined ? { credentialNumber } : {}),
  };
}

function optionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value);
  return text === "" ? undefined : text;
}
