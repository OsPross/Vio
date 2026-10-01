import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSessionSnapshot } from '../lib/sessionSnapshot';
import { isTorTab, useStore, type Tab } from '../store';

export type UseSessionPersistArgs = {
  guestWc: Record<string, number>;
  windowMode: 'normal' | 'private' | 'tor';
};

export function useSessionPersist({ guestWc, windowMode }: UseSessionPersistArgs) {
  const [crashOffer, setCrashOffer] = useState(false);
  const navHistoryRef = useRef<Record<string, Tab['navHistory']>>({});
  const sessionBooted = useRef(false);

  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeId);
  const closedTabs = useStore((s) => s.closedTabs);
  const sessionReady = useStore((s) => s.sessionReady);
  const restoreSessionTabs = useStore((s) => s.restoreSessionTabs);
  const setSessionReady = useStore((s) => s.setSessionReady);

  // Session restore on boot
  useEffect(() => {
    if (sessionBooted.current) return;
    sessionBooted.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const boot = await window.shell?.getWindowBoot?.();
        if (cancelled) return;
        if (boot?.mode === 'private' || boot?.mode === 'tor') {
          setSessionReady(true);
          return;
        }
        if (Array.isArray(boot?.restoreTabs) && boot.restoreTabs.length) {
          const lazy = useStore.getState().settings.perfLazyTabs !== false;
          const tabs = boot.restoreTabs.map((t, i) => ({
            id: Math.random().toString(36).slice(2, 10),
            url: t.url,
            title: t.title || t.url,
            favicon: t.favicon,
            pinned: Boolean(t.pinned),
            navHistory: (t.navHistory as Tab['navHistory']) || null,
            mode: 'normal' as const,
            discarded: lazy && i !== 0,
            lastActiveAt: Date.now(),
          }));
          restoreSessionTabs(tabs, tabs[0]?.id || null, []);
          setSessionReady(true);
          return;
        }
        const status = await window.shell?.sessionStatus?.();
        const saved = await window.shell?.sessionLoad?.();
        if (cancelled) return;
        const mode = useStore.getState().settings.startupMode || 'session';
        const pages = String(useStore.getState().settings.startupPages || '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

        if (status?.dirtyExit && saved?.tabs?.length && mode === 'session') {
          setCrashOffer(true);
          setSessionReady(true);
          return;
        }

        if (mode === 'session' && saved?.tabs?.length) {
          const lazy = useStore.getState().settings.perfLazyTabs !== false;
          restoreSessionTabs(
            saved.tabs.map((t) => ({
              id: t.id,
              url: t.url,
              title: t.title,
              favicon: t.favicon,
              pinned: Boolean(t.pinned),
              navHistory: t.navHistory || null,
              mode: 'normal' as const,
              discarded: lazy && t.id !== saved.activeId,
            })),
            saved.activeId,
            saved.closedTabs || [],
          );
          return;
        }

        if (mode === 'pages' && pages.length) {
          const lazy = useStore.getState().settings.perfLazyTabs !== false;
          const tabs = pages.map((url, i) => ({
            id: Math.random().toString(36).slice(2, 10),
            url,
            title: url,
            mode: 'normal' as const,
            pinned: false,
            discarded: lazy && i !== 0,
            lastActiveAt: Date.now(),
          }));
          restoreSessionTabs(tabs, tabs[0].id, saved?.closedTabs || []);
          return;
        }

        // newtab / empty session
        if (saved?.closedTabs?.length) {
          useStore.getState().setClosedTabs(saved.closedTabs);
        }
        setSessionReady(true);
      } catch {
        setSessionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restoreSessionTabs, setSessionReady]);

  const persistSessionNow = useCallback(async () => {
    if (windowMode === 'private' || windowMode === 'tor') return;
    const st = useStore.getState();
    // Refresh nav history for live guests
    const navMap = { ...navHistoryRef.current };
    await Promise.all(
      Object.entries(guestWc).map(async ([tabId, wcId]) => {
        const tab = st.tabs.find((t) => t.id === tabId);
        if (!tab || isTorTab(tab)) return;
        try {
          const nh = await window.shell?.sessionNavHistory?.(wcId);
          if (nh) navMap[tabId] = nh;
        } catch {
          /* */
        }
      }),
    );
    navHistoryRef.current = navMap;
    const snap = buildSessionSnapshot(st.tabs, st.activeId, st.closedTabs, navMap);
    await window.shell?.sessionSave?.(snap);
  }, [guestWc, windowMode]);

  // Debounced session save
  useEffect(() => {
    if (!sessionReady) return;
    const t = setTimeout(() => {
      void persistSessionNow();
    }, 1000);
    return () => clearTimeout(t);
  }, [tabs, activeId, closedTabs, sessionReady, persistSessionNow]);

  // Flush on page hide / before unload
  useEffect(() => {
    const flush = () => {
      void persistSessionNow();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [persistSessionNow]);

  return { crashOffer, setCrashOffer, persistSessionNow };
}
