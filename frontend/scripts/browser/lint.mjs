#!/usr/bin/env node
// Render lint: check what the canvas draws for a pedigree (buildScene's
// output) for lines through symbols, lines to missing nodes, children with no
// line from their parents, couple lines between non-partners and overlapping
// symbols, then the same for the SVG export (which PNG and PDF are made from).
// The checks live in frontend/src/pedigree/renderLint.ts and
// frontend/src/io/svg/exportLint.ts and run in the browser through Vite, so
// this is the app's own code.
import {
  COMMON_HELP, closeBrowser, main, parseArgs, launchBrowser, newContext, contextOptions,
  resolveTarget, assertServerUp, loadFixture, inApp, openPage, servedInfo, servedLines, DEFAULT_BASE, UsageError,
} from "./harness.mjs";

const HELP = `usage: node frontend/scripts/browser/lint.mjs [--all-examples] [--all-fixtures] [--fixture SPEC ...] [URL] [options]

  --all-examples      Lint every example in src/data/examples.ts.
  --all-fixtures      Lint every feature fixture in src/fixtures/features.ts (#140).
  --fixture SPEC      Lint a fixture (repeatable; same SPECs as the other tools).
  URL                 Lint the pedigree loaded in an editor page (/p/<id>),
                      after any steps, as __pededit.check() sees it.
  --compact           Lint the compact layout instead of the normal one
                      (for a URL, the canvas's own setting is used).
  --no-export         Skip the SVG export lint (on by default; it also
                      covers PNG and PDF, which are made from the SVG).
  --deidentify        Lint the de-identified export instead of the plain one.
  --u-shape           Lint the U-shape export instead of the standard one:
                      its consanguinity labels against every line, symbol
                      and text (src/io/svg/uShapeLint.ts). Examples and
                      fixtures only.
  --relationship-labels
                      Turn on "Name consanguineous relationships" first, so
                      every double line the pedigree can name has text above
                      it (#97, #109). Examples and fixtures only.
  --monochrome        Set "Conditions and tags drawn in: black and white patterns" first
                      (#67), so every quadrant tag is drawn as a pattern.
                      Examples and fixtures only.

Prints one line per pedigree, then one line per finding. Exits 0 when every
pedigree draws cleanly, 1 when any has findings.
The same checks run in vitest (src/pedigree/__tests__/renderLint.test.ts,
src/io/svg/__tests__/exportLint.test.ts).
${COMMON_HELP}`;

const isBad = r => r.findings.length + r.exportFindings.length > 0;

