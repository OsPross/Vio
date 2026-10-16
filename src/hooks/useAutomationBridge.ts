import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import type { Tab } from '../store/types';

/**
 * Soul automation API ↔ tab store bridge. Main asks, we answer with raw tab data;
 * main does all filtering (Tor / private / internal) and per-webContents checks.
 */
export function useAutomationBridge(guestWc: Record<string, number>, enabled: boolean): void {
  const guestWcRef = useRef(guestWc);
  guestWcRef.current = guestWc;

  useEffect(() => {
    void window.shell?.automationSetEnabled?.(enabled);
  }, [enabled]);

  useEffect(() => {
    const raw = (t: Tab, active: boolean) => ({
      tabId: t.id,
      title: t.title,
      url: t.url,
      active,
      discarded: Boolean(t.discarded),
      mode: t.mode ?? 'normal',
      partition: t.partition,
      wcId: guestWcRef.current[t.id] ?? null,
    });

    const off = window.shell?.onAutomationRequest?.(({ reqId, cmd, args }) => {
      const st = useStore.getState();
      const tabId = typeof args?.tabId === 'string' ? args.tabId : '';
      let result: unknown = {};
      if (cmd === 'tabs') {
        result = {
          tabs: st.tabs.map((t) => raw(t, st.view === 'browser' && t.id === st.activeId)),
        };
      } else if (cmd === 'open' && typeof args?.url === 'string') {
        st.newTab(args.url);
        result = { tabId: useStore.getState().activeId };
      } else if (cmd === 'close' && tabId) {
        st.closeTab(tabId);
      } else if (cmd === 'activate' && tabId) {
        st.setActive(tabId);
      } else if (cmd === 'mute' && tabId) {
        st.muteTab(tabId, args?.value === true);
      } else if (cmd === 'pin' && tabId) {
        st.pinTab(tabId, args?.value === true);
      } else if (cmd === 'reopen') {
        // tabs only — never the "reopen closed window" fallback
        if (st.closedTabs.length) result = { tabId: st.reopenClosedTab() };
      } else if (cmd === 'bookmarks') {
        const q = String(args?.query ?? '').toLowerCase();
        const folder = (id?: string) => st.bookmarkFolders.find((f) => f.id === id)?.title ?? '';
        result = {
          items: st.bookmarks
            .filter((b) => !q || b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q))
            .slice(0, 100)
            .map((b) => ({ url: b.url, title: b.title, folder: folder(b.folderId) })),
        };
      }
      void window.shell?.automationReply?.(reqId, result);
    });

    // tabActivated / tabClosed events (main filters them like listTabs)
    const unsub = useStore.subscribe((s, prev) => {
      if (!useStore.getState().settings.automationEnabled) return;
      if (s.activeId !== prev.activeId && s.view === 'browser') {
        const t = s.tabs.find((x) => x.id === s.activeId);
        if (t) void window.shell?.automationUiEvent?.('tabActivated', raw(t, true));
      }
      if (s.tabs !== prev.tabs) {
        const ids = new Set(s.tabs.map((t) => t.id));
        for (const t of prev.tabs) {
          if (!ids.has(t.id)) void window.shell?.automationUiEvent?.('tabClosed', raw(t, false));
        }
      }
    });
    return () => {
      off?.();
      unsub();
    };
  }, []);
}
