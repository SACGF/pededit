import axios from "axios";

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

// On 401, try to refresh the token once
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem("refresh_token");
      if (!refresh) {
        // No refresh token — clear any stale tokens and go to landing
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/";
        return Promise.reject(error);
      }

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
        const newToken = await tokenRefreshInProgress;
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      } catch {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/";
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth endpoints ────────────────────────────────────────────────────────────

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface UserInfo {
  id: number;
  username: string;
  email: string;
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
  register: (username: string, email: string, password: string) =>
    apiClient.post<UserInfo>("/auth/register/", { username, email, password }),

  login: (username: string, password: string) =>
    apiClient.post<TokenPair>("/auth/token/", { username, password }),

  me: () => apiClient.get<UserInfo>("/auth/me/"),
};

export const pedigreeApi = {
  list: () => apiClient.get<PedigreeMeta[]>("/pedigrees/"),

  get: (id: string) => apiClient.get<PedigreePayload>(`/pedigrees/${id}/`),

  create: (title: string) =>
    apiClient.post<PedigreePayload>("/pedigrees/", {
      title,
      data: { individuals: [], partnerships: [], parentOf: {} },
    }),

  createWithData: (title: string, data: unknown) =>
    apiClient.post<PedigreePayload>("/pedigrees/", { title, data }),

  update: (id: string, patch: { title?: string; data?: unknown }) =>
    apiClient.patch<PedigreePayload>(`/pedigrees/${id}/`, patch),

  delete: (id: string) => apiClient.delete(`/pedigrees/${id}/`),
};
