import { useEffect, useRef } from 'react';
import { useStore } from '../store';

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
    const off = window.shell?.onAutomationRequest?.(({ reqId, cmd, args }) => {
      const st = useStore.getState();
      const tabId = typeof args?.tabId === 'string' ? args.tabId : '';
      let result: unknown = {};
      if (cmd === 'tabs') {
        result = {
          tabs: st.tabs.map((t) => ({
            tabId: t.id,
            title: t.title,
            url: t.url,
            active: st.view === 'browser' && t.id === st.activeId,
            discarded: Boolean(t.discarded),
            mode: t.mode ?? 'normal',
            partition: t.partition,
            wcId: guestWcRef.current[t.id] ?? null,
          })),
        };
      } else if (cmd === 'open' && typeof args?.url === 'string') {
        st.newTab(args.url);
        result = { tabId: useStore.getState().activeId };
      } else if (cmd === 'close' && tabId) {
        st.closeTab(tabId);
      } else if (cmd === 'activate' && tabId) {
        st.setActive(tabId);
      }
      void window.shell?.automationReply?.(reqId, result);
    });
    return () => off?.();
  }, []);
}
