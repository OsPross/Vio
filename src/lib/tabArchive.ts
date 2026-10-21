/**
 * Auto-archive idle tabs — close + persist to userData/tab-archive.json.
 * Works with discarded (sleeping) tabs; Tor/private never written.
 */

import { t } from '../i18n/core';
import { HOME_URL, TOR_HOME_URL, useStore, type Tab } from '../store';
import { uid } from '../store/uid';
import { captureTabScrollY, tabHasDirtyForm } from './tabDiscard';
import {
  dropTabSessionHistory,
  exportTabSessionHistory,
  importTabSessionHistory,
} from './tabSessionHistory';

export type ArchivedTabEntry = {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  archivedAt: number;
  scrollY?: number;
  session?: { stack: string[]; index: number };
  navHistory?: Tab['navHistory'];
};

export type ArchiveSkipReason =
  | 'active'
  | 'pinned'
  | 'tor'
  | 'private'
  | 'internal'
  | 'audio'
  | 'sideapp'
  | null;

/** Allowed setting values (0 = off). Default 12. */
export const ARCHIVE_HOUR_OPTIONS = [0, 6, 12, 24] as const;

export function normalizeArchiveHours(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v <= 6) return 6;
  if (v <= 12) return 12;
  return 24;
}

/** Idle threshold in ms. Dev: `localStorage.vio-archive-ms` or `window.__VIO_ARCHIVE_MS` (e.g. 60000). */
export function archiveIdleMs(hours: number): number {
  try {
    const meta = import.meta as { env?: { DEV?: boolean } };
    if (meta.env?.DEV && typeof window !== 'undefined') {
      const w = (window as unknown as { __VIO_ARCHIVE_MS?: unknown }).__VIO_ARCHIVE_MS;
      const fromWin = typeof w === 'number' ? w : Number(w);
      if (Number.isFinite(fromWin) && fromWin > 0) return fromWin;
      const ls = localStorage.getItem('vio-archive-ms');
      const fromLs = ls ? Number(ls) : NaN;
      if (Number.isFinite(fromLs) && fromLs > 0) return fromLs;
    }
  } catch {
    /* node tests / no vite env */
  }
  return Math.max(1, hours) * 3_600_000;
}

export function archivePollMs(idleMs: number): number {
  if (idleMs < 120_000) return Math.min(5_000, Math.max(1_000, Math.floor(idleMs / 4)));
  if (idleMs < 3_600_000) return 60_000;
  return 5 * 60_000;
}

function urlsMatchSideApp(tabUrl: string, sideUrl: string): boolean {
  try {
    const a = new URL(tabUrl);
    const b = new URL(sideUrl);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return tabUrl === sideUrl;
  }
}

export function archiveSkipReason(
  tab: Tab,
  activeId: string,
  opts: { audioPlaying?: boolean; sideAppUrls?: string[] },
): ArchiveSkipReason {
  if (tab.id === activeId) return 'active';
  if (tab.pinned) return 'pinned';
  if (tab.mode === 'tor') return 'tor';
  if (tab.mode === 'private') return 'private';
  const url = tab.url || '';
  if (
    url === HOME_URL ||
    url === TOR_HOME_URL ||
    url.startsWith('about:') ||
    url.startsWith('djxxr://') ||
    /\.onion\b/i.test(url)
  )
    return 'internal';
  if (opts.audioPlaying) return 'audio';
  const sides = opts.sideAppUrls || [];
  if (sides.some((s) => urlsMatchSideApp(url, s))) return 'sideapp';
  return null;
}

/**
 * Archive one tab: persist entry, close without closedTabs stack.
 * Sleeping tabs OK (no dirty-form check when already discarded).
 */
export async function archiveTabNow(
  tabId: string,
  opts?: { audioPlaying?: boolean },
): Promise<boolean> {
  const st = useStore.getState();
  const tab = st.tabs.find((t) => t.id === tabId);
  if (!tab) return false;
  const sideAppUrls = st.sideApps.map((a) => a.url);
  const skip = archiveSkipReason(tab, st.activeId, {
    audioPlaying: Boolean(opts?.audioPlaying),
    sideAppUrls,
  });
  if (skip) return false;
  if (!tab.discarded && (await tabHasDirtyForm(tabId))) return false;

  let scrollY = tab.scrollY;
  if (!tab.discarded) {
    const y = await captureTabScrollY(tabId);
    if (y != null) scrollY = y;
  }

  const session = exportTabSessionHistory(tabId) || undefined;
  const entry = {
    url: tab.url,
    title: tab.title || t('tabs.untitled'),
    favicon: tab.favicon,
    archivedAt: Date.now(),
    scrollY,
    session,
    navHistory: tab.navHistory || null,
  };

  const res = await window.shell?.tabArchiveAdd?.(entry);
  if (!res?.ok) return false;

  dropTabSessionHistory(tabId);
  st.closeTab(tabId, { skipClosedStack: true });
  return true;
}

/** Restore archived entry as a new normal tab; remove from archive file. */
export async function restoreArchivedTab(entry: ArchivedTabEntry): Promise<string | null> {
  if (!entry?.url || /\.onion\b/i.test(entry.url) || entry.url.startsWith('about:')) return null;
  const id = uid();
  const tab: Tab = {
    id,
    url: entry.url,
    title: entry.title || t('tabs.untitled'),
    favicon: entry.favicon,
    pinned: false,
    navHistory: entry.navHistory || null,
    lastActiveAt: Date.now(),
    discarded: true,
    scrollY: entry.scrollY,
    mode: 'normal',
  };
  importTabSessionHistory(id, entry.session);
  useStore.setState((s) => ({
    tabs: [...s.tabs, tab],
    activeId: id,
    view: 'browser',
  }));
  useStore.getState().setActive(id);
  void window.shell?.tabArchiveRemove?.(entry.id);
  return id;
}

export async function restoreAllArchivedTabs(): Promise<number> {
  const listed = await window.shell?.tabArchiveList?.();
  const entries = listed?.entries || [];
  let n = 0;
  // Restore oldest first so newest ends active-ish at end
  const ordered = [...entries].sort((a, b) => a.archivedAt - b.archivedAt);
  for (const e of ordered) {
    const ok = await restoreArchivedTab(e as ArchivedTabEntry);
    if (ok) n += 1;
  }
  return n;
}

export async function clearTabArchive(): Promise<void> {
  await window.shell?.tabArchiveClear?.();
}
