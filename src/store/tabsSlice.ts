import type { StateCreator } from 'zustand';
import { t } from '../i18n/core';
import { getWindowPartition } from '../lib/windowBoot';
import { HOME_URL, MAX_CLOSED_TABS, TOR_HOME_URL } from './constants';
import { isTorTab, sortTabsPinnedFirst } from './tabHelpers';
import type { StoreState } from './storeState';
import { toClosedTab } from './toClosedTab';
import type { ClosedTab, Tab } from './types';
import { uid } from './uid';

export type TabsSlice = {
  tabs: Tab[];
  activeId: string;

  newTab: (
    url?: string,
    opts?: { background?: boolean; besideId?: string; private?: boolean },
  ) => void;
  /** Create a Tor-mode tab bound to ephemeral partition from main */
  newTorTab: (opts: { url?: string; partition: string; background?: boolean }) => void;
  newPrivateTab: (url?: string) => void;
  newTabBeside: (besideId: string, url?: string) => void;
  muteTab: (id: string, muted?: boolean) => void;
  /** skipClosedStack: archive close — do not push Ctrl+Shift+T stack */
  closeTab: (id: string, opts?: { skipClosedStack?: boolean }) => void;
  setActive: (id: string) => void;
  updateTab: (id: string, patch: Partial<Tab>) => void;
  pinTab: (id: string, pinned?: boolean) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  duplicateTab: (id: string) => void;
};

