import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { hostFromPageUrl, zoomFactorForHost } from '../lib/pageHost';
import { isEditableDomTarget } from '../lib/shortcutsRegistry';
import {
  draftForUrl,
  isInternalPageUrl,
  resolveTorHomeUrl,
  titleForInternalUrl,
} from '../lib/tabNavigate';
import {
  pruneTabSessionHistory,
  recordTabSessionUrl,
  tabSessionBack,
  tabSessionCanBack,
  tabSessionCanForward,
  tabSessionForward,
  tabSessionPeekBack,
  tabSessionPeekForward,
} from '../lib/tabSessionHistory';
import {
  markTypedUrl,
  recordVisitFromTab,
  type WebviewEl,
} from '../features/tabs';
import {
  HOME_URL,
  TOR_HOME_URL,
  isTorTab,
  normalizeInput,
  useStore,
} from '../store';

export type UseBrowserNavArgs = {
  isHome: boolean;
  isTorHome: boolean;
  isInternalAbout: boolean;
  omniEditingRef: MutableRefObject<boolean>;
  omniFocusedRef: MutableRefObject<boolean>;
  setDraft: Dispatch<SetStateAction<string>>;
};

export type UseBrowserNavResult = {
  nav: { back: boolean; forward: boolean };
  onNav: (canBack: boolean, canForward: boolean, url: string, title?: string) => void;
  doBrowserNav: (dir: 'back' | 'forward', source?: string) => void;
  currentView: () => WebviewEl | null;
  zoomPercent: number;
  zoomFlash: number | null;
  applyZoom: (factor: number, pageUrl?: string) => void;
  bumpZoom: (delta: number, pageUrl?: string) => void;
  findOpen: boolean;
  setFindOpen: Dispatch<SetStateAction<boolean>>;
  findQuery: string;
  setFindQuery: Dispatch<SetStateAction<string>>;
  findActive: number;
  setFindActive: Dispatch<SetStateAction<number>>;
  findTotal: number;
  setFindTotal: Dispatch<SetStateAction<number>>;
  closeFind: () => void;
  runFind: (q: string, backward?: boolean) => void;
  navigateActive: (url: string, query?: string, opts?: { typed?: boolean }) => void;
  go: (raw: string, opts?: { typed?: boolean; fromSuggest?: boolean }) => void;
};

