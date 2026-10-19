import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useStore } from './store';
import { TabContent, type SaveOffer } from './features/tabs';
import { AppChrome } from './features/shell';
import {
  ShellOverlays,
  type AboutInfo,
  useBookmarkHandlers,
} from './features/dialogs';
import { useOmniboxDraft } from './features/omnibox';
import { getActiveTabFlags } from './lib/activeTabFlags';
import { isMotionOff, viewTransition } from './lib/motionPresets';
import { useIpcEvents } from './hooks/useIpcEvents';
import { useShortcuts } from './hooks/useShortcuts';
import { useBindCommandHost } from './hooks/useAppMenuActions';
import { useSessionPersist } from './hooks/useSessionPersist';
import { useTabLifecycle, useTabMediaFlags } from './hooks/useTabLifecycle';
import { useTorSession } from './hooks/useTorSession';
import { useBrowserNav } from './hooks/useBrowserNav';
import { usePictureInPicture } from './hooks/usePictureInPicture';
import { useShellEffects } from './hooks/useShellEffects';
import { usePageActions } from './hooks/usePageActions';
import { useAutomationBridge } from './hooks/useAutomationBridge';

/** Heavy routes / dialogs — not needed for first paint */
const SettingsPage = lazy(() =>
  import('./components/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
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
  const {
    activeIsTor,
    isHistoryPage,
    isDownloadsPage,
    isBookmarksPage,
    isExtensionsPage,
    isAboutPage,
    isInternalAbout,
    isHome,
    isTorHome,
  } = getActiveTabFlags(active);

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

  const { crashOffer, acceptCrashRestore, declineCrashRestore } = useSessionPersist({
    guestWc,
    windowMode,
  });
  useAutomationBridge(guestWc, settings.automationEnabled);

  useShellEffects({
    settings,
    activeId,
    activeUrl: active?.url,
    activeTabId: active?.id,
    isHome,
    activeIsTor,
    htmlFullscreen,
    setPwForPage,
    setSaveOffer,
    setFsToast,
    patchSettings,
  });

  const { togglePictureInPicture } = usePictureInPicture({
    guestWc,
    currentView,
    tabMediaRef,
    autoPipOnTabSwitch: settings.autoPipOnTabSwitch,
  });

  const {
    blockedToday,
    permAsk,
    setPermAsk,
    extInstallAsk,
    setExtInstallAsk,
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

  const { saveActivePdf, printActivePage } = usePageActions({ guestWc, currentView });

  const { bookmarkPop, setBookmarkPop, bookmarkStarRef, openBookmarkDialog, openBookmarkUrl } =
    useBookmarkHandlers({ active, activeIsTor, navigateActive });

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

  const motionOff = isMotionOff(settings);
  const viewMotion = viewTransition(motionOff);

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

  return shell(
    <div className="app-view-stack">
      <AnimatePresence initial={false}>
        {view === 'settings' ? (
          <motion.div
            key="settings"
            className={`app settings-mode app-view-layer ${settings.uiGlass ? 'glass-on' : ''}`}
            initial={viewMotion.initial}
            animate={viewMotion.animate}
            exit={viewMotion.exit}
            transition={viewMotion.transition}
          >
            <div className="drag-strip absolute-drag" />
            <ErrorBoundary name="settings">
              <Suspense fallback={<LazyFallback label="Ustawienia…" />}>
                <SettingsPage />
              </Suspense>
            </ErrorBoundary>
          </motion.div>
        ) : (
          <motion.div
            key="browser"
            className="app-view-layer"
            initial={viewMotion.initial}
            animate={viewMotion.animate}
            exit={viewMotion.exit}
            transition={viewMotion.transition}
          >
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
              acceptCrashRestore={acceptCrashRestore}
              declineCrashRestore={declineCrashRestore}
              torProgress={torProgress}
              torError={torError}
              setTorError={setTorError}
              permAsk={permAsk}
              setPermAsk={setPermAsk}
              extInstallAsk={extInstallAsk}
              setExtInstallAsk={setExtInstallAsk}
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
            </AppChrome>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
  );
}
