#!/usr/bin/env node
// Writes frontend/public/changelog.json from the GitHub milestones (#79).
//
// Every fixed issue goes on the current release milestone when its code lands
// (root AGENTS.md), so a milestone's issues are what that release shipped,
// whether or not they have been tested and closed yet. deploy.sh runs this
// before the build; on any failure it exits non-zero and leaves the previous
// file alone, so the page shows the last good changelog.
//
// Unauthenticated requests are fine (60 an hour); GITHUB_TOKEN is used if set.
//
//   node frontend/scripts/changelog.mjs [--out PATH]

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "SACGF/pededit";
const here = dirname(fileURLToPath(import.meta.url));
const outArg = process.argv.indexOf("--out");
const out = outArg > 0 ? resolve(process.argv[outArg + 1]) : resolve(here, "../public/changelog.json");

async function get(path) {
  const results = [];
  let url = `https://api.github.com/repos/${REPO}/${path}`;
  while (url) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "pededit-changelog",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
    results.push(...(await res.json()));
    url = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "")?.[1];
  }
  return results;
}

const milestones = await get("milestones?state=all&per_page=100");
const releases = [];
for (const m of milestones) {
  const issues = (await get(`issues?milestone=${m.number}&state=all&per_page=100`))
    .filter((i) => !i.pull_request && i.state_reason !== "not_planned")
    .sort((a, b) => a.number - b.number)
    .map((i) => ({ number: i.number, title: i.title, url: i.html_url }));
  if (!issues.length) continue;
  releases.push({
    title: m.title,
    description: m.description ?? "",
    url: m.html_url,
    released: m.state === "closed",
    // A closed milestone is dated by when it closed, an open one by its due date.
    date: m.state === "closed" ? m.closed_at : m.due_on,
    issues,
  });
}
releases.sort((a, b) => Number(a.released) - Number(b.released) || String(b.date).localeCompare(String(a.date)));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), releases }, null, 2) + "\n");
console.log(`changelog: ${releases.length} releases, ${releases.reduce((n, r) => n + r.issues.length, 0)} issues -> ${out}`);
