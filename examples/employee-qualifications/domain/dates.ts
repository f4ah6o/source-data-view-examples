/**
 * Calendar-date ("YYYY-MM-DD") arithmetic with no dependency on `Date`,
 * `Date.now()`, or any implicit "current time" - and therefore no
 * timezone sensitivity. `acquiredAt` / `expiresAt` / `asOf` are calendar
 * dates, not instants; comparing them as JS `Date` objects would risk a
 * date parsed as UTC midnight landing on the previous day in a
 * negative-UTC-offset timezone. Everything here is pure integer math.
 */

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function parseCalendarDate(value: string): CalendarDate {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) throw new Error(`invalid calendar date (expected YYYY-MM-DD): ${value}`);
  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

/**
 * Proleptic Gregorian day number (Fliegel & Van Flandern). An arbitrary
 * but consistent integer axis for diffing two dates - never touches a
 * `Date` object, so it can't be timezone-dependent.
 */
function toDayNumber({ year, month, day }: CalendarDate): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/** `left` - `right`, in whole days. Positive means `left` is later. */
export function diffDays(left: string, right: string): number {
  return toDayNumber(parseCalendarDate(left)) - toDayNumber(parseCalendarDate(right));
}

/** Positive if `left` is the later date, negative if earlier, 0 if equal. */
export function compareCalendarDates(left: string, right: string): number {
  return diffDays(left, right);
}
