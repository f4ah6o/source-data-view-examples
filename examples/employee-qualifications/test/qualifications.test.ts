import assert from "node:assert/strict";
import { before, test } from "node:test";

import { createInProcessFetch, MockStore } from "kintone-mock-server";
import type { KintoneRuntime } from "@f4ah6o/data-source";
import { matrix as rawMatrix } from "@f4ah6o/data-view";

import { qualificationsFixture } from "../fixtures/qualifications.ts";
import {
  buildExpirationRows,
  buildQualificationDepartmentViews,
  filterEmployeesByRole,
  loadQualificationSourceData,
  qualificationCoordinateKey,
  qualificationSourceSpecs,
  qualificationStatus,
  selectCurrentQualification,
  selectCurrentQualifications,
  toExpirationTable,
  type Employee,
  type EmployeeQualification,
  type QualificationDefinition,
  type QualificationSourceData,
} from "../domain/index.ts";

/**
 * End-to-end example / integration test for the employee-avatar /
 * qualification-Matrix / expiration-Table domain prototype (see the repo
 * README's "Example 2" section):
 *
 *   kintone mock (3 apps)
 *     -> @f4ah6o/data-source (multi-app fetch, kintone record normalize,
 *        including a FILE field and a CHECK_BOX field)
 *     -> source-neutral domain data (Employee / QualificationDefinition /
 *        EmployeeQualification)
 *     -> domain transforms (role filter, department partition, current
 *        credential resolution, employee x qualification cross product,
 *        qualification status) - all in this package, not data-source /
 *        data-view
 *     -> @f4ah6o/data-view matrix() / table()
 *     -> department Matrix ViewModels + an expiration Table ViewModel
 *
 * As with the visibility example, no HTTP server is started:
 * `createInProcessFetch` drives `KintoneRuntime.fetch` in-process.
 */

const APP_IDS = {
  employees: 1,
  qualificationDefinitions: 2,
  employeeQualifications: 3,
} as const;

const CONSTRUCTION_ROLE_ID = "construction";
const AS_OF = "2026-08-08";
const EXPIRING_WITHIN_DAYS = 90;
const TARGET_CATEGORIES = new Set(["architecture", "civil"]);

let sourceData: QualificationSourceData;

before(async () => {
  const store = new MockStore(qualificationsFixture);
  const runtime: KintoneRuntime = {
    baseUrl: "https://example.cybozu.com",
    apiToken: "test-token",
    fetch: createInProcessFetch(store),
  };
  sourceData = await loadQualificationSourceData(qualificationSourceSpecs(APP_IDS), runtime);
});

function eligibleEmployees(): Employee[] {
  return filterEmployeesByRole(sourceData.employees, [CONSTRUCTION_ROLE_ID]);
}

/** Role filtering and qualification filtering are deliberately separate concerns. */
function targetQualifications(): QualificationDefinition[] {
  return sourceData.qualifications.filter(
    (qualification) =>
      qualification.category !== undefined && TARGET_CATEGORIES.has(qualification.category),
  );
}

function currentQualifications(asOf = AS_OF): EmployeeQualification[] {
  return selectCurrentQualifications(sourceData.history, { asOf });
}

// ---------------------------------------------------------------------------
// Source fetch / normalize
// ---------------------------------------------------------------------------

test("fetches all 3 kintone apps from the in-process mock, no socket required", () => {
  assert.equal(sourceData.employees.length, 5);
  assert.equal(sourceData.qualifications.length, 5);
  assert.equal(sourceData.history.length, 8);
});

test("EmployeeQualification.id is derived from kintone's own record $id", () => {
  const ids = sourceData.history.map((record) => record.id).sort();
  assert.deepEqual(ids, ["1", "2", "3", "4", "5", "6", "7", "8"]);
});

// ---------------------------------------------------------------------------
// Use Case 0: avatar mode - FILE field normalize
// ---------------------------------------------------------------------------

