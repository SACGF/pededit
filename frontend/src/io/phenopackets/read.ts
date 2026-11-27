/** Reading protobuf JSON leniently: either field name, and strings or numbers as text. */

export type Obj = Record<string, unknown>;

export const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * A field by its JSON name or its proto name: protobuf JSON readers accept
 * both (`individualId`, `individual_id`).
 */
export function field(o: Obj, camel: string): unknown {
  if (camel in o) return o[camel];
  return o[camel.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)];
}

export const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** A repeated field as a list of messages; anything else is empty. */
export const list = (o: Obj, camel: string): Obj[] => {
  const v = field(o, camel);
  return Array.isArray(v) ? v.filter(isObject) : [];
};
