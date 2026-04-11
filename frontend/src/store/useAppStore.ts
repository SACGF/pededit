import { create } from "zustand";
import { authApi, pedigreeApi, PedigreeMeta, UserInfo } from "../api/client";
import type { Pedigree } from "@pedigree-editor/layout-engine";

interface AppState {
  // ── Auth ───────────────────────────────────────────────────────────────────
  user: UserInfo | null;
  isAuthenticated: boolean;

  // ── Pedigree list ──────────────────────────────────────────────────────────
  pedigrees: PedigreeMeta[];

  // ── Active pedigree ────────────────────────────────────────────────────────
  activePedigreeId: string | null;
  activePedigree: Pedigree | null;
  isDirty: boolean;

  // ── Actions ────────────────────────────────────────────────────────────────
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  loadPedigrees: () => Promise<void>;
  openPedigree: (id: string) => Promise<void>;
  createPedigree: (title: string) => Promise<string>; // returns new id
  deletePedigree: (id: string) => Promise<void>;
  markDirty: () => void;
  saveActivePedigree: () => Promise<void>;
}

export const useAppStore = create<AppState>()((set, get) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem("access_token"),
  pedigrees: [],
  activePedigreeId: null,
  activePedigree: null,
  isDirty: false,

  login: async (username, password) => {
    const { data } = await authApi.login(username, password);
    localStorage.setItem("access_token", data.access);
    localStorage.setItem("refresh_token", data.refresh);
    set({ isAuthenticated: true });
    await get().fetchMe();
  },

  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({ user: null, isAuthenticated: false, pedigrees: [], activePedigree: null, activePedigreeId: null });
  },

  fetchMe: async () => {
    const { data } = await authApi.me();
    set({ user: data });
  },

  loadPedigrees: async () => {
    const { data } = await pedigreeApi.list();
    set({ pedigrees: data });
  },

  openPedigree: async (id) => {
    const { data } = await pedigreeApi.get(id);
    set({
      activePedigreeId: id,
      activePedigree: data.data as Pedigree,
      isDirty: false,
    });
  },

  createPedigree: async (title) => {
    const { data } = await pedigreeApi.create(title);
    set((state) => ({ pedigrees: [data, ...state.pedigrees] }));
    return data.id;
  },

  deletePedigree: async (id) => {
    await pedigreeApi.delete(id);
    set((state) => ({
      pedigrees: state.pedigrees.filter((p) => p.id !== id),
      activePedigreeId: state.activePedigreeId === id ? null : state.activePedigreeId,
      activePedigree: state.activePedigreeId === id ? null : state.activePedigree,
    }));
  },

  markDirty: () => set({ isDirty: true }),

  saveActivePedigree: async () => {
    const { activePedigreeId, activePedigree } = get();
    if (!activePedigreeId || !activePedigree) return;
    await pedigreeApi.update(activePedigreeId, { data: activePedigree });
    set({ isDirty: false });
  },
}));
