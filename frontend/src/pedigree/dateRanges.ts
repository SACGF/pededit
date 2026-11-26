/**
 * Partial dates ("2007", "2007-03", "2007-03-14"): reading them, the age
 * at death drawn under a symbol, and arithmetic for the editor warnings.
 * A partial date stands for every day it could
 * be, so each comparison asks what is certain: 2007 is not certainly before
 * 2007-03-14, and someone born in 1950 is 55 or 56 in 2006. A check flags
 * only what holds for every day the dates could be.
 */
const DAY = 86_400_000;

export interface PartialDate { y: number; m?: number; d?: number }

/** "2007", "2007-03" or "2007-03-14" (often only the year of death is known); anything else is undefined. */
export function parsePartialDate(text: string): PartialDate | undefined {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(text);
  if (!m) return undefined;
  const y = +m[1]!, mo = m[2] ? +m[2] : undefined, d = m[3] ? +m[3] : undefined;
  if (mo !== undefined && (mo < 1 || mo > 12)) return undefined;
  if (d !== undefined && (d < 1 || d > 31)) return undefined;
  return { y, ...(mo ? { m: mo } : {}), ...(d ? { d } : {}) };
}

/**
 * Age at death from two full dates: "72y", or "4 mo" under a year, "5 d"
 * under a month. Undefined when either date lacks a month or day (a year
 * alone leaves the age a year out) or death comes before birth.
 */
export function ageAtDeath(birth: PartialDate, death: PartialDate): string | undefined {
  if (birth.m === undefined || birth.d === undefined || death.m === undefined || death.d === undefined) return undefined;
  const before = death.m < birth.m || (death.m === birth.m && death.d < birth.d);
  const years = death.y - birth.y - (before ? 1 : 0);
  if (years >= 1) return `${years}y`;
  const months = (death.y - birth.y) * 12 + death.m - birth.m - (death.d < birth.d ? 1 : 0);
  if (months >= 1) return `${months} mo`;
  const days = Math.round((Date.UTC(death.y, death.m - 1, death.d) - Date.UTC(birth.y, birth.m - 1, birth.d)) / 86_400_000);
  return days >= 0 ? `${days} d` : undefined;
}

/** The first and last day a partial date could be, as days since 1970-01-01 (UTC). */
export function dayRange(d: PartialDate): [number, number] {
  const day = (y: number, m: number, dd: number) => Math.round(Date.UTC(y, m, dd) / DAY);
  if (d.m === undefined) return [day(d.y, 0, 1), day(d.y, 11, 31)];
  if (d.d === undefined) return [day(d.y, d.m - 1, 1), day(d.y, d.m, 0)];
  const one = day(d.y, d.m - 1, d.d);
  return [one, one];
}

/** Whether `a` is certainly before `b` (every day `a` could be is before every day `b` could be). */
export function certainlyBefore(a: PartialDate, b: PartialDate): boolean {
  return dayRange(a)[1] < dayRange(b)[0];
}

/** Whole years from day `from` to day `to` (both days since 1970-01-01), as an age is counted. */
function wholeYears(from: number, to: number): number {
  const a = new Date(from * DAY), b = new Date(to * DAY);
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) years--;
  return years;
}

/**
 * The least and greatest age in whole years someone born on `birth` could
 * be on `at`. Born 1950, at 2006: 55 to 56.
 */
export function ageRange(birth: PartialDate, at: PartialDate): { min: number; max: number } {
  const [bFirst, bLast] = dayRange(birth);
  const [aFirst, aLast] = dayRange(at);
  return { min: wholeYears(bLast, aFirst), max: wholeYears(bFirst, aLast) };
}

/** The least number of days between two partial dates, in either order (0 when they could be the same day). */
export function minDaysApart(a: PartialDate, b: PartialDate): number {
  const [aFirst, aLast] = dayRange(a);
  const [bFirst, bLast] = dayRange(b);
  return Math.max(0, bFirst - aLast, aFirst - bLast);
}

/** A date as a full partial date, for "today". */
export function partialDateOf(date: Date): PartialDate {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

/** The same date `years` later; 29 February becomes 28 February in a common year. */
export function addYears(d: PartialDate, years: number): PartialDate {
  if (d.m === 2 && d.d === 29) return { y: d.y + years, m: 2, d: 28 };
  return { ...d, y: d.y + years };
}