export const createTabsSlice: StateCreator<StoreState, [], [], TabsSlice> = (set, get) => {
  const first = uid();
  return {
    tabs: [{ id: first, title: t('pages.newTab'), url: HOME_URL }],
    activeId: first,

    newTab: (url, opts) => {
      const id = uid();
      const s = get().settings;
      const u = url ?? (s.newTabIsSearch ? HOME_URL : s.homepage);
      const background = Boolean(opts?.background);
      const asPrivate = Boolean(opts?.private);
      const besideId = opts?.besideId;
      set((st) => {
        const tab: Tab = {
          id,
          title:
            u === HOME_URL
              ? asPrivate
                ? t('pages.newPrivateTab')
                : t('pages.newTab')
              : '…',
          url: u,
          lastActiveAt: Date.now(),
          discarded: false,
          mode: asPrivate ? 'private' : 'normal',
          pinned: false,
          muted: false,
        };
        const tabs = [...st.tabs];
        if (besideId) {
          const idx = tabs.findIndex((t) => t.id === besideId);
          if (idx >= 0) tabs.splice(idx + 1, 0, tab);
          else tabs.push(tab);
        } else {
          tabs.push(tab);
        }
        return {
          tabs: sortTabsPinnedFirst(tabs),
          activeId: background ? st.activeId : id,
          view: 'browser' as const,
        };
      });
    },
    newPrivateTab: (url) => {
      const part = getWindowPartition();
      if (!part || !/^private-/i.test(part)) {
        console.error(
          '[store] newPrivateTab refused — no window private partition; open a private window instead',
        );
        void window.shell?.newWindow?.({ boot: 'private' });
        return;
      }
      const id = uid();
      const s = get().settings;
      const u = url ?? (s.newTabIsSearch ? HOME_URL : s.homepage);
      set((st) => ({
        tabs: sortTabsPinnedFirst([
          ...st.tabs,
          {
            id,
            title: u === HOME_URL ? t('pages.newPrivateTab') : '…',
            url: u,
            lastActiveAt: Date.now(),
            discarded: false,
            mode: 'private' as const,
            partition: part,
            pinned: false,
            muted: false,
          },
        ]),
        activeId: id,
        view: 'browser' as const,
      }));
    },
    newTabBeside: (besideId, url) => {
      get().newTab(url, { besideId });
    },
    muteTab: (id, muted) =>
      set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, muted: muted ?? !t.muted } : t)),
      })),
    newTorTab: ({ url, partition, background }) => {
      const id = uid();
      const u = url ?? TOR_HOME_URL;
      set((st) => ({
        tabs: [
          ...st.tabs,
          {
            id,
            title: t('pages.tor'),
            url: u,
            lastActiveAt: Date.now(),
            discarded: false,
            mode: 'tor' as const,
            partition,
            pinned: false,
          },
        ],
        activeId: background ? st.activeId : id,
        view: 'browser' as const,
      }));
    },
    closeTab: (id, opts) => {
      const { tabs, activeId, closedTabs } = get();
      const idx = tabs.findIndex((t) => t.id === id);
      const closing = idx >= 0 ? tabs[idx] : null;
      let nextClosed = closedTabs;
      if (closing && !isTorTab(closing) && !opts?.skipClosedStack) {
        const entry = toClosedTab(closing, idx);
        if (entry) nextClosed = [entry, ...closedTabs].slice(0, MAX_CLOSED_TABS);
      }
      if (tabs.length <= 1) {
        // Closing last tab: if pinned-only policy — still replace; keep closed stack
        if (closing?.pinned && tabs.length === 1) {
          // allow closing last pinned → new home
        }
        const nid = uid();
        set({
          tabs: [
            { id: nid, title: t('pages.newTab'), url: HOME_URL, mode: 'normal', pinned: false },
          ],
          activeId: nid,
          closedTabs: nextClosed,
        });
        return;
      }
      const next = tabs.filter((t) => t.id !== id);
      const active = activeId === id ? next[Math.max(0, idx - 1)].id : activeId;
      set({ tabs: sortTabsPinnedFirst(next), activeId: active, closedTabs: nextClosed });
    },
    setActive: (id) =>
      set((s) => ({
        activeId: id,
        view: 'browser',
        tabs: s.tabs.map((t) =>
          t.id === id ? { ...t, lastActiveAt: Date.now(), discarded: false } : t,
        ),
      })),
    updateTab: (id, patch) =>
      set((s) => {
        const tab = s.tabs.find((t) => t.id === id);
        if (!tab) return s;
        let changed = false;
        for (const key of Object.keys(patch) as (keyof Tab)[]) {
          const next = patch[key];
          const prev = tab[key];
          if (key === 'loadError' || key === 'navHistory') {
            if (JSON.stringify(prev ?? null) !== JSON.stringify(next ?? null)) {
              changed = true;
              break;
            }
            continue;
          }
          if (prev !== next) {
            changed = true;
            break;
          }
        }
        if (!changed) return s;
        return {
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        };
      }),
    pinTab: (id, pinned) =>
      set((s) => {
        const nextPinned = pinned ?? !s.tabs.find((t) => t.id === id)?.pinned;
        const tabs = sortTabsPinnedFirst(
          s.tabs.map((t) => (t.id === id && t.mode !== 'tor' ? { ...t, pinned: nextPinned } : t)),
        );
        return { tabs };
      }),
    closeOtherTabs: (id) => {
      const { tabs, closedTabs } = get();
      const keep = tabs.find((t) => t.id === id);
      if (!keep) return;
      const extras = tabs.filter((t) => t.id !== id && !t.pinned);
      const added: ClosedTab[] = [];
      extras.forEach((t) => {
        if (isTorTab(t)) return; // close Tor tabs without stacking
        const c = toClosedTab(t, tabs.indexOf(t));
        if (c) added.push(c);
      });
      // Also close non-pinned Tor others without adding to stack
      const nextTabs = tabs.filter((t) => t.id === id || t.pinned);
      set({
        tabs: sortTabsPinnedFirst(nextTabs.length ? nextTabs : [keep]),
        activeId: id,
        closedTabs: [...added, ...closedTabs].slice(0, MAX_CLOSED_TABS),
      });
    },
    closeTabsToRight: (id) => {
      const { tabs, closedTabs } = get();
      const idx = tabs.findIndex((t) => t.id === id);
      if (idx < 0) return;
      const right = tabs.slice(idx + 1).filter((t) => !t.pinned);
      const added: ClosedTab[] = [];
      right.forEach((t) => {
        if (isTorTab(t)) return;
        const c = toClosedTab(t, tabs.indexOf(t));
        if (c) added.push(c);
      });
      const rightIds = new Set(right.map((t) => t.id));
      set({
        tabs: sortTabsPinnedFirst(tabs.filter((t) => !rightIds.has(t.id))),
        closedTabs: [...added, ...closedTabs].slice(0, MAX_CLOSED_TABS),
      });
    },
    duplicateTab: (id) => {
      const { tabs } = get();
      const src = tabs.find((t) => t.id === id);
      if (!src || isTorTab(src)) return;
      const nid = uid();
      const idx = tabs.findIndex((t) => t.id === id);
      const copy: Tab = {
        ...src,
        id: nid,
        pinned: false,
        muted: false,
        lastActiveAt: Date.now(),
        discarded: true,
        mode: src.mode === 'private' ? 'private' : 'normal',
        partition: undefined,
      };
      const next = [...tabs];
      next.splice(idx + 1, 0, copy);
      set({ tabs: sortTabsPinnedFirst(next), activeId: nid, view: 'browser' });
      get().setActive(nid);
    },
  };
};
