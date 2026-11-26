import schemaDocument from "../../../../docs/pedigree-json-schema.json";

/**
 * The field rules of docs/pedigree-json-schema.json, applied by walking its
 * `$defs`: `type`, `enum`, `required`, `minLength`, `minItems` and `minimum`,
 * through `properties`, `items` and `additionalProperties`. `pattern` and
 * `format` are documentation only, here and on the server. Rules between
 * fields (ids that exist, cycles, twins, `leftPartner`) are the importer's
 * own code. backend/api/serializers.py applies the same rules (its drift test
 * compares each field with this schema).
 */

export interface SchemaNode {
  $ref?: string;
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  enum?: string[];
  const?: string;
  required?: string[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  additionalProperties?: boolean | SchemaNode;
  minLength?: number;
  minItems?: number;
  minimum?: number;
}

const DEFS = (schemaDocument as unknown as { $defs: Record<string, SchemaNode> }).$defs;

export type DefName = "Pedigree" | "Individual" | "Partnership" | "TwinSet" | "Tag" | "Evaluation"
  | "SiblingOrderSettings" | "CanvasSettings" | "ClinicalDetails" | "ViewFilters";

export const schemaDef = (name: DefName): SchemaNode => DEFS[name]!;

function resolve(node: SchemaNode): SchemaNode {
  return node.$ref ? DEFS[node.$ref.replace("#/$defs/", "")]! : node;
}

type Obj = Record<string, unknown>;
export const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function hasType(v: unknown, node: SchemaNode): boolean {
  switch (node.type) {
    case "object": return isObject(v);
    case "array": return Array.isArray(v) && v.length >= (node.minItems ?? 0);
    case "string": return typeof v === "string" && v.length >= (node.minLength ?? 0);
    case "boolean": return typeof v === "boolean";
    case "number": return typeof v === "number" && Number.isFinite(v) && v >= (node.minimum ?? -Infinity);
    case "integer": return Number.isInteger(v) && (v as number) >= (node.minimum ?? -Infinity);
  }
  if (node.enum) return typeof v === "string" && node.enum.includes(v);
  if (node.const !== undefined) return v === node.const;
  return true;
}

/** What a value must be, for a message: "a boolean", `"male" | "female" | "unknown"`. */
function describe(node: SchemaNode): string {
  if (node.enum) return node.enum.map(s => `"${s}"`).join(" | ");
  switch (node.type) {
    case "object": return "an object";
    case "array": {
      const items = node.items && resolve(node.items);
      const of = items?.type === "string" ? " of strings" : items?.type === "object" ? " of objects" : "";
      return node.minItems ? `an array of at least ${node.minItems}${of ? of.slice(3) : " items"}` : `an array${of}`;
    }
    case "string": return node.minLength ? "a non-empty string" : "a string";
    case "number": case "integer":
      return `a${node.type === "integer" ? "n integer" : " number"}${node.minimum !== undefined ? ` of at least ${node.minimum}` : ""}`;
    case "boolean": return "a boolean";
  }
  return node.const !== undefined ? `"${node.const}"` : "valid";
}

export interface ShapeIssue {
  kind: "missing" | "wrong";
  /** Where, as the importer writes paths: `pedigree.individuals[2].sex`. */
  path: string;
  message: string;
}

const join = (base: string, key: string) => (base ? `${base}.${key}` : key);

/**
 * Every place `value` breaks the field rules of `$defs[def]`. Absent and
 * null optional fields are fine (the format treats null as absent). Nothing
 * is changed. `base` is the path of `value` in the document ("" for the
 * root), `name` what messages call it when `base` is empty.
 */
export function shapeIssues(value: unknown, def: DefName, base: string, name = base): ShapeIssue[] {
  const out: ShapeIssue[] = [];
  const walk = (v: unknown, node: SchemaNode, path: string, label: string, optional: boolean) => {
    node = resolve(node);
    if (!hasType(v, node)) {
      out.push({ kind: "wrong", path, message: `${label} must be ${describe(node)}${optional ? " when present" : ""}` });
      return;
    }
    if (Array.isArray(v) && node.items) {
      v.forEach((item, i) => walk(item, node.items!, `${path}[${i}]`, `${label}[${i}]`, false));
    }
    if (!isObject(v)) return;
    const props = node.properties ?? {};
    for (const [key, child] of Object.entries(props)) {
      const required = node.required?.includes(key) ?? false;
      const x = v[key];
      if (x === undefined) {
        if (required) out.push({ kind: "missing", path: join(path, key), message: `${label}.${key} is required` });
      } else if (x !== null || required) {
        walk(x, child, join(path, key), `${label}.${key}`, !required);
      }
    }
    if (isObject(node.additionalProperties)) {
      for (const [key, x] of Object.entries(v)) {
        if (!(key in props)) walk(x, node.additionalProperties, `${path}["${key}"]`, `${label}["${key}"]`, false);
      }
    }
  };
  walk(value, schemaDef(def), base, name || base, false);
  return out;
}

// ── Lenient reading of stored pedigrees ──────────────────────────────────────

/*
 * Pedigrees saved before #229 may hold a wrong type that the server's Django
 * REST Framework validation coerced and then stored as sent ("deceased":
 * "false", "sibOrder": "1", "name": 5). A pedigree opened by its link goes
 * through `repairShape`, which reads such values the way the server did
 * (DRF's BooleanField, FloatField and CharField rules), so "false" is false
 * in the editor and not a truthy string.
 */

const TRUE_WORDS = new Set(["t", "y", "yes", "true", "on", "1"]);
const FALSE_WORDS = new Set(["f", "n", "no", "false", "off", "0"]);
const NULL_WORDS = new Set(["", "null"]);
const DROP = Symbol("drop");

function coerce(v: unknown, node: SchemaNode): unknown {
  if (node.type === "boolean") {
    if (v === 1) return true;
    if (v === 0) return false;
    if (typeof v === "string") {
      const w = v.toLowerCase();
      if (TRUE_WORDS.has(w)) return true;
      if (FALSE_WORDS.has(w)) return false;
      if (NULL_WORDS.has(w)) return null;
    }
  } else if (node.type === "number" || node.type === "integer") {
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "boolean" ? Number(v) : NaN;
    if (hasType(n, node)) return n;
  } else if (node.type === "string") {
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return DROP;
}

/**
 * Repair `value` in place so it meets the field rules of `$defs[def]`: a
 * wrong type the server would have coerced becomes what the server read; a
 * bad optional field or list element is dropped. A required field that
 * cannot be read is left alone. Unknown fields are kept.
 */
export function repairShape(value: unknown, def: DefName): void {
  const fix = (v: unknown, node: SchemaNode): unknown => {
    node = resolve(node);
    if (!hasType(v, node)) {
      const c = coerce(v, node);
      return c === DROP || c === null || hasType(c, node) ? c : DROP;
    }
    if (Array.isArray(v) && node.items) {
      const kept = [];
      for (const item of v) {
        const r = fix(item, node.items);
        if (r !== DROP && r !== null) kept.push(r);
      }
      v.splice(0, v.length, ...kept);
    }
    if (isObject(v)) {
      const props = node.properties ?? {};
      for (const [key, child] of Object.entries(props)) {
        if (v[key] === undefined || v[key] === null) continue;
        const r = fix(v[key], child);
        if (r === DROP && node.required?.includes(key)) continue;
        if (r === DROP || r === null) delete v[key];
        else v[key] = r;
      }
      if (isObject(node.additionalProperties)) {
        for (const key of Object.keys(v)) {
          if (key in props) continue;
          const r = fix(v[key], node.additionalProperties);
          if (r === DROP || r === null) delete v[key];
          else v[key] = r;
        }
      }
    }
    return v;
  };
  fix(value, schemaDef(def));
}
