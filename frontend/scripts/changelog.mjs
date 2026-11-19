#!/usr/bin/env node
// Writes frontend/public/changelog.json from the GitHub milestones (#79).
//
// Every fixed issue goes on the current release milestone when its code lands
// (root AGENTS.md), but a milestone also holds work planned for it and not
// started. Only finished work is listed: an issue closed as completed, or an
// open one labelled "Human work required" (added once the code is committed
// and only testing or setup by the maintainer is left) that a commit in this
// checkout cites as (#N). The label alone is not enough: an issue that is all
// server setup carries it with no code. A milestone with nothing finished is
// left out. deploy.sh runs this
// before the build; on any failure it exits non-zero and leaves the previous
// file alone, so the page shows the last good changelog.
//
// Unauthenticated requests are fine (60 an hour); GITHUB_TOKEN is used if set.
//
//   node frontend/scripts/changelog.mjs [--out PATH]

import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
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

const AWAITING_TESTING = "Human work required";

// Issue numbers cited as (#N) in a commit message reachable from HEAD.
const cited = new Set(
  [...execFileSync("git", ["log", "--format=%B"], { cwd: here, encoding: "utf8", maxBuffer: 1 << 28 })
    .matchAll(/\(#(\d+)\)/g)].map((m) => Number(m[1])),
);

function isFinished(issue) {
  if (issue.state === "closed") return issue.state_reason !== "not_planned";
  return cited.has(issue.number)
    && issue.labels.some((l) => (typeof l === "string" ? l : l.name) === AWAITING_TESTING);
}

const milestones = await get("milestones?state=all&per_page=100");
const releases = [];
for (const m of milestones) {
  const issues = (await get(`issues?milestone=${m.number}&state=all&per_page=100`))
    .filter((i) => !i.pull_request && isFinished(i))
    .sort((a, b) => a.number - b.number)
    .map((i) => ({ number: i.number, title: i.title, url: i.html_url }));
  if (!issues.length) continue;
  releases.push({
    title: m.title,
    description: m.description ?? "",
    url: m.html_url,
    released: m.state === "closed",
    // Dated by the due date, which is the release date. closed_at is only a
    // fallback: milestones made after the fact (Initial deployment) were closed
    // long after they shipped and would otherwise sort as the newest release.
    date: m.due_on ?? m.closed_at,
    issues,
  });
}
releases.sort((a, b) => Number(a.released) - Number(b.released) || String(b.date).localeCompare(String(a.date)));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), releases }, null, 2) + "\n");
console.log(`changelog: ${releases.length} releases, ${releases.reduce((n, r) => n + r.issues.length, 0)} issues -> ${out}`);
