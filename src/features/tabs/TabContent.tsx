import {
  lazy,
  Suspense,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { HomeSearch } from '../../components/HomeSearch';
import { ErrorPage } from '../../components/ErrorPage';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import type { TorStatusInfo } from '../../components/TorLanding';
import {
  ABOUT_URL,
  HOME_URL,
  TOR_HOME_URL,
  useStore,
  type Tab,
} from '../../store';
import { TabWebview, type SaveOffer, type WebviewEl } from './TabWebview';

const AboutPage = lazy(() =>
  import('../../components/AboutPage').then((m) => ({ default: m.AboutPage })),
);
const HistoryPage = lazy(() =>
  import('../../components/HistoryPage').then((m) => ({ default: m.HistoryPage })),
);
const BookmarksPage = lazy(() =>
  import('../../components/BookmarksPage').then((m) => ({ default: m.BookmarksPage })),
);
const ExtensionsPage = lazy(() =>
  import('../../components/ExtensionsPage').then((m) => ({ default: m.ExtensionsPage })),
);
const DownloadsPage = lazy(() =>
  import('../../components/DownloadsUI').then((m) => ({ default: m.DownloadsPage })),
);
const TorLanding = lazy(() =>
  import('../../components/TorLanding').then((m) => ({ default: m.TorLanding })),
);

function LazyFallback({ label }: { label?: string }) {
  return (
    <div className="lazy-route-fallback" role="status" aria-live="polite">
      {label || 'Ładowanie…'}
    </div>
  );
}

export type TabContentProps = {
  active: Tab | undefined;
  activeId: string;
  tabs: Tab[];
  activeIsTor: boolean;
  isHistoryPage: boolean;
  isDownloadsPage: boolean;
  isBookmarksPage: boolean;
  isExtensionsPage: boolean;
  isAboutPage: boolean;
  isInternalAbout: boolean;
  isHome: boolean;
  isTorHome: boolean;
  windowMode: 'normal' | 'private' | 'tor';
  torInfo: TorStatusInfo | null;
  setTorInfo: Dispatch<SetStateAction<TorStatusInfo | null>>;
  torBusy: boolean;
  torError: string | null;
  torProgress: string | null;
  requestNewIdentity: () => void | Promise<void>;
  navigateActive: (url: string, query?: string, opts?: { typed?: boolean }) => void;
  openBookmarkUrl: (url: string, opts?: { newTab?: boolean }) => void;
  openBookmarkDialog: (url?: string, title?: string) => void;
  currentView: () => WebviewEl | null;
  bumpZoom: (delta: number, pageUrl?: string) => void;
  doBrowserNav: (dir: 'back' | 'forward', source?: string) => void;
  onNav: (canBack: boolean, canForward: boolean, url: string, title?: string) => void;
  setSaveOffer: Dispatch<SetStateAction<SaveOffer | null>>;
  onGuestMeta: (tabId: string, webContentsId: number | null) => void;
  tabMediaRef: MutableRefObject<Record<string, { hasVideo: boolean; playing: boolean }>>;
  setPageHasVideo: Dispatch<SetStateAction<boolean>>;
  setFindActive: Dispatch<SetStateAction<number>>;
  setFindTotal: Dispatch<SetStateAction<number>>;
  setHtmlFullscreen: Dispatch<SetStateAction<boolean>>;
};

export function TabContent({
  active,
  activeId,
  tabs,
  activeIsTor,
  isHistoryPage,
  isDownloadsPage,
  isBookmarksPage,
  isExtensionsPage,
  isAboutPage,
  isInternalAbout,
  isHome,
  isTorHome,
  windowMode,
  torInfo,
  setTorInfo,
  torBusy,
  torError,
  torProgress,
  requestNewIdentity,
  navigateActive,
  openBookmarkUrl,
  openBookmarkDialog,
  currentView,
  bumpZoom,
  doBrowserNav,
  onNav,
  setSaveOffer,
  onGuestMeta,
  tabMediaRef,
  setPageHasVideo,
  setFindActive,
  setFindTotal,
  setHtmlFullscreen,
}: TabContentProps) {
  const settings = useStore((s) => s.settings);
  const newTab = useStore((s) => s.newTab);
  const updateTab = useStore((s) => s.updateTab);
  const pushHistory = useStore((s) => s.pushHistory);
  const patchSettings = useStore((s) => s.patchSettings);

  return (
    <>
      {isHistoryPage && active && (
        <ErrorBoundary name="about:history">
          <Suspense fallback={<LazyFallback />}>
            <HistoryPage
              onOpen={(url) => {
                navigateActive(url);
              }}
              onOpenNewTab={(url) => newTab(url)}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {isDownloadsPage && active && (
        <ErrorBoundary name="about:downloads">
          <Suspense fallback={<LazyFallback />}>
            <DownloadsPage />
          </Suspense>
        </ErrorBoundary>
      )}
      {isBookmarksPage && active && (
        <ErrorBoundary name="about:bookmarks">
          <Suspense fallback={<LazyFallback />}>
            <BookmarksPage
              onOpen={openBookmarkUrl}
              onEditBookmark={(b) => openBookmarkDialog(b.url, b.title)}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {isExtensionsPage && active && (
        <ErrorBoundary name="about:extensions">
          <Suspense fallback={<LazyFallback />}>
            <ExtensionsPage />
          </Suspense>
        </ErrorBoundary>
      )}
      {isAboutPage && (
        <ErrorBoundary name="about:about">
          <Suspense fallback={<LazyFallback />}>
            <AboutPage />
          </Suspense>
        </ErrorBoundary>
      )}
      {isTorHome && active && (
        <Suspense fallback={<LazyFallback />}>
          <TorLanding
            info={torInfo}
            busy={torBusy}
            error={torError}
            progress={torProgress}
            showDisclaimer={!settings.torSeenDisclaimer}
            onDismissDisclaimer={() => patchSettings({ torSeenDisclaimer: true })}
            onRefresh={() => {
              void window.shell?.torRefresh?.().then((st) => setTorInfo(st || null));
            }}
            onNewIdentity={() => void requestNewIdentity()}
            onStartBrowse={(url) => navigateActive(url)}
          />
        </Suspense>
      )}
      {isHome && active && !activeIsTor && !isHistoryPage && (
        <>
          <HomeSearch
            onGo={(url, query) => {
              if (windowMode === 'private') {
                useStore.getState().newPrivateTab(url);
                return;
              }
              if (windowMode === 'tor') {
                const part = useStore.getState().tabs.find((t) => t.mode === 'tor')?.partition;
                if (part) useStore.getState().newTorTab({ url, partition: part });
                return;
              }
              if (settings.openSearchInNewTab && query) {
                pushHistory(query);
                newTab(url);
                return;
              }
              navigateActive(url, query);
            }}
          />
        </>
      )}
      {active?.loadError &&
        active.id === activeId &&
        !isHome &&
        !isTorHome &&
        !isInternalAbout && (
          <ErrorPage
            url={active.loadError.url}
            errorCode={active.loadError.errorCode}
            description={active.loadError.description}
            kind={active.loadError.kind === 'crash' ? 'crash' : 'network'}
            onRetry={() => {
              const err = active.loadError;
              updateTab(active.id, { loadError: null });
              try {
                currentView()?.reload?.();
              } catch {
                if (err?.url) navigateActive(err.url);
              }
            }}
          />
        )}
      {tabs.map((t) => {
        const isActive =
          t.id === activeId &&
          t.url !== HOME_URL &&
          t.url !== TOR_HOME_URL &&
          !t.url.startsWith('about:') &&
          !t.url.startsWith('djxxr://') &&
          t.url !== ABOUT_URL;
        const keep =
          t.url !== HOME_URL &&
          t.url !== TOR_HOME_URL &&
          !t.url.startsWith('about:') &&
          !t.url.startsWith('djxxr://') &&
          t.url !== ABOUT_URL &&
          // Chrome-like: all non-discarded tabs keep a live <webview> (hidden via CSS).
          // Lazy = session restore marks inactive as discarded; discard timer separately.
          // Previously perfLazyTabs unmounted every inactive tab → killed YouTube/forms.
          (t.id === activeId || !t.discarded);
        const pwOn = settings.passwordsEnabled && t.mode !== 'tor';
        return (
          <TabWebview
            key={t.id}
            tab={t}
            active={isActive}
            alive={keep}
            zoomFactors={settings.zoomFactors}
            onZoomWheel={(deltaY, url) => bumpZoom(deltaY > 0 ? -0.1 : 0.1, url)}
            onFoundInPage={(result) => {
              setFindActive(result.activeMatchOrdinal ?? 0);
              setFindTotal(result.matches ?? 0);
            }}
            onLoadFailed={(payload) => {
              updateTab(t.id, { loadError: payload });
            }}
            onHtmlFullscreen={(on) => {
              if (t.id === activeId) setHtmlFullscreen(on);
            }}
            onMediaState={(st) => {
              tabMediaRef.current[t.id] = st;
              if (t.id === activeId) {
                const next = Boolean(st.hasVideo || st.playing);
                setPageHasVideo((prev) => (prev === next ? prev : next));
              }
            }}
            onBrowserNav={(dir, source) => doBrowserNav(dir, source)}
            onNav={(b, f, u, title) => onNav(b, f, u, title)}
            onSaveOffer={setSaveOffer}
            onGuestMeta={onGuestMeta}
            passwordsEnabled={pwOn}
            passwordsAutofill={pwOn && settings.passwordsAutofill}
            darkPageScrollbars={settings.darkPageScrollbars}
            appTheme={settings.theme}
          />
        );
      })}
    </>
  );
}
