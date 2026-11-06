#!/usr/bin/env node
// Load a page, run the steps, then evaluate one JavaScript expression (or
// function body) in it and print the result as JSON. In the dev build the
// stores and helpers are on window.__pededit (see frontend/src/devHooks.ts).
import {
  COMMON_HELP, closeBrowser, main, parseArgs, parseViewport, launchBrowser, newContext, targetsFrom,
  assertServerUp, loadFixture, openPage, resolveFindings, SourceMapper,
  summaryLine, findingLines, writesLine, UsageError,
} from "./harness.mjs";

const HELP = `usage: node frontend/scripts/browser/eval.mjs [URL] 'JS' [options]

JS is an expression (await is allowed) or, if it does not parse as one, a
function body that returns a value. The result is printed as JSON on stdout;
the JS findings summary goes to stderr. Exits 1 if the expression threw.

Examples:
  eval.mjs --fixture example:0 '__pededit.pedigree().individuals.length'
  eval.mjs --fixture example:0 --click '[data-individual-id="c1"]' \\
      '__pededit.usePedigreeStore.getState().selectedId'
  eval.mjs --fixture example:0 'const l = __pededit.layout(); return l.nodes.map(n => [n.data.individual.id, n.position])'
${COMMON_HELP}`;

await main(async () => {
  const { positional, flags, steps } = parseArgs(process.argv.slice(2));
  if (flags.help) { console.log(HELP); return 0; }
  let urlArg, js;
  if (positional.length === 2) [urlArg, js] = positional;
  else if (positional.length === 1 && flags.fixture) [js] = positional;
  else throw new UsageError("usage: eval.mjs URL 'JS' (or --fixture SPEC 'JS')");
  const targets = targetsFrom(urlArg, flags);
  if (targets.length > 1) throw new UsageError("eval takes one --fixture");
  const [t] = targets;
  await assertServerUp(t.url);

  const browser = await launchBrowser();
  let result, threw = null, run;
  try {
    const context = await newContext(browser, { asAgent: flags["as-agent"], viewport: parseViewport(flags.viewport) });
    const fixture = t.spec ? await loadFixture(t.spec, context, t.url) : null;
    run = await openPage(context, { url: t.url, fixture, steps, flags });
    try {
      result = await run.page.evaluate(async src => {
        const AsyncFunction = (async () => {}).constructor;
        let fn;
        try { fn = new AsyncFunction(`return (${src}\n);`); } catch { fn = new AsyncFunction(src); }
        const value = await fn();
        // Make anything JSON-safe: functions, Maps, Sets, DOM nodes, cycles.
        const seen = new WeakSet();
        return JSON.parse(JSON.stringify(value === undefined ? null : value, (_k, v) => {
          if (typeof v === "function") return `[function ${v.name || "anonymous"}]`;
          if (v instanceof Map) return Object.fromEntries(v);
          if (v instanceof Set) return [...v];
          if (typeof Node !== "undefined" && v instanceof Node) return `[${v.nodeName}]`;
          if (v && typeof v === "object") { if (seen.has(v)) return "[circular]"; seen.add(v); }
          return v;
        }) ?? "null");
      }, js);
    } catch (e) {
      threw = String(e.message).replace(/^page\.evaluate: /, "").split("\n")[0];
    }
    await resolveFindings(run.findings, new SourceMapper());
  } finally {
    await closeBrowser(browser);
  }

  if (flags.json) {
    console.log(JSON.stringify({ url: t.url, fixture: t.spec, result: threw ? null : result, error: threw, ...run.findings }, null, 2));
  } else {
    if (threw) console.log(`error: ${threw}`);
    else console.log(JSON.stringify(result, null, 2));
    console.error(summaryLine(run.findings));
    for (const line of findingLines(run.findings, { verbose: flags.verbose })) console.error(line);
    const writes = writesLine(run.findings);
    if (writes) console.error(writes);
  }
  return threw ? 1 : 0;
}, HELP);
