import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import ts from "typescript";

/*
 * docs/pedigree-json-schema.json is hand-written. This test keeps it in step
 * with the canonical interfaces in layout-engine/src/types.ts: every interface
 * property must appear in the schema with the same required/optional status,
 * and string-literal unions must match the schema enums. The backend
 * serializer is checked against the same schema in backend/api/tests.py.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../../../..");
const schema = JSON.parse(readFileSync(join(ROOT, "docs/pedigree-json-schema.json"), "utf8"));
const source = ts.createSourceFile(
  "types.ts",
  readFileSync(join(ROOT, "layout-engine/src/types.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);

interface Prop { name: string; optional: boolean; type: ts.TypeNode | undefined }

const interfaces = new Map<string, Prop[]>();
const aliases = new Map<string, ts.TypeNode>();
source.forEachChild(node => {
  if (ts.isInterfaceDeclaration(node)) {
    interfaces.set(node.name.text, node.members.filter(ts.isPropertySignature).map(m => ({
      name: (m.name as ts.Identifier).text,
      optional: !!m.questionToken,
      type: m.type,
    })));
  } else if (ts.isTypeAliasDeclaration(node)) {
    aliases.set(node.name.text, node.type);
  }
});

/** String literal members of a union type, following one level of alias. */
function literalUnion(type: ts.TypeNode | undefined): string[] | null {
  if (!type) return null;
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    return literalUnion(aliases.get(type.typeName.text));
  }
  if (!ts.isUnionTypeNode(type)) return null;
  const values = type.types.map(t =>
    ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal) ? t.literal.text : null);
  return values.every(v => v !== null) ? (values as string[]) : null;
}

/** Fields the TS type requires but the format lets a file omit (the importer defaults them). */
const DEFAULTED = new Set(["Pedigree.siblingOrder"]);

const DEFS = ["Pedigree", "Individual", "Partnership", "Tag", "SiblingOrderSettings", "CanvasSettings", "ClinicalDetails"];

describe("pedigree-json-schema.json matches types.ts", () => {
  for (const name of DEFS) {
    it(name, () => {
      const props = interfaces.get(name);
      expect(props, `interface ${name} in types.ts`).toBeDefined();
      const def = schema.$defs[name];
      expect(def, `$defs.${name} in the schema`).toBeDefined();

      expect(Object.keys(def.properties).sort()).toEqual(props!.map(p => p.name).sort());

      const required = props!
        .filter(p => !p.optional && !DEFAULTED.has(`${name}.${p.name}`))
        .map(p => p.name).sort();
      expect([...(def.required ?? [])].sort()).toEqual(required);

      for (const p of props!) {
        const literals = literalUnion(p.type);
        if (literals) expect(def.properties[p.name].enum, `${name}.${p.name} enum`).toEqual(literals);
      }
    });
  }
});
