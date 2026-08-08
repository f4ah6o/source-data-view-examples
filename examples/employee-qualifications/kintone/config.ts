import type { QualificationAppIds } from "../domain/index.ts";

export interface EmployeeQualificationsCustomizationConfig {
  readonly apps: QualificationAppIds;
  readonly viewId: number;
  readonly targetRoleIds: readonly string[];
  readonly targetQualificationCategories: readonly string[];
  readonly expiringWithinDays: number;
  readonly includeNoExpiry: boolean;
  readonly guestSpaceId?: number;
  readonly asOf?: string;
}

interface ConfigHost {
  readonly EMPLOYEE_QUALIFICATIONS_CONFIG?: unknown;
}

export function readCustomizationConfig(
  value: unknown = (globalThis as typeof globalThis & ConfigHost).EMPLOYEE_QUALIFICATIONS_CONFIG,
): EmployeeQualificationsCustomizationConfig {
  const input = requireRecord(value, "EMPLOYEE_QUALIFICATIONS_CONFIG");
  const apps = requireRecord(input.apps, "apps");

  const config: EmployeeQualificationsCustomizationConfig = {
    apps: {
      employees: requireAppId(apps.employees, "apps.employees"),
      qualificationDefinitions: requireAppId(
        apps.qualificationDefinitions,
        "apps.qualificationDefinitions",
      ),
      employeeQualifications: requireAppId(
        apps.employeeQualifications,
        "apps.employeeQualifications",
      ),
    },
    viewId: requireNonNegativeInteger(input.viewId, "viewId"),
    targetRoleIds: requireStringArray(input.targetRoleIds, "targetRoleIds", true),
    targetQualificationCategories: requireStringArray(
      input.targetQualificationCategories ?? [],
      "targetQualificationCategories",
      false,
    ),
    expiringWithinDays: requireNonNegativeInteger(
      input.expiringWithinDays ?? 90,
      "expiringWithinDays",
    ),
    includeNoExpiry: requireBoolean(input.includeNoExpiry ?? false, "includeNoExpiry"),
    ...(input.guestSpaceId === undefined
      ? {}
      : { guestSpaceId: requireNonNegativeInteger(input.guestSpaceId, "guestSpaceId") }),
    ...(input.asOf === undefined ? {} : { asOf: requireCalendarDate(input.asOf, "asOf") }),
  };

  return config;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireAppId(value: unknown, label: string): string | number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim() !== "") return value;
  throw new TypeError(`${label} must be a positive integer or non-empty string`);
}

function requireStringArray(value: unknown, label: string, nonEmpty: boolean): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item === "")) {
    throw new TypeError(`${label} must be an array of non-empty strings`);
  }
  if (nonEmpty && value.length === 0) throw new TypeError(`${label} must not be empty`);
  return [...value] as string[];
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
  return value;
}

function requireCalendarDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${label} must be YYYY-MM-DD`);
  }
  return value;
}
