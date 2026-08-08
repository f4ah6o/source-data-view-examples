import { matrix } from "@f4ah6o/data-view";
import type { MatrixViewModel } from "@f4ah6o/data-view";

import { coordinateKey, dedupeResources } from "./resolve.ts";
import type {
  Affiliation,
  BusinessRole,
  ResourceRef,
  User,
  UserAssignment,
  VisibilityMatrixRow,
  VisibilityPolicy,
} from "./types.ts";

export interface VisibilityMatrixCell {
  readonly affiliationName: string;
  readonly businessRoleName: string;
  readonly resources: readonly ResourceRef[];
  readonly users: readonly User[];
}

export type VisibilityMatrixViewModel = MatrixViewModel<string, string, VisibilityMatrixCell>;

interface ToVisibilityMatrixRowsInput {
  readonly policies: readonly VisibilityPolicy[];
  readonly assignments: readonly UserAssignment[];
  readonly users: readonly User[];
  readonly affiliations: readonly Affiliation[];
  readonly businessRoles: readonly BusinessRole[];
}

/**
 * Aggregates policies + assignments (+ their name/user lookups) down to
 * exactly one `VisibilityMatrixRow` per (affiliationId x businessRoleId)
 * coordinate. This is the "1 coordinate = 1 row" step `matrix()` itself
 * relies on upstream callers to do - it never aggregates on its own.
 */
export function toVisibilityMatrixRows(input: ToVisibilityMatrixRowsInput): VisibilityMatrixRow[] {
  const affiliationName = nameLookup(input.affiliations);
  const businessRoleName = nameLookup(input.businessRoles);
  const userById = new Map(input.users.map((user) => [user.id, user]));

  const coordinates = new Map<string, { affiliationId: string; businessRoleId: string }>();
  const resourcesByCoordinate = new Map<string, ResourceRef[]>();
  const userIdsByCoordinate = new Map<string, Set<string>>();

  const touch = (affiliationId: string, businessRoleId: string) => {
    const key = coordinateKey(affiliationId, businessRoleId);
    if (!coordinates.has(key)) coordinates.set(key, { affiliationId, businessRoleId });
    return key;
  };

  for (const policy of input.policies) {
    const key = touch(policy.affiliationId, policy.businessRoleId);
    const resources = resourcesByCoordinate.get(key) ?? [];
    resources.push(...policy.resources);
    resourcesByCoordinate.set(key, resources);
  }

  for (const assignment of input.assignments) {
    const key = touch(assignment.affiliationId, assignment.businessRoleId);
    const userIds = userIdsByCoordinate.get(key) ?? new Set<string>();
    userIds.add(assignment.userId);
    userIdsByCoordinate.set(key, userIds);
  }

  return [...coordinates.entries()].map(([key, coordinate]) => ({
    affiliationId: coordinate.affiliationId,
    affiliationName: affiliationName.get(coordinate.affiliationId) ?? coordinate.affiliationId,
    businessRoleId: coordinate.businessRoleId,
    businessRoleName: businessRoleName.get(coordinate.businessRoleId) ?? coordinate.businessRoleId,
    resources: dedupeResources(resourcesByCoordinate.get(key) ?? []),
    users: [...(userIdsByCoordinate.get(key) ?? [])]
      .map((userId) => userById.get(userId))
      .filter((user): user is User => user !== undefined),
  }));
}

function nameLookup(items: readonly { id: string; name: string }[]): Map<string, string> {
  return new Map(items.map((item) => [item.id, item.name]));
}

/**
 * Projects already-aggregated `VisibilityMatrixRow[]` onto `data-view`'s
 * `matrix()`, keyed by stable ids (not display names - names can collide
 * or be renamed without the underlying coordinate changing identity).
 */
export function toVisibilityMatrix(
  rows: readonly VisibilityMatrixRow[],
): VisibilityMatrixViewModel {
  return matrix(rows, {
    row: (item) => item.affiliationId,
    column: (item) => item.businessRoleId,
    value: (item) => ({
      affiliationName: item.affiliationName,
      businessRoleName: item.businessRoleName,
      resources: item.resources,
      users: item.users,
    }),
  });
}
