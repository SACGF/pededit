import { create } from "zustand";
import { authApi, pedigreeApi, PedigreeMeta, UserInfo } from "../api/client";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { usePedigreeStore } from "./usePedigreeStore";

interface AppState {
  // ── Auth ───────────────────────────────────────────────────────────────────
  user: UserInfo | null;
  isAuthenticated: boolean;

  // ── Pedigree list (only populated for authenticated users) ─────────────────
  pedigrees: PedigreeMeta[];

  // ── Active pedigree ────────────────────────────────────────────────────────
  activePedigreeId: string | null;

  // ── Actions ────────────────────────────────────────────────────────────────
  login: (username: string, password: string) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  githubLogin: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  loadPedigrees: () => Promise<void>;
  openPedigree: (id: string) => Promise<void>;
  createPedigree: (title: string) => Promise<string>;
  createPedigreeFromData: (title: string, data: Pedigree) => Promise<string>;
  deletePedigree: (id: string) => Promise<void>;
  saveActivePedigree: () => Promise<void>;
  renamePedigree: (id: string, title: string) => Promise<void>;
}

export const useAppStore = create<AppState>()((set, get) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem("access_token"),
  pedigrees: [],
  activePedigreeId: null,

  login: async (username, password) => {
    const { data } = await authApi.login(username, password);
    localStorage.setItem("access_token", data.access);
    localStorage.setItem("refresh_token", data.refresh);
    set({ isAuthenticated: true });
    await get().fetchMe();
  },

  googleLogin: async (credential) => {
    const { data } = await authApi.googleLogin(credential);
    localStorage.setItem("access_token", data.access);
    localStorage.setItem("refresh_token", data.refresh);
    set({ isAuthenticated: true });
    await get().fetchMe();
  },

  githubLogin: async (code) => {
    const { data } = await authApi.githubLogin(code);
    localStorage.setItem("access_token", data.access);
    localStorage.setItem("refresh_token", data.refresh);
    set({ isAuthenticated: true });
    await get().fetchMe();
  },

  logout: async () => {
    const { activePedigreeId } = get();
    if (activePedigreeId && usePedigreeStore.getState().isDirty) {
      await get().saveActivePedigree();
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    usePedigreeStore.getState().reset();
    set({ user: null, isAuthenticated: false, pedigrees: [], activePedigreeId: null });
  },

  fetchMe: async () => {
    const { data } = await authApi.me();
    set({ user: data });
  },

  loadPedigrees: async () => {
    if (!get().isAuthenticated) return;
    const { data } = await pedigreeApi.list();
    set({ pedigrees: data });
  },

  openPedigree: async (id) => {
    const { activePedigreeId } = get();
    if (activePedigreeId && activePedigreeId !== id && usePedigreeStore.getState().isDirty) {
      await get().saveActivePedigree();
    }
    const { data } = await pedigreeApi.get(id);
    const pedigree = data.data as Pedigree;
    // Ensure siblingOrder is present (backwards compat)
    if (!pedigree.siblingOrder) {
      pedigree.siblingOrder = { mode: "insertion", affectedFirst: false };
    }
    // Ensure each individual has sibOrder
    pedigree.individuals.forEach((ind, i) => {
      if (ind.sibOrder === undefined) ind.sibOrder = i;
    });
    usePedigreeStore.getState().initialize(pedigree);
    set({ activePedigreeId: id });
  },

  createPedigree: async (title) => {
    const { data } = await pedigreeApi.create(title);
    if (get().isAuthenticated) {
      set((state) => ({ pedigrees: [data, ...state.pedigrees] }));
    }
    return data.id;
  },

  createPedigreeFromData: async (title, data) => {
    const { data: created } = await pedigreeApi.createWithData(title, data);
    if (get().isAuthenticated) {
      set((state) => ({ pedigrees: [created, ...state.pedigrees] }));
    }
    return created.id;
  },

  deletePedigree: async (id) => {
    await pedigreeApi.delete(id);
    set((state) => ({
      pedigrees: state.pedigrees.filter((p) => p.id !== id),
      activePedigreeId: state.activePedigreeId === id ? null : state.activePedigreeId,
    }));
  },

  saveActivePedigree: async () => {
    const { activePedigreeId } = get();
    if (!activePedigreeId) return;
    const pedigree = usePedigreeStore.getState().getPedigree();
    await pedigreeApi.update(activePedigreeId, { data: pedigree });
    usePedigreeStore.setState({ isDirty: false });
  },

  renamePedigree: async (id, title) => {
    const { data } = await pedigreeApi.update(id, { title });
    set(state => ({
      pedigrees: state.pedigrees.map(p =>
        p.id === id
          ? { id: data.id, title: data.title, created: data.created, updated: data.updated }
          : p
      ),
    }));
  },
}));
