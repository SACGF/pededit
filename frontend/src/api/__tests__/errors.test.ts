import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { describe, expect, it } from "vitest";
import { describeWait, rateLimitMessage, requestErrorMessage, retryAfterSeconds } from "../errors";

function httpError(status: number, headers: Record<string, string> = {}) {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  return new AxiosError(`Request failed with status code ${status}`, undefined, config, null,
    { data: {}, status, statusText: "", headers, config });
}

describe("rate limit messages (#184)", () => {
  it("reads Retry-After as seconds or as an HTTP date", () => {
    expect(retryAfterSeconds("42")).toBe(42);
    const now = Date.parse("2026-11-16T10:00:00Z");
    expect(retryAfterSeconds("Mon, 16 Nov 2026 10:02:00 GMT", now)).toBe(120);
    expect(retryAfterSeconds("Mon, 16 Nov 2026 09:00:00 GMT", now)).toBe(0);
    expect(retryAfterSeconds(undefined)).toBeNull();
    expect(retryAfterSeconds("soon")).toBeNull();
  });

  it("rounds the wait up, so it is never shorter than the server's", () => {
    expect([1, 2, 59, 60, 61, 3599, 3600, 3601, 86400].map(describeWait)).toEqual([
      "a second", "2 seconds", "59 seconds", "a minute", "2 minutes", "an hour", "an hour", "2 hours", "24 hours",
    ]);
  });

  it("says how long to wait on a 429, and falls back without Retry-After", () => {
    expect(rateLimitMessage(httpError(429, { "retry-after": "40" })))
      .toBe("Too many requests from your network. Try again in 40 seconds.");
    expect(rateLimitMessage(httpError(429)))
      .toBe("Too many requests from your network. Wait a minute and try again.");
  });

  it("leaves other failures to the caller's own message", () => {
    expect(rateLimitMessage(httpError(500))).toBeNull();
    expect(rateLimitMessage(new Error("network"))).toBeNull();
    expect(requestErrorMessage(httpError(500), "Could not create the pedigree.")).toBe("Could not create the pedigree.");
    expect(requestErrorMessage(httpError(429, { "retry-after": "5" }), "x")).toMatch(/Try again in 5 seconds/);
  });
});
