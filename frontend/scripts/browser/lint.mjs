#!/usr/bin/env node
// Render lint: check what the canvas draws for a pedigree (layoutToFlow's
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

const HELP = `usage: node frontend/scripts/browser/lint.mjs [--all-examples] [--fixture SPEC ...] [URL] [options]

  --all-examples      Lint every example in src/data/examples.ts.
  --fixture SPEC      Lint a fixture (repeatable; same SPECs as the other tools).
  URL                 Lint the pedigree loaded in an editor page (/p/<id>),
                      after any steps, as __pededit.check() sees it.
  --compact           Lint the compact layout instead of the normal one
                      (for a URL, the canvas's own setting is used).
  --no-export         Skip the SVG export lint (on by default; it also
                      covers PNG and PDF, which are made from the SVG).
  --deidentify        Lint the de-identified export instead of the plain one.

Prints one line per pedigree, then one line per finding. Exits 0 when every
pedigree draws cleanly, 1 when any has findings.
The same checks run in vitest (src/pedigree/__tests__/renderLint.test.ts,
src/io/svg/__tests__/exportLint.test.ts).
${COMMON_HELP}`;

const isBad = r => r.findings.length + r.exportFindings.length > 0;

await main(async () => {
  const { positional, flags, steps } = parseArgs(process.argv.slice(2), { "all-examples": "bool", compact: "bool", "no-export": "bool", deidentify: "bool" });
  const exportOpts = flags["no-export"] ? null : { compact: !!flags.compact, deidentify: !!flags.deidentify };
  if (flags.help) { console.log(HELP); return 0; }
  const specs = [...(flags["all-examples"] ? ["__all__"] : []), ...(flags.fixture ?? [])];
  if (!specs.length && !positional.length) throw new UsageError("usage: give --all-examples, --fixture SPEC or a URL");
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
      if (spec === "__all__") {
        items = await inApp(context, base, async ({ compact, exportOpts }) => {
          const { EXAMPLES } = await import("/src/data/examples.ts");
          const { layoutToFlow } = await import("/src/pedigree/layoutToFlow.ts");
          const { lintFlow } = await import("/src/pedigree/renderLint.ts");
          const { lintExport } = await import("/src/io/svg/exportLint.ts");
          return EXAMPLES.map((e, i) => ({
            name: `example:${i} ${e.label}`,
            findings: lintFlow(e.data, layoutToFlow(e.data, { compact })),
            exportFindings: exportOpts ? lintExport(e.data, exportOpts) : [],
          }));
        }, { compact: !!flags.compact, exportOpts });
      } else {
        const fixture = await loadFixture(spec, context, base);
        const [one] = await inApp(context, base, async ({ pedigree, compact, exportOpts }) => {
          const { layoutToFlow } = await import("/src/pedigree/layoutToFlow.ts");
          const { lintFlow } = await import("/src/pedigree/renderLint.ts");
          const { lintExport } = await import("/src/io/svg/exportLint.ts");
          return [{
            findings: lintFlow(pedigree, layoutToFlow(pedigree, { compact })),
            exportFindings: exportOpts ? lintExport(pedigree, exportOpts) : [],
          }];
        }, { pedigree: fixture.pedigree, compact: !!flags.compact, exportOpts });
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