await main(async () => {
  const { positional, flags, steps } = parseArgs(process.argv.slice(2), { "all-examples": "bool", "all-fixtures": "bool", compact: "bool", "no-export": "bool", deidentify: "bool", "relationship-labels": "bool", "u-shape": "bool", monochrome: "bool" });
  // Settings forced on before linting: names above double lines, monochrome tag fills.
  const named = {
    ...(flags["relationship-labels"] ? { relationshipLabels: true } : {}),
    ...(flags.monochrome ? { tagFills: "monochrome" } : {}),
  };
  const exportOpts = flags["no-export"] ? null : { compact: !!flags.compact, deidentify: !!flags.deidentify, uShape: !!flags["u-shape"] };
  if (flags.help) { console.log(HELP); return 0; }
  const specs = [...(flags["all-examples"] ? ["__examples__"] : []), ...(flags["all-fixtures"] ? ["__fixtures__"] : []), ...(flags.fixture ?? [])];
  if (!specs.length && !positional.length) throw new UsageError("usage: give --all-examples, --all-fixtures, --fixture SPEC or a URL");
  if (positional.length > 1) throw new UsageError("usage: one URL at most");
  const base = positional[0] ? resolveTarget(positional[0], { allowRemote: flags["allow-remote"] }) : DEFAULT_BASE;
  await assertServerUp(base);
  const served = await servedInfo(base);

  const browser = await launchBrowser();
  const results = [];
  try {
    const context = await newContext(browser, contextOptions(flags));
    for (const spec of specs) {
      let items;
      if (spec === "__examples__" || spec === "__fixtures__") {
        items = await inApp(context, base, async ({ compact, exportOpts, named, fixtures }) => {
          const set = fixtures
            ? (await import("/src/fixtures/features.ts")).FEATURE_FIXTURES.map(f => ({ name: `fixture:${f.slug} ${f.label}`, data: f.data, title: f.label }))
            : (await import("/src/data/examples.ts")).EXAMPLES.map((e, i) => ({ name: `example:${i} ${e.label}`, data: e.data, title: e.label }));
          const { buildScene } = await import("/src/pedigree/scene.ts");
          const { lintScene } = await import("/src/pedigree/renderLint.ts");
          const { lintExport: lintStandard } = await import("/src/io/svg/exportLint.ts");
          const { lintUShape } = await import("/src/io/svg/uShapeLint.ts");
          const lintExport = (p, o) => (o.uShape ? lintUShape(p, o) : lintStandard(p, o));
          const withNames = p => (Object.keys(named).length ? { ...p, canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, ...p.canvasSettings, ...named } } : p);
          // The chart title the editor would draw (#20, #188), named after the pedigree; none when de-identified.
          const { chartTitle } = await import("/src/pedigree/labels.ts");
          return set.map(e => {
            const title = chartTitle(e.data, e.title) || undefined;
            return {
              name: e.name,
              findings: lintScene(withNames(e.data), buildScene(withNames(e.data), { compact }), { title }),
              exportFindings: exportOpts ? lintExport(withNames(e.data), { ...exportOpts, title: exportOpts.deidentify ? undefined : title }) : [],
            };
          });
        }, { compact: !!flags.compact, exportOpts, named, fixtures: spec === "__fixtures__" });
      } else {
        const fixture = await loadFixture(spec, context, base);
        const [one] = await inApp(context, base, async ({ pedigree: raw, compact, exportOpts, named, name }) => {
          const pedigree = Object.keys(named).length ? { ...raw, canvasSettings: { nodesMoveable: false, snapToGrid: false, snapGridSize: 20, ...raw.canvasSettings, ...named } } : raw;
          const { buildScene } = await import("/src/pedigree/scene.ts");
          const { lintScene } = await import("/src/pedigree/renderLint.ts");
          const { lintExport: lintStandard } = await import("/src/io/svg/exportLint.ts");
          const { lintUShape } = await import("/src/io/svg/uShapeLint.ts");
          const lintExport = (p, o) => (o.uShape ? lintUShape(p, o) : lintStandard(p, o));
          const { chartTitle } = await import("/src/pedigree/labels.ts");
          const title = chartTitle(pedigree, name) || undefined;
          return [{
            findings: lintScene(pedigree, buildScene(pedigree, { compact }), { title }),
            exportFindings: exportOpts ? lintExport(pedigree, { ...exportOpts, title: exportOpts.deidentify ? undefined : title }) : [],
          }];
        }, { pedigree: fixture.pedigree, compact: !!flags.compact, exportOpts, named, name: fixture.title });
        items = [{ name: spec, findings: one.findings, exportFindings: one.exportFindings, warnings: fixture.warnings }];
      }
      results.push(...items);
    }
    if (positional[0]) {
      const run = await openPage(context, { url: base, steps, flags });
      const found = await run.page.evaluate(exportOpts => window.__pededit ? {
        findings: window.__pededit.check(),
        exportFindings: exportOpts ? window.__pededit.checkExport(undefined, { deidentify: exportOpts.deidentify }) : [],
      } : null, exportOpts);
      if (found === null) throw new UsageError(`${base} is not an editor page (no window.__pededit)`);
      results.push({ name: base, ...found });
    }
  } finally {
    await closeBrowser(browser);
  }

  if (flags.json) {
    console.log(JSON.stringify({ served, results }, null, 2));
  } else {
    for (const line of servedLines(served)) console.log(line);
    for (const r of results) {
      const n = r.findings.length + r.exportFindings.length;
      console.log(`${n ? "FAIL" : "ok  "}  ${r.name}${n ? `  (${n})` : ""}`);
      for (const f of r.findings) console.log(`        ${f.code}  ${f.message}`);
      for (const f of r.exportFindings) console.log(`        export ${f.code}  ${f.message}`);
      for (const w of r.warnings ?? []) console.log(`        import warning  ${w}`);
    }
    const bad = results.filter(isBad).length;
    console.log(`lint: ${bad} of ${results.length} pedigree(s) with findings${exportOpts ? " (canvas and SVG export)" : " (canvas only)"}`);
  }
  return results.some(isBad) ? 1 : 0;
}, HELP);