test("photo FILE field normalizes into plain EmployeePhoto metadata, not a { type, value } wrapper", () => {
  const yamada = sourceData.employees.find((employee) => employee.id === "e1");
  assert.ok(yamada);
  assert.deepEqual(yamada.photo, {
    key: "file-e1-a",
    name: "yamada_front.jpg",
    contentType: "image/jpeg",
  });
});

test("primary photo selection is deterministic: the first file in FILE field order", () => {
  const yamada = sourceData.employees.find((employee) => employee.id === "e1");
  // e1 has 2 files in its fixture; the primary photo must be the first
  // one ("file-e1-a"), never "file-e1-b", and never order-dependent.
  assert.equal(yamada?.photo?.key, "file-e1-a");
});

test("an employee with no photo files is retained, with photo undefined", () => {
  const suzuki = sourceData.employees.find((employee) => employee.id === "e3");
  assert.ok(suzuki);
  assert.equal(suzuki.photo, undefined);
  assert.equal(suzuki.name, "鈴木 一郎");
});

test("avatar/employee metadata (name, photo) is retained outside the Matrix, on QualificationDepartmentView.employees", () => {
  const views = buildQualificationDepartmentViews({
    employees: eligibleEmployees(),
    qualifications: targetQualifications(),
    currentQualifications: currentQualifications(),
    statusOptions: { asOf: AS_OF, expiringWithinDays: EXPIRING_WITHIN_DAYS },
  });

  const archDept = views.find((view) => view.departmentId === "construction-arch");
  assert.ok(archDept);
  const yamada = archDept.employees.find((employee) => employee.id === "e1");
  assert.deepEqual(yamada, {
    id: "e1",
    name: "山田 太郎",
    photo: { key: "file-e1-a", name: "yamada_front.jpg", contentType: "image/jpeg" },
  });

  const suzuki = archDept.employees.find((employee) => employee.id === "e3");
  assert.deepEqual(suzuki, { id: "e3", name: "鈴木 一郎" });

  // The Matrix cell itself carries no employee name/photo - that lives
  // only on `view.employees`.
  const cell = archDept.view.rows[0]?.cells[0]?.value;
  assert.ok(cell);
  for (const key of Object.keys(cell)) {
    assert.ok(["held", "status", "qualification"].includes(key));
  }
});

// ---------------------------------------------------------------------------
// business role filtering (stable ID, not display text)
// ---------------------------------------------------------------------------

test("business role filtering uses a stable role ID, not the display string", () => {
  const eligible = eligibleEmployees();
  assert.deepEqual(eligible.map((employee) => employee.id).sort(), ["e1", "e2", "e3", "e4"]);
});

test("an employee without the target business role is excluded, even if they hold a target qualification", () => {
  const eligible = eligibleEmployees();
  assert.ok(!eligible.some((employee) => employee.id === "e5"));

  // e5 legitimately holds q-arch-1 in the fixture ($id "8") - exclusion is
  // by role, not by absence of qualifications.
  assert.ok(
    sourceData.history.some(
      (record) => record.employeeId === "e5" && record.qualificationId === "q-arch-1",
    ),
  );
});

test("an employee with multiple business roles is still matched by role filtering", () => {
  const eligible = eligibleEmployees();
  const suzuki = eligible.find((employee) => employee.id === "e3");
  assert.ok(suzuki);
  assert.deepEqual([...suzuki.businessRoleIds].sort(), ["construction", "sales"]);
});

// ---------------------------------------------------------------------------
// department partition
// ---------------------------------------------------------------------------

