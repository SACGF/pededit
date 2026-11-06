#!/usr/bin/env node
// Load a page in headless chromium and report what its JavaScript complained
// about: uncaught exceptions, console errors and warnings, failed requests and
// 4xx/5xx responses, steps that could not run, fixture import warnings, the
// render lint, and (with --fixture-via-api) what did not persist.
import {
  COMMON_HELP, closeBrowser, main, parseArgs, launchBrowser, newContext, targetsFrom,
  assertServerUp, loadFixture, openPage, finishPage, contextOptions, resolveFindings, SourceMapper,
  summaryLine, findingLines, writesLine, hasFindings, servedInfo, servedLines, UsageError,
} from "./harness.mjs";

const HELP = `usage: node frontend/scripts/browser/console.mjs [URL] [options]

Prints the served commit, one summary line, then one line per finding with a
file:line. Everything goes to stdout.
Exits 0 when the page is clean, 1 when there are findings, 2 on usage errors.
${COMMON_HELP}`;

await main(async () => {
  const { positional, flags, steps } = parseArgs(process.argv.slice(2));
  if (flags.help) { console.log(HELP); return 0; }
  if (positional.length > 1) throw new UsageError("usage: one URL at most (use --fixture several times for several pedigrees)");
  const targets = targetsFrom(positional[0], flags);
  await assertServerUp(targets[0].url);
  const served = await servedInfo(targets[0].url);

  const browser = await launchBrowser();
  const mapper = new SourceMapper();
  const reports = [];
  try {
    const context = await newContext(browser, contextOptions(flags));
    for (const t of targets) {
      const fixture = t.spec ? await loadFixture(t.spec, context, t.url) : null;
      const run = await openPage(context, { url: t.url, fixture, steps, flags });
      await finishPage(run, flags);
      await resolveFindings(run.findings, mapper);
      reports.push({ url: run.url, fixture: t.spec, status: run.status, ms: run.ms, ...run.findings });
      await run.page.close();
    }
  } finally {
    await closeBrowser(browser);
  }

  if (flags.json) {
    console.log(JSON.stringify({ served, reports }, null, 2));
  } else {
    for (const line of servedLines(served)) console.log(line);
    for (const r of reports) {
      console.log(`page: ${r.url}${r.fixture ? ` (fixture ${r.fixture})` : ""}  status ${r.status}, ${r.ms} ms`);
      console.log(summaryLine(r));
      for (const line of findingLines(r, { verbose: flags.verbose })) console.log(line);
      const writes = writesLine(r);
      if (writes) console.log(writes);
    }
  }
  return reports.some(hasFindings) ? 1 : 0;
}, HELP);
