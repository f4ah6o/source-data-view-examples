import type { MockFixture } from "kintone-mock-server";

/**
 * Three kintone apps backing the employee-avatar / qualification-Matrix /
 * expiration-Table domain:
 *
 *   employees               (app 1): employee_id, name, department_id,
 *                                     department_name, business_role_ids
 *                                     (CHECK_BOX, stable role IDs),
 *                                     photo (FILE, 0+ attachments)
 *   qualification_definitions (app 2): qualification_id, name, category, grade
 *   employee_qualifications (app 3): employee_id, qualification_id,
 *                                     acquired_at, expires_at,
 *                                     credential_number
 *                                     (no natural business key - domain
 *                                     `EmployeeQualification.id` is built
 *                                     from kintone's own record `$id`,
 *                                     i.e. "1".."8" in fixture order below)
 *
 * All scenarios below are evaluated against `asOf: "2026-08-08"`,
 * `expiringWithinDays: 90` in the tests.
 *
 * Employees (constructionRoleId = "construction"):
 *   e1 山田 - 建築部 - [construction]         - photo: 2 files (tests primary-photo selection)
 *   e2 佐藤 - 土木部 - [construction]         - photo: 1 file
 *   e3 鈴木 - 建築部 - [construction, sales]  - no photo
 *   e4 田中 - 土木部 - [construction]         - photo: 1 file, holds nothing (completely unheld)
 *   e5 高橋 - 営業部 - [sales]                - no photo, NOT eligible (non-construction), holds q-arch-1 anyway
 *
 * Qualifications (target = category "architecture"/"civil"; q-safety is
 * intentionally out of that target set, to prove role-filtering and
 * qualification-filtering are independent):
 *   q-arch-1  建築施工管理技術者1級 (architecture/1)
 *   q-arch-2  建築施工管理技術者2級 (architecture/2)
 *   q-civil-1 土木施工管理技術者1級 (civil/1)
 *   q-civil-2 土木施工管理技術者2級 (civil/2) - held by nobody
 *   q-safety  安全衛生責任者 (safety, not a target qualification)
 *
 * employee_qualifications history (in fixture/record-id order):
 *   $id 1: e1 x q-arch-1, acquired 2015-04-01, expires 2020-03-31 (superseded, would be expired)
 *   $id 2: e1 x q-arch-1, acquired 2020-04-01, expires 2031-03-31 (current: valid) - same
 *          coordinate as $id 1, exercises multi-history current-credential resolution
 *   $id 3: e1 x q-civil-1, acquired 2015-01-01, expires 2024-01-01 (expired)
 *   $id 4: e1 x q-safety,  acquired 2021-01-01, no expiry (held, but q-safety is filtered out upstream)
 *   $id 5: e2 x q-arch-2,  acquired 2022-01-10, expires 2026-09-30 (expiring: 53 days out)
 *   $id 6: e3 x q-civil-1, acquired 2019-05-01, no expiry (no-expiry)
 *   $id 7: e3 x q-arch-1,  acquired 2027-01-01 (future relative to asOf - must be ignored)
 *   $id 8: e5 x q-arch-1,  acquired 2020-01-01, expires 2030-01-01 (valid, but e5 isn't eligible)
 */