test("eligible employees partition by department", () => {
  const views = buildQualificationDepartmentViews({
    employees: eligibleEmployees(),
    qualifications: targetQualifications(),
    currentQualifications: currentQualifications(),
    statusOptions: { asOf: AS_OF, expiringWithinDays: EXPIRING_WITHIN_DAYS },
  });

  assert.deepEqual(views.map((view) => view.departmentId).sort(), [
    "construction-arch",
    "construction-civil",
  ]);

  const archDept = views.find((view) => view.departmentId === "construction-arch");
  assert.equal(archDept?.departmentName, "建築部");
  assert.deepEqual(archDept?.employees.map((employee) => employee.id).sort(), ["e1", "e3"]);

  const civilDept = views.find((view) => view.departmentId === "construction-civil");
  assert.equal(civilDept?.departmentName, "土木部");
  assert.deepEqual(civilDept?.employees.map((employee) => employee.id).sort(), ["e2", "e4"]);
});

// ---------------------------------------------------------------------------
// qualification filtering (multiple types, multiple grades - separate from role filtering)
// ---------------------------------------------------------------------------

test("target qualification filtering is a separate concern from role filtering", () => {
  const targets = targetQualifications();
  // q-safety exists and category "safety" is real data, but isn't in the
  // target category set - proves filtering happens independently, by
  // whatever the caller passes in, not by a name check inside domain code.
  assert.deepEqual(targets.map((qualification) => qualification.id).sort(), [
    "q-arch-1",
    "q-arch-2",
    "q-civil-1",
    "q-civil-2",
  ]);
});

test("multiple qualification types and multiple grades are distinct qualification IDs", () => {
  const targets = targetQualifications();
  const byCategory = new Map<string, string[]>();
  for (const qualification of targets) {
    const list = byCategory.get(qualification.category!) ?? [];
    list.push(qualification.grade!);
    byCategory.set(qualification.category!, list);
  }
  assert.deepEqual([...(byCategory.get("architecture") ?? [])].sort(), ["1", "2"]);
  assert.deepEqual([...(byCategory.get("civil") ?? [])].sort(), ["1", "2"]);
});

// ---------------------------------------------------------------------------
// Use Case 1: employee x qualification grid (complete coordinate set)
// ---------------------------------------------------------------------------

test("the Matrix has the complete employee x qualification coordinate set, including unheld cells", () => {
  const views = buildQualificationDepartmentViews({
    employees: eligibleEmployees(),
    qualifications: targetQualifications(),
    currentQualifications: currentQualifications(),
    statusOptions: { asOf: AS_OF, expiringWithinDays: EXPIRING_WITHIN_DAYS },
  });

  // 4 target qualifications x (2 employees in each department) = 8 cells per department.
  for (const view of views) {
    assert.equal(
      view.view.columns.length,
      4,
      `${view.departmentId} should have 4 qualification columns`,
    );
    for (const row of view.view.rows) {
      assert.equal(row.cells.length, 4, `${view.departmentId}/${row.key} should have 4 cells`);
      for (const cell of row.cells)
        assert.notEqual(cell.value, undefined, "no sparse cells - every coordinate is explicit");
    }
  }
});

test("an employee who holds nothing is still present, with every cell 'missing'", () => {
  const views = buildQualificationDepartmentViews({
    employees: eligibleEmployees(),
    qualifications: targetQualifications(),
    currentQualifications: currentQualifications(),
    statusOptions: { asOf: AS_OF, expiringWithinDays: EXPIRING_WITHIN_DAYS },
  });

  const civilDept = views.find((view) => view.departmentId === "construction-civil");
  const tanakaRow = civilDept?.view.rows.find((row) => row.key === "e4");
  assert.ok(tanakaRow);
  for (const cell of tanakaRow.cells) {
    assert.deepEqual(cell.value, { held: false, status: "missing" });
  }
});

