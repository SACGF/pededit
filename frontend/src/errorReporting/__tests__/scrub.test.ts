import { describe, expect, it, vi } from "vitest";
import { buildReport, componentNames, parseStack, routeOf, scrubScriptUrl, scrubText, MAX_TEXT } from "../scrub";
import { createReporter, envelopeBody, envelopeUrl } from "../reporter";

// A pedigree's content and its link: none of this may appear in a report (#49).
const UUID = "3f2b8c1e-9d4a-4e7b-8a6f-1c2d3e4f5a6b";
const NAME = "Wilhelmina Featherstonehaugh";
const DOB = "1962-04-17";
const NOTES = "Ovarian cancer at 41, declined testing";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjo0Mn0.c2VjcmV0c2lnbmF0dXJl";
const SECRETS = [UUID, UUID.replace(/-/g, ""), NAME, "Wilhelmina", "Featherstonehaugh", DOB, "1962", NOTES, "Ovarian",
  TOKEN, "counsellor@hospital.example", "ghcode123", "chrome-extension", "abcdefextension"];

const ORIGIN = "https://pededit.example";
const CTX = {
  mechanism: "onerror" as const,
  origin: ORIGIN,
  pathname: `/p/${UUID}`,
  release: "pededit-frontend@2026-11-16T00:00:00.000Z",
  environment: "production",
  now: new Date("2026-11-16T01:02:03Z"),
  eventId: "0".repeat(32),
};

const CHROME_STACK = `TypeError: Cannot read properties of undefined (reading '${NAME}')
    at drawPerson (${ORIGIN}/assets/index-BxK3f9a2.js:412:1877)
    at Array.map (<anonymous>)
    at async saveNow (${ORIGIN}/assets/index-BxK3f9a2.js:9:120)
    at ${ORIGIN}/p/${UUID}?name=${encodeURIComponent(NAME)}:1:1
    at inject (chrome-extension://abcdefextension/content.js:1:5)
    at new Promise (<anonymous>)`;

const FIREFOX_STACK = `drawPerson@${ORIGIN}/assets/index-BxK3f9a2.js:412:1877
saveNow/<@${ORIGIN}/assets/index-BxK3f9a2.js:9:120
@${ORIGIN}/p/${UUID}:1:1
inject@moz-extension://abcdefextension/content.js:1:5`;

function errorWith(message: string, stack: string, name = "TypeError"): Error {
  const e = new Error(message);
  e.name = name;
  e.stack = stack;
  return e;
}

