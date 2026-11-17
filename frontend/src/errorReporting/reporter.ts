/**
 * Posts error reports to Rollbar. This module and `scrub.ts` are loaded
 * by `index.ts` only when the build has an access token, so a build without
 * one carries and runs none of this.
 *
 * It is hand-written and not `rollbar.js`: that SDK collects by default what
 * must not leave the page here (console output, DOM text of clicks, network
 * URLs with the pedigree id, the page URL, the sender's IP) and each default
 * would need switching off and re-checking on every upgrade. This sends one
 * thing, the report built by `buildReport`.
 */
import { buildReport, type Mechanism, type Report } from "./scrub";

/** Reports per page load. A render loop must not flood the project. */
const MAX_REPORTS = 5;

export const ROLLBAR_ITEM_URL = "https://api.rollbar.com/api/1/item/";

export interface ReporterConfig {
  /** The project's post_client_item token, public by design: it can only add items. */
  accessToken: string;
  release: string;
  environment: string;
}

/** Rollbar access tokens are 32 hex characters. Anything else is a config mistake and sends nothing. */
export function isAccessToken(token: string): boolean {
  return /^[0-9a-f]{32}$/.test(token);
}

export function itemBody(accessToken: string, report: Report): string {
  return JSON.stringify({ access_token: accessToken, data: report });
}

export function createReporter(config: ReporterConfig, post: typeof fetch = fetch) {
  const on = isAccessToken(config.accessToken);
  const seen = new Set<string>();
  let sent = 0;

  return function send(thrown: unknown, extra: { mechanism: Mechanism; componentStack?: string | null }): Report | null {
    if (!on || sent >= MAX_REPORTS) return null;
    let report: Report;
    try {
      report = buildReport(thrown, {
        ...extra,
        origin: window.location.origin,
        pathname: window.location.pathname,
        release: config.release,
        environment: config.environment,
      });
    } catch {
      return null;
    }
    const { exception, frames } = report.body.trace;
    const top = frames[frames.length - 1];
    const key = `${exception.class}|${exception.message}|${top?.filename}:${top?.lineno}:${top?.colno}`;
    if (seen.has(key)) return null;
    seen.add(key);
    sent++;
    // No cookies, and no Referer: the page's URL holds the pedigree's link.
    void post(ROLLBAR_ITEM_URL, {
      method: "POST",
      body: itemBody(config.accessToken, report),
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      keepalive: true,
    }).catch(() => {});
    return report;
  };
}