test("an employee who holds some but not all target qualifications shows 'missing' only for the unheld ones", () => {
  const views = buildQualificationDepartmentViews({
    employees: eligibleEmployees(),
    qualifications: targetQualifications(),
    currentQualifications: currentQualifications(),
    statusOptions: { asOf: AS_OF, expiringWithinDays: EXPIRING_WITHIN_DAYS },
  });

  const archDept = views.find((view) => view.departmentId === "construction-arch");
  const yamadaRow = archDept?.view.rows.find((row) => row.key === "e1");
  assert.ok(yamadaRow);
  const heldQualificationIds = yamadaRow.cells
    .filter((cell) => cell.value?.held)
    .map((cell) => cell.column);
  const missingQualificationIds = yamadaRow.cells
    .filter((cell) => !cell.value?.held)
    .map((cell) => cell.column);
  assert.deepEqual(heldQualificationIds.sort(), ["q-arch-1", "q-civil-1"]);
  assert.deepEqual(missingQualificationIds.sort(), ["q-arch-2", "q-civil-2"]);
});

test("a qualification nobody holds still appears as a column, all cells missing", () => {
  const views = buildQualificationDepartmentViews({
    employees: eligibleEmployees(),
    qualifications: targetQualifications(),
    currentQualifications: currentQualifications(),
    statusOptions: { asOf: AS_OF, expiringWithinDays: EXPIRING_WITHIN_DAYS },
  });

  for (const view of views) {
    assert.ok(view.view.columns.some((column) => column.key === "q-civil-2"));
    for (const row of view.view.rows) {
      const cell = row.cells.find((c) => c.column === "q-civil-2");
      assert.deepEqual(cell?.value, { held: false, status: "missing" });
    }
  }
});

test("Matrix row axis is employeeId, column axis is qualificationId (stable IDs)", () => {
  const views = buildQualificationDepartmentViews({
    employees: eligibleEmployees(),
    qualifications: targetQualifications(),
    currentQualifications: currentQualifications(),
    statusOptions: { asOf: AS_OF, expiringWithinDays: EXPIRING_WITHIN_DAYS },
  });

  const archDept = views.find((view) => view.departmentId === "construction-arch");
  assert.deepEqual(archDept?.view.rows.map((row) => row.key).sort(), ["e1", "e3"]);
  assert.deepEqual(archDept?.view.columns.map((column) => column.key).sort(), [
    "q-arch-1",
    "q-arch-2",
    "q-civil-1",
    "q-civil-2",
  ]);
});

test("data-view's matrix() duplicate coordinate rejection is unchanged", () => {
  assert.throws(
    () =>
      rawMatrix(
        [
          { employeeId: "e1", qualificationId: "q-arch-1", n: 1 },
          { employeeId: "e1", qualificationId: "q-arch-1", n: 2 },
        ],
        {
          row: (item) => item.employeeId,
          column: (item) => item.qualificationId,
          value: (item) => item.n,
        },
      ),
    RangeError,
  );
});

test("held cell exposes the resolved current qualification record", () => {
  const views = buildQualificationDepartmentViews({
    employees: eligibleEmployees(),
    qualifications: targetQualifications(),
    currentQualifications: currentQualifications(),
    statusOptions: { asOf: AS_OF, expiringWithinDays: EXPIRING_WITHIN_DAYS },
  });

  const archDept = views.find((view) => view.departmentId === "construction-arch");
  const yamadaArch1 = archDept?.view.rows
    .find((row) => row.key === "e1")
    ?.cells.find((cell) => cell.column === "q-arch-1");
  assert.deepEqual(yamadaArch1?.value, {
    held: true,
    status: "valid",
    qualification: {
      id: "2",
      employeeId: "e1",
      qualificationId: "q-arch-1",
      acquiredAt: "2020-04-01",
      expiresAt: "2031-03-31",
      credentialNumber: "NEW-0001",
    },
  });
});

// ---------------------------------------------------------------------------
// current credential resolution
// ---------------------------------------------------------------------------

test("multiple history records for the same employee x qualification resolve to one current record", () => {
  const history = sourceData.history.filter(
    (record) => record.employeeId === "e1" && record.qualificationId === "q-arch-1",
  );
  assert.equal(history.length, 2, "fixture has 2 records for this coordinate");

  const current = selectCurrentQualification(history, { asOf: AS_OF });
  assert.equal(
    current?.id,
    "2",
    "the more recently acquired, currently-valid record wins over the superseded one",
  );
});

