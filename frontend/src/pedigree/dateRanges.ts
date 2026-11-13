/**
 * Arithmetic on partial dates ("2007", "2007-03", "2007-03-14", #103) for
 * the editor warnings (#116). A partial date stands for every day it could
 * be, so each comparison asks what is certain: 2007 is not certainly before
 * 2007-03-14, and someone born in 1950 is 55 or 56 in 2006. A check flags
 * only what holds for every day the dates could be.
 */
import type { PartialDate } from "./labels";

const DAY = 86_400_000;

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
