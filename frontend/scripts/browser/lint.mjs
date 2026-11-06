#!/usr/bin/env node
// Render lint: check what the canvas draws for a pedigree (layoutToFlow's
// output) for lines through symbols, lines to missing nodes, children with no
// line from their parents, couple lines between non-partners and overlapping
// symbols. The checks live in frontend/src/pedigree/renderLint.ts and run in
// the browser through Vite, so this is the app's own code.
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

Prints one line per pedigree, then one line per finding. Exits 0 when every
pedigree draws cleanly, 1 when any has findings.
The same checks run in vitest (src/pedigree/__tests__/renderLint.test.ts)
with a list of the examples known to be broken.
${COMMON_HELP}`;

await main(async () => {
  const { positional, flags, steps } = parseArgs(process.argv.slice(2), { "all-examples": "bool", compact: "bool" });
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
        items = await inApp(context, base, async ({ compact }) => {
          const { EXAMPLES } = await import("/src/data/examples.ts");
          const { layoutToFlow } = await import("/src/pedigree/layoutToFlow.ts");
          const { lintFlow } = await import("/src/pedigree/renderLint.ts");
          return EXAMPLES.map((e, i) => ({ name: `example:${i} ${e.label}`, findings: lintFlow(e.data, layoutToFlow(e.data, { compact })) }));
        }, { compact: !!flags.compact });
      } else {
        const fixture = await loadFixture(spec, context, base);
        const [one] = await inApp(context, base, async ({ pedigree, compact }) => {
          const { layoutToFlow } = await import("/src/pedigree/layoutToFlow.ts");
          const { lintFlow } = await import("/src/pedigree/renderLint.ts");
          return [{ findings: lintFlow(pedigree, layoutToFlow(pedigree, { compact })) }];
        }, { pedigree: fixture.pedigree, compact: !!flags.compact });
        items = [{ name: spec, findings: one.findings, warnings: fixture.warnings }];
      }
      results.push(...items);
    }
    if (positional[0]) {
      const run = await openPage(context, { url: base, steps, flags });
      const findings = await run.page.evaluate(() => window.__pededit?.check() ?? null);
      if (findings === null) throw new UsageError(`${base} is not an editor page (no window.__pededit)`);
      results.push({ name: base, findings });
    }
  } finally {
    await closeBrowser(browser);
  }

  if (flags.json) {
    console.log(JSON.stringify({ served, results }, null, 2));
  } else {
    for (const line of servedLines(served)) console.log(line);
    for (const r of results) {
      console.log(`${r.findings.length ? "FAIL" : "ok  "}  ${r.name}${r.findings.length ? `  (${r.findings.length})` : ""}`);
      for (const f of r.findings) console.log(`        ${f.code}  ${f.message}`);
      for (const w of r.warnings ?? []) console.log(`        import warning  ${w}`);
    }
    const bad = results.filter(r => r.findings.length).length;
    console.log(`lint: ${bad} of ${results.length} pedigree(s) with findings`);
  }
  return results.some(r => r.findings.length) ? 1 : 0;
}, HELP);
