import assert from "node:assert/strict";
import { before, test } from "node:test";

import { createInProcessFetch, MockStore } from "kintone-mock-server";
import type { KintoneRuntime } from "@f4ah6o/data-source";
import { matrix as rawMatrix } from "@f4ah6o/data-view";

import { visibilityFixture } from "../fixtures/visibility.ts";
import {
  loadVisibilitySourceData,
  resolveVisibleResources,
  toVisibilityMatrix,
  toVisibilityMatrixRows,
  visibilitySourceSpecs,
  type VisibilitySourceData,
} from "../domain/index.ts";

/**
 * End-to-end example / integration test for the "所属 x 業務役割"
 * visibility domain prototype (see the repo README's "Example 1" section):
 *
 *   kintone mock (5 apps)
 *     -> @f4ah6o/data-source  (multi-app fetch, kintone record normalize)
 *     -> source-neutral domain data (User / Affiliation / BusinessRole /
 *        UserAssignment / VisibilityPolicy)
 *     -> resolveVisibleResources() / toVisibilityMatrixRows() (domain
 *        transform, lives in this package - not data-source, not data-view)
 *     -> @f4ah6o/data-view matrix()
 *     -> 所属 x 業務役割 MatrixViewModel
 *
 * No HTTP server is started: `createInProcessFetch` drives
 * `KintoneRuntime.fetch` in-process.
 */

const APP_IDS = {
  users: 1,
  affiliations: 2,
  businessRoles: 3,
  userAssignments: 4,
  visibilityPolicies: 5,
} as const;

let runtime: KintoneRuntime;
let sourceData: VisibilitySourceData;

before(async () => {
  const store = new MockStore(visibilityFixture);
  runtime = {
    baseUrl: "https://example.cybozu.com",
    apiToken: "test-token",
    fetch: createInProcessFetch(store),
  };
  sourceData = await loadVisibilitySourceData(visibilitySourceSpecs(APP_IDS), runtime);
});

test("fetches all 5 kintone apps from the in-process mock, no socket required", () => {
  assert.equal(sourceData.users.length, 2);
  assert.equal(sourceData.affiliations.length, 2);
  assert.equal(sourceData.businessRoles.length, 3);
  assert.equal(sourceData.assignments.length, 3);
  assert.equal(sourceData.policies.length, 3);
});

test("kintone records are normalized into plain domain values, not { type, value } wrappers", () => {
  assert.deepEqual(
    [...sourceData.users].sort((a, b) => a.id.localeCompare(b.id)),
    [
      { id: "u1", name: "User A" },
      { id: "u2", name: "User B" },
    ],
  );
  assert.deepEqual(
    [...sourceData.affiliations].sort((a, b) => a.id.localeCompare(b.id)),
    [
      { id: "hq", name: "本社" },
      { id: "nagoya", name: "名古屋支店", parentId: "hq" },
    ],
  );
});

test("a user can hold more than one UserAssignment", () => {
  const forUserA = sourceData.assignments.filter((assignment) => assignment.userId === "u1");
  assert.deepEqual(
    forUserA.map((assignment) => [assignment.affiliationId, assignment.businessRoleId]).sort(),
    [
      ["nagoya", "construction"],
      ["nagoya", "estimate"],
    ].sort(),
  );
});

test("visibility_policies rows convert into the source-neutral VisibilityPolicy model", () => {
  const hqAccounting = sourceData.policies.find(
    (policy) => policy.affiliationId === "hq" && policy.businessRoleId === "accounting",
  );
  assert.ok(hqAccounting);
  assert.deepEqual(
    [...hqAccounting.resources].sort((a, b) => a.resource.localeCompare(b.resource)),
    [
      { source: "kintone", resource: "invoices" },
      { source: "kintone", resource: "ledger", view: "monthly-ledger" },
    ],
  );
});

test("SUBTABLE resources convert into ResourceRef[], deduped within a single policy", () => {
  const nagoyaConstruction = sourceData.policies.find(
    (policy) => policy.affiliationId === "nagoya" && policy.businessRoleId === "construction",
  );
  assert.ok(nagoyaConstruction);
  // Fixture repeats "projects/active-projects" twice in the same subtable;
  // it must collapse to one.
  assert.deepEqual(
    [...nagoyaConstruction.resources].sort((a, b) => a.resource.localeCompare(b.resource)),
    [
      { source: "kintone", resource: "projects", view: "active-projects" },
      { source: "kintone", resource: "tasks" },
    ],
  );
});

test("resolveVisibleResources: dedupes a resource shared across the policies a user's assignments span", () => {
  const forUserA = resolveVisibleResources("u1", sourceData.assignments, sourceData.policies);
  // User A is assigned to nagoya/construction (projects, tasks) AND
  // nagoya/estimate (projects, estimates) - "projects" is shared and must
  // appear exactly once in the resolved, deduped result.
  assert.deepEqual(
    [...forUserA].sort((a, b) => a.resource.localeCompare(b.resource)),
    [
      { source: "kintone", resource: "estimates", view: "pending-estimates" },
      { source: "kintone", resource: "projects", view: "active-projects" },
      { source: "kintone", resource: "tasks" },
    ],
  );
});

