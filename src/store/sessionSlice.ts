import type { StateCreator } from 'zustand';
import { t } from '../i18n/core';
import { HOME_URL, MAX_CLOSED_TABS, MAX_CLOSED_WINDOWS } from './constants';
import { isPrivateTab, isTorTab, sortTabsPinnedFirst } from './tabHelpers';
import type { StoreState } from './storeState';
import { toClosedTab } from './toClosedTab';
import type { ClosedTab, ClosedWindow, Tab } from './types';
import { uid } from './uid';

export type SessionSlice = {
  /** Recently closed normal tabs (Tor never here) — mirrored to session.json */
  closedTabs: ClosedTab[];
  /** Closed windows (secondary) for Ctrl+Shift+T */
  closedWindows: ClosedWindow[];
  /** Session bootstrap done */
  sessionReady: boolean;

  reopenClosedTab: () => string | null;
  pushClosedWindow: () => void;
  setClosedWindows: (wins: ClosedWindow[]) => void;
  restoreSessionTabs: (tabs: Tab[], activeId: string | null, closedTabs?: ClosedTab[]) => void;
  setClosedTabs: (closed: ClosedTab[]) => void;
  setSessionReady: (v: boolean) => void;
};

export const createSessionSlice: StateCreator<StoreState, [], [], SessionSlice> = (set, get) => ({
  closedTabs: [],
  closedWindows: [],
  sessionReady: false,

  reopenClosedTab: () => {
    const { closedTabs, tabs } = get();
    const entry = closedTabs[0];
    if (entry) {
      const id = uid();
      const insertAt = Math.min(Math.max(0, entry.index), tabs.length);
      const tab: Tab = {
        id,
        url: entry.url,
        title: entry.title || t('tabs.untitled'),
        favicon: entry.favicon,
        pinned: Boolean(entry.pinned),
        navHistory: entry.navHistory || null,
        lastActiveAt: Date.now(),
        discarded: true,
        mode: 'normal',
      };
      const next = [...tabs];
      next.splice(insertAt, 0, tab);
      set({
        tabs: sortTabsPinnedFirst(next),
        activeId: id,
        closedTabs: closedTabs.slice(1),
        view: 'browser',
      });
      get().setActive(id);
      return id;
    }
    // Whole window — from shared session store
    void window.shell?.sessionPopClosedWindow?.().then((win) => {
      if (!win?.tabs?.length) return;
      void window.shell?.newWindow?.({
        restoreTabs: win.tabs.map((t) => ({
          url: t.url,
          title: t.title,
          favicon: t.favicon,
          pinned: t.pinned,
          navHistory: t.navHistory as Tab['navHistory'],
        })),
      });
    });
    return 'window';
  },
  pushClosedWindow: () => {
    const { tabs } = get();
    const entries = tabs
      .map((t, i) => (!isTorTab(t) && !isPrivateTab(t) ? toClosedTab(t, i) : null))
      .filter(Boolean) as ClosedTab[];
    if (!entries.length) return;
    void window.shell?.sessionPushClosedWindow?.(entries);
  },
  setClosedWindows: (wins) => set({ closedWindows: (wins || []).slice(0, MAX_CLOSED_WINDOWS) }),
  restoreSessionTabs: (incoming, activeId, closed) => {
    const tabs = sortTabsPinnedFirst(
      incoming
        .filter((t) => t && t.mode !== 'tor')
        .map((t) => ({
          ...t,
          mode: (t.mode === 'private' ? 'private' : 'normal') as Tab['mode'],
          partition: undefined,
          discarded: true,
          lastActiveAt: t.lastActiveAt || Date.now(),
        })),
    );
    if (!tabs.length) {
      const nid = uid();
      set({
        tabs: [{ id: nid, title: t('pages.newTab'), url: HOME_URL, mode: 'normal', pinned: false }],
        activeId: nid,
        closedTabs: (closed || []).slice(0, MAX_CLOSED_TABS),
        sessionReady: true,
      });
      return;
    }
    const aid =
      (activeId && tabs.some((t) => t.id === activeId) ? activeId : null) ||
      tabs.find((t) => t.pinned)?.id ||
      tabs[0].id;
    set({
      tabs: tabs.map((t) => (t.id === aid ? { ...t, discarded: false } : t)),
      activeId: aid,
      closedTabs: (closed || [])
        .filter((c) => c && !/\.onion\b/i.test(c.url))
        .slice(0, MAX_CLOSED_TABS),
      sessionReady: true,
      view: 'browser',
    });
  },
  setClosedTabs: (closed) => set({ closedTabs: closed.slice(0, MAX_CLOSED_TABS) }),
  setSessionReady: (v) => set({ sessionReady: v }),
});
