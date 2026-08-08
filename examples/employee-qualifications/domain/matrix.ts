import { matrix } from "@f4ah6o/data-view";

import { qualificationCoordinateKey } from "./credentials.ts";
import { partitionByDepartment } from "./roles.ts";
import { qualificationStatus, type QualificationStatusOptions } from "./status.ts";
import type {
  Employee,
  EmployeeQualification,
  QualificationCellValue,
  QualificationDefinition,
  QualificationDepartmentView,
} from "./types.ts";

export interface BuildQualificationDepartmentViewsInput {
  /** Already role-filtered (see `filterEmployeesByRole`). */
  readonly employees: readonly Employee[];
  /** Already filtered to the qualifications this view should show. */
  readonly qualifications: readonly QualificationDefinition[];
  /** At most one record per (employeeId x qualificationId) coordinate - see `selectCurrentQualifications`. */
  readonly currentQualifications: readonly EmployeeQualification[];
  readonly statusOptions: QualificationStatusOptions;
}

/**
 * Builds one `MatrixViewModel` per department, over the *complete*
 * employee x qualification coordinate set - not just held ones. This is
 * what keeps an employee with zero qualifications, and a qualification
 * nobody holds, visible: every (employee, qualification) pair in the
 * input becomes exactly one row before `matrix()` ever sees it, so
 * `matrix()`'s own duplicate-coordinate rejection is never at stake here
 * (the cross product is 1:1 by construction) and no cell is ever sparse.
 *
 * Row axis = `employeeId`, column axis = `qualificationId` (both stable
 * IDs, never display names) - see `matrix()` calls below.
 */
export function buildQualificationDepartmentViews(
  input: BuildQualificationDepartmentViewsInput,
): QualificationDepartmentView[] {
  const currentByCoordinate = new Map(
    input.currentQualifications.map((record) => [
      qualificationCoordinateKey(record.employeeId, record.qualificationId),
      record,
    ]),
  );

  return partitionByDepartment(input.employees).map((department) => {
    const rows = department.employees.flatMap((employee) =>
      input.qualifications.map((qualification) => {
        const held = currentByCoordinate.get(
          qualificationCoordinateKey(employee.id, qualification.id),
        );
        const value: QualificationCellValue = {
          held: held !== undefined,
          status: qualificationStatus(held, input.statusOptions),
          ...(held ? { qualification: held } : {}),
        };
        return { employeeId: employee.id, qualificationId: qualification.id, value };
      }),
    );

    const view = matrix(rows, {
      row: (item) => item.employeeId,
      column: (item) => item.qualificationId,
      value: (item) => item.value,
    });

    return {
      departmentId: department.departmentId,
      departmentName: department.departmentName,
      employees: department.employees.map((employee) => ({
        id: employee.id,
        name: employee.name,
        ...(employee.photo ? { photo: employee.photo } : {}),
      })),
      qualifications: input.qualifications,
      view,
    };
  });
}
