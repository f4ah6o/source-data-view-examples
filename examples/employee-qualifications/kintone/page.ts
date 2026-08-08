import type { KintoneRuntime } from "@f4ah6o/data-source";

import {
  buildExpirationRows,
  buildQualificationDepartmentViews,
  filterEmployeesByRole,
  loadQualificationSourceData,
  qualificationSourceSpecs,
  selectCurrentQualifications,
  toExpirationTable,
  type QualificationDepartmentView,
} from "../domain/index.ts";
import type { EmployeeQualificationsCustomizationConfig } from "./config.ts";

export interface EmployeeQualificationsPageView {
  readonly asOf: string;
  readonly departments: readonly QualificationDepartmentView[];
  readonly expirationTable: ReturnType<typeof toExpirationTable>;
}

export interface BuildPageOptions {
  readonly today?: () => string;
}

export async function buildEmployeeQualificationsPageView(
  config: EmployeeQualificationsCustomizationConfig,
  runtime: KintoneRuntime,
  options: BuildPageOptions = {},
): Promise<EmployeeQualificationsPageView> {
  const asOf = config.asOf ?? (options.today ?? localCalendarDate)();
  const sourceData = await loadQualificationSourceData(qualificationSourceSpecs(config.apps), runtime);
  const employees = filterEmployeesByRole(sourceData.employees, config.targetRoleIds);
  const categories = new Set(config.targetQualificationCategories);
  const qualifications =
    categories.size === 0
      ? sourceData.qualifications
      : sourceData.qualifications.filter(
          (qualification) =>
            qualification.category !== undefined && categories.has(qualification.category),
        );
  const currentQualifications = selectCurrentQualifications(sourceData.history, { asOf });
  const statusOptions = { asOf, expiringWithinDays: config.expiringWithinDays };

  const departments = buildQualificationDepartmentViews({
    employees,
    qualifications,
    currentQualifications,
    statusOptions,
  });
  const expirationRows = buildExpirationRows(currentQualifications, employees, qualifications, {
    ...statusOptions,
    includeNoExpiry: config.includeNoExpiry,
  });

  return {
    asOf,
    departments,
    expirationTable: toExpirationTable(expirationRows),
  };
}

function localCalendarDate(): string {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
