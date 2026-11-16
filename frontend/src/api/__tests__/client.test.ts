import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient, setSignedOutHandler } from "../client";

// The 401 handling of the API client (#191), with the network replaced by a
// fake server: the stored access token is accepted or not, and a refresh
// answers with a new pair or a 401.

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

interface Seen { url: string; auth: string | null }

function fakeServer({ validAccess, refreshTo, refreshLimited = false }: { validAccess: string; refreshTo: string | null; refreshLimited?: boolean }) {
  const seen: Seen[] = [];
  const respond = (config: InternalAxiosRequestConfig, status: number, data: unknown) => {
    const response = { data, status, statusText: String(status), headers: {}, config };
    if (status >= 400) throw new AxiosError(`Request failed with status code ${status}`, undefined, config, null, response);
    return response;
  };
  const adapter: AxiosAdapter = async config => {
    const url = config.url ?? "";
    const auth = (config.headers?.Authorization as string | undefined) ?? null;
    seen.push({ url, auth });
    if (url.includes("token/refresh")) {
      if (refreshLimited) return respond(config, 429, {});
      return refreshTo ? respond(config, 200, { access: refreshTo, refresh: `${refreshTo}-r` }) : respond(config, 401, {});
    }
    if (url.includes("/auth/me/")) return auth === `Bearer ${validAccess}` ? respond(config, 200, { id: 1 }) : respond(config, 401, {});
    // A pedigree opened by its link: anyone may read it, but a rejected token is a 401.
    if (auth && auth !== `Bearer ${validAccess}`) return respond(config, 401, {});
    return respond(config, 200, { id: "p1" });
  };
  return { adapter, seen };
}

describe("API client on a 401 (#191)", () => {
  let signedOut: number;
  let location: { href: string };

  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    location = { href: "/p/p1" };
    vi.stubGlobal("window", { location });
    signedOut = 0;
    setSignedOutHandler(() => { signedOut++; });
  });
  afterEach(() => {
    setSignedOutHandler(null);
    apiClient.defaults.adapter = undefined;
    axios.defaults.adapter = undefined;
    vi.unstubAllGlobals();
  });

  const use = (server: ReturnType<typeof fakeServer>) => {
    apiClient.defaults.adapter = server.adapter;
    axios.defaults.adapter = server.adapter;
  };
  const refreshes = (seen: Seen[]) => seen.filter(s => s.url.includes("token/refresh")).length;

  it("refreshes once and retries with the new token", async () => {
    localStorage.setItem("access_token", "old");
    localStorage.setItem("refresh_token", "r");
    const server = fakeServer({ validAccess: "new", refreshTo: "new" });
    use(server);
    const res = await apiClient.get("/auth/me/");
    expect(res.status).toBe(200);
    expect(refreshes(server.seen)).toBe(1);
    expect(localStorage.getItem("access_token")).toBe("new");
    expect(signedOut).toBe(0);
  });

  it("with a refresh token the server rejects: one refresh, signed out, the request sent again without a token, no reload", async () => {
    localStorage.setItem("access_token", "forged");
    localStorage.setItem("refresh_token", "forged-r");
    const server = fakeServer({ validAccess: "good", refreshTo: null });
    use(server);
    const res = await apiClient.get("/pedigrees/p1/");
    expect(res.data).toEqual({ id: "p1" });
    expect(refreshes(server.seen)).toBe(1);
    expect(server.seen.at(-1)).toEqual({ url: "/pedigrees/p1/", auth: null });
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(signedOut).toBe(1);
    expect(location.href).toBe("/p/p1");
  });

  it("several requests rejected at once share one refresh and sign out once", async () => {
    localStorage.setItem("access_token", "forged");
    localStorage.setItem("refresh_token", "forged-r");
    const server = fakeServer({ validAccess: "good", refreshTo: null });
    use(server);
    const results = await Promise.allSettled([apiClient.get("/pedigrees/p1/"), apiClient.get("/pedigrees/p1/"), apiClient.get("/auth/me/")]);
    expect(results.map(r => r.status)).toEqual(["fulfilled", "fulfilled", "rejected"]);
    expect(refreshes(server.seen)).toBe(1);
    expect(signedOut).toBe(1);
  });

  it("a 401 to a request sent without a token is passed on, with no refresh", async () => {
    const server = fakeServer({ validAccess: "good", refreshTo: "new" });
    use(server);
    await expect(apiClient.get("/auth/me/")).rejects.toMatchObject({ response: { status: 401 } });
    expect(server.seen).toHaveLength(1);
    expect(signedOut).toBe(0);
    expect(location.href).toBe("/p/p1");
  });

  it("an access token with no refresh token signs out and retries without it", async () => {
    localStorage.setItem("access_token", "forged");
    const server = fakeServer({ validAccess: "good", refreshTo: "new" });
    use(server);
    const res = await apiClient.get("/pedigrees/p1/");
    expect(res.status).toBe(200);
    expect(refreshes(server.seen)).toBe(0);
    expect(signedOut).toBe(1);
  });

  it("a new token that is rejected too is not refreshed again", async () => {
    localStorage.setItem("access_token", "old");
    localStorage.setItem("refresh_token", "r");
    const server = fakeServer({ validAccess: "never", refreshTo: "new" });
    use(server);
    await expect(apiClient.get("/auth/me/")).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshes(server.seen)).toBe(1);
  });

  it("a rate-limited refresh keeps the tokens and passes the 429 on (#184)", async () => {
    localStorage.setItem("access_token", "old");
    localStorage.setItem("refresh_token", "r");
    const server = fakeServer({ validAccess: "new", refreshTo: "new", refreshLimited: true });
    use(server);
    await expect(apiClient.get("/auth/me/")).rejects.toMatchObject({ response: { status: 429 } });
    expect(localStorage.getItem("refresh_token")).toBe("r");
    expect(signedOut).toBe(0);
  });
});
