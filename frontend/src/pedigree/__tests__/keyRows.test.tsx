import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FEATURE_FIXTURES } from "../../fixtures/features";
import { EXAMPLES } from "../../data/examples";
import { drawnPedigree } from "../collapse";
import { keyRows, KEY_DIFFERENCES, type KeyRow } from "../keyRows";
import { renderExportKeySvg } from "../exportKey";
import { Legend } from "../../components/Legend";

/*
 * #148: the legend on the Pedigree tab and the key of the exports draw from
 * one list of rows, `keyRows`. They are allowed to differ only in the ways
 * `KEY_DIFFERENCES` writes down.
 */

const CASES = [
  ...FEATURE_FIXTURES.map(f => ({ name: `fixture ${f.slug}`, data: f.data })),
  ...EXAMPLES.map(e => ({ name: `example ${e.label}`, data: e.data })),
];

/** What a row explains, without its label or place: enough to tell two rows are the same row. */
function what(row: KeyRow): string {
  const { label: _label, ...rest } = row as KeyRow & { label: string };
  if (row.kind === "tag") return `tag ${row.tag.id}${row.carrier ? " carrier" : ""}`;
  return JSON.stringify(rest);
}
const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

describe("legend and export key: one list of rows (#148)", () => {
  for (const c of CASES) {
    it(`${c.name}: the same rows, apart from the listed differences`, () => {
      const legend = keyRows(c.data, "legend");
      // The exporters hand the key the pedigree they draw.
      const exported = keyRows(drawnPedigree(c.data), "export", { duplicates: legend.relationships.some(r => r.kind === "duplicate") });
      const shared = (rows: KeyRow[]) => rows.filter(r => !KEY_DIFFERENCES.legendOnly.includes(r.kind));

      // Symbols: the same rows in the same order (#173).
      expect(KEY_DIFFERENCES.symbolOrderDiffers).toBe(false);
      expect(shared(legend.symbols).map(what)).toEqual(exported.symbols.map(what));
      // Relationships: the same rows in the same order.
      expect(shared(legend.relationships).map(what)).toEqual(exported.relationships.map(what));
      // Labels agree, but for the life statuses the export names by their caption.
      const exportLabel = new Map([...exported.symbols, ...exported.relationships].map(r => [what(r), r.label]));
      for (const row of shared([...legend.symbols, ...legend.relationships])) {
        const want = row.kind === "lifeStatus" ? KEY_DIFFERENCES.exportLabels[row.status] ?? row.label : row.label;
        expect(exportLabel.get(what(row)), what(row)).toBe(want);
      }
      // Tags: the export lists the legend's rows that are in use, in its order.
      const tag = (r: KeyRow) => (r.kind === "tag" ? `${what(r)}: ${r.label}` : "");
      expect(legend.tags.filter(r => r.kind === "tag" && r.inUse).map(tag)).toEqual(exported.tags.map(tag));
      // Clinical details: the same.
      expect(legend.details).toEqual(exported.details);
      // Nothing the export shows is missing from the legend.
      expect(exported.symbols.filter(r => KEY_DIFFERENCES.legendOnly.includes(r.kind))).toEqual([]);
    });
  }

  it("the legend only adds the plain shapes and the plain couple line", () => {
    const kinds = new Set<string>();
    for (const c of CASES) {
      const legend = keyRows(c.data, "legend"), exported = keyRows(drawnPedigree(c.data), "export");
      const inExport = new Set([...exported.symbols, ...exported.relationships].map(r => r.kind));
      for (const r of [...legend.symbols, ...legend.relationships]) if (!inExport.has(r.kind) && r.kind !== "duplicate") kinds.add(r.kind);
    }
    expect([...kinds].sort()).toEqual([...KEY_DIFFERENCES.legendOnly].sort());
  });

  it("between them the fixtures show every kind of row", () => {
    const seen = new Set<string>();
    for (const c of CASES) {
      const k = keyRows(c.data, "legend");
      for (const r of [...k.tags, ...k.symbols, ...k.relationships, ...k.details]) seen.add(r.kind);
    }
    expect([...seen].sort()).toEqual([
      "adopted", "affected", "affectedCore", "assignedAtBirth", "assistedLine", "carrier", "childless", "clinicalDetail", "collapsedBranch",
      "consanguineous", "consultand", "couple", "deceased", "documented", "duplicate", "ended", "evaluation", "familyHistoryUnknown",
      "inbreeding", "kinship", "lifeStatus", "presymptomatic", "proband", "role", "sex", "tag", "twins",
    ]);
  });
});

describe("both draw every row of their list", () => {
  for (const fx of FEATURE_FIXTURES) {
    it(`${fx.slug}: every label is in the legend and in the export key`, () => {
      const legend = keyRows(fx.data, "legend");
      const html = renderToStaticMarkup(<Legend pedigree={fx.data} />);
      for (const r of [...legend.tags, ...legend.symbols, ...legend.relationships]) expect(html, r.label).toContain(escapeXml(r.label).replace(/&apos;/g, "&#x27;"));
      expect((html.match(/data-legend-carrier-row/g) ?? []).length).toBe(legend.tags.filter(r => r.kind === "tag" && r.carrier).length);

      const drawn = drawnPedigree(fx.data);
      const exported = keyRows(drawn, "export");
      const svg = renderExportKeySvg(drawn, 0, 0).markup.join("");
      for (const r of [...exported.tags, ...exported.symbols, ...exported.relationships]) expect(svg, r.label).toContain(`>${escapeXml(r.label)}</text>`);
      const rows = exported.tags.length + exported.symbols.length + exported.relationships.length;
      // One label for each row, and no row drawn that the list does not have.
      const labels = [...exported.tags, ...exported.symbols, ...exported.relationships].map(r => `>${escapeXml(r.label)}</text>`);
      expect(labels.filter(l => svg.includes(l)).length).toBe(rows);
      expect(renderExportKeySvg(drawn, 0, 0).height).toBeGreaterThanOrEqual(rows * 20);
    });
  }
});