test("a future acquiredAt record is ignored: the coordinate reads as unheld as of asOf", () => {
  const history = sourceData.history.filter(
    (record) => record.employeeId === "e3" && record.qualificationId === "q-arch-1",
  );
  assert.equal(history.length, 1);
  assert.equal(history[0]?.acquiredAt, "2027-01-01");

  assert.equal(selectCurrentQualification(history, { asOf: AS_OF }), undefined);

  // ... and it shows up as "missing" in the Matrix, not held.
  const views = buildQualificationDepartmentViews({
    employees: eligibleEmployees(),
    qualifications: targetQualifications(),
    currentQualifications: currentQualifications(),
    statusOptions: { asOf: AS_OF, expiringWithinDays: EXPIRING_WITHIN_DAYS },
  });
  const archDept = views.find((view) => view.departmentId === "construction-arch");
  const cell = archDept?.view.rows
    .find((row) => row.key === "e3")
    ?.cells.find((c) => c.column === "q-arch-1");
  assert.deepEqual(cell?.value, { held: false, status: "missing" });
});

test("current credential selection prefers a record valid as of asOf over an expired one, regardless of recency", () => {
  const older: EmployeeQualification = {
    id: "h1",
    employeeId: "x",
    qualificationId: "y",
    acquiredAt: "2020-01-01",
    expiresAt: "2021-01-01",
  };
  const morerecent: EmployeeQualification = {
    id: "h2",
    employeeId: "x",
    qualificationId: "y",
    acquiredAt: "2022-01-01",
    expiresAt: "2023-01-01",
  };
  const stillValid: EmployeeQualification = {
    id: "h3",
    employeeId: "x",
    qualificationId: "y",
    acquiredAt: "2024-06-01",
    expiresAt: "2030-01-01",
  };

  const current = selectCurrentQualification([older, morerecent, stillValid], {
    asOf: "2026-01-01",
  });
  assert.equal(current?.id, "h3");
});

test("current credential selection falls back to the most recent record when nothing is valid as of asOf, so it can be judged expired", () => {
  const older: EmployeeQualification = {
    id: "h1",
    employeeId: "x",
    qualificationId: "y",
    acquiredAt: "2020-01-01",
    expiresAt: "2021-01-01",
  };
  const morerecent: EmployeeQualification = {
    id: "h2",
    employeeId: "x",
    qualificationId: "y",
    acquiredAt: "2022-01-01",
    expiresAt: "2023-01-01",
  };

  const current = selectCurrentQualification([older, morerecent], { asOf: "2026-01-01" });
  assert.equal(current?.id, "h2", "most recently acquired of the (all-expired) candidates");
  assert.equal(
    qualificationStatus(current, { asOf: "2026-01-01", expiringWithinDays: 30 }),
    "expired",
  );
});

test("current credential selection breaks a full tie deterministically by stable id (lexicographic, not numeric)", () => {
  const candidateA: EmployeeQualification = {
    id: "9",
    employeeId: "x",
    qualificationId: "y",
    acquiredAt: "2024-01-01",
    expiresAt: "2030-01-01",
  };
  const candidateB: EmployeeQualification = {
    id: "10",
    employeeId: "x",
    qualificationId: "y",
    acquiredAt: "2024-01-01",
    expiresAt: "2030-01-01",
  };

  // "9" > "10" lexicographically, even though 10 > 9 numerically - pinning
  // this documents the tie-break is a plain string compare.
  const current = selectCurrentQualification([candidateA, candidateB], { asOf: "2026-01-01" });
  assert.equal(current?.id, "9");
});

