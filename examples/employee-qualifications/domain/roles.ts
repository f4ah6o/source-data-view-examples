import type { Employee } from "./types.ts";

/**
 * Filters employees by business role, using stable role IDs supplied by
 * the caller - never a display string like "施工業務" baked into this
 * function. A display name can be renamed without this logic breaking;
 * the caller decides which role ID(s) count as "eligible" for its use case
 * (e.g. `filterEmployeesByRole(employees, [constructionRoleId])`).
 */
export function filterEmployeesByRole(
  employees: readonly Employee[],
  targetRoleIds: readonly string[],
): Employee[] {
  const targets = new Set(targetRoleIds);
  return employees.filter((employee) =>
    employee.businessRoleIds.some((roleId) => targets.has(roleId)),
  );
}

export interface EmployeeDepartment {
  readonly departmentId: string;
  readonly departmentName: string;
  readonly employees: readonly Employee[];
}

/**
 * Partitions employees by `departmentId`, in first-seen order. Each
 * employee already carries its own `departmentName`, so no separate
 * department lookup/join is needed.
 */
export function partitionByDepartment(employees: readonly Employee[]): EmployeeDepartment[] {
  const order: string[] = [];
  const byDepartment = new Map<string, Employee[]>();

  for (const employee of employees) {
    if (!byDepartment.has(employee.departmentId)) {
      order.push(employee.departmentId);
      byDepartment.set(employee.departmentId, []);
    }
    byDepartment.get(employee.departmentId)!.push(employee);
  }

  return order.map((departmentId) => {
    const departmentEmployees = byDepartment.get(departmentId)!;
    return {
      departmentId,
      departmentName: departmentEmployees[0]!.departmentName,
      employees: departmentEmployees,
    };
  });
}
