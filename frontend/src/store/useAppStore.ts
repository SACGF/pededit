import { create } from "zustand";
import { authApi, pedigreeApi, PedigreeMeta, UserInfo, setSignedOutHandler } from "../api/client";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { usePedigreeStore } from "./usePedigreeStore";
import { recordRecentPedigree, renameRecentPedigree, forgetRecentPedigree } from "../utils/recentPedigrees";
import type { ExamplePedigree } from "../data/examples";

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
  /**
   * A built-in example drawn from the bundle with no saved copy yet
   * (`/example/<slug>`, #151). The first edit saves it as the visitor's own
   * pedigree, which sets `activePedigreeId` and clears this.
   */
  example: { slug: string; label: string } | null;

  // ── Actions ────────────────────────────────────────────────────────────────
  googleLogin: (credential: string) => Promise<void>;
  githubLogin: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Delete the account on the server: the server deletes its pedigrees
   * and My library with it. Then forget those pedigrees in Recent on this
   * device, since their links no longer work, and sign out.
   */
  deleteAccount: () => Promise<void>;
  fetchMe: () => Promise<void>;
  loadPedigrees: () => Promise<void>;
  openPedigree: (id: string) => Promise<void>;
  /** Draw an example in the editor without saving anything. */
  openExample: (example: ExamplePedigree) => void;
  /**
   * Leave the editor: save unsaved edits, then empty the editing store, so
   * the next pedigree opened starts from a blank canvas instead of flashing
   * the last one.
   */
  closePedigree: () => void;
  createPedigree: (title: string) => Promise<string>;
  createPedigreeFromData: (title: string, data: Pedigree) => Promise<string>;
  deletePedigree: (id: string) => Promise<void>;
  /** Save the edits; for an open example, create the visitor's copy first. */
  saveActivePedigree: () => Promise<void>;
  /**
   * Save unsaved edits now, as the page is hidden or unloading. Sent
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

/** Old saves may lack the sibling order fields; fill them in place. */
function normalise(pedigree: Pedigree): Pedigree {
  if (!pedigree.siblingOrder) {
    pedigree.siblingOrder = { mode: "insertion", affectedFirst: false };
  }
  pedigree.individuals.forEach((ind, i) => {
    if (ind.sibOrder === undefined) ind.sibOrder = i;
  });
  return pedigree;
}

/** The create of an open example's copy in flight, so every save while it runs waits for the one request. */
let copyRequest: Promise<void> | null = null;

/**
 * The pedigree the editor held when it was closed while a copy was being
 * created, so edits made during that request are not lost.
 */
let closedDuringCopy: Pedigree | null = null;

async function createExampleCopy() {
  const { example, isAuthenticated } = useAppStore.getState();
  if (!example) return;
  const pedigree = usePedigreeStore.getState().getPedigree();
  const seq = openSeq;
  let created: PedigreeMeta;
  try {
    ({ data: created } = await pedigreeApi.createWithData(example.label, pedigree));
  } catch (err) {
    useAppStore.setState({ lastSaveFailed: true });
    throw err;
  }
  recordRecentPedigree(created.id, created.title);
  if (isAuthenticated) useAppStore.setState(s => ({ pedigrees: [created, ...s.pedigrees] }));
  if (seq !== openSeq) {
    // The editor was closed while the copy was being made: save what it held then.
    const last = closedDuringCopy;
    closedDuringCopy = null;
    if (last && last !== pedigree) await pedigreeApi.update(created.id, { data: last });
    return;
  }
  useAppStore.setState({ activePedigreeId: created.id, activeTitle: created.title, example: null });
  markSaved(pedigree);
}

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
  example: null,
  lastSaveFailed: false,

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
    const { activePedigreeId, example } = get();
    if ((activePedigreeId || example) && usePedigreeStore.getState().isDirty) {
      await get().saveActivePedigree();
    }
    // The account's pedigrees leave "Recent on this device": their links no
    // longer open, and their titles would stay for the next person here.
    let owned: { id: string }[] = get().pedigrees;
    try { owned = (await pedigreeApi.list()).data; } catch { /* offline: what the list last held */ }
    for (const p of owned) forgetRecentPedigree(p.id);
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    usePedigreeStore.getState().reset();
    set({ user: null, isAuthenticated: false, pedigrees: [], activePedigreeId: null, activeTitle: null, example: null });
  },

  deleteAccount: async () => {
    // Listed first: afterwards there is no account to ask.
    const { data: owned } = await pedigreeApi.list();
    await authApi.deleteAccount();
    for (const p of owned) forgetRecentPedigree(p.id);
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    usePedigreeStore.getState().reset();
    set({ user: null, isAuthenticated: false, pedigrees: [], activePedigreeId: null, activeTitle: null, example: null });
  },

  fetchMe: async () => {
    const { data } = await authApi.me();
    set({ user: data });
  },

  loadPedigrees: async () => {
    if (!get().isAuthenticated) return;
    try {
      const { data } = await pedigreeApi.list();
      set({ pedigrees: data });
    } catch (err) {
      // The token was rejected and the page is now signed out (#191): nothing to list.
      if (!get().isAuthenticated) return;
      throw err;
    }
  },

  openPedigree: async (id) => {
    const { activePedigreeId, example } = get();
    if ((example || (activePedigreeId && activePedigreeId !== id)) && usePedigreeStore.getState().isDirty) {
      await get().saveActivePedigree();
    }
    const seq = ++openSeq;
    const { data } = await pedigreeApi.get(id);
    if (seq !== openSeq) return;
    usePedigreeStore.getState().initialize(normalise(data.data as Pedigree));
    set({ activePedigreeId: id, activeTitle: data.title ?? null, example: null, lastSaveFailed: false });
    recordRecentPedigree(id, data.title ?? "Untitled pedigree");
  },

  openExample: (ex) => {
    openSeq++;
    usePedigreeStore.getState().initialize(normalise(structuredClone(ex.data)));
    set({ activePedigreeId: null, activeTitle: ex.label, example: { slug: ex.slug, label: ex.label }, lastSaveFailed: false });
  },

  closePedigree: () => {
    if (copyRequest) closedDuringCopy = usePedigreeStore.getState().pedigree;
    // Reads the pedigree before the reset below; the request carries on.
    // Before the bump, so an example copy this starts knows it was closed.
    get().flushActivePedigree();
    openSeq++;
    usePedigreeStore.getState().reset();
    set({ activePedigreeId: null, activeTitle: null, example: null });
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
    const { activePedigreeId, example } = get();
    if (!activePedigreeId && example) {
      copyRequest ??= createExampleCopy().finally(() => { copyRequest = null; });
      await copyRequest;
      return;
    }
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
    const { activePedigreeId, example } = get();
    const { isDirty, pedigree } = usePedigreeStore.getState();
    if (!isDirty) return "none";
    if (!activePedigreeId) {
      if (!example) return "none";
      // The copy's id is only known from the answer, so this cannot be a
      // keepalive sent and forgotten.
      void get().saveActivePedigree().catch(() => {});
      return "request";
    }
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

// Tokens the server rejected and could not refresh were dropped (#191): show
// the page signed out. The pedigree open stays open; it was opened anonymously.
setSignedOutHandler(() => useAppStore.setState({ user: null, isAuthenticated: false, pedigrees: [] }));
