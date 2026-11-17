/**
 * What an error report contains. A pedigree is family health data and
 * the id in `/p/<id>` is the edit link of an anonymous pedigree, so a report
 * is built here from an allowlist, field by field: the error's type, its
 * message after `scrubText`, the stack (script URL on our own origin,
 * function, line, column) and the route pattern of the page. Nothing is read
 * from the DOM, the stores, the console, the network or the URL's query.
 *
 * Anything new on a report (a tag, a context, a breadcrumb) is added here,
 * with a test in `__tests__/scrub.test.ts` showing it cannot carry pedigree
 * content. `backend/peded/error_reporting.py` applies the same rules to the
 * server's reports; keep `scrubText` in step with its `scrub_text`.
 */

export const MAX_TEXT = 200;
const MAX_FRAMES = 50;
export const ID_PLACEHOLDER = "[id]";

const UUID = /[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}/g;
const JWT = /eyJ[\w-]+\.[\w-]+(\.[\w-]+)?/g;
const EMAIL = /[^\s@<>()[\]]+@[^\s@<>()[\]]+/g;
const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;
const DATE = /\b\d{1,4}[-/.]\d{1,2}([-/.]\d{1,4})?\b/g;
const LONG_NUMBER = /\d{4,}/g;
const QUOTE = /["'`‘’“”]/;
const IDENTIFIER = /^[A-Za-z_$][\w$]{0,60}$/;
const FUNCTION_NAME = /^[\w$.<>[\] /#*-]{1,100}$/;

/**
 * An error message with anything that could be data removed. Messages are
 * free text, so this cannot be an allowlist. It leans on how engines write
 * them: interpolated values are quoted (`Unexpected token 'J', "John Smi"...
 * is not valid JSON`), so everything from the first quote to the last goes,
 * and with one unpaired quote everything after it. First line only. Ids,
 * dates, long numbers, emails, URLs and tokens go wherever they are.
 */
export function scrubText(text: unknown): string {
  if (typeof text !== "string") return "";
  let line = text.trim().split("\n", 1)[0];
  const first = line.search(QUOTE);
  if (first >= 0) {
    let last = first;
    for (let i = line.length - 1; i > first; i--) {
      if (QUOTE.test(line[i])) { last = i; break; }
    }
    line = line.slice(0, first) + "[redacted]" + (last > first ? line.slice(last + 1) : "");
  }
  return line
    .replace(JWT, "[token]")
    .replace(URL_IN_TEXT, "[url]")
    .replace(EMAIL, "[email]")
    .replace(UUID, ID_PLACEHOLDER)
    .replace(DATE, "[date]")
    .replace(LONG_NUMBER, "[n]")
    .slice(0, MAX_TEXT);
}

/** The app's routes (`App.tsx`). A path that is none of them is not sent. */
const ROUTES: [RegExp, string][] = [
  [/^\/$/, "/"],
  [/^\/login\/?$/, "/login"],
  [/^\/auth\/github\/callback\/?$/, "/auth/github/callback"],
  [/^\/changelog\/?$/, "/changelog"],
  [/^\/p\/[^/]+\/?$/, `/p/${ID_PLACEHOLDER}`],
];

/** The route pattern for a path: `/p/[id]`, never the pedigree's link. */
export function routeOf(pathname: string): string {
  return ROUTES.find(([pattern]) => pattern.test(pathname))?.[1] ?? "[other]";
}

/**
 * A script URL from a stack frame: kept only when it is one of our own
 * scripts, as origin and path (which is what Rollbar needs to find the source
 * map). Browser extensions, blob: and inline code become "[external]".
 */
export function scrubScriptUrl(url: string, origin: string): string {
  try {
    const u = new URL(url);
    if (u.origin !== origin) return "[external]";
    return u.origin + u.pathname.replace(UUID, ID_PLACEHOLDER);
  } catch {
    return "[external]";
  }
}

export interface Frame {
  filename: string;
  method?: string;
  lineno?: number;
  colno?: number;
}

// "    at fn (url:1:2)", "    at async fn (url:1:2)", "    at url:1:2"
const V8_FRAME = /^\s*at (?:(.+?) \()?((?:[a-z][a-z0-9+.-]*:)?\/\/?[^\s()]+?):(\d+):(\d+)\)?\s*$/i;
// "fn@url:1:2", "@url:1:2"
const GECKO_FRAME = /^\s*([^@\s]*)@((?:[a-z][a-z0-9+.-]*:)?\/\/?[^\s]+?):(\d+):(\d+)\s*$/i;

/**
 * Frames from `error.stack`, oldest first as Rollbar wants. A line that is not
 * a frame is dropped: in Chrome the first line repeats the message, and that
 * must not get past `scrubText` this way.
 */
export function parseStack(stack: unknown, origin: string): Frame[] {
  if (typeof stack !== "string") return [];
  const frames: Frame[] = [];
  for (const line of stack.split("\n").slice(0, MAX_FRAMES * 2)) {
    const m = V8_FRAME.exec(line) ?? GECKO_FRAME.exec(line);
    if (!m) continue;
    const filename = scrubScriptUrl(m[2], origin);
    const frame: Frame = { filename };
    const fn = m[1]?.trim();
    if (fn && FUNCTION_NAME.test(fn)) frame.method = fn.replace(UUID, ID_PLACEHOLDER);
    if (filename !== "[external]") {
      frame.lineno = Number(m[3]);
      frame.colno = Number(m[4]);
    }
    frames.push(frame);
    if (frames.length >= MAX_FRAMES) break;
  }
  return frames.reverse();
}

/** React's component stack: component names only, in render order from the failing one. */
export function componentNames(componentStack: unknown): string[] {
  if (typeof componentStack !== "string") return [];
  const names: string[] = [];
  for (const line of componentStack.split("\n")) {
    const name = /^\s*(?:at\s+)?([A-Za-z_$][\w$.]*)/.exec(line)?.[1];
    if (name && name !== "at" && IDENTIFIER.test(name.replace(/\./g, "_"))) names.push(name);
    if (names.length >= 30) break;
  }
  return names;
}

export type Mechanism = "onerror" | "unhandledrejection" | "react";

export interface ReportContext {
  mechanism: Mechanism;
  /** `window.location.origin` and `.pathname`; nothing else of the URL is looked at. */
  origin: string;
  pathname: string;
  release: string;
  environment: string;
  componentStack?: string | null;
  now?: Date;
  eventId?: string;
}

/** A Rollbar item's `data` (https://docs.rollbar.com/reference/create-item). */
export interface Report {
  uuid: string;
  timestamp: number;
  environment: string;
  level: "error";
  platform: "browser";
  language: "javascript";
  framework: "browser-js";
  code_version: string;
  /** The route pattern, shown on the item in Rollbar. */
  context: string;
  request: { url: string };
  body: {
    trace: {
      frames: Frame[];
      exception: { class: string; message: string };
    };
  };
  custom: { mechanism: Mechanism; handled: boolean; components?: string[] };
  /** Tells Rollbar to fetch the source map named by each script (vite.config.ts). */
  client: { javascript: { code_version: string; source_map_enabled: true; guess_uncaught_frames: true } };
  notifier: { name: "pededit.reporter"; version: "1" };
}

function newUuid(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The whole report for one thrown value. Every field is set here and nowhere
 * else. There is no `person` and no `request.user_ip`: Rollbar records the
 * sender's address only when a report asks it to.
 */
export function buildReport(thrown: unknown, ctx: ReportContext): Report {
  const isObject = typeof thrown === "object" && thrown !== null;
  const read = (key: "name" | "message" | "stack"): unknown => {
    // A getter on a thrown object can itself throw.
    try { return isObject ? (thrown as Record<string, unknown>)[key] : undefined; } catch { return undefined; }
  };
  const name = read("name");
  const type = typeof name === "string" && IDENTIFIER.test(name) ? name : isObject ? "Error" : "NonError";
  // A thrown string is reported as text; any other non-error has no message we can trust.
  const message = isObject ? read("message") : typeof thrown === "string" ? thrown : "";
  const route = routeOf(ctx.pathname);
  const components = componentNames(ctx.componentStack);

  return {
    uuid: ctx.eventId ?? newUuid(),
    timestamp: Math.floor((ctx.now ?? new Date()).getTime() / 1000),
    environment: ctx.environment,
    level: "error",
    platform: "browser",
    language: "javascript",
    framework: "browser-js",
    code_version: ctx.release,
    context: route,
    request: { url: ctx.origin + route },
    body: {
      trace: {
        frames: parseStack(read("stack"), ctx.origin),
        exception: { class: type, message: scrubText(message) },
      },
    },
    custom: {
      mechanism: ctx.mechanism,
      handled: ctx.mechanism === "react",
      ...(components.length ? { components } : {}),
    },
    client: { javascript: { code_version: ctx.release, source_map_enabled: true, guess_uncaught_frames: true } },
    notifier: { name: "pededit.reporter", version: "1" },
  };
}
