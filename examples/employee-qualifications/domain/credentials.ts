import { compareCalendarDates } from "./dates.ts";
import type { EmployeeQualification } from "./types.ts";

export interface SelectCurrentQualificationOptions {
  /** Calendar date ("YYYY-MM-DD") to evaluate against - never read from `Date.now()`. */
  readonly asOf: string;
}

/**
 * Resolves a same employeeId x qualificationId history down to the single
 * "current" record, so callers (the Matrix, the expiration Table) never
 * see duplicate coordinates.
 *
 * Rules, applied in order:
 *   1. records with `acquiredAt` after `asOf` are not yet in effect and
 *      are excluded from consideration entirely
 *   2. among the rest, prefer one that is valid as of `asOf` (no
 *      `expiresAt`, or `expiresAt >= asOf`) over one already expired
 *   3. break ties by the most recent `acquiredAt`
 *   4. then by the most recent `expiresAt` (no-expiry counts as "latest")
 *   5. then deterministically by `id` (the lexicographically greatest id)
 *   6. if nothing is valid as of `asOf`, fall back to the most recent
 *      (by the same 3-5 tie-break) record at/before `asOf`, so the caller
 *      can still classify it as `expired`
 *
 * Returns `undefined` only when every record's `acquiredAt` is after
 * `asOf` (i.e. as of `asOf`, nothing has been acquired yet).
 */
export function selectCurrentQualification(
  history: readonly EmployeeQualification[],
  options: SelectCurrentQualificationOptions,
): EmployeeQualification | undefined {
  const candidates = history.filter(
    (record) =>
      record.acquiredAt === undefined || compareCalendarDates(record.acquiredAt, options.asOf) <= 0,
  );
  if (candidates.length === 0) return undefined;

  const validAsOf = candidates.filter(
    (record) =>
      record.expiresAt === undefined || compareCalendarDates(record.expiresAt, options.asOf) >= 0,
  );
  const pool = validAsOf.length > 0 ? validAsOf : candidates;

  return pool.reduce((best, candidate) =>
    compareCandidates(candidate, best) > 0 ? candidate : best,
  );
}

/** Positive if `a` should be preferred over `b` as the "current" record. */
function compareCandidates(a: EmployeeQualification, b: EmployeeQualification): number {
  const byAcquired = compareOptionalDate(a.acquiredAt, b.acquiredAt, "earliest");
  if (byAcquired !== 0) return byAcquired;
  const byExpires = compareOptionalDate(a.expiresAt, b.expiresAt, "latest");
  if (byExpires !== 0) return byExpires;
  if (a.id === b.id) return 0;
  return a.id > b.id ? 1 : -1;
}

/**
 * `undefinedRank` decides how a missing date compares: an unknown
 * `acquiredAt` is treated as the earliest possible (it can't win a
 * "most recent" tie-break on unproven grounds); a missing `expiresAt`
 * (no-expiry) is treated as the latest possible, matching its domain
 * meaning of "never expires".
 */
function compareOptionalDate(
  a: string | undefined,
  b: string | undefined,
  undefinedRank: "earliest" | "latest",
): number {
  if (a === b) return 0;
  if (a === undefined) return undefinedRank === "latest" ? 1 : -1;
  if (b === undefined) return undefinedRank === "latest" ? -1 : 1;
  return compareCalendarDates(a, b);
}

export function qualificationCoordinateKey(employeeId: string, qualificationId: string): string {
  return `${employeeId} ${qualificationId}`;
}

/**
 * Batch form of `selectCurrentQualification()`: groups mixed
 * employee/qualification history by coordinate and resolves each group
 * independently. The result has at most one record per
 * (employeeId x qualificationId) coordinate.
 */
export function selectCurrentQualifications(
  history: readonly EmployeeQualification[],
  options: SelectCurrentQualificationOptions,
): EmployeeQualification[] {
  const byCoordinate = new Map<string, EmployeeQualification[]>();
  for (const record of history) {
    const key = qualificationCoordinateKey(record.employeeId, record.qualificationId);
    const bucket = byCoordinate.get(key) ?? [];
    bucket.push(record);
    byCoordinate.set(key, bucket);
  }

  const current: EmployeeQualification[] = [];
  for (const bucket of byCoordinate.values()) {
    const selected = selectCurrentQualification(bucket, options);
    if (selected) current.push(selected);
  }
  return current;
}
