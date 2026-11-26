import axios from "axios";
import { withCurrentNotation } from "../pedigree/notation";
import { isRateLimited } from "./errors";
import type { Pedigree, TagFill, TagKind } from "@pedigree-editor/layout-engine";

export const apiClient = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Shared in-flight refresh promise — prevents multiple concurrent 401 responses
// from each triggering their own refresh when ROTATE_REFRESH_TOKENS is true.
// The second caller waits for the first caller's refresh rather than starting
// a new one with an already-consumed refresh token.
let tokenRefreshInProgress: Promise<string> | null = null;

let onSignedOut: (() => void) | null = null;
/** Called when the tokens are found to be no good and have been dropped (the app store signs out). */
export function setSignedOutHandler(fn: (() => void) | null) {
  onSignedOut = fn;
}

/**
 * A 401 means the token was rejected: an owned pedigree answers 404 to
 * everyone else, so nothing else gives one. Refresh once; if that fails too
 * (expired, signed with another key, user gone), drop the tokens, sign out
 * and send the request again without a token (#191). Anonymous mode is the
 * default, so a pedigree opened by its link still opens, and the page ends
 * signed out where it was, with one refresh request and no reload. (It used
 * to go to the landing page, which a harness that puts the tokens back on
 * every load turned into a loop of refreshes.)
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || !original || original._retry) return Promise.reject(error);
    original._retry = true;
    // Sent without a token: there is nothing to refresh, it is just not allowed (/auth/me/).
    if (!original.headers?.Authorization) return Promise.reject(error);

    const refresh = localStorage.getItem("refresh_token");
    let newToken: string | null = null;
    if (refresh) {
      // Start a refresh if none is already in progress; otherwise reuse it.
      if (!tokenRefreshInProgress) {
        tokenRefreshInProgress = axios
          .post("/api/auth/token/refresh/", { refresh })
          .then(({ data }) => {
            localStorage.setItem("access_token", data.access);
            localStorage.setItem("refresh_token", data.refresh);
            return data.access as string;
          })
          .finally(() => {
            tokenRefreshInProgress = null;
          });
      }
      try {
        newToken = await tokenRefreshInProgress;
      } catch (refreshError) {
        // The refresh was rate limited: the tokens may be fine, so stay
        // signed in and pass the 429 on for the page to say wait and retry.
        if (isRateLimited(refreshError)) return Promise.reject(refreshError);
      }
    }

    if (newToken) {
      original.headers.Authorization = `Bearer ${newToken}`;
    } else {
      signOutLocally();
      delete original.headers.Authorization;
    }
    return apiClient(original);
  }
);

function signOutLocally() {
  const had = localStorage.getItem("access_token") !== null || localStorage.getItem("refresh_token") !== null;
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  if (had) onSignedOut?.();
}

// ── Auth endpoints ────────────────────────────────────────────────────────────

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface UserInfo {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

export interface PedigreeMeta {
  id: string;
  title: string;
  created: string;
  updated: string;
}

export interface PedigreePayload {
  id: string;
  title: string;
  data: {
    individuals: unknown[];
    partnerships: unknown[];
    parentOf: Record<string, string[]>;
  };
  created: string;
  updated: string;
}

export const authApi = {
  googleLogin: (credential: string) =>
    apiClient.post<TokenPair>("/auth/google/", { credential }),

  githubLogin: (code: string) =>
    apiClient.post<TokenPair>("/auth/github/", { code }),

  me: () => apiClient.get<UserInfo>("/auth/me/"),

  /** Delete the signed-in account, its pedigrees and its My library. */
  deleteAccount: () => apiClient.delete("/auth/me/"),
};

export const pedigreeApi = {
  list: () => apiClient.get<PedigreeMeta[]>("/pedigrees/"),

  get: (id: string) => apiClient.get<PedigreePayload>(`/pedigrees/${id}/`),

  create: (title: string) =>
    apiClient.post<PedigreePayload>("/pedigrees/", {
      title,
      // A new pedigree is drawn in the current NSGC edition; absent would mean 2008.
      data: withCurrentNotation<Pick<Pedigree, "individuals" | "partnerships" | "parentOf" | "canvasSettings">>({ individuals: [], partnerships: [], parentOf: {} }),
    }),

  createWithData: (title: string, data: unknown) =>
    apiClient.post<PedigreePayload>("/pedigrees/", { title, data }),

  update: (id: string, patch: { title?: string; data?: unknown }) =>
    apiClient.patch<PedigreePayload>(`/pedigrees/${id}/`, patch),

  delete: (id: string) => apiClient.delete(`/pedigrees/${id}/`),
};

// ── Tag presets (the signed-in user's personal tag library) ──────────────────

export interface TagPresetPayload {
  id: string;
  label: string;
  color: string;
  style: "quadrant" | "dot" | "text";
  abbrev: string;
  /** Tag.fill; "" when the tag has none (solid). */
  fill: TagFill | "";
  /** Tag.carrierFill; "" when the tag has none (chosen automatically). */
  carrierFill: TagFill | "";
  /** Tag.kind; "" when the tag has none (a condition). */
  kind: TagKind | "";
  created: string;
}

export const tagPresetApi = {
  list: () => apiClient.get<TagPresetPayload[]>("/tag-presets/"),

  create: (preset: Omit<TagPresetPayload, "id" | "created">) =>
    apiClient.post<TagPresetPayload>("/tag-presets/", preset),

  delete: (id: string) => apiClient.delete(`/tag-presets/${id}/`),
};
