import { isAxiosError } from "axios";

/**
 * What to tell the user when a request failed. The server limits how
 * often one address may sign in, refresh a token or create a pedigree
 * without an account (`backend/api/throttling.py`) and answers 429 with
 * a `Retry-After` header; saving an open pedigree is never limited.
 */

/** Seconds from a `Retry-After` header (a number of seconds or an HTTP date), or null. */
export function retryAfterSeconds(header: unknown, now: number = Date.now()): number | null {
  if (typeof header !== "string" || !header.trim()) return null;
  const s = header.trim();
  if (/^\d+$/.test(s)) return Number(s);
  const at = Date.parse(s);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now) / 1000));
}

/** "40 seconds", "a minute", "3 minutes", "2 hours": rounded up, never shorter than the wait. */
export function describeWait(seconds: number): string {
  if (seconds <= 1) return "a second";
  if (seconds < 60) return `${Math.ceil(seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "a minute" : `${minutes} minutes`;
  const hours = Math.ceil(seconds / 3600);
  return hours === 1 ? "an hour" : `${hours} hours`;
}

export function isRateLimited(err: unknown): boolean {
  return isAxiosError(err) && err.response?.status === 429;
}

/** The message for a rate-limited request, or null when `err` is something else. */
export function rateLimitMessage(err: unknown): string | null {
  if (!isAxiosError(err) || err.response?.status !== 429) return null;
  const wait = retryAfterSeconds(err.response.headers?.["retry-after"]);
  return wait === null
    ? "Too many requests from your network. Wait a minute and try again."
    : `Too many requests from your network. Try again in ${describeWait(wait)}.`;
}

/** The rate limit message, or `otherwise` for any other failure. */
export function requestErrorMessage(err: unknown, otherwise: string): string {
  return rateLimitMessage(err) ?? otherwise;
}
