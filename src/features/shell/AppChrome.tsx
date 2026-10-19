import {
  lazy,
  Suspense,
  type CSSProperties,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from 'react';
import { X } from 'lucide-react';
import { BookmarksBar } from '../../components/BookmarksBar';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import type { TorStatusInfo } from '../../components/TorLanding';
import { BrowserChrome } from '../omnibox';
import type { OmniMenuState } from '../omnibox';
import {
  ChromeOverlays,
  CrashRestoreOffer,
  HttpsWarnOverlay,
  StageOverlays,
  type AboutInfo,
} from '../dialogs';
import type {
  CertWarn,
  ExtInstallAsk,
  HttpsWarn,
  PermAsk,
  PopupBlocked,
} from '../../hooks/useIpcEvents';
import { TabStrip, type NewTabMenuState, type TabMenuState, type SaveOffer, type WebviewEl } from '../tabs';
import { useT } from '../../i18n';
import { HOME_URL, TOR_HOME_URL, isBookmarkableUrl, useStore, type Tab } from '../../store';

const AppSidebar = lazy(() =>
  import('../../components/AppSidebar').then((m) => ({ default: m.AppSidebar })),
);

export type AppChromeProps = {
  children: ReactNode;
  htmlFullscreen: boolean;
  windowMode: 'normal' | 'private' | 'tor';
  sidebarAutoOpen: boolean;
  setSidebarAutoOpen: Dispatch<SetStateAction<boolean>>;
  sidebarAutoTimer: MutableRefObject<number | null>;
  sidebarMenu: { x: number; y: number } | null;
  setSidebarMenu: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  navigateActive: (url: string, query?: string, opts?: { typed?: boolean }) => void;
  openBookmarkUrl: (url: string, opts?: { newTab?: boolean }) => void;
  openBookmarkDialog: (url?: string, title?: string) => void;
  hotTabs: Record<string, number>;
  torBusy: boolean;
  openTorTab: (url?: string) => void | Promise<void>;
  tabMenu: TabMenuState;
  newTabMenu: NewTabMenuState;
  setTabMenu: Dispatch<SetStateAction<TabMenuState>>;
  setNewTabMenu: Dispatch<SetStateAction<NewTabMenuState>>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  omniEditingRef: MutableRefObject<boolean>;
  omniFocusedRef: MutableRefObject<boolean>;
  omniMenu: OmniMenuState;
  setOmniMenu: Dispatch<SetStateAction<OmniMenuState>>;
  nav: { back: boolean; forward: boolean };
  go: (raw: string, opts?: { typed?: boolean; fromSuggest?: boolean }) => void;
  currentView: () => WebviewEl | null;
  toggleSidebar: () => void;
  active: Tab | undefined;
  activeIsTor: boolean;
  isHome: boolean;
  isTorHome: boolean;
  isInternalAbout: boolean;
  isHistoryPage: boolean;
  guestWc: Record<string, number>;
  zoomFlash: number | null;
  zoomPercent: number;
  popupBlocked: PopupBlocked | null;
  setPopupBlocked: Dispatch<SetStateAction<PopupBlocked | null>>;
  pageHasVideo: boolean;
  togglePictureInPicture: () => void;
  mediaFlags: { mic: boolean; cam: boolean };
  bookmarkPop: { url: string; title: string } | null;
  setBookmarkPop: Dispatch<SetStateAction<{ url: string; title: string } | null>>;
  bookmarkStarRef: RefObject<HTMLButtonElement | null>;
  pwForPage: number;
  shieldOpen: boolean;
  setShieldOpen: Dispatch<SetStateAction<boolean>>;
  blockedToday: number;
  torInfo: TorStatusInfo | null;
  requestNewIdentity: () => void | Promise<void>;
  bumpZoom: (delta: number, pageUrl?: string) => void;
  applyZoom: (factor: number, pageUrl?: string) => void;
  printActivePage: () => void;
  saveActivePdf: () => void;
  setTaskMgrOpen: Dispatch<SetStateAction<boolean>>;
  setClearDataOpen: Dispatch<SetStateAction<boolean>>;
  setQrOpen: Dispatch<SetStateAction<boolean>>;
  setFindOpen: Dispatch<SetStateAction<boolean>>;
  findOpen: boolean;
  findQuery: string;
  findActive: number;
  findTotal: number;
  setFindQuery: Dispatch<SetStateAction<string>>;
  runFind: (q: string, backward?: boolean) => void;
  closeFind: () => void;
  fsToast: boolean;
  certWarn: CertWarn | null;
  setCertWarn: Dispatch<SetStateAction<CertWarn | null>>;
  certRemember: boolean;
  setCertRemember: Dispatch<SetStateAction<boolean>>;
  qrOpen: boolean;
  clearDataOpen: boolean;
  aboutInfo: AboutInfo | null;
  setAboutInfo: Dispatch<SetStateAction<AboutInfo | null>>;
  crashOffer: boolean;
  acceptCrashRestore: () => void;
  declineCrashRestore: () => void;
  torProgress: string | null;
  torError: string | null;
  setTorError: Dispatch<SetStateAction<string | null>>;
  permAsk: PermAsk | null;
  setPermAsk: Dispatch<SetStateAction<PermAsk | null>>;
  extInstallAsk: ExtInstallAsk | null;
  setExtInstallAsk: Dispatch<SetStateAction<ExtInstallAsk | null>>;
  permRemember: boolean;
  setPermRemember: Dispatch<SetStateAction<boolean>>;
  saveOffer: SaveOffer | null;
  setSaveOffer: Dispatch<SetStateAction<SaveOffer | null>>;
  setPwForPage: Dispatch<SetStateAction<number>>;
  httpsWarn: HttpsWarn | null;
  setHttpsWarn: Dispatch<SetStateAction<HttpsWarn | null>>;
};

export function AppChrome({
  children,
  htmlFullscreen,
  windowMode,
  sidebarAutoOpen,
  setSidebarAutoOpen,
  sidebarAutoTimer,
  sidebarMenu,
  setSidebarMenu,
  navigateActive,
  openBookmarkUrl,
  openBookmarkDialog,
  hotTabs,
  torBusy,
  openTorTab,
  tabMenu,
  newTabMenu,
  setTabMenu,
  setNewTabMenu,
  draft,
  setDraft,
  omniEditingRef,
  omniFocusedRef,
  omniMenu,
  setOmniMenu,
  nav,
  go,
  currentView,
  toggleSidebar,
  active,
  activeIsTor,
  isHome,
  isTorHome,
  isInternalAbout,
  isHistoryPage,
  guestWc,
  zoomFlash,
  zoomPercent,
  popupBlocked,
  setPopupBlocked,
  pageHasVideo,
  togglePictureInPicture,
  mediaFlags,
  bookmarkPop,
  setBookmarkPop,
  bookmarkStarRef,
  pwForPage,
  shieldOpen,
  setShieldOpen,
  blockedToday,
  torInfo,
  requestNewIdentity,
  bumpZoom,
  applyZoom,
  printActivePage,
  saveActivePdf,
  setTaskMgrOpen,
  setClearDataOpen,
  setQrOpen,
  setFindOpen,
  findOpen,
  findQuery,
  findActive,
  findTotal,
  setFindQuery,
  runFind,
  closeFind,
  fsToast,
  certWarn,
  setCertWarn,
  certRemember,
  setCertRemember,
  qrOpen,
  clearDataOpen,
  aboutInfo,
  setAboutInfo,
  crashOffer,
  acceptCrashRestore,
  declineCrashRestore,
  torProgress,
  torError,
  setTorError,
  permAsk,
  setPermAsk,
  extInstallAsk,
  setExtInstallAsk,
  permRemember,
  setPermRemember,
  saveOffer,
  setSaveOffer,
  setPwForPage,
  httpsWarn,
  setHttpsWarn,
}: AppChromeProps) {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const bookmarks = useStore((s) => s.bookmarks);
  const newTab = useStore((s) => s.newTab);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const patchSettings = useStore((s) => s.patchSettings);

  const pageUrlForShare =
    active &&
    !active.url.startsWith('about:') &&
    active.url !== HOME_URL &&
    active.url !== TOR_HOME_URL
      ? active.url
      : '';
  const pageBookmarked =
    !!active?.url && isBookmarkableUrl(active.url) && bookmarks.some((b) => b.url === active.url);

  return (
    <div
      className={[
        'app',
        settings.sidebarMode === 'off' || settings.sidebarMode === 'auto' || !settings.showSidebar
          ? 'no-side'
          : '',
        settings.sidebarMode === 'auto' ? 'sidebar-auto' : '',
        settings.sidebarMode === 'auto' && (sidebarAutoOpen || settings.sidePanelOpen)
          ? 'sidebar-auto-open'
          : '',
        (settings.sidebarMode === 'on' || settings.sidebarMode === 'auto') && settings.sidePanelOpen
          ? 'side-panel-open'
          : '',
        settings.uiGlass ? 'glass-on' : '',
        settings.uiMotion ? 'motion-on' : '',
        `theme-${settings.theme}`,
        `bg-${settings.bgStyle}`,
        htmlFullscreen ? 'html-fullscreen' : '',
        windowMode === 'private' ? 'window-private' : '',
        windowMode === 'tor' ? 'window-tor' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          ['--rail-w' as string]: '56px',
          ['--panel-w' as string]:
            (settings.sidebarMode === 'on' || settings.sidebarMode === 'auto') &&
            settings.sidePanelOpen
              ? `${settings.sidePanelWidth}px`
              : '0px',
          ['--side-total' as string]:
            settings.sidebarMode === 'on'
              ? settings.sidePanelOpen
                ? `${56 + settings.sidePanelWidth}px`
                : '56px'
              : '0px',
        } as CSSProperties
      }
    >
      {settings.sidebarMode === 'auto' && (
        <div
          className="sidebar-edge-hit"
          onMouseEnter={() => {
            setSidebarAutoOpen(true);
            if (sidebarAutoTimer.current) window.clearTimeout(sidebarAutoTimer.current);
          }}
        />
      )}
      {(settings.sidebarMode === 'on' || settings.sidebarMode === 'auto') && (
        <div
          className="sidebar-ctx-host"
          onMouseEnter={() => {
            if (settings.sidebarMode !== 'auto') return;
            setSidebarAutoOpen(true);
            if (sidebarAutoTimer.current) window.clearTimeout(sidebarAutoTimer.current);
          }}
          onMouseLeave={() => {
            if (settings.sidebarMode !== 'auto') return;
            // Keep overlay while a side app panel is open
            if (settings.sidePanelOpen) return;
            if (sidebarAutoTimer.current) window.clearTimeout(sidebarAutoTimer.current);
            sidebarAutoTimer.current = window.setTimeout(() => setSidebarAutoOpen(false), 300);
          }}
          onContextMenu={(e) => {
            const t = e.target as HTMLElement;
            if (
              t.closest('webview') ||
              t.closest('input') ||
              t.closest('textarea') ||
              t.closest('a')
            )
              return;
            e.preventDefault();
            setSidebarMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <ErrorBoundary name="sidebar">
            <Suspense fallback={null}>
              <AppSidebar onHome={() => navigateActive(HOME_URL)} onOpenTab={(url) => newTab(url)} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      <div className="main">
        <TabStrip
          hotTabs={hotTabs}
          torBusy={torBusy}
          openTorTab={openTorTab}
          tabMenu={tabMenu}
          newTabMenu={newTabMenu}
          setTabMenu={setTabMenu}
          setNewTabMenu={setNewTabMenu}
        />

        <BrowserChrome
          draft={draft}
          setDraft={setDraft}
          omniEditingRef={omniEditingRef}
          omniFocusedRef={omniFocusedRef}
          omniMenu={omniMenu}
          setOmniMenu={setOmniMenu}
          nav={nav}
          go={go}
          navigateActive={navigateActive}
          currentView={currentView}
          toggleSidebar={toggleSidebar}
          active={active}
          activeIsTor={activeIsTor}
          isHome={isHome}
          isTorHome={isTorHome}
          isInternalAbout={isInternalAbout}
          isHistoryPage={isHistoryPage}
          windowMode={windowMode}
          guestWc={guestWc}
          zoomFlash={zoomFlash}
          zoomPercent={zoomPercent}
          popupBlocked={popupBlocked}
          setPopupBlocked={setPopupBlocked}
          pageHasVideo={pageHasVideo}
          togglePictureInPicture={togglePictureInPicture}
          mediaFlags={mediaFlags}
          pageBookmarked={pageBookmarked}
          openBookmarkDialog={openBookmarkDialog}
          bookmarkPop={bookmarkPop}
          setBookmarkPop={setBookmarkPop}
          bookmarkStarRef={bookmarkStarRef}
          shieldOpen={shieldOpen}
          setShieldOpen={setShieldOpen}
          blockedToday={blockedToday}
          torInfo={torInfo}
          requestNewIdentity={requestNewIdentity}
          bumpZoom={bumpZoom}
          applyZoom={applyZoom}
          printActivePage={printActivePage}
          saveActivePdf={saveActivePdf}
          pageUrlForShare={pageUrlForShare}
          setTaskMgrOpen={setTaskMgrOpen}
          setClearDataOpen={setClearDataOpen}
          setQrOpen={setQrOpen}
          setFindOpen={setFindOpen}
        />

        <BookmarksBar onOpen={openBookmarkUrl} onEdit={(b) => openBookmarkDialog(b.url, b.title)} />

        <ChromeOverlays
          findOpen={findOpen}
          findQuery={findQuery}
          findActive={findActive}
          findTotal={findTotal}
          setFindQuery={setFindQuery}
          runFind={runFind}
          closeFind={closeFind}
          fsToast={fsToast}
          htmlFullscreen={htmlFullscreen}
          certWarn={certWarn}
          setCertWarn={setCertWarn}
          certRemember={certRemember}
          setCertRemember={setCertRemember}
          qrOpen={qrOpen}
          setQrOpen={setQrOpen}
          pageUrlForShare={pageUrlForShare}
          clearDataOpen={clearDataOpen}
          setClearDataOpen={setClearDataOpen}
          aboutInfo={aboutInfo}
          setAboutInfo={setAboutInfo}
        />

        <div
          className="stage"
          onDragOver={(e) => {
            if (
              e.dataTransfer.types.includes('Files') ||
              e.dataTransfer.types.includes('text/uri-list')
            ) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            const uri = e.dataTransfer.getData('text/uri-list').split('\n')[0]?.trim();
            if (uri && /^https?:/i.test(uri)) {
              newTab(uri);
              return;
            }
            const file = e.dataTransfer.files?.[0];
            if (file) {
              const path = (file as File & { path?: string }).path;
              if (path) {
                const fileUrl = path.startsWith('file:')
                  ? path
                  : `file:///${path.replace(/\\/g, '/').replace(/^\/+/, '')}`;
                newTab(fileUrl);
              }
            }
          }}
        >
          {(windowMode === 'private' || windowMode === 'tor') && (
            <div className={`window-mode-banner ${windowMode}`} role="status">
              {windowMode === 'private' ? t('chrome.privateBanner') : t('chrome.torBanner')}
            </div>
          )}
          <CrashRestoreOffer
            crashOffer={crashOffer}
            onAccept={acceptCrashRestore}
            onDecline={declineCrashRestore}
          />
          {sidebarMenu && (
            <div
              className="tab-ctx-backdrop"
              onMouseDown={() => setSidebarMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setSidebarMenu(null);
              }}
            >
              <div
                className="tab-ctx-menu"
                style={{ left: sidebarMenu.x, top: sidebarMenu.y }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    newTab();
                    setSidebarMenu(null);
                  }}
                >
                  {t('chrome.newTab')}
                  <kbd>Ctrl+T</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigateActive(HOME_URL);
                    setSidebarMenu(null);
                  }}
                >
                  {t('chrome.home')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsTab('general');
                    setSidebarMenu(null);
                  }}
                >
                  {t('chrome.settings')}
                </button>
                <hr />
                <button
                  type="button"
                  onClick={() => {
                    patchSettings({ showSidebar: false });
                    setSidebarMenu(null);
                  }}
                >
                  {t('chrome.hideSidebarBar')}
                  <kbd>Ctrl+B</kbd>
                </button>
              </div>
            </div>
          )}
          <HttpsWarnOverlay
            httpsWarn={httpsWarn}
            setHttpsWarn={setHttpsWarn}
            navigateActive={navigateActive}
          />
          {torProgress && torBusy && (
            <div className="tor-progress-banner" role="status">
              {torProgress}
            </div>
          )}
          {torError && (
            <div className="tor-error-banner" role="alert">
              <span>{torError}</span>
              <button
                type="button"
                className="icon-btn sm"
                onClick={() => setTorError(null)}
                title={t('common.close')}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <StageOverlays
            permAsk={permAsk}
            setPermAsk={setPermAsk}
            extInstallAsk={extInstallAsk}
            setExtInstallAsk={setExtInstallAsk}
            permRemember={permRemember}
            setPermRemember={setPermRemember}
            saveOffer={saveOffer}
            setSaveOffer={setSaveOffer}
            passwordsOfferSave={settings.passwordsOfferSave}
            activeIsTor={activeIsTor}
            setPwForPage={setPwForPage}
          />
          {children}
        </div>
      </div>
    </div>
  );
}