function expectNoSecrets(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

describe("scrubText", () => {
  it("removes what a message can interpolate", () => {
    const cases: [string, string][] = [
      [`Pedigree ${UUID} not found`, "Pedigree [id] not found"],
      [`Cannot read properties of undefined (reading 'name')`, "Cannot read properties of undefined (reading [redacted])"],
      [`Unexpected token 'W', "Wilhelmina"... is not valid JSON`, "Unexpected token [redacted]... is not valid JSON"],
      [`JSON Parse error: Unexpected identifier "Wilhelmina"`, "JSON Parse error: Unexpected identifier [redacted]"],
      ["can't find Wilhelmina", "can[redacted]"],
      ["born 1962-04-17, seen 3/4/2021", "born [date], seen [date]"],
      ["b. 1978", "b. [n]"],
      ["mail counsellor@hospital.example now", "mail [email] now"],
      [`GET ${ORIGIN}/api/pedigrees/${UUID}/ failed`, "GET [url] failed"],
      [`Bearer ${TOKEN}`, "Bearer [token]"],
      ["first line\nsecond line with Wilhelmina", "first line"],
      ["Request failed with status code 500", "Request failed with status code 500"],
      ["Network Error", "Network Error"],
    ];
    for (const [raw, want] of cases) expect(scrubText(raw), raw).toBe(want);
  });

  it("is empty for anything but a string, and bounded", () => {
    expect(scrubText(undefined)).toBe("");
    expect(scrubText({ name: NAME })).toBe("");
    expect(scrubText("x".repeat(5000)).length).toBe(MAX_TEXT);
  });
});

describe("routes and script URLs", () => {
  it("sends the route pattern, never the path", () => {
    expect(routeOf(`/p/${UUID}`)).toBe("/p/[id]");
    expect(routeOf("/p/anything-at-all/")).toBe("/p/[id]");
    expect(routeOf("/")).toBe("/");
    expect(routeOf("/auth/github/callback")).toBe("/auth/github/callback");
    expect(routeOf(`/somewhere/${NAME}`)).toBe("[other]");
  });

  it("keeps only our own scripts, without query or fragment", () => {
    expect(scrubScriptUrl(`${ORIGIN}/assets/index-abc.js?v=${NAME}#x`, ORIGIN)).toBe(`${ORIGIN}/assets/index-abc.js`);
    expect(scrubScriptUrl(`${ORIGIN}/p/${UUID}`, ORIGIN)).toBe(`${ORIGIN}/p/[id]`);
    expect(scrubScriptUrl("chrome-extension://abcdefextension/content.js", ORIGIN)).toBe("[external]");
    expect(scrubScriptUrl("https://elsewhere.example/x.js", ORIGIN)).toBe("[external]");
    expect(scrubScriptUrl("<anonymous>", ORIGIN)).toBe("[external]");
  });
});

describe("parseStack", () => {
  it("reads Chrome frames, oldest first, and drops the message line", () => {
    const frames = parseStack(CHROME_STACK, ORIGIN);
    expectNoSecrets(frames);
    expect(frames[frames.length - 1]).toEqual({
      filename: `${ORIGIN}/assets/index-BxK3f9a2.js`, function: "drawPerson", lineno: 412, colno: 1877, in_app: true,
    });
    expect(frames.map((f) => f.filename)).toEqual([
      "[external]", `${ORIGIN}/p/[id]`, `${ORIGIN}/assets/index-BxK3f9a2.js`, `${ORIGIN}/assets/index-BxK3f9a2.js`,
    ]);
    expect(frames[0]).toEqual({ filename: "[external]", function: "inject", in_app: false });
  });

  it("reads Firefox and Safari frames", () => {
    const frames = parseStack(FIREFOX_STACK, ORIGIN);
    expectNoSecrets(frames);
    expect(frames).toHaveLength(4);
    expect(frames[3]).toEqual({
      filename: `${ORIGIN}/assets/index-BxK3f9a2.js`, function: "drawPerson", lineno: 412, colno: 1877, in_app: true,
    });
  });

  it("gives no frames for a missing or foreign stack", () => {
    expect(parseStack(undefined, ORIGIN)).toEqual([]);
    expect(parseStack(`${NAME}\n${NOTES}`, ORIGIN)).toEqual([]);
  });
});

describe("buildReport", () => {
  it("carries no pedigree content or pedigree link", () => {
    const thrown = errorWith(`Cannot read properties of undefined (reading '${NAME}')`, CHROME_STACK);
    // What a careless SDK would pick up from the error object.
    Object.assign(thrown, {
      config: { url: `/api/pedigrees/${UUID}/`, data: JSON.stringify({ name: NAME, dob: DOB, notes: NOTES }),
        headers: { Authorization: `Bearer ${TOKEN}` } },
      response: { data: { individuals: [{ name: NAME }] } },
      cause: new Error(NOTES),
    });
    const report = buildReport(thrown, {
      ...CTX,
      mechanism: "react",
      componentStack: `\n    at PersonNode (${ORIGIN}/assets/index-BxK3f9a2.js:1:2)\n    at div\n    at CanvasPage (${ORIGIN}/p/${UUID}:3:4)`,
    });
    expectNoSecrets(report);
    expect(report).toEqual({
      event_id: "0".repeat(32),
      timestamp: 1794790923,
      platform: "javascript",
      level: "error",
      release: CTX.release,
      environment: "production",
      transaction: "/p/[id]",
      request: { url: `${ORIGIN}/p/[id]` },
      exception: {
        values: [{
          type: "TypeError",
          value: "Cannot read properties of undefined (reading [redacted])",
          mechanism: { type: "react", handled: true },
          stacktrace: { frames: parseStack(CHROME_STACK, ORIGIN) },
        }],
      },
      extra: { components: ["PersonNode", "div", "CanvasPage"] },
      sdk: { name: "pededit.reporter", version: "1", settings: { infer_ip: "never" } },
      user: {},
    });
  });

  it("scrubs messages that interpolate without quotes", () => {
    const report = buildReport(errorWith(`Pedigree ${UUID} of ${DOB} failed for counsellor@hospital.example`, FIREFOX_STACK, "Error"), CTX);
    expectNoSecrets(report);
    expect(report.exception.values[0].value).toBe("Pedigree [id] of [date] failed for [email]");
  });

  it("handles what is thrown or rejected that is not an Error", () => {
    const thrownString = buildReport(`save of '${NAME}' failed in ${UUID}`, CTX);
    expectNoSecrets(thrownString);
    expect(thrownString.exception.values[0]).toMatchObject({ type: "NonError", value: "save of [redacted] failed in [id]" });

    // A rejected pedigree object: nothing of it is read.
    const thrownObject = buildReport({ individuals: [{ name: NAME, dob: DOB, notes: NOTES }], id: UUID }, CTX);
    expectNoSecrets(thrownObject);
    expect(thrownObject.exception.values[0]).toMatchObject({ type: "Error", value: "", stacktrace: { frames: [] } });

    for (const odd of [undefined, null, 42, Symbol("x")]) {
      expect(buildReport(odd, CTX).exception.values[0]).toMatchObject({ type: "NonError", value: "" });
    }
    const hostile = { get message(): string { throw new Error(NAME); }, name: `${NAME}` };
    expectNoSecrets(buildReport(hostile, CTX));
  });

  it("does not send a path that is not a route, or the GitHub sign-in code", () => {
    const report = buildReport(new Error("x"), { ...CTX, pathname: `/notes/${NAME}` });
    expect(report.transaction).toBe("[other]");
    expectNoSecrets(report);
    expect(buildReport(new Error("x"), { ...CTX, pathname: "/auth/github/callback" }).request.url)
      .toBe(`${ORIGIN}/auth/github/callback`);
  });
});

describe("componentNames", () => {
  it("keeps names only", () => {
    expect(componentNames(`\n    at EditPanel (${ORIGIN}/p/${UUID}:1:2)\nPersonNode@${ORIGIN}/a.js:1:2\n    at Context.Provider`))
      .toEqual(["EditPanel", "PersonNode", "Context.Provider"]);
    expect(componentNames(null)).toEqual([]);
  });
});

describe("reporter", () => {
  const DSN = "https://publickey@o1.ingest.errors.invalid/42";

  it("turns a DSN into the envelope endpoint", () => {
    expect(envelopeUrl(DSN)).toBe(
      "https://o1.ingest.errors.invalid/api/42/envelope/?sentry_version=7&sentry_key=publickey&sentry_client=pededit.reporter%2F1",
    );
    expect(envelopeUrl("https://publickey@sentry.clinic.invalid/sentry/7")).toMatch(/^https:\/\/sentry\.clinic\.invalid\/sentry\/api\/7\/envelope\/\?/);
    expect(envelopeUrl("")).toBeNull();
    expect(envelopeUrl("not a dsn")).toBeNull();
    expect(envelopeUrl("https://o1.ingest.errors.invalid/42")).toBeNull();
  });

  function withWindow<T>(fn: () => T): T {
    vi.stubGlobal("window", {
      location: { origin: ORIGIN, pathname: `/p/${UUID}`, search: `?name=${NAME}`, hash: `#${NOTES}`,
        href: `${ORIGIN}/p/${UUID}?name=${NAME}#${NOTES}` },
    });
    try { return fn(); } finally { vi.unstubAllGlobals(); }
  }

  it("posts one scrubbed envelope, with no cookies and no referrer", () => {
    const post = vi.fn(() => Promise.resolve(new Response()));
    withWindow(() => {
      const send = createReporter({ dsn: DSN, release: CTX.release, environment: "production" }, post as unknown as typeof fetch);
      send(errorWith(`bad '${NAME}' in ${UUID}`, CHROME_STACK), { mechanism: "onerror" });
    });
    expect(post).toHaveBeenCalledTimes(1);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(envelopeUrl(DSN));
    expect(init).toMatchObject({ method: "POST", credentials: "omit", referrerPolicy: "no-referrer" });
    expectNoSecrets(url);
    expectNoSecrets(init.body as string);
    const lines = (init.body as string).split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[1])).toEqual({ type: "event" });
    expect(JSON.parse(lines[2]).transaction).toBe("/p/[id]");
    expect(Object.keys(JSON.parse(lines[0])).sort()).toEqual(["event_id", "sent_at"]);
  });

  it("sends a repeated error once and stops after five", () => {
    const post = vi.fn(() => Promise.resolve(new Response()));
    withWindow(() => {
      const send = createReporter({ dsn: DSN, release: "r", environment: "e" }, post as unknown as typeof fetch);
      const same = errorWith("again", CHROME_STACK);
      send(same, { mechanism: "onerror" });
      send(same, { mechanism: "react" });
      expect(post).toHaveBeenCalledTimes(1);
      for (let i = 0; i < 20; i++) send(errorWith(`different ${"x".repeat(i)}`, CHROME_STACK), { mechanism: "onerror" });
    });
    expect(post).toHaveBeenCalledTimes(5);
  });

  it("sends nothing when the DSN is not one, and never throws", () => {
    const post = vi.fn(() => Promise.reject(new Error("offline")));
    withWindow(() => {
      expect(createReporter({ dsn: "nonsense", release: "r", environment: "e" }, post as unknown as typeof fetch)(new Error("x"), { mechanism: "onerror" })).toBeNull();
      expect(post).not.toHaveBeenCalled();
      expect(() => createReporter({ dsn: DSN, release: "r", environment: "e" }, post as unknown as typeof fetch)(new Error("x"), { mechanism: "onerror" })).not.toThrow();
    });
  });

  it("writes the envelope as three JSON lines", () => {
    const report = buildReport(new Error("x"), CTX);
    expect(envelopeBody(report).split("\n").map((l) => JSON.parse(l))[2]).toEqual(report);
  });
});