test("selectCurrentQualifications resolves every coordinate in a mixed multi-employee history batch", () => {
  const current = currentQualifications();
  const coordinates = new Set(
    current.map((record) => qualificationCoordinateKey(record.employeeId, record.qualificationId)),
  );
  // one entry per distinct (employeeId, qualificationId) pair actually held as of asOf:
  // e1xq-arch-1, e1xq-civil-1, e1xq-safety, e2xq-arch-2, e3xq-civil-1, e5xq-arch-1
  // (e3xq-arch-1 is excluded: its only record has a future acquiredAt)
  assert.equal(coordinates.size, 6);
  assert.equal(current.length, coordinates.size, "one record per coordinate, never duplicates");
});

// ---------------------------------------------------------------------------
// Use Case 2: qualification status (calendar-date boundaries)
// ---------------------------------------------------------------------------

test("qualificationStatus: missing when there is no credential", () => {
  assert.equal(
    qualificationStatus(undefined, { asOf: "2026-01-01", expiringWithinDays: 10 }),
    "missing",
  );
});

test("qualificationStatus: no-expiry when held with no expiresAt", () => {
  const heldForever: EmployeeQualification = {
    id: "h",
    employeeId: "x",
    qualificationId: "y",
    expiresAt: undefined,
  };
  assert.equal(
    qualificationStatus(heldForever, { asOf: "2026-01-01", expiringWithinDays: 10 }),
    "no-expiry",
  );
});

test("qualificationStatus: expired the day after expiresAt, valid well before it", () => {
  const expiresJan1: EmployeeQualification = {
    id: "h",
    employeeId: "x",
    qualificationId: "y",
    expiresAt: "2026-01-01",
  };
  assert.equal(
    qualificationStatus(expiresJan1, { asOf: "2025-01-01", expiringWithinDays: 0 }),
    "valid",
    "asOf is a full year before expiresAt, well outside any reasonable window",
  );
  assert.equal(
    qualificationStatus(expiresJan1, { asOf: "2026-01-02", expiringWithinDays: 10 }),
    "expired",
    "expiresAt < asOf",
  );
});

test("qualificationStatus: expiresAt === asOf is still valid-for-the-day, classified as expiring", () => {
  const expiresJan1: EmployeeQualification = {
    id: "h",
    employeeId: "x",
    qualificationId: "y",
    expiresAt: "2026-01-01",
  };
  assert.equal(
    qualificationStatus(expiresJan1, { asOf: "2026-01-01", expiringWithinDays: 10 }),
    "expiring",
  );
});

test("qualificationStatus: exact expiring threshold boundary (0 days, threshold days, threshold + 1 day)", () => {
  const expiresJan11: EmployeeQualification = {
    id: "h",
    employeeId: "x",
    qualificationId: "y",
    expiresAt: "2026-01-11",
  };
  // asOf = 2026-01-01, expiringWithinDays = 10 -> boundary is exactly Jan 11.
  assert.equal(
    qualificationStatus(expiresJan11, { asOf: "2026-01-01", expiringWithinDays: 10 }),
    "expiring",
    "exactly at the threshold (10 days out) is still expiring",
  );

  const expiresJan12: EmployeeQualification = {
    id: "h",
    employeeId: "x",
    qualificationId: "y",
    expiresAt: "2026-01-12",
  };
  assert.equal(
    qualificationStatus(expiresJan12, { asOf: "2026-01-01", expiringWithinDays: 10 }),
    "valid",
    "one day past the threshold (11 days out) is valid",
  );

  const expiresJan01: EmployeeQualification = {
    id: "h",
    employeeId: "x",
    qualificationId: "y",
    expiresAt: "2026-01-01",
  };
  assert.equal(
    qualificationStatus(expiresJan01, { asOf: "2026-01-01", expiringWithinDays: 0 }),
    "expiring",
    "0 days out, with a 0-day window, is still expiring (not expired)",
  );
});

test("qualificationStatus rejects a negative or non-integer expiringWithinDays", () => {
  const held: EmployeeQualification = {
    id: "h",
    employeeId: "x",
    qualificationId: "y",
    expiresAt: "2026-01-01",
  };
  assert.throws(() => qualificationStatus(held, { asOf: "2026-01-01", expiringWithinDays: -1 }));
  assert.throws(() => qualificationStatus(held, { asOf: "2026-01-01", expiringWithinDays: 1.5 }));
});

