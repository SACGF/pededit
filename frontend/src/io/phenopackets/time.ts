/**
 * PedEdit's free-text ages and dates as Phenopackets v2 `TimeElement`s and
 * `Timestamp`s, both ways. An age is written only when reading it back gives
 * the same text, so what does not come back is named in the export warning
 * (`losses.ts`) rather than changed quietly:
 *
 * - "45y", "6mo", "3 wk", "10d": `age.iso8601duration` (P45Y, P6M, P3W, P10D);
 *   "3 wk" of a pregnancy or loss is a `gestationalAge`;
 * - "40s": an `ageRange` from P40Y to P49Y;
 * - onset words ("childhood", "adult", ...): the HPO onset term (`ONSET_TERMS`);
 * - a date of death "2007" or "2007-03": an `interval` over that year or month.
 *
 * Read from other tools, any duration, age range, gestational age, timestamp,
 * interval or ontology term becomes text, even when it is not one of these
 * forms ("P3Y6M" is "3y 6mo").
 */
import { field, isObject, text, type Obj } from "./read.js";

export type TimeElement = Obj;

/** HPO onset terms (HP:0003674 "Onset" and below), by the word written in PedEdit. */
const ONSET_TERMS: Record<string, { id: string; label: string }> = {
  antenatal:     { id: "HP:0030674", label: "Antenatal onset" },
  congenital:    { id: "HP:0003577", label: "Congenital onset" },
  neonatal:      { id: "HP:0003623", label: "Neonatal onset" },
  infantile:     { id: "HP:0003593", label: "Infantile onset" },
  childhood:     { id: "HP:0011463", label: "Childhood onset" },
  juvenile:      { id: "HP:0003621", label: "Juvenile onset" },
  adult:         { id: "HP:0003581", label: "Adult onset" },
  "young adult": { id: "HP:0011462", label: "Young adult onset" },
  "middle age":  { id: "HP:0003596", label: "Middle age onset" },
  "late onset":  { id: "HP:0003584", label: "Late onset" },
};

const UNIT_TEXT: Record<string, (n: string) => string> = { Y: n => `${n}y`, M: n => `${n}mo`, W: n => `${n} wk`, D: n => `${n}d` };

const duration = (iso: string): TimeElement => ({ age: { iso8601duration: iso } });

/**
 * The TimeElement for an age written in PedEdit, or undefined when it has no
 * form that reads back as the same text. `gestational` is for a pregnancy or
 * loss, whose weeks are a gestational age.
 */
export function ageElement(value: string, gestational = false): TimeElement | undefined {
  const te = toElement(value, gestational);
  return te && elementText(te) === value ? te : undefined;
}

function toElement(value: string, gestational: boolean): TimeElement | undefined {
  let m: RegExpMatchArray | null;
  if ((m = value.match(/^(\d+)y$/))) return duration(`P${m[1]}Y`);
  if ((m = value.match(/^(\d+)mo$/))) return duration(`P${m[1]}M`);
  if ((m = value.match(/^(\d+) wk$/))) return gestational ? { gestationalAge: { weeks: Number(m[1]) } } : duration(`P${m[1]}W`);
  if ((m = value.match(/^(\d+)d$/))) return duration(`P${m[1]}D`);
  if ((m = value.match(/^(\d*)0s$/))) {
    const start = Number(`${m[1]}0`);
    return { ageRange: { start: { iso8601duration: `P${start}Y` }, end: { iso8601duration: `P${start + 9}Y` } } };
  }
  const term = ONSET_TERMS[value];
  return term ? { ontologyClass: { ...term } } : undefined;
}

/** "P45Y" as "45y", "P3Y6M" as "3y 6mo"; undefined for anything else. */
function durationText(iso: unknown): string | undefined {
  const m = typeof iso === "string" ? iso.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/) : null;
  if (!m || m.slice(1).every(x => x === undefined)) return undefined;
  return (["Y", "M", "W", "D"] as const).flatMap((u, i) => (m[i + 1] !== undefined ? [UNIT_TEXT[u]!(m[i + 1]!)] : [])).join(" ");
}

