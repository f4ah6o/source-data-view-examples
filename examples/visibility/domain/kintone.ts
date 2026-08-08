import {
  createKintoneSource,
  type KintoneRuntime,
  type KintoneSourceSpec,
} from "@f4ah6o/data-source";
import { getPath } from "@f4ah6o/data-view";

import { dedupeResources } from "./resolve.ts";
import type {
  Affiliation,
  BusinessRole,
  ResourceRef,
  User,
  UserAssignment,
  VisibilityPolicy,
} from "./types.ts";

export interface VisibilityAppIds {
  readonly users: string | number;
  readonly affiliations: string | number;
  readonly businessRoles: string | number;
  readonly userAssignments: string | number;
  readonly visibilityPolicies: string | number;
}

export interface VisibilitySourceSpecs {
  readonly users: KintoneSourceSpec;
  readonly affiliations: KintoneSourceSpec;
  readonly businessRoles: KintoneSourceSpec;
  readonly userAssignments: KintoneSourceSpec;
  readonly visibilityPolicies: KintoneSourceSpec;
}

/**
 * Five independent, single-app specs - one per kintone app.
 *
 * Each app maps 1:1 onto a domain type, so there's no row-level join to
 * make here: the real relationship between policies/assignments/
 * affiliations/roles/users is a many-to-many correlation by id, which is
 * exactly the kind of aggregation the domain transform (`matrix.ts`), not
 * data-source's `join`, is meant to own. "Domain-natural boundary" here is
 * five flat reads, not one large join chain.
 */
export function visibilitySourceSpecs(app: VisibilityAppIds): VisibilitySourceSpecs {
  const singleApp = (id: string, appId: string | number, fields: string[]): KintoneSourceSpec => ({
    kind: "kintone",
    apps: [{ id, app: appId, fields }],
  });

  return {
    users: singleApp("users", app.users, ["user_id", "name"]),
    affiliations: singleApp("affiliations", app.affiliations, [
      "affiliation_id",
      "name",
      "parent_id",
    ]),
    businessRoles: singleApp("business_roles", app.businessRoles, ["role_id", "name"]),
    userAssignments: singleApp("user_assignments", app.userAssignments, [
      "user_id",
      "affiliation_id",
      "role_id",
    ]),
    visibilityPolicies: singleApp("visibility_policies", app.visibilityPolicies, [
      "affiliation_id",
      "role_id",
      "resources",
    ]),
  };
}

export interface VisibilitySourceData {
  readonly users: readonly User[];
  readonly affiliations: readonly Affiliation[];
  readonly businessRoles: readonly BusinessRole[];
  readonly assignments: readonly UserAssignment[];
  readonly policies: readonly VisibilityPolicy[];
}

/**
 * kintone apps -> @f4ah6o/data-source -> source-neutral domain data.
 *
 * Each `KintoneSourceSpec` has no `joins`, so `composeData` still
 * namespaces its single source under its own id (e.g. every "users" row
 * comes back as `{ users: { user_id, name } }`, not flattened) - `getPath`
 * (from `@f4ah6o/data-view`) reads straight through that nesting instead
 * of requiring a `DataQuery.select` just to flatten one app's rows.
 */
export async function loadVisibilitySourceData(
  specs: VisibilitySourceSpecs,
  runtime: KintoneRuntime,
): Promise<VisibilitySourceData> {
  const [usersData, affiliationsData, businessRolesData, assignmentsData, policiesData] =
    await Promise.all([
      createKintoneSource(specs.users, runtime).load(),
      createKintoneSource(specs.affiliations, runtime).load(),
      createKintoneSource(specs.businessRoles, runtime).load(),
      createKintoneSource(specs.userAssignments, runtime).load(),
      createKintoneSource(specs.visibilityPolicies, runtime).load(),
    ]);

  return {
    users: usersData.rows.map((row) => ({
      id: String(getPath(row, "users.user_id")),
      name: String(getPath(row, "users.name")),
    })),
    affiliations: affiliationsData.rows.map((row) => {
      const affiliation: Affiliation = {
        id: String(getPath(row, "affiliations.affiliation_id")),
        name: String(getPath(row, "affiliations.name")),
      };
      const parentId = getPath(row, "affiliations.parent_id");
      return parentId ? { ...affiliation, parentId: String(parentId) } : affiliation;
    }),
    businessRoles: businessRolesData.rows.map((row) => ({
      id: String(getPath(row, "business_roles.role_id")),
      name: String(getPath(row, "business_roles.name")),
    })),
    assignments: assignmentsData.rows.map((row) => ({
      userId: String(getPath(row, "user_assignments.user_id")),
      affiliationId: String(getPath(row, "user_assignments.affiliation_id")),
      businessRoleId: String(getPath(row, "user_assignments.role_id")),
    })),
    policies: policiesData.rows.map((row) => ({
      affiliationId: String(getPath(row, "visibility_policies.affiliation_id")),
      businessRoleId: String(getPath(row, "visibility_policies.role_id")),
      resources: toResourceRefs(getPath(row, "visibility_policies.resources")),
    })),
  };
}

/**
 * `resources` arrives as a kintone SUBTABLE, already unwrapped by
 * `normalizeKintoneRecord()` into `{ id, source, resource, view }[]`. The
 * subtable row `id` is a kintone artifact, not part of `ResourceRef` -
 * dropping it here is the domain transform's job, not data-source's.
 *
 * Deduped up front, so a single policy's own subtable never carries a
 * literal duplicate resource into the domain model (a plausible fixture /
 * data-entry mistake); `toVisibilityMatrixRows` separately dedupes across
 * the multiple policies one matrix coordinate can aggregate.
 */
function toResourceRefs(value: unknown): ResourceRef[] {
  if (!Array.isArray(value)) return [];
  return dedupeResources(
    value.map((entry) => {
      const row = entry as Record<string, unknown>;
      const ref: ResourceRef = { source: String(row.source), resource: String(row.resource) };
      return row.view == null || row.view === "" ? ref : { ...ref, view: String(row.view) };
    }),
  );
}
