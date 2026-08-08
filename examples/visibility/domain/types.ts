/**
 * Source-neutral "所属 × 業務役割" visibility domain model.
 *
 * This is not an access log. It models who is assigned to which
 * (affiliation × business role) coordinate, and which resources that
 * coordinate is allowed to see. None of these types are kintone-specific;
 * `src/visibility/kintone.ts` is the only file that knows kintone exists.
 */

export interface User {
  readonly id: string;
  readonly name: string;
}

export interface Affiliation {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string;
}

export interface BusinessRole {
  readonly id: string;
  readonly name: string;
}

/** A user can hold more than one assignment (multiple affiliations/roles). */
export interface UserAssignment {
  readonly userId: string;
  readonly affiliationId: string;
  readonly businessRoleId: string;
}

/** `source` is a source-neutral tag; kintone is just one possible value. */
export interface ResourceRef {
  readonly source: string;
  readonly resource: string;
  readonly view?: string;
}

/** allow-only: a coordinate with no policy grants no access. */
export interface VisibilityPolicy {
  readonly affiliationId: string;
  readonly businessRoleId: string;
  readonly resources: readonly ResourceRef[];
}

/**
 * One row per (affiliationId × businessRoleId) coordinate - the shape
 * `data-view`'s `matrix()` is fed with. `users` is a display-only join of
 * `UserAssignment` against `User`, kept separate from the policy itself.
 */
export interface VisibilityMatrixRow {
  readonly affiliationId: string;
  readonly affiliationName: string;
  readonly businessRoleId: string;
  readonly businessRoleName: string;
  readonly resources: readonly ResourceRef[];
  readonly users: readonly User[];
}
