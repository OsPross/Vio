import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { hostFromPageUrl, zoomFactorForHost } from './lib/pageHost';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  applyThemeToDom,
  HOME_URL,
  HISTORY_URL,
  DOWNLOADS_URL,
  BOOKMARKS_URL,
  EXTENSIONS_URL,
  ABOUT_URL,
  TOR_HOME_URL,
  isBookmarkableUrl,
  isTorTab,
  normalizeInput,
  useStore,
} from './store';
import type { TorStatusInfo } from './components/TorLanding';
import { isEditableDomTarget } from './lib/shortcutsRegistry';
import {
  TabContent,
  markTypedUrl,
  recordVisitFromTab,
  type WebviewEl,
  type SaveOffer,
} from './features/tabs';
import { AppChrome } from './features/shell';
import {
  ShellOverlays,
  type AboutInfo,
} from './features/dialogs';
import {
  draftForUrl,
  isInternalPageUrl,
  resolveTorHomeUrl,
  titleForInternalUrl,
} from './lib/tabNavigate';
import { useIpcEvents } from './hooks/useIpcEvents';
import { useShortcuts } from './hooks/useShortcuts';
import { useBindCommandHost } from './hooks/useAppMenuActions';
import { useSessionPersist } from './hooks/useSessionPersist';
import { useTabLifecycle, useTabMediaFlags } from './hooks/useTabLifecycle';