export const qualificationsFixture: MockFixture = {
  apps: [
    {
      id: 1,
      code: "EMPLOYEES",
      name: "Employees",
      fields: {
        employee_id: { type: "SINGLE_LINE_TEXT", code: "employee_id", label: "Employee ID" },
        name: { type: "SINGLE_LINE_TEXT", code: "name", label: "Name" },
        department_id: { type: "SINGLE_LINE_TEXT", code: "department_id", label: "Department ID" },
        department_name: {
          type: "SINGLE_LINE_TEXT",
          code: "department_name",
          label: "Department Name",
        },
        business_role_ids: {
          type: "CHECK_BOX",
          code: "business_role_ids",
          label: "Business Role IDs",
          options: {
            construction: { label: "construction", index: "0" },
            sales: { label: "sales", index: "1" },
          },
        },
        photo: { type: "FILE", code: "photo", label: "Photo" },
      },
      records: [
        {
          employee_id: { type: "SINGLE_LINE_TEXT", value: "e1" },
          name: { type: "SINGLE_LINE_TEXT", value: "山田 太郎" },
          department_id: { type: "SINGLE_LINE_TEXT", value: "construction-arch" },
          department_name: { type: "SINGLE_LINE_TEXT", value: "建築部" },
          business_role_ids: { type: "CHECK_BOX", value: ["construction"] },
          photo: {
            type: "FILE",
            value: [
              {
                fileKey: "file-e1-a",
                name: "yamada_front.jpg",
                contentType: "image/jpeg",
                size: "12345",
              },
              {
                fileKey: "file-e1-b",
                name: "yamada_side.jpg",
                contentType: "image/jpeg",
                size: "23456",
              },
            ],
          },
        },
        {
          employee_id: { type: "SINGLE_LINE_TEXT", value: "e2" },
          name: { type: "SINGLE_LINE_TEXT", value: "佐藤 花子" },
          department_id: { type: "SINGLE_LINE_TEXT", value: "construction-civil" },
          department_name: { type: "SINGLE_LINE_TEXT", value: "土木部" },
          business_role_ids: { type: "CHECK_BOX", value: ["construction"] },
          photo: {
            type: "FILE",
            value: [
              { fileKey: "file-e2-a", name: "sato.jpg", contentType: "image/jpeg", size: "11111" },
            ],
          },
        },
        {
          employee_id: { type: "SINGLE_LINE_TEXT", value: "e3" },
          name: { type: "SINGLE_LINE_TEXT", value: "鈴木 一郎" },
          department_id: { type: "SINGLE_LINE_TEXT", value: "construction-arch" },
          department_name: { type: "SINGLE_LINE_TEXT", value: "建築部" },
          business_role_ids: { type: "CHECK_BOX", value: ["construction", "sales"] },
          photo: { type: "FILE", value: [] },
        },
        {
          employee_id: { type: "SINGLE_LINE_TEXT", value: "e4" },
          name: { type: "SINGLE_LINE_TEXT", value: "田中 次郎" },
          department_id: { type: "SINGLE_LINE_TEXT", value: "construction-civil" },
          department_name: { type: "SINGLE_LINE_TEXT", value: "土木部" },
          business_role_ids: { type: "CHECK_BOX", value: ["construction"] },
          photo: {
            type: "FILE",
            value: [
              { fileKey: "file-e4-a", name: "tanaka.jpg", contentType: "image/jpeg", size: "9999" },
            ],
          },
        },
        {
          employee_id: { type: "SINGLE_LINE_TEXT", value: "e5" },
          name: { type: "SINGLE_LINE_TEXT", value: "高橋 三郎" },
          department_id: { type: "SINGLE_LINE_TEXT", value: "sales" },
          department_name: { type: "SINGLE_LINE_TEXT", value: "営業部" },
          business_role_ids: { type: "CHECK_BOX", value: ["sales"] },
          photo: { type: "FILE", value: [] },
        },
      ],
    },
    {
      id: 2,
      code: "QUALIFICATION_DEFINITIONS",
      name: "Qualification Definitions",
      fields: {
        qualification_id: {
          type: "SINGLE_LINE_TEXT",
          code: "qualification_id",
          label: "Qualification ID",
        },
        name: { type: "SINGLE_LINE_TEXT", code: "name", label: "Name" },
        category: { type: "SINGLE_LINE_TEXT", code: "category", label: "Category" },
        grade: { type: "SINGLE_LINE_TEXT", code: "grade", label: "Grade" },
      },
      records: [
        {
          qualification_id: { type: "SINGLE_LINE_TEXT", value: "q-arch-1" },
          name: { type: "SINGLE_LINE_TEXT", value: "建築施工管理技術者1級" },
          category: { type: "SINGLE_LINE_TEXT", value: "architecture" },
          grade: { type: "SINGLE_LINE_TEXT", value: "1" },
        },
        {
          qualification_id: { type: "SINGLE_LINE_TEXT", value: "q-arch-2" },
          name: { type: "SINGLE_LINE_TEXT", value: "建築施工管理技術者2級" },
          category: { type: "SINGLE_LINE_TEXT", value: "architecture" },
          grade: { type: "SINGLE_LINE_TEXT", value: "2" },
        },
        {
          qualification_id: { type: "SINGLE_LINE_TEXT", value: "q-civil-1" },
          name: { type: "SINGLE_LINE_TEXT", value: "土木施工管理技術者1級" },
          category: { type: "SINGLE_LINE_TEXT", value: "civil" },
          grade: { type: "SINGLE_LINE_TEXT", value: "1" },
        },
        {
          // Held by nobody in the fixture below.
          qualification_id: { type: "SINGLE_LINE_TEXT", value: "q-civil-2" },
          name: { type: "SINGLE_LINE_TEXT", value: "土木施工管理技術者2級" },
          category: { type: "SINGLE_LINE_TEXT", value: "civil" },
          grade: { type: "SINGLE_LINE_TEXT", value: "2" },
        },
        {
          // Not in the "target" category set the tests filter to.
          qualification_id: { type: "SINGLE_LINE_TEXT", value: "q-safety" },
          name: { type: "SINGLE_LINE_TEXT", value: "安全衛生責任者" },
          category: { type: "SINGLE_LINE_TEXT", value: "safety" },
          grade: { type: "SINGLE_LINE_TEXT", value: "" },
        },
      ],
    },
    {
      id: 3,
      code: "EMPLOYEE_QUALIFICATIONS",
      name: "Employee Qualifications",
      fields: {
        employee_id: { type: "SINGLE_LINE_TEXT", code: "employee_id", label: "Employee ID" },
        qualification_id: {
          type: "SINGLE_LINE_TEXT",
          code: "qualification_id",
          label: "Qualification ID",
        },
        acquired_at: { type: "DATE", code: "acquired_at", label: "Acquired At" },
        expires_at: { type: "DATE", code: "expires_at", label: "Expires At" },
        credential_number: {
          type: "SINGLE_LINE_TEXT",
          code: "credential_number",
          label: "Credential Number",
        },
      },
      records: [
        {
          // $id "1" - superseded by $id "2" below (same e1 x q-arch-1 coordinate).
          employee_id: { type: "SINGLE_LINE_TEXT", value: "e1" },
          qualification_id: { type: "SINGLE_LINE_TEXT", value: "q-arch-1" },
          acquired_at: { type: "DATE", value: "2015-04-01" },
          expires_at: { type: "DATE", value: "2020-03-31" },
          credential_number: { type: "SINGLE_LINE_TEXT", value: "OLD-0001" },
        },
        {
          // $id "2" - the current record for e1 x q-arch-1 (most recent acquiredAt, still valid).
          employee_id: { type: "SINGLE_LINE_TEXT", value: "e1" },
          qualification_id: { type: "SINGLE_LINE_TEXT", value: "q-arch-1" },
          acquired_at: { type: "DATE", value: "2020-04-01" },
          expires_at: { type: "DATE", value: "2031-03-31" },
          credential_number: { type: "SINGLE_LINE_TEXT", value: "NEW-0001" },
        },
        {
          // $id "3" - expired.
          employee_id: { type: "SINGLE_LINE_TEXT", value: "e1" },
          qualification_id: { type: "SINGLE_LINE_TEXT", value: "q-civil-1" },
          acquired_at: { type: "DATE", value: "2015-01-01" },
          expires_at: { type: "DATE", value: "2024-01-01" },
          credential_number: { type: "SINGLE_LINE_TEXT", value: "C-0001" },
        },
        {
          // $id "4" - held, but q-safety is outside the target qualification set.
          employee_id: { type: "SINGLE_LINE_TEXT", value: "e1" },
          qualification_id: { type: "SINGLE_LINE_TEXT", value: "q-safety" },
          acquired_at: { type: "DATE", value: "2021-01-01" },
          expires_at: { type: "DATE", value: "" },
          credential_number: { type: "SINGLE_LINE_TEXT", value: "S-0001" },
        },
        {
          // $id "5" - expiring (53 days out from asOf 2026-08-08, within the 90-day window).
          employee_id: { type: "SINGLE_LINE_TEXT", value: "e2" },
          qualification_id: { type: "SINGLE_LINE_TEXT", value: "q-arch-2" },
          acquired_at: { type: "DATE", value: "2022-01-10" },
          expires_at: { type: "DATE", value: "2026-09-30" },
          credential_number: { type: "SINGLE_LINE_TEXT", value: "C-0002" },
        },
        {
          // $id "6" - no-expiry.
          employee_id: { type: "SINGLE_LINE_TEXT", value: "e3" },
          qualification_id: { type: "SINGLE_LINE_TEXT", value: "q-civil-1" },
          acquired_at: { type: "DATE", value: "2019-05-01" },
          expires_at: { type: "DATE", value: "" },
          credential_number: { type: "SINGLE_LINE_TEXT", value: "C-0003" },
        },
        {
          // $id "7" - acquiredAt is after asOf: must be ignored, e3 x q-arch-1 reads as unheld as of asOf.
          employee_id: { type: "SINGLE_LINE_TEXT", value: "e3" },
          qualification_id: { type: "SINGLE_LINE_TEXT", value: "q-arch-1" },
          acquired_at: { type: "DATE", value: "2027-01-01" },
          expires_at: { type: "DATE", value: "2032-01-01" },
          credential_number: { type: "SINGLE_LINE_TEXT", value: "FUTURE-0001" },
        },
        {
          // $id "8" - e5 holds a qualification, but e5 has no "construction" business role.
          employee_id: { type: "SINGLE_LINE_TEXT", value: "e5" },
          qualification_id: { type: "SINGLE_LINE_TEXT", value: "q-arch-1" },
          acquired_at: { type: "DATE", value: "2020-01-01" },
          expires_at: { type: "DATE", value: "2030-01-01" },
          credential_number: { type: "SINGLE_LINE_TEXT", value: "C-0004" },
        },
      ],
    },
  ],
};