test("resolveVisibleResources: a coordinate with no matching policy grants no access (allow-only)", () => {
  assert.deepEqual(
    resolveVisibleResources("does-not-exist", sourceData.assignments, sourceData.policies),
    [],
  );
});

test("toVisibilityMatrixRows: exactly one row per (affiliationId x businessRoleId) coordinate", () => {
  const rows = toVisibilityMatrixRows({
    policies: sourceData.policies,
    assignments: sourceData.assignments,
    users: sourceData.users,
    affiliations: sourceData.affiliations,
    businessRoles: sourceData.businessRoles,
  });

  assert.equal(rows.length, 3, "3 policy/assignment coordinates in the fixture, 3 rows out");
  const coordinates = rows.map((row) => `${row.affiliationId}/${row.businessRoleId}`).sort();
  assert.deepEqual(coordinates, ["hq/accounting", "nagoya/construction", "nagoya/estimate"]);

  const nagoyaConstruction = rows.find(
    (row) => row.affiliationId === "nagoya" && row.businessRoleId === "construction",
  );
  assert.ok(nagoyaConstruction);
  assert.equal(nagoyaConstruction.affiliationName, "名古屋支店");
  assert.equal(nagoyaConstruction.businessRoleName, "工事担当");
  assert.equal(
    nagoyaConstruction.resources.length,
    2,
    "deduped from 3 subtable rows to 2 unique resources",
  );
  assert.deepEqual(
    nagoyaConstruction.users.map((user) => user.id),
    ["u1"],
  );
});

test("Data -> visibility transform -> matrix(): affiliationId is the row axis, businessRoleId is the column axis", () => {
  const rows = toVisibilityMatrixRows({
    policies: sourceData.policies,
    assignments: sourceData.assignments,
    users: sourceData.users,
    affiliations: sourceData.affiliations,
    businessRoles: sourceData.businessRoles,
  });
  const view = toVisibilityMatrix(rows);

  assert.deepEqual(view.rows.map((row) => row.key).sort(), ["hq", "nagoya"]);
  assert.deepEqual(view.columns.map((column) => column.key).sort(), [
    "accounting",
    "construction",
    "estimate",
  ]);
});

test("final MatrixViewModel matches the expected 所属 x 業務役割 shape exactly", () => {
  const rows = toVisibilityMatrixRows({
    policies: sourceData.policies,
    assignments: sourceData.assignments,
    users: sourceData.users,
    affiliations: sourceData.affiliations,
    businessRoles: sourceData.businessRoles,
  });
  const view = toVisibilityMatrix(rows);

  const cellAt = (affiliationId: string, businessRoleId: string) =>
    view.rows
      .find((row) => row.key === affiliationId)
      ?.cells.find((cell) => cell.column === businessRoleId)?.value;

  assert.equal(view.kind, "matrix");

  const nagoyaConstruction = cellAt("nagoya", "construction");
  assert.deepEqual(nagoyaConstruction, {
    affiliationName: "名古屋支店",
    businessRoleName: "工事担当",
    resources: [
      { source: "kintone", resource: "projects", view: "active-projects" },
      { source: "kintone", resource: "tasks" },
    ],
    users: [{ id: "u1", name: "User A" }],
  });

  const nagoyaEstimate = cellAt("nagoya", "estimate");
  assert.deepEqual(nagoyaEstimate, {
    affiliationName: "名古屋支店",
    businessRoleName: "積算担当",
    resources: [
      { source: "kintone", resource: "projects", view: "active-projects" },
      { source: "kintone", resource: "estimates", view: "pending-estimates" },
    ],
    users: [{ id: "u1", name: "User A" }],
  });

  const hqAccounting = cellAt("hq", "accounting");
  assert.deepEqual(hqAccounting, {
    affiliationName: "本社",
    businessRoleName: "経理担当",
    resources: [
      { source: "kintone", resource: "invoices" },
      { source: "kintone", resource: "ledger", view: "monthly-ledger" },
    ],
    users: [{ id: "u2", name: "User B" }],
  });

  // Coordinates that don't exist in the data are still present as a cell
  // (data-view's matrix() emits a full-width row), but with an undefined
  // value - e.g. nagoya has no accounting policy.
  assert.equal(cellAt("nagoya", "accounting"), undefined);
  assert.equal(cellAt("hq", "construction"), undefined);
});

test("data-view's matrix() duplicate coordinate rejection is unchanged", () => {
  // If domain transform ever regresses and stops aggregating to
  // 1 coordinate = 1 row, matrix() must still refuse to silently pick one -
  // this pins that behavior so a future edit here can't accidentally rely
  // on matrix() itself absorbing duplicates.
  assert.throws(
    () =>
      rawMatrix(
        [
          { affiliationId: "nagoya", businessRoleId: "construction", n: 1 },
          { affiliationId: "nagoya", businessRoleId: "construction", n: 2 },
        ],
        {
          row: (item) => item.affiliationId,
          column: (item) => item.businessRoleId,
          value: (item) => item.n,
        },
      ),
    RangeError,
  );
});
