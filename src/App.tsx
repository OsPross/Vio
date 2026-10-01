import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
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
  isTorTab,
  useStore,
} from './store';
import {
  TabContent,
  type SaveOffer,
} from './features/tabs';
import { AppChrome } from './features/shell';
import {
  ShellOverlays,
  type AboutInfo,
  useBookmarkHandlers,
} from './features/dialogs';
import { useIpcEvents } from './hooks/useIpcEvents';
import { useShortcuts } from './hooks/useShortcuts';
import { useBindCommandHost } from './hooks/useAppMenuActions';
import { useSessionPersist } from './hooks/useSessionPersist';
import { useTabLifecycle, useTabMediaFlags } from './hooks/useTabLifecycle';
import { useTorSession } from './hooks/useTorSession';
import { useBrowserNav } from './hooks/useBrowserNav';
import { useOmniboxDraft } from './features/omnibox';

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
  const view = useStore((s) => s.view);
  const patchSettings = useStore((s) => s.patchSettings);

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
  const { draft, setDraft, omniEditingRef, omniFocusedRef } = useOmniboxDraft({
    activeUrl: active?.url,
    activeId: active?.id,
    isHome,
    isTorHome,
    isInternalAbout,
  });
  const [saveOffer, setSaveOffer] = useState<SaveOffer | null>(null);
  const [pwForPage, setPwForPage] = useState(0);
  const [taskMgrOpen, setTaskMgrOpen] = useState(false);
  const prevActiveIdRef = useRef(activeId);
  const {
    torInfo,
    setTorInfo,
    torBusy,
    torError,
    setTorError,
    torProgress,
    setTorProgress,
    openTorTab,
    requestNewIdentity,
  } = useTorSession();
  const {
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
  } = useBrowserNav({
    isHome,
    isTorHome,
    isInternalAbout,
    omniEditingRef,
    omniFocusedRef,
    setDraft,
  });
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
  const [qrOpen, setQrOpen] = useState(false);
  const [clearDataOpen, setClearDataOpen] = useState(false);
  const [aboutInfo, setAboutInfo] = useState<AboutInfo | null>(null);
  const [htmlFullscreen, setHtmlFullscreen] = useState(false);
  const [fsToast, setFsToast] = useState(false);
  const [certRemember, setCertRemember] = useState(false);

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
    void window.shell?.setDevtoolsEnabled?.(Boolean(settings.allowInspect));
  }, [settings.allowInspect]);

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

  const { bookmarkPop, setBookmarkPop, bookmarkStarRef, openBookmarkDialog, openBookmarkUrl } =
    useBookmarkHandlers({ active, activeIsTor, navigateActive });

  useEffect(() => {
    const onSave = () => saveActivePage();
    window.addEventListener('djxxr-save-page', onSave);
    return () => window.removeEventListener('djxxr-save-page', onSave);
  }, [saveActivePage]);

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