/** Heavy routes / dialogs — not needed for first paint */
const SettingsPage = lazy(() =>
  import('./components/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

function LazyFallback({ label }: { label?: string }) {
  return (
    <div className="lazy-route-fallback" role="status" aria-live="polite">
      {label || 'Ładowanie…'}
    </div>
  );
}

export function App() {
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeId);
  const settings = useStore((s) => s.settings);
  const bangs = useStore((s) => s.bangs);
  const view = useStore((s) => s.view);
  const newTab = useStore((s) => s.newTab);
  const newTorTab = useStore((s) => s.newTorTab);
  const muteTab = useStore((s) => s.muteTab);
  const closeTab = useStore((s) => s.closeTab);
  const setActive = useStore((s) => s.setActive);
  const updateTab = useStore((s) => s.updateTab);
  const pinTab = useStore((s) => s.pinTab);
  const reopenClosedTab = useStore((s) => s.reopenClosedTab);
  const duplicateTab = useStore((s) => s.duplicateTab);
  const setView = useStore((s) => s.setView);
  const patchSettings = useStore((s) => s.patchSettings);
  const shortcuts = useStore((s) => s.shortcuts);
  const pushHistory = useStore((s) => s.pushHistory);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const activeIsTor = isTorTab(active);
  const isHistoryPage = !!active && !activeIsTor && active.url === HISTORY_URL;
  const isDownloadsPage = !!active && !activeIsTor && active.url === DOWNLOADS_URL;
  const isBookmarksPage = !!active && !activeIsTor && active.url === BOOKMARKS_URL;
  const isExtensionsPage = !!active && !activeIsTor && active.url === EXTENSIONS_URL;
  const isAboutPage =
    !!active &&
    !activeIsTor &&
    (active.url === ABOUT_URL ||
      active.url === 'about:about' ||
      active.url === 'djxxr://about' ||
      /^https?:\/\/djxxr\/about\/?$/i.test(active.url));
  const isInternalAbout =
    isHistoryPage || isDownloadsPage || isBookmarksPage || isExtensionsPage || isAboutPage;
  const isHome =
    !!active &&
    !isInternalAbout &&
    (active.url === HOME_URL ||
      (active.url.startsWith('about:') &&
        !activeIsTor &&
        active.url !== ABOUT_URL &&
        active.url !== 'about:about' &&
        active.url !== TOR_HOME_URL));
  const isTorHome =
    !!active &&
    activeIsTor &&
    (active.url === TOR_HOME_URL || active.url === HOME_URL || active.url === 'about:blank');
  const [draft, setDraft] = useState(isHome || isTorHome ? '' : (active?.url ?? ''));
  /** Omnibox: user is editing — ignore navigations / tab URL sync for draft */
  const omniEditingRef = useRef(false);
  const omniFocusedRef = useRef(false);
  const [nav, setNav] = useState({ back: false, forward: false });
  const [saveOffer, setSaveOffer] = useState<SaveOffer | null>(null);
  const [pwForPage, setPwForPage] = useState(0);
  const [taskMgrOpen, setTaskMgrOpen] = useState(false);
  const prevActiveIdRef = useRef(activeId);
  const [torInfo, setTorInfo] = useState<TorStatusInfo | null>(null);
  const [torBusy, setTorBusy] = useState(false);
  const [torError, setTorError] = useState<string | null>(null);
  const [torProgress, setTorProgress] = useState<string | null>(null);
  const [shieldOpen, setShieldOpen] = useState(false);
  const [permRemember, setPermRemember] = useState(true);
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const [newTabMenu, setNewTabMenu] = useState<{ x: number; y: number } | null>(null);
  const [omniMenu, setOmniMenu] = useState<{ x: number; y: number } | null>(null);
  const [sidebarMenu, setSidebarMenu] = useState<{ x: number; y: number } | null>(null);
  const [sidebarAutoOpen, setSidebarAutoOpen] = useState(false);
  const sidebarAutoTimer = useRef<number | null>(null);
  const [windowMode, setWindowMode] = useState<'normal' | 'private' | 'tor'>('normal');
  const [windowPartition, setWindowPartition] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [qrOpen, setQrOpen] = useState(false);
  const [clearDataOpen, setClearDataOpen] = useState(false);
  const [aboutInfo, setAboutInfo] = useState<AboutInfo | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findActive, setFindActive] = useState(0);
  const [findTotal, setFindTotal] = useState(0);
  const [zoomFlash, setZoomFlash] = useState<number | null>(null);
  const [bookmarkPop, setBookmarkPop] = useState<{ url: string; title: string } | null>(null);
  const bookmarkStarRef = useRef<HTMLButtonElement>(null);
  const [htmlFullscreen, setHtmlFullscreen] = useState(false);
  const [fsToast, setFsToast] = useState(false);
  const [certRemember, setCertRemember] = useState(false);
  const zoomFlashTimer = useRef<number | null>(null);

  const {
    guestWc,
    onGuestMeta,
    tabMediaRef,
    hotTabs,
    mediaFlags,
    setMediaFlags,
    pageHasVideo,
    setPageHasVideo,
  } = useTabLifecycle({ taskMgrOpen, isHome });

  const { crashOffer, setCrashOffer } = useSessionPersist({ guestWc, windowMode });

  useEffect(() => {
    applyThemeToDom(settings);
    const prefersReduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.dataset.reduceMotion =
      settings.perfReduceMotion || !settings.uiMotion || prefersReduce ? 'on' : 'off';
  }, [settings]);

  useEffect(() => {
    void window.shell?.perfBoot?.({
      hardwareAcceleration: settings.perfHardwareAcceleration,
      smoothScrolling: settings.perfSmoothScrolling,
      backgroundThrottling: settings.perfBackgroundThrottling,
      cacheMb: settings.perfCacheMb,
      reduceRenderers: settings.perfMode === 'saver',
      memoryCapMb:
        settings.perfMode === 'saver' ? 512 : settings.perfMode === 'performance' ? 1024 : 768,
    });
    void window.shell?.perfApplySession?.({
      cacheMb: settings.perfCacheMb,
      backgroundThrottling: settings.perfBackgroundThrottling,
      spellcheck: settings.perfSpellcheck !== false,
    });
    void window.shell?.spellcheckConfig?.({ enabled: settings.perfSpellcheck !== false });
  }, [
    settings.perfHardwareAcceleration,
    settings.perfSmoothScrolling,
    settings.perfBackgroundThrottling,
    settings.perfCacheMb,
    settings.perfMode,
    settings.perfSpellcheck,
  ]);

  useEffect(() => {
    setSaveOffer(null);
    if (!settings.passwordsEnabled || isHome || !active?.url) {
      setPwForPage(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      const st = await window.shell?.passwordsStatus?.();
      if (!st?.unlocked || cancelled) {
        if (!cancelled) setPwForPage(0);
        return;
      }
      const list = await window.shell?.passwordsFind?.(active.url);
      if (!cancelled) setPwForPage(Array.isArray(list) ? list.length : 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [active?.url, activeId, isHome, settings.passwordsEnabled]);

  useEffect(() => {
    if (activeIsTor && settings.sidePanelOpen) {
      patchSettings({ sidePanelOpen: false, activeSideAppId: null });
    }
  }, [activeIsTor, active?.id, settings.sidePanelOpen, patchSettings]);

  const openTorTab = useCallback(
    async (url?: string) => {
      setTorBusy(true);
      setTorError(null);
      setTorProgress('Uruchamianie trybu Tor…');
      try {
        // Sync bridge prefs to daemon before start (embedded only)
        void (await window.shell?.torBridges?.({
          mode: settings.torBridgeMode,
          customLines:
            settings.torBridgeMode === 'custom'
              ? settings.torBridgeLines
                  .split(/\r?\n/)
                  .map((l) => l.trim())
                  .filter(Boolean)
              : undefined,
        }));
        const st = await window.shell?.torStart?.({ proxyUrl: settings.torProxyUrl });
        if (!st?.ok || !st.partition) {
          setTorError(st?.error || 'Nie udało się uruchomić trybu Tor (fail-closed).');
          setTorInfo(st || null);
          setTorBusy(false);
          setTorProgress(null);
          return;
        }
        setTorInfo(st);
        setTorProgress(null);
        newTorTab({ url: url || TOR_HOME_URL, partition: st.partition });
        setView('browser');
      } catch (err) {
        setTorError(String((err as Error)?.message || err));
        setTorProgress(null);
      } finally {
        setTorBusy(false);
      }
    },
    [settings.torProxyUrl, settings.torBridgeMode, settings.torBridgeLines, newTorTab, setView],
  );

  const requestNewIdentity = useCallback(async () => {
    const torTabs = useStore.getState().tabs.filter((t) => t.mode === 'tor');
    if (!torTabs.length && !torInfo?.active) return;
    const ok = window.confirm(
      'Nowa tożsamość zamknie wszystkie karty Tor, wyczyści sesję (ciasteczka, cache) i zbuduje nowy obwód.\n\nKontynuować?',
    );
    if (!ok) return;
    setTorBusy(true);
    setTorError(null);
    setTorProgress('Nowa tożsamość…');
    try {
      for (const t of [...torTabs]) {
        useStore.getState().closeTab(t.id);
      }
      const st = await window.shell?.torNewIdentity?.();
      if (!st?.ok || !st.partition) {
        setTorError((st?.error as string) || 'Nowa tożsamość nieudana');
        setTorInfo(st || null);
        setTorProgress(null);
        return;
      }
      setTorInfo(st);
      setTorProgress(null);
      newTorTab({ url: TOR_HOME_URL, partition: String(st.partition) });
      setView('browser');
    } catch (err) {
      setTorError(String((err as Error)?.message || err));
      setTorProgress(null);
    } finally {
      setTorBusy(false);
    }
  }, [torInfo?.active, newTorTab, setView]);

  useEffect(() => {
    const onOpen = () => void openTorTab();
    window.addEventListener('djxxr-open-tor', onOpen);
    return () => window.removeEventListener('djxxr-open-tor', onOpen);
  }, [openTorTab]);

  useEffect(() => {
    const onNewId = () => void requestNewIdentity();
    window.addEventListener('djxxr-tor-new-identity', onNewId);
    return () => window.removeEventListener('djxxr-tor-new-identity', onNewId);
  }, [requestNewIdentity]);

  useEffect(() => {
    const hasTor = tabs.some((t) => t.mode === 'tor');
    if (!hasTor && torInfo?.active) {
      void window.shell?.torStop?.().then((st) => setTorInfo(st || null));
    }
  }, [tabs, torInfo?.active]);

  const runPictureInPictureOnTab = useCallback(
    (tabId: string, opts?: { enterOnly?: boolean }) => {
      const wcId = guestWc[tabId];
      if (typeof wcId === 'number' && window.shell?.pictureInPicture) {
        void window.shell.pictureInPicture(wcId, { enterOnly: Boolean(opts?.enterOnly) });
        return;
      }
      if (tabId !== useStore.getState().activeId) return;
      const el = currentView();
      if (!el) return;
      const enterOnly = Boolean(opts?.enterOnly);
      void el
        .executeJavaScript?.(
          enterOnly
            ? `(async () => {
            try {
              if (!document.pictureInPictureEnabled) return 'disabled';
              if (document.pictureInPictureElement) return 'already';
              const videos = Array.from(document.querySelectorAll('video'));
              const v =
                videos.find((x) => !x.paused && !x.ended) ||
                videos.find((x) => (x.readyState || 0) > 1) ||
                videos[0];
              if (!v) return 'no-video';
              await v.requestPictureInPicture();
              return 'enter';
            } catch {
              return 'error';
            }
          })()`
            : `(async () => {
            try {
              if (!document.pictureInPictureEnabled) return 'disabled';
              if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                return 'exit';
              }
              const videos = Array.from(document.querySelectorAll('video'));
              const v =
                videos.find((x) => !x.paused && !x.ended) ||
                videos.find((x) => (x.readyState || 0) > 1) ||
                videos[0];
              if (!v) return 'no-video';
              await v.requestPictureInPicture();
              return 'enter';
            } catch {
              return 'error';
            }
          })()`,
          true,
        )
        .catch(() => {});
    },
    [guestWc],
  );

  const togglePictureInPicture = useCallback(() => {
    runPictureInPictureOnTab(useStore.getState().activeId);
  }, [runPictureInPictureOnTab]);

  // Document PiP is OS-level — do not exit when the tab webview is hidden (tab switch / minimize).
  useEffect(() => {
    const prevId = prevActiveIdRef.current;
    prevActiveIdRef.current = activeId;
    if (!settings.autoPipOnTabSwitch || !prevId || prevId === activeId) return;
    const media = tabMediaRef.current[prevId];
    if (!media?.playing) return;
    runPictureInPictureOnTab(prevId, { enterOnly: true });
  }, [activeId, settings.autoPipOnTabSwitch, runPictureInPictureOnTab]);

  useEffect(() => {
    if (omniEditingRef.current && omniFocusedRef.current) return;
    if (isHome || isTorHome || isInternalAbout) setDraft('');
    else setDraft(active?.url ?? '');
  }, [active?.id, active?.url, isHome, isTorHome, isInternalAbout]);

  useEffect(() => {
    void window.shell?.setDevtoolsEnabled?.(Boolean(settings.allowInspect));
  }, [settings.allowInspect]);

  const onNav = useCallback(
    (canBack: boolean, canForward: boolean, url: string, _title?: string) => {
      setNav((prev) =>
        prev.back === canBack && prev.forward === canForward
          ? prev
          : { back: canBack, forward: canForward },
      );
      if (omniEditingRef.current && omniFocusedRef.current) return;
      if (!url.startsWith('about:')) {
        setDraft((d) => (d === url ? d : url));
      }
    },
    [],
  );

  /** Single history nav entry — mouse / IPC / chrome UI share one 150ms gate */
  const browserNavAt = useRef(0);
  const navigateHistory = useCallback((tabId: string, dir: 'back' | 'forward', source = 'unknown') => {
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
    if (tab.url === HOME_URL || tab.url === TOR_HOME_URL || tab.url.startsWith('about:')) {
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
  }, []);

  const doBrowserNav = useCallback(
    (dir: 'back' | 'forward', source = 'unknown') => {
      navigateHistory(useStore.getState().activeId, dir, source);
    },
    [navigateHistory],
  );

  const {
    blockedToday,
    permAsk,
    setPermAsk,
    httpsWarn,
    setHttpsWarn,
    popupBlocked,
    setPopupBlocked,
    certWarn,
    setCertWarn,
  } = useIpcEvents({
    guestWc,
    openTorTab,
    doBrowserNav,
    setTorProgress,
    setWindowMode,
    setWindowPartition,
    setCertRemember,
  });

  useTabMediaFlags(active?.url, permAsk, setMediaFlags);

  // Clear blocked-popup badge when navigating away
  useEffect(() => {
    setPopupBlocked(null);
    setPageHasVideo(false);
  }, [activeId, active?.url, setPopupBlocked]);

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

  const currentView = () => {
    const nodes = document.querySelectorAll('webview');
    for (const n of nodes) {
      if (!(n as HTMLElement).classList.contains('hidden')) return n as unknown as WebviewEl;
    }
    return null;
  };

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

  const saveActivePage = useCallback(() => {
    const id = useStore.getState().activeId;
    const wcId = guestWc[id];
    if (typeof wcId !== 'number') return;
    void window.shell?.savePage?.(wcId);
  }, [guestWc]);

  const saveActivePdf = useCallback(() => {
    const id = useStore.getState().activeId;
    const wcId = guestWc[id];
    if (typeof wcId !== 'number') return;
    void window.shell?.printToPdf?.(wcId);
  }, [guestWc]);

  const printActivePage = useCallback(() => {
    const id = useStore.getState().activeId;
    const wcId = guestWc[id];
    if (typeof wcId === 'number' && window.shell?.printPage) {
      void window.shell.printPage(wcId);
      return;
    }
    try {
      currentView()?.print?.();
    } catch {
      void currentView()?.executeJavaScript?.('window.print()');
    }
  }, [guestWc]);

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

  const openBookmarkDialog = useCallback(
    (url?: string, title?: string) => {
      const u = url ?? active?.url ?? '';
      const t = title ?? active?.title ?? u;
      if (!isBookmarkableUrl(u)) return;
      setBookmarkPop({ url: u, title: t });
    },
    [active?.url, active?.title],
  );

  useEffect(() => {
    const onSave = () => saveActivePage();
    window.addEventListener('djxxr-save-page', onSave);
    return () => window.removeEventListener('djxxr-save-page', onSave);
  }, [saveActivePage]);

  useEffect(() => {
    const onBookmark = () => openBookmarkDialog();
    window.addEventListener('djxxr-bookmark-page', onBookmark);
    return () => window.removeEventListener('djxxr-bookmark-page', onBookmark);
  }, [openBookmarkDialog]);

  useEffect(() => {
    if (!htmlFullscreen) {
      setFsToast(false);
      return;
    }
    setFsToast(true);
    const t = window.setTimeout(() => setFsToast(false), 4000);
    return () => window.clearTimeout(t);
  }, [htmlFullscreen]);

  useShortcuts({
    isHome,
    isTorHome,
    isInternalAbout,
    htmlFullscreen,
    findOpen,
    taskMgrOpen,
    tabMenu,
    newTabMenu,
    omniMenu,
    sidebarMenu,
    paletteOpen,
    shieldOpen,
    setFindOpen,
    setTaskMgrOpen,
    setTabMenu,
    setNewTabMenu,
    setOmniMenu,
    setSidebarMenu,
    setPaletteOpen,
    setShieldOpen,
    setClearDataOpen,
    setSidebarAutoOpen,
    currentView,
    doBrowserNav,
    openBookmarkDialog,
    printActivePage,
    togglePictureInPicture,
    bumpZoom,
    applyZoom,
    closeFind,
  });

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

  const openBookmarkUrl = (url: string, opts?: { newTab?: boolean }) => {
    if (activeIsTor && active?.partition) {
      if (opts?.newTab) {
        newTorTab({ url, partition: active.partition, background: true });
      } else {
        navigateActive(url);
      }
      return;
    }
    if (opts?.newTab) newTab(url);
    else navigateActive(url);
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

  const toggleSidebar = () => patchSettings({ showSidebar: !settings.showSidebar });

  const motionOff =
    settings.perfReduceMotion ||
    !settings.uiMotion ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useBindCommandHost({
    openTorTab,
    navigateActive,
    printActivePage,
    bumpZoom,
    setTaskMgrOpen,
  });

  const shell = (node: React.ReactNode) => (
    <MotionConfig reducedMotion={motionOff ? 'always' : 'never'}>
      {node}
      <ShellOverlays
        taskMgrOpen={taskMgrOpen}
        setTaskMgrOpen={setTaskMgrOpen}
        paletteOpen={paletteOpen}
        setPaletteOpen={setPaletteOpen}
        setDraft={setDraft}
        go={go}
      />
    </MotionConfig>
  );

  if (view === 'settings') {
    return shell(
      <div className={`app settings-mode ${settings.uiGlass ? 'glass-on' : ''}`}>
        <div className="drag-strip absolute-drag" />
        <ErrorBoundary name="settings">
          <Suspense fallback={<LazyFallback label="Ustawienia…" />}>
            <SettingsPage />
          </Suspense>
        </ErrorBoundary>
      </div>,
    );
  }

  return shell(
    <AppChrome
      htmlFullscreen={htmlFullscreen}
      windowMode={windowMode}
      sidebarAutoOpen={sidebarAutoOpen}
      setSidebarAutoOpen={setSidebarAutoOpen}
      sidebarAutoTimer={sidebarAutoTimer}
      sidebarMenu={sidebarMenu}
      setSidebarMenu={setSidebarMenu}
      navigateActive={navigateActive}
      openBookmarkUrl={openBookmarkUrl}
      openBookmarkDialog={openBookmarkDialog}
      hotTabs={hotTabs}
      torBusy={torBusy}
      openTorTab={openTorTab}
      tabMenu={tabMenu}
      newTabMenu={newTabMenu}
      setTabMenu={setTabMenu}
      setNewTabMenu={setNewTabMenu}
      draft={draft}
      setDraft={setDraft}
      omniEditingRef={omniEditingRef}
      omniFocusedRef={omniFocusedRef}
      omniMenu={omniMenu}
      setOmniMenu={setOmniMenu}
      nav={nav}
      go={go}
      currentView={currentView}
      toggleSidebar={toggleSidebar}
      active={active}
      activeIsTor={activeIsTor}
      isHome={isHome}
      isTorHome={isTorHome}
      isInternalAbout={isInternalAbout}
      isHistoryPage={isHistoryPage}
      guestWc={guestWc}
      zoomFlash={zoomFlash}
      zoomPercent={zoomPercent}
      popupBlocked={popupBlocked}
      setPopupBlocked={setPopupBlocked}
      pageHasVideo={pageHasVideo}
      togglePictureInPicture={togglePictureInPicture}
      mediaFlags={mediaFlags}
      bookmarkPop={bookmarkPop}
      setBookmarkPop={setBookmarkPop}
      bookmarkStarRef={bookmarkStarRef}
      pwForPage={pwForPage}
      shieldOpen={shieldOpen}
      setShieldOpen={setShieldOpen}
      blockedToday={blockedToday}
      torInfo={torInfo}
      requestNewIdentity={requestNewIdentity}
      bumpZoom={bumpZoom}
      applyZoom={applyZoom}
      printActivePage={printActivePage}
      saveActivePdf={saveActivePdf}
      setTaskMgrOpen={setTaskMgrOpen}
      setClearDataOpen={setClearDataOpen}
      setQrOpen={setQrOpen}
      setFindOpen={setFindOpen}
      findOpen={findOpen}
      findQuery={findQuery}
      findActive={findActive}
      findTotal={findTotal}
      setFindQuery={setFindQuery}
      runFind={runFind}
      closeFind={closeFind}
      fsToast={fsToast}
      certWarn={certWarn}
      setCertWarn={setCertWarn}
      certRemember={certRemember}
      setCertRemember={setCertRemember}
      qrOpen={qrOpen}
      clearDataOpen={clearDataOpen}
      aboutInfo={aboutInfo}
      setAboutInfo={setAboutInfo}
      crashOffer={crashOffer}
      setCrashOffer={setCrashOffer}
      torProgress={torProgress}
      torError={torError}
      setTorError={setTorError}
      permAsk={permAsk}
      setPermAsk={setPermAsk}
      permRemember={permRemember}
      setPermRemember={setPermRemember}
      saveOffer={saveOffer}
      setSaveOffer={setSaveOffer}
      setPwForPage={setPwForPage}
      httpsWarn={httpsWarn}
      setHttpsWarn={setHttpsWarn}
    >
      <TabContent
        active={active}
        activeId={activeId}
        tabs={tabs}
        activeIsTor={activeIsTor}
        isHistoryPage={isHistoryPage}
        isDownloadsPage={isDownloadsPage}
        isBookmarksPage={isBookmarksPage}
        isExtensionsPage={isExtensionsPage}
        isAboutPage={isAboutPage}
        isInternalAbout={isInternalAbout}
        isHome={isHome}
        isTorHome={isTorHome}
        windowMode={windowMode}
        torInfo={torInfo}
        setTorInfo={setTorInfo}
        torBusy={torBusy}
        torError={torError}
        torProgress={torProgress}
        requestNewIdentity={requestNewIdentity}
        navigateActive={navigateActive}
        openBookmarkUrl={openBookmarkUrl}
        openBookmarkDialog={openBookmarkDialog}
        currentView={currentView}
        bumpZoom={bumpZoom}
        doBrowserNav={doBrowserNav}
        onNav={onNav}
        setSaveOffer={setSaveOffer}
        onGuestMeta={onGuestMeta}
        tabMediaRef={tabMediaRef}
        setPageHasVideo={setPageHasVideo}
        setFindActive={setFindActive}
        setFindTotal={setFindTotal}
        setHtmlFullscreen={setHtmlFullscreen}
      />
    </AppChrome>,
  );
}