/** A TimeElement as the text PedEdit shows, or undefined when it holds nothing readable. */
export function elementText(te: unknown): string | undefined {
  if (!isObject(te)) return undefined;
  const age = field(te, "age");
  if (isObject(age)) return durationText(field(age, "iso8601duration"));
  const range = field(te, "ageRange");
  if (isObject(range)) {
    const start = isObject(field(range, "start")) ? field(field(range, "start") as Obj, "iso8601duration") : undefined;
    const end = isObject(field(range, "end")) ? field(field(range, "end") as Obj, "iso8601duration") : undefined;
    const s = typeof start === "string" ? start.match(/^P(\d+)Y$/) : null;
    const e = typeof end === "string" ? end.match(/^P(\d+)Y$/) : null;
    if (s && e && Number(s[1]) % 10 === 0 && Number(e[1]) === Number(s[1]) + 9) return `${s[1]}s`;
    const a = durationText(start), b = durationText(end);
    return a && b ? `${a} to ${b}` : a ?? b;
  }
  const gestational = field(te, "gestationalAge");
  if (isObject(gestational)) {
    const weeks = text(field(gestational, "weeks"));
    const days = text(field(gestational, "days"));
    if (!weeks) return undefined;
    return days && days !== "0" ? `${weeks} wk ${days}d` : `${weeks} wk`;
  }
  const term = field(te, "ontologyClass");
  if (isObject(term)) {
    const id = text(field(term, "id"));
    const word = Object.keys(ONSET_TERMS).find(k => ONSET_TERMS[k]!.id === id);
    return word ?? (text(field(term, "label")) || id || undefined);
  }
  const stamp = field(te, "timestamp");
  if (stamp !== undefined) return dateOf(stamp);
  const interval = field(te, "interval");
  if (isObject(interval)) return intervalText(interval, false);
  return undefined;
}

/** "1950-01-02" as a protobuf JSON Timestamp, or undefined for anything that is not a whole date. */
export function timestamp(date: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(date) ? `${date}T00:00:00Z` : undefined;
}

/** The date of a Timestamp, "1950-01-02"; undefined when it is not one. */
export function dateOf(stamp: unknown): string | undefined {
  if (typeof stamp !== "string") return undefined;
  const m = stamp.match(/^(\d{4}-\d{2}-\d{2})T/);
  return m && !Number.isNaN(Date.parse(stamp)) ? m[1] : undefined;
}

/** A date of death, whole or a year or month only, as a TimeElement; undefined when it is none of those. */
export function deathElement(dod: string): TimeElement | undefined {
  const whole = timestamp(dod);
  if (whole) return { timestamp: whole };
  let m: RegExpMatchArray | null;
  if ((m = dod.match(/^(\d{4})$/))) return { interval: { start: `${m[1]}-01-01T00:00:00Z`, end: `${Number(m[1]) + 1}-01-01T00:00:00Z` } };
  if ((m = dod.match(/^(\d{4})-(0[1-9]|1[0-2])$/))) {
    const year = Number(m[1]), month = Number(m[2]);
    const next = month === 12 ? `${year + 1}-01` : `${m[1]}-${String(month + 1).padStart(2, "0")}`;
    return { interval: { start: `${m[1]}-${m[2]}-01T00:00:00Z`, end: `${next}-01T00:00:00Z` } };
  }
  return undefined;
}

/** A date of death read back: a timestamp or a whole year or month, else undefined. */
export function deathDate(te: unknown): string | undefined {
  if (!isObject(te)) return undefined;
  const stamp = field(te, "timestamp");
  if (stamp !== undefined) return dateOf(stamp);
  const interval = field(te, "interval");
  return isObject(interval) ? intervalText(interval, true) : undefined;
}

/**
 * "2007" for an interval over 2007, "2007-03" for one over March 2007; any
 * other is "start to end", or with `strict` (a date of death, which must be a
 * date) undefined.
 */
function intervalText(interval: Obj, strict: boolean): string | undefined {
  const start = dateOf(field(interval, "start"));
  const end = dateOf(field(interval, "end"));
  if (!start) return undefined;
  for (const candidate of [start.slice(0, 4), start.slice(0, 7)]) {
    const te = deathElement(candidate);
    const i = te && (te.interval as Obj);
    if (i && dateOf(i.start) === start && dateOf(i.end) === end) return candidate;
  }
  if (strict) return undefined;
  return end ? `${start} to ${end}` : start;
}