test("qualification statuses observed end-to-end from the fixture cover valid / expiring / expired / no-expiry", () => {
  const statusFor = (employeeId: string, qualificationId: string) => {
    const record = currentQualifications().find(
      (q) => q.employeeId === employeeId && q.qualificationId === qualificationId,
    );
    return qualificationStatus(record, { asOf: AS_OF, expiringWithinDays: EXPIRING_WITHIN_DAYS });
  };

  assert.equal(statusFor("e1", "q-arch-1"), "valid");
  assert.equal(statusFor("e1", "q-civil-1"), "expired");
  assert.equal(statusFor("e2", "q-arch-2"), "expiring");
  assert.equal(statusFor("e3", "q-civil-1"), "no-expiry");
  assert.equal(statusFor("e4", "q-arch-1"), "missing");
});

// ---------------------------------------------------------------------------
// expiration Table
// ---------------------------------------------------------------------------

test("expiration Table rows are sorted ascending by expiresAt, no-expiry excluded by default", () => {
  const rows = buildExpirationRows(
    currentQualifications(),
    sourceData.employees,
    sourceData.qualifications,
    {
      asOf: AS_OF,
      expiringWithinDays: EXPIRING_WITHIN_DAYS,
      includeNoExpiry: false,
    },
  );

  // e3 x q-civil-1 (no-expiry) must not appear.
  assert.ok(!rows.some((row) => row.employeeId === "e3" && row.qualificationId === "q-civil-1"));

  const order = rows.map((row) => [row.employeeId, row.qualificationId, row.expiresAt, row.status]);
  assert.deepEqual(order, [
    ["e1", "q-civil-1", "2024-01-01", "expired"],
    ["e2", "q-arch-2", "2026-09-30", "expiring"],
    ["e5", "q-arch-1", "2030-01-01", "valid"],
    ["e1", "q-arch-1", "2031-03-31", "valid"],
  ]);
});

test("expiration Table can include no-expiry rows via an explicit option, sorted after every dated row", () => {
  const rows = buildExpirationRows(
    currentQualifications(),
    sourceData.employees,
    sourceData.qualifications,
    {
      asOf: AS_OF,
      expiringWithinDays: EXPIRING_WITHIN_DAYS,
      includeNoExpiry: true,
    },
  );

  // 2 no-expiry coordinates in the fixture (e1 x q-safety, e3 x q-civil-1);
  // both sort after every dated row, tied with each other on `expiresAt`,
  // and broken deterministically by (employeeId, qualificationId).
  const noExpiryRows = rows.slice(-2);
  assert.deepEqual(
    noExpiryRows.map((row) => [row.employeeId, row.qualificationId, row.expiresAt, row.status]),
    [
      ["e1", "q-safety", undefined, "no-expiry"],
      ["e3", "q-civil-1", undefined, "no-expiry"],
    ],
  );
  assert.equal(rows.length, 6);
});

test("expiration Table renders via the existing table() primitive", () => {
  const rows = buildExpirationRows(
    currentQualifications(),
    sourceData.employees,
    sourceData.qualifications,
    {
      asOf: AS_OF,
      expiringWithinDays: EXPIRING_WITHIN_DAYS,
      includeNoExpiry: false,
    },
  );
  const view = toExpirationTable(rows);

  assert.equal(view.kind, "table");
  assert.deepEqual(
    view.fields.map((field) => field.key),
    ["employeeName", "qualificationName", "departmentName", "expiresAt", "status"],
  );
  assert.deepEqual(
    view.rows[0]?.cells.map((cell) => cell.value),
    ["山田 太郎", "土木施工管理技術者1級", "建築部", "2024-01-01", "expired"],
  );
});
