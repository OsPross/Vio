/**
 * Tab discard (sleep) helpers — unmount webview to free RAM.
 * Session history stays in tabSessionHistory.ts; cookies stay on persist:main.
 */

import { HOME_URL, TOR_HOME_URL, useStore, type Tab } from '../store';

export type DiscardGuest = {
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
};

const guests = new Map<string, DiscardGuest>();

export function registerDiscardGuest(tabId: string, el: DiscardGuest | null): void {
  if (!tabId) return;
  if (!el) guests.delete(tabId);
  else guests.set(tabId, el);
}

const FORM_DIRTY_JS = `(() => {
  try {
    for (const el of document.querySelectorAll('input,textarea,select')) {
      if (el instanceof HTMLInputElement) {
        const t = el.type;
        if (
          el.disabled ||
          t === 'hidden' ||
          t === 'submit' ||
          t === 'button' ||
          t === 'image' ||
          t === 'reset' ||
          t === 'checkbox' ||
          t === 'radio' ||
          t === 'file' ||
          t === 'range' ||
          t === 'color'
        )
          continue;
        if (el.value !== el.defaultValue) return true;
      } else if (el instanceof HTMLTextAreaElement) {
        if (!el.disabled && el.value !== el.defaultValue) return true;
      } else if (el instanceof HTMLSelectElement) {
        if (el.disabled) continue;
        for (const o of el.options) {
          if (o.selected !== o.defaultSelected) return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
})()`;

const SCROLL_Y_JS = `(() => {
  try {
    return Math.round(window.scrollY || document.documentElement.scrollTop || 0);
  } catch {
    return 0;
  }
})()`;

export async function tabHasDirtyForm(tabId: string): Promise<boolean> {
  const el = guests.get(tabId);
  if (!el) return false;
  try {
    return Boolean(await el.executeJavaScript(FORM_DIRTY_JS, false));
  } catch {
    return false;
  }
}

export async function captureTabScrollY(tabId: string): Promise<number | undefined> {
  const el = guests.get(tabId);
  if (!el) return undefined;
  try {
    const y = await el.executeJavaScript(SCROLL_Y_JS, false);
    return typeof y === 'number' && Number.isFinite(y) && y > 0 ? Math.round(y) : undefined;
  } catch {
    return undefined;
  }
}

export async function restoreTabScrollY(el: DiscardGuest, y: number): Promise<void> {
  if (!Number.isFinite(y) || y <= 0) return;
  const n = Math.round(y);
  try {
    await el.executeJavaScript(
      `(() => { try { window.scrollTo(0, ${n}); } catch (e) {} })()`,
      false,
    );
  } catch {
    /* */
  }
}

/** Idle threshold in ms. Dev: `localStorage.vio-discard-ms` or `window.__VIO_DISCARD_MS` (e.g. 60000). */
export function discardIdleMs(minutes: number): number {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    try {
      const w = (window as unknown as { __VIO_DISCARD_MS?: unknown }).__VIO_DISCARD_MS;
      const fromWin = typeof w === 'number' ? w : Number(w);
      if (Number.isFinite(fromWin) && fromWin > 0) return fromWin;
      const ls = localStorage.getItem('vio-discard-ms');
      const fromLs = ls ? Number(ls) : NaN;
      if (Number.isFinite(fromLs) && fromLs > 0) return fromLs;
    } catch {
      /* */
    }
  }
  return Math.max(1, minutes) * 60_000;
}

export function discardPollMs(idleMs: number): number {
  if (idleMs < 120_000) return Math.min(5_000, Math.max(1_000, Math.floor(idleMs / 4)));
  return 30_000;
}

export type DiscardSkipReason =
  | 'active'
  | 'already'
  | 'tor'
  | 'private'
  | 'pinned'
  | 'internal'
  | 'audio'
  | null;

export function discardSkipReason(
  tab: Tab,
  activeId: string,
  opts: { keepPinned: boolean; audioPlaying?: boolean },
): DiscardSkipReason {
  if (tab.id === activeId) return 'active';
  if (tab.discarded) return 'already';
  if (tab.mode === 'tor') return 'tor';
  if (tab.mode === 'private') return 'private';
  if (opts.keepPinned && tab.pinned) return 'pinned';
  const url = tab.url || '';
  if (
    url === HOME_URL ||
    url === TOR_HOME_URL ||
    url.startsWith('about:') ||
    url.startsWith('djxxr://')
  )
    return 'internal';
  if (opts.audioPlaying) return 'audio';
  return null;
}

/** Allowed preset values for settings UI (0 = off). */
export const DISCARD_MINUTE_OPTIONS = [0, 15, 30, 60] as const;

export function normalizeDiscardMinutes(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v <= 15) return 15;
  if (v <= 30) return 30;
  return 60;
}

/**
 * Manual sleep from tab menu / CPU hint.
 * Blocks Tor/private/active/internal/audio/dirty forms; pinned allowed.
 */
export async function sleepTabNow(
  tabId: string,
  opts?: { audioPlaying?: boolean },
): Promise<boolean> {
  const st = useStore.getState();
  const tab = st.tabs.find((t) => t.id === tabId);
  if (!tab) return false;
  const skip = discardSkipReason(tab, st.activeId, {
    keepPinned: false,
    audioPlaying: Boolean(opts?.audioPlaying),
  });
  if (skip && skip !== 'pinned') return false;
  if (await tabHasDirtyForm(tabId)) return false;
  const scrollY = await captureTabScrollY(tabId);
  st.updateTab(tabId, {
    discarded: true,
    ...(scrollY != null ? { scrollY } : {}),
  });
  return true;
}