export function useBrowserNav({
  isHome,
  isTorHome,
  isInternalAbout,
  omniEditingRef,
  omniFocusedRef,
  setDraft,
}: UseBrowserNavArgs): UseBrowserNavResult {
  const activeId = useStore((s) => s.activeId);
  const tabs = useStore((s) => s.tabs);
  const settings = useStore((s) => s.settings);
  const bangs = useStore((s) => s.bangs);
  const newTab = useStore((s) => s.newTab);
  const updateTab = useStore((s) => s.updateTab);
  const setView = useStore((s) => s.setView);
  const patchSettings = useStore((s) => s.patchSettings);
  const pushHistory = useStore((s) => s.pushHistory);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  const [nav, setNav] = useState({ back: false, forward: false });
  const [zoomPercent, setZoomPercent] = useState(100);
  const [zoomFlash, setZoomFlash] = useState<number | null>(null);
  const zoomFlashTimer = useRef<number | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findActive, setFindActive] = useState(0);
  const [findTotal, setFindTotal] = useState(0);

  const currentView = () => {
    const nodes = document.querySelectorAll('webview');
    for (const n of nodes) {
      if (!(n as HTMLElement).classList.contains('hidden')) return n as unknown as WebviewEl;
    }
    return null;
  };

  const refreshNavFlags = useCallback(
    (tabId: string, webBack = false, webForward = false) => {
      const back = tabSessionCanBack(tabId) || webBack;
      const forward = tabSessionCanForward(tabId) || webForward;
      setNav((prev) =>
        prev.back === back && prev.forward === forward ? prev : { back, forward },
      );
    },
    [],
  );

  const applySessionUrl = useCallback(
    (tabId: string, url: string) => {
      const st = useStore.getState();
      const tab = st.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const tor = isTorTab(tab);
      const nextUrl = resolveTorHomeUrl(url, tor);
      const internal = isInternalPageUrl(nextUrl);
      const title = internal
        ? titleForInternalUrl(nextUrl, tor, tab.mode === 'private')
        : '…';
      st.updateTab(tabId, {
        url: nextUrl,
        title,
        ...(tor ? { mode: 'tor' as const } : {}),
      });
      if (!tor && !internal) {
        requestAnimationFrame(() => {
          const el =
            (document.querySelector(
              `webview[data-tab-id="${tabId}"]`,
            ) as unknown as WebviewEl | null) ||
            (tabId === useStore.getState().activeId ? currentView() : null);
          if (el && el.src !== nextUrl) el.src = nextUrl;
        });
      }
      if (tabId === st.activeId) {
        setDraft(draftForUrl(nextUrl));
        refreshNavFlags(tabId, false, false);
      }
      st.setView('browser');
    },
    [refreshNavFlags, setDraft],
  );

  const onNav = useCallback(
    (canBack: boolean, canForward: boolean, url: string, _title?: string) => {
      const id = useStore.getState().activeId;
      if (id && url) recordTabSessionUrl(id, url);
      refreshNavFlags(id, canBack, canForward);
      if (omniEditingRef.current && omniFocusedRef.current) return;
      if (!url.startsWith('about:')) {
        setDraft((d) => (d === url ? d : url));
      }
    },
    [omniEditingRef, omniFocusedRef, refreshNavFlags, setDraft],
  );

  /** Single history nav entry — mouse / IPC / chrome UI share one 150ms gate */
  const browserNavAt = useRef(0);
  const navigateHistory = useCallback(
    (tabId: string, dir: 'back' | 'forward', source = 'unknown') => {
      const now = Date.now();
      if (now - browserNavAt.current < 150) {
        if (
          typeof window !== 'undefined' &&
          (window as unknown as { __DJXXR_DEBUG_MOUSE?: boolean }).__DJXXR_DEBUG_MOUSE
        ) {
          console.log('[mouse-nav:ui] dedup-skip', { tabId, dir, source });
        }
        return;
      }
      browserNavAt.current = now;
      if (
        typeof window !== 'undefined' &&
        (window as unknown as { __DJXXR_DEBUG_MOUSE?: boolean }).__DJXXR_DEBUG_MOUSE
      ) {
        console.log('[mouse-nav:ui] nav', { tabId, dir, source });
      }
      const st = useStore.getState();
      if (st.view === 'settings') {
        if (dir === 'back') st.setView('browser');
        return;
      }
      const id = tabId || st.activeId;
      const tab = st.tabs.find((t) => t.id === id);
      if (!tab) return;
      // Home / Tor home: chrome disables buttons; keep a hard stop here.
      if (tab.url === HOME_URL || tab.url === TOR_HOME_URL) return;

      const curInternal = isInternalPageUrl(tab.url);
      const peek =
        dir === 'back' ? tabSessionPeekBack(id) : tabSessionPeekForward(id);
      const peekInternal = peek ? isInternalPageUrl(peek) : false;

      // Cross about:* ↔ www (or about ↔ about) via session stack — webview has no about:* history.
      if (peek && (curInternal || peekInternal)) {
        const url = dir === 'back' ? tabSessionBack(id) : tabSessionForward(id);
        if (url) applySessionUrl(id, url);
        return;
      }

      const el =
        (document.querySelector(`webview[data-tab-id="${id}"]`) as unknown as WebviewEl | null) ||
        (id === st.activeId ? currentView() : null);
      try {
        if (dir === 'back') el?.goBack?.();
        else el?.goForward?.();
      } catch {
        /* */
      }
    },
    [applySessionUrl],
  );

  const tabIdsKey = tabs.map((t) => t.id).join(',');
  useEffect(() => {
    pruneTabSessionHistory(tabIdsKey ? tabIdsKey.split(',') : []);
  }, [tabIdsKey]);

  // Keep session stack + button state in sync when tab URL changes (omnibox, shortcuts, about:*).
  const activeTabId = active?.id;
  const activeTabUrl = active?.url;
  useEffect(() => {
    if (!activeTabId || !activeTabUrl) return;
    recordTabSessionUrl(activeTabId, activeTabUrl);
    if (isHome || isTorHome) {
      setNav({ back: false, forward: false });
      return;
    }
    let webBack = false;
    let webForward = false;
    if (!isInternalAbout) {
      try {
        const el = currentView();
        webBack = Boolean(el?.canGoBack?.());
        webForward = Boolean(el?.canGoForward?.());
      } catch {
        /* */
      }
    }
    refreshNavFlags(activeTabId, webBack, webForward);
  }, [activeTabId, activeTabUrl, isHome, isTorHome, isInternalAbout, refreshNavFlags]);

  const doBrowserNav = useCallback(
    (dir: 'back' | 'forward', source = 'unknown') => {
      navigateHistory(useStore.getState().activeId, dir, source);
    },
    [navigateHistory],
  );

  // Chrome UI (tabs / omnibox / about:*): mouseup X1/X2 — primary on all platforms.
  // app-command remains fallback from main (deduped above).
  useEffect(() => {
    const debug =
      typeof window !== 'undefined' &&
      (Boolean(window.shell?.debugMouse) ||
        /[?&]djxxr_debug_mouse=1/i.test(location.search) ||
        (window as unknown as { __DJXXR_DEBUG_MOUSE?: boolean }).__DJXXR_DEBUG_MOUSE);
    if (debug) (window as unknown as { __DJXXR_DEBUG_MOUSE?: boolean }).__DJXXR_DEBUG_MOUSE = true;

    const logUi = (kind: string, e: MouseEvent | PointerEvent) => {
      if (!(window as unknown as { __DJXXR_DEBUG_MOUSE?: boolean }).__DJXXR_DEBUG_MOUSE) return;
      console.log('[mouse-nav:ui]', kind, {
        button: e.button,
        type: e.type,
        target: (e.target as HTMLElement | null)?.tagName || null,
      });
    };

    const onSide = (e: MouseEvent | PointerEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      logUi('side', e);
      // Chrome UI only — do not steal events from page (those go through guest/before-mouse).
      e.preventDefault();
      doBrowserNav(e.button === 3 ? 'back' : 'forward', 'chrome-mouseup');
    };

    const onUp = (e: MouseEvent) => {
      logUi('mouseup', e);
      onSide(e);
    };
    const onDown = (e: MouseEvent) => logUi('mousedown', e);
    const onAux = (e: MouseEvent) => logUi('auxclick', e);
    const onPtr = (e: PointerEvent) => logUi('pointerdown', e);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isEditableDomTarget(e.target)) return;
      e.preventDefault();
    };

    window.addEventListener('mouseup', onUp, true);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('auxclick', onAux, true);
    window.addEventListener('pointerdown', onPtr, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mouseup', onUp, true);
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('auxclick', onAux, true);
      window.removeEventListener('pointerdown', onPtr, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [doBrowserNav]);

  const flashZoomBadge = useCallback((pct: number) => {
    setZoomFlash(pct);
    if (zoomFlashTimer.current) window.clearTimeout(zoomFlashTimer.current);
    zoomFlashTimer.current = window.setTimeout(() => setZoomFlash(null), 2200);
  }, []);

  const persistZoomFactor = useCallback(
    (factor: number, pageUrl?: string) => {
      const next = Math.min(5, Math.max(0.25, factor));
      const el = currentView();
      try {
        el?.setZoomFactor?.(next);
      } catch {
        /* */
      }
      const pct = Math.round(next * 100);
      setZoomPercent(pct);
      flashZoomBadge(pct);
      const u = pageUrl || active?.url || '';
      const host = hostFromPageUrl(u);
      if (host) {
        const st = useStore.getState();
        patchSettings({
          zoomFactors: { ...st.settings.zoomFactors, [host]: next },
        });
      }
    },
    [active?.url, flashZoomBadge, patchSettings],
  );

  const applyZoom = useCallback(
    (factor: number, pageUrl?: string) => {
      persistZoomFactor(factor, pageUrl);
    },
    [persistZoomFactor],
  );

  const bumpZoom = useCallback(
    (delta: number, pageUrl?: string) => {
      const el = currentView();
      let cur = zoomPercent / 100;
      try {
        cur = el?.getZoomFactor?.() ?? cur;
      } catch {
        /* */
      }
      persistZoomFactor(cur + delta, pageUrl);
    },
    [persistZoomFactor, zoomPercent],
  );

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery('');
    setFindActive(0);
    setFindTotal(0);
    try {
      currentView()?.stopFindInPage?.('clearSelection');
    } catch {
      /* */
    }
  }, []);

  const runFind = useCallback((q: string, backward?: boolean) => {
    const text = q.trim();
    if (!text) {
      try {
        currentView()?.stopFindInPage?.('clearSelection');
      } catch {
        /* */
      }
      setFindActive(0);
      setFindTotal(0);
      return;
    }
    try {
      currentView()?.findInPage?.(text, {
        forward: !backward,
        findNext: backward !== undefined,
      });
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    if (!active || isHome || isTorHome || isInternalAbout) return;
    const host = hostFromPageUrl(active.url);
    const factor = zoomFactorForHost(settings.zoomFactors, host);
    setZoomPercent(Math.round(factor * 100));
    const el = currentView();
    try {
      el?.setZoomFactor?.(factor);
    } catch {
      /* */
    }
  }, [active?.id, active?.url, isHome, isTorHome, isInternalAbout, settings.zoomFactors]);

  const navigateActive = (url: string, query?: string, opts?: { typed?: boolean }) => {
    if (!active) return;
    const tor = isTorTab(active);
    if (!tor) {
      if (query) {
        pushHistory(query);
      } else if (!url.startsWith('http') && !url.startsWith('about:')) {
        pushHistory(url);
      }
      if (opts?.typed && /^https?:/i.test(url)) markTypedUrl(url);
    }
    const nextUrl = resolveTorHomeUrl(url, tor);
    const title = titleForInternalUrl(nextUrl, tor);
    if (!tor && /^https?:/i.test(nextUrl)) {
      recordVisitFromTab(active, nextUrl, '', { typed: !!opts?.typed });
    }
    updateTab(active.id, {
      url: nextUrl,
      title,
      ...(tor ? { mode: 'tor' as const } : {}),
    });
    if (!tor && !isInternalPageUrl(nextUrl)) {
      requestAnimationFrame(() => {
        const el = currentView();
        if (el && el.src !== nextUrl) el.src = nextUrl;
      });
    }
    setDraft(draftForUrl(nextUrl));
    setView('browser');
  };

  const go = (raw: string, opts?: { typed?: boolean; fromSuggest?: boolean }) => {
    const url = normalizeInput(raw, settings, bangs);
    const isQuery =
      !!raw.trim() && !/^https?:/i.test(raw.trim()) && !raw.trim().startsWith('about:');
    if (isTorTab(active)) {
      navigateActive(url);
      return;
    }
    const typed = opts?.typed ?? (!isQuery && /^https?:/i.test(url));
    if (typed) markTypedUrl(url);
    if (settings.openSearchInNewTab && isQuery) {
      if (raw.trim()) pushHistory(raw.trim());
      newTab(url);
      // Visit will be recorded when the new tab's webview finishes loading
      return;
    }
    navigateActive(url, isQuery ? raw.trim() : undefined, { typed });
  };

  return {
    nav,
    onNav,
    doBrowserNav,
    currentView,
    zoomPercent,
    zoomFlash,
    applyZoom,
    bumpZoom,
    findOpen,
    setFindOpen,
    findQuery,
    setFindQuery,
    findActive,
    setFindActive,
    findTotal,
    setFindTotal,
    closeFind,
    runFind,
    navigateActive,
    go,
  };
}
