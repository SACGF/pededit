/**
 * "Recent on this device" (#16): the pedigrees opened in this browser, kept in
 * localStorage so an anonymous user who loses the link can find a pedigree
 * again from the landing page. Per browser, not per account; nothing here
 * reaches the server.
 *
 * Framework-free so it can be unit tested with a fake storage. Every call
 * tolerates a missing or throwing storage (private windows, blocked site
 * data) by behaving as if the list were empty.
 */

export const RECENT_PEDIGREES_KEY = "recentPedigrees";

/** How many entries to keep. Older ones fall off the end. */
export const RECENT_PEDIGREES_LIMIT = 20;

export interface RecentPedigree {
  id: string;
  title: string;
  /** ISO timestamp of the last time it was opened here. */
  openedAt: string;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isEntry(v: unknown): v is RecentPedigree {
  return typeof v === "object" && v !== null
    && typeof (v as RecentPedigree).id === "string" && (v as RecentPedigree).id !== ""
    && typeof (v as RecentPedigree).title === "string"
    && typeof (v as RecentPedigree).openedAt === "string";
}

/** Most recently opened first. */
export function listRecentPedigrees(storage: StorageLike | null = defaultStorage()): RecentPedigree[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_PEDIGREES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function write(entries: RecentPedigree[], storage: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.setItem(RECENT_PEDIGREES_KEY, JSON.stringify(entries));
  } catch {
    // Quota or blocked storage: the list is a convenience, so give up quietly.
  }
}

/** Move (or add) a pedigree to the front of the list. */
export function recordRecentPedigree(
  id: string,
  title: string,
  storage: StorageLike | null = defaultStorage(),
  now: () => Date = () => new Date(),
): void {
  if (!id) return;
  const rest = listRecentPedigrees(storage).filter(e => e.id !== id);
  const entry: RecentPedigree = { id, title, openedAt: now().toISOString() };
  write([entry, ...rest].slice(0, RECENT_PEDIGREES_LIMIT), storage);
}

/** Update the title of a listed pedigree without changing its place. */
export function renameRecentPedigree(id: string, title: string, storage: StorageLike | null = defaultStorage()): void {
  const entries = listRecentPedigrees(storage);
  if (!entries.some(e => e.id === id)) return;
  write(entries.map(e => (e.id === id ? { ...e, title } : e)), storage);
}

/** Drop a pedigree from the list (deleted, not found, or dismissed by the user). */
export function forgetRecentPedigree(id: string, storage: StorageLike | null = defaultStorage()): void {
  const entries = listRecentPedigrees(storage);
  if (!entries.some(e => e.id === id)) return;
  write(entries.filter(e => e.id !== id), storage);
}
