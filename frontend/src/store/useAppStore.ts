import { create } from "zustand";
import { authApi, pedigreeApi, PedigreeMeta, UserInfo } from "../api/client";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { usePedigreeStore } from "./usePedigreeStore";
import { recordRecentPedigree, renameRecentPedigree, forgetRecentPedigree } from "../utils/recentPedigrees";

interface AppState {
  // ── Auth ───────────────────────────────────────────────────────────────────
  user: UserInfo | null;
  isAuthenticated: boolean;

  // ── Pedigree list (only populated for authenticated users) ─────────────────
  pedigrees: PedigreeMeta[];

  // ── Active pedigree ────────────────────────────────────────────────────────
  activePedigreeId: string | null;
  /** Server title of the active pedigree. Set on open for anonymous pedigrees too. */
  activeTitle: string | null;

  // ── Actions ────────────────────────────────────────────────────────────────
  login: (username: string, password: string) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  githubLogin: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  loadPedigrees: () => Promise<void>;
  openPedigree: (id: string) => Promise<void>;
  /**
   * Leave the editor: save unsaved edits, then empty the editing store, so
   * the next pedigree opened starts from a blank canvas instead of flashing
   * the last one.
   */
  closePedigree: () => void;
  createPedigree: (title: string) => Promise<string>;
  createPedigreeFromData: (title: string, data: Pedigree) => Promise<string>;
  deletePedigree: (id: string) => Promise<void>;
  saveActivePedigree: () => Promise<void>;
  /**
   * Save unsaved edits now, as the page is hidden or unloading (#123). Sent
   * with fetch keepalive when the body fits, so it finishes after the tab
   * closes. Returns "keepalive" when that was sent (or one is in flight for
   * these edits), "request" for an ordinary save that a close may cut off,
   * "none" when nothing needed saving.
   */
  flushActivePedigree: () => "keepalive" | "request" | "none";
  /** The last save attempt failed (offline, server error). Cleared by a save that works. */
  lastSaveFailed: boolean;
  renamePedigree: (id: string, title: string) => Promise<void>;
}

/**
 * Bumped by every open and close: an open whose fetch returns after a later
 * open or a close (the user went back to the landing page) is dropped, so it
 * cannot put an old pedigree back in the editor.
 */
let openSeq = 0;

/**
 * Browsers cap keepalive request bodies at 64 KiB in total; stay under it.
 * Larger pedigrees (House Targaryen with notes and tags) use an ordinary
 * request, so the beforeunload prompt asks the user to stay while it runs.
 */
const KEEPALIVE_MAX_BYTES = 60 * 1024;

/** The pedigree object a keepalive save is in flight for, so hide and pagehide send it once. */
let keepaliveFor: Pedigree | null = null;

/** After a save of `saved`: clean only when nothing was edited while it ran. */
function markSaved(saved: Pedigree) {
  if (usePedigreeStore.getState().pedigree === saved) usePedigreeStore.setState({ isDirty: false });
  useAppStore.setState({ lastSaveFailed: false });
}

export const useAppStore = create<AppState>()((set, get) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem("access_token"),
  pedigrees: [],
  activePedigreeId: null,
  activeTitle: null,
  lastSaveFailed: false,

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
    set({ user: null, isAuthenticated: false, pedigrees: [], activePedigreeId: null, activeTitle: null });
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
    const seq = ++openSeq;
    const { data } = await pedigreeApi.get(id);
    if (seq !== openSeq) return;
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
    set({ activePedigreeId: id, activeTitle: data.title ?? null, lastSaveFailed: false });
    recordRecentPedigree(id, data.title ?? "Untitled pedigree");
  },

  closePedigree: () => {
    openSeq++;
    // Reads the pedigree before the reset below; the request carries on.
    get().flushActivePedigree();
    usePedigreeStore.getState().reset();
    set({ activePedigreeId: null, activeTitle: null });
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
    forgetRecentPedigree(id);
    set((state) => ({
      pedigrees: state.pedigrees.filter((p) => p.id !== id),
      activePedigreeId: state.activePedigreeId === id ? null : state.activePedigreeId,
      activeTitle: state.activePedigreeId === id ? null : state.activeTitle,
    }));
  },

  saveActivePedigree: async () => {
    const { activePedigreeId } = get();
    if (!activePedigreeId) return;
    const pedigree = usePedigreeStore.getState().getPedigree();
    try {
      await pedigreeApi.update(activePedigreeId, { data: pedigree });
    } catch (err) {
      set({ lastSaveFailed: true });
      throw err;
    }
    markSaved(pedigree);
  },

  flushActivePedigree: () => {
    const { activePedigreeId } = get();
    const { isDirty, pedigree } = usePedigreeStore.getState();
    if (!activePedigreeId || !isDirty) return "none";
    if (keepaliveFor === pedigree) return "keepalive";
    const body = JSON.stringify({ data: pedigree });
    if (new TextEncoder().encode(body).length > KEEPALIVE_MAX_BYTES) {
      void get().saveActivePedigree().catch(() => {});
      return "request";
    }
    const token = localStorage.getItem("access_token");
    keepaliveFor = pedigree;
    fetch(`/api/pedigrees/${activePedigreeId}/`, {
      method: "PATCH",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    })
      .then(async res => {
        if (res.ok) markSaved(pedigree);
        // An expired token cannot be refreshed here; if the page is still
        // open (only hidden), the ordinary save refreshes it.
        else if (res.status === 401) await get().saveActivePedigree();
        else set({ lastSaveFailed: true });
      })
      .catch(() => set({ lastSaveFailed: true }))
      .finally(() => { if (keepaliveFor === pedigree) keepaliveFor = null; });
    return "keepalive";
  },

  renamePedigree: async (id, title) => {
    const { data } = await pedigreeApi.update(id, { title });
    renameRecentPedigree(id, data.title);
    set(state => ({
      activeTitle: state.activePedigreeId === id ? data.title : state.activeTitle,
      pedigrees: state.pedigrees.map(p =>
        p.id === id
          ? { id: data.id, title: data.title, created: data.created, updated: data.updated }
          : p
      ),
    }));
  },
}));
