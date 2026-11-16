/**
 * Posts error reports to the Sentry project the DSN names (#49). This module
 * and `scrub.ts` are loaded by `index.ts` only when the build has a DSN, so a
 * build without one carries and runs none of this.
 *
 * It is hand-written and not `@sentry/browser`: that SDK collects by default
 * what must not leave the page here (console output, DOM text of clicks,
 * fetch URLs with the pedigree id) and each default would need switching off
 * and re-checking on every upgrade. This sends one thing, the report built by
 * `buildReport`.
 */
import { buildReport, type Mechanism, type Report } from "./scrub";

/** Reports per page load. A render loop must not flood the project. */
const MAX_REPORTS = 5;

export interface ReporterConfig {
  dsn: string;
  release: string;
  environment: string;
}

/** `https://<key>@<host>/<path>/<project>` to the envelope endpoint, or null if it is not a DSN. */
export function envelopeUrl(dsn: string): string | null {
  try {
    const u = new URL(dsn);
    const parts = u.pathname.split("/").filter(Boolean);
    const project = parts.pop();
    if (!u.username || !project || !/^https?:$/.test(u.protocol)) return null;
    const prefix = parts.length ? `/${parts.join("/")}` : "";
    const query = new URLSearchParams({ sentry_version: "7", sentry_key: u.username, sentry_client: "pededit.reporter/1" });
    return `${u.protocol}//${u.host}${prefix}/api/${project}/envelope/?${query}`;
  } catch {
    return null;
  }
}

export function envelopeBody(report: Report): string {
  return [
    JSON.stringify({ event_id: report.event_id, sent_at: new Date(report.timestamp * 1000).toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(report),
  ].join("\n");
}

export function createReporter(config: ReporterConfig, post: typeof fetch = fetch) {
  const url = envelopeUrl(config.dsn);
  const seen = new Set<string>();
  let sent = 0;

  return function send(thrown: unknown, extra: { mechanism: Mechanism; componentStack?: string | null }): Report | null {
    if (!url || sent >= MAX_REPORTS) return null;
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
    const exc = report.exception.values[0];
    const top = exc.stacktrace.frames[exc.stacktrace.frames.length - 1];
    const key = `${exc.type}|${exc.value}|${top?.filename}:${top?.lineno}:${top?.colno}`;
    if (seen.has(key)) return null;
    seen.add(key);
    sent++;
    // text/plain keeps it a simple request (no CORS preflight). No cookies,
    // and no Referer: the page's URL holds the pedigree's link.
    void post(url, {
      method: "POST",
      body: envelopeBody(report),
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      keepalive: true,
    }).catch(() => {});
    return report;
  };
}
