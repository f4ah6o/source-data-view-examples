import { diffDays } from "./dates.ts";
import type { EmployeeQualification, QualificationStatus } from "./types.ts";

export interface QualificationStatusOptions {
  /** Calendar date ("YYYY-MM-DD") to evaluate against - never read from `Date.now()`. */
  readonly asOf: string;
  readonly expiringWithinDays: number;
}

/**
 * Deterministic, pure status derivation. Never reads the current time -
 * `asOf` must be supplied explicitly, which is what makes this testable
 * (and lets a caller preview a future/past `asOf`).
 *
 * Rules (all boundaries inclusive as stated):
 *   - no credential                          -> "missing"
 *   - held, no `expiresAt`                   -> "no-expiry"
 *   - `expiresAt` < `asOf`                   -> "expired"
 *   - 0 <= (`expiresAt` - `asOf`) <= window   -> "expiring" (asOf === expiresAt included)
 *   - (`expiresAt` - `asOf`) > window         -> "valid"
 */
export function qualificationStatus(
  qualification: EmployeeQualification | undefined,
  options: QualificationStatusOptions,
): QualificationStatus {
  if (!Number.isInteger(options.expiringWithinDays) || options.expiringWithinDays < 0) {
    throw new Error("expiringWithinDays must be a non-negative integer");
  }
  if (!qualification) return "missing";
  if (qualification.expiresAt === undefined) return "no-expiry";

  const daysUntilExpiry = diffDays(qualification.expiresAt, options.asOf);
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= options.expiringWithinDays) return "expiring";
  return "valid";
}
