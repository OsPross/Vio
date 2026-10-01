import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  AppWindow,
  PictureInPicture2,
  Fingerprint,
  Globe,
  KeyRound,
  Lock,
  Mic,
  Moon,
  PanelLeft,
  Plus,
  Puzzle,
  RefreshCw,
  Settings2,
  Shield,
  Star,
  TriangleAlert,
  Video,
  X,
} from 'lucide-react';
import { HomeSearch } from './components/HomeSearch';
import { DownloadsButton } from './components/DownloadsUI';
import { BookmarksBar } from './components/BookmarksBar';
import { BookmarkPopover } from './components/BookmarkPopover';
import { AppMenu, type SidebarMode } from './components/AppMenu';
import { FindBar } from './components/FindBar';
import { ErrorPage } from './components/ErrorPage';
import { PerfGate } from './components/PerfGate';
import { hostFromPageUrl, zoomFactorForHost } from './lib/pageHost';
import { getWindowPartition } from './lib/windowBoot';
import { bindCommandHost } from './lib/commands';
import { OmniboxSuggest } from './components/OmniboxSuggest';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MetricsDot } from './components/metrics/MetricsDot';
import { useMetrics, useMetricsGuests } from './lib/useMetrics';
import type { MetricsGuest } from './lib/metricsTypes';
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
  isPrivateTab,
  normalizeInput,
  useStore,
  type Tab,
  type ThemeId,
} from './store';
import { buildSessionSnapshot } from './lib/sessionSnapshot';
import { Switch } from './components/ui/Switch';
import { formatUrlPlain } from './lib/url-display';
import type { TorStatusInfo } from './components/TorLanding';
import { isEditableDomTarget } from './lib/shortcutsRegistry';
import { TabWebview, markTypedUrl, recordVisitFromTab, type WebviewEl, type SaveOffer } from './features/tabs';
import {
  draftForUrl,
  isInternalPageUrl,
  resolveTorHomeUrl,
  titleForInternalUrl,
} from './lib/tabNavigate';
import { useIpcEvents } from './hooks/useIpcEvents';
import { useShortcuts } from './hooks/useShortcuts';

/** Heavy routes / dialogs — not needed for first paint */
const SettingsPage = lazy(() =>
  import('./components/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const AboutPage = lazy(() =>
  import('./components/AboutPage').then((m) => ({ default: m.AboutPage })),
);
const HistoryPage = lazy(() =>
  import('./components/HistoryPage').then((m) => ({ default: m.HistoryPage })),
);
const BookmarksPage = lazy(() =>
  import('./components/BookmarksPage').then((m) => ({ default: m.BookmarksPage })),
);
const ExtensionsPage = lazy(() =>
  import('./components/ExtensionsPage').then((m) => ({ default: m.ExtensionsPage })),
);
const DownloadsPage = lazy(() =>
  import('./components/DownloadsUI').then((m) => ({ default: m.DownloadsPage })),
);
const CommandPalette = lazy(() =>
  import('./components/CommandPalette').then((m) => ({ default: m.CommandPalette })),
);
const ClearDataDialog = lazy(() =>
  import('./components/ClearDataDialog').then((m) => ({ default: m.ClearDataDialog })),
);
const AboutDialog = lazy(() =>
  import('./components/AppDialogs').then((m) => ({ default: m.AboutDialog })),
);
const QrShareDialog = lazy(() =>
  import('./components/AppDialogs').then((m) => ({ default: m.QrShareDialog })),
);
const TaskManagerOverlay = lazy(() =>
  import('./components/metrics/ResourcesPanel').then((m) => ({ default: m.TaskManagerOverlay })),
);
const AppSidebar = lazy(() =>
  import('./components/AppSidebar').then((m) => ({ default: m.AppSidebar })),
);
const ShieldPanel = lazy(() =>
  import('./components/ShieldPanel').then((m) => ({ default: m.ShieldPanel })),
);
const TorLanding = lazy(() =>
  import('./components/TorLanding').then((m) => ({ default: m.TorLanding })),
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
  const settingsTab = useStore((s) => s.settingsTab);
  const newTab = useStore((s) => s.newTab);
  const newTorTab = useStore((s) => s.newTorTab);
  const newTabBeside = useStore((s) => s.newTabBeside);
  const muteTab = useStore((s) => s.muteTab);
  const closeTab = useStore((s) => s.closeTab);
  const setActive = useStore((s) => s.setActive);
  const updateTab = useStore((s) => s.updateTab);
  const pinTab = useStore((s) => s.pinTab);
  const reopenClosedTab = useStore((s) => s.reopenClosedTab);
  const closeOtherTabs = useStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useStore((s) => s.closeTabsToRight);
  const duplicateTab = useStore((s) => s.duplicateTab);
  const restoreSessionTabs = useStore((s) => s.restoreSessionTabs);
  const setSessionReady = useStore((s) => s.setSessionReady);
  const closedTabs = useStore((s) => s.closedTabs);
  const sessionReady = useStore((s) => s.sessionReady);
  const setView = useStore((s) => s.setView);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
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
  const [guestWc, setGuestWc] = useState<Record<string, number>>({});
  const tabMediaRef = useRef<Record<string, { hasVideo: boolean; playing: boolean }>>({});
  const prevActiveIdRef = useRef(activeId);
  const [hotTabs, setHotTabs] = useState<Record<string, number>>({});
  const [mediaFlags, setMediaFlags] = useState<{ mic: boolean; cam: boolean }>({
    mic: false,
    cam: false,
  });
  const [torInfo, setTorInfo] = useState<TorStatusInfo | null>(null);
  const [torBusy, setTorBusy] = useState(false);
  const [torError, setTorError] = useState<string | null>(null);
  const [torProgress, setTorProgress] = useState<string | null>(null);
  const [shieldOpen, setShieldOpen] = useState(false);
  const [pageHasVideo, setPageHasVideo] = useState(false);
  const [permRemember, setPermRemember] = useState(true);
  const [crashOffer, setCrashOffer] = useState(false);
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
  const [aboutInfo, setAboutInfo] = useState<{
    appVersion: string;
    electron: string;
    chrome: string;
    node: string;
    platform: string;
  } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findActive, setFindActive] = useState(0);
  const [findTotal, setFindTotal] = useState(0);
  const [zoomFlash, setZoomFlash] = useState<number | null>(null);
  const [bookmarkPop, setBookmarkPop] = useState<{ url: string; title: string } | null>(null);
  const bookmarkStarRef = useRef<HTMLButtonElement>(null);
  const bookmarks = useStore((s) => s.bookmarks);
  const [htmlFullscreen, setHtmlFullscreen] = useState(false);
  const [fsToast, setFsToast] = useState(false);
  const [certRemember, setCertRemember] = useState(false);
  const zoomFlashTimer = useRef<number | null>(null);
  const navHistoryRef = useRef<Record<string, Tab['navHistory']>>({});
  const sessionBooted = useRef(false);

  const metricsActive =
    taskMgrOpen ||
    (view === 'settings' && settingsTab === 'resources') ||
    (isHome && settings.homeShowStats);
  // CPU hot-tab hints: sample slowly when discard is on and nobody watches the UI
  const metricsDiscardActive = Boolean(settings.perfDiscardTabs) && !metricsActive;
  const metricsData = useMetrics(
    metricsActive || metricsDiscardActive,
    settings.perfLowPowerClock,
    metricsActive ? 'live' : 'discard',
  );

  const metricsGuests: MetricsGuest[] = tabs
    .filter((t) => t.url !== HOME_URL && !t.url.startsWith('about:') && !t.discarded)
    .map((t) => ({
      id: t.id,
      kind: 'tab' as const,
      title: t.title,
      url: t.url,
      favicon: t.favicon,
      webContentsId: guestWc[t.id] ?? null,
    }));
  useMetricsGuests(metricsActive || metricsDiscardActive, metricsGuests);

  useEffect(() => {
    if (!metricsData?.rows) return;
    setHotTabs((prev) => {
      let changed = false;
      const next: Record<string, number> = { ...prev };
      for (const r of metricsData.rows) {
        if (r.kind !== 'tab') continue;
        const val = r.cpu >= 25 ? (prev[r.id] || 0) + 1 : 0;
        if ((prev[r.id] || 0) !== val) {
          next[r.id] = val;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [metricsData?.ts]); // eslint-disable-line react-hooks/exhaustive-deps

  const onGuestMeta = useCallback((tabId: string, webContentsId: number | null) => {
    setGuestWc((m) => {
      if (webContentsId == null) {
        if (!(tabId in m)) return m;
        const { [tabId]: _, ...rest } = m;
        return rest;
      }
      if (m[tabId] === webContentsId) return m;
      return { ...m, [tabId]: webContentsId };
    });
  }, []);

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

  // Wyrzucanie nieaktywnych kart z pamięci (odmontowanie webview)
  useEffect(() => {
    if (!settings.perfDiscardTabs) return;
    const ms = Math.max(1, settings.perfDiscardMinutes) * 60_000;
    const t = setInterval(() => {
      const st = useStore.getState();
      const now = Date.now();
      for (const tab of st.tabs) {
        if (tab.id === st.activeId) continue;
        if (tab.pinned) continue;
        if (tab.url === HOME_URL || tab.url.startsWith('about:')) continue;
        if (tab.discarded) continue;
        // Never discard while media is playing (YouTube/Discord audio) or video present (PiP risk)
        const media = tabMediaRef.current[tab.id];
        if (media?.playing || media?.hasVideo) continue;
        const last = tab.lastActiveAt ?? 0;
        if (last && now - last >= ms) {
          st.updateTab(tab.id, { discarded: true });
        }
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [settings.perfDiscardTabs, settings.perfDiscardMinutes]);

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

  useEffect(() => {
    let cancelled = false;
    const url = active?.url || '';
    void (async () => {
      try {
        const origin = new URL(url).origin;
        if (!/^https:/i.test(origin)) {
          if (!cancelled) setMediaFlags({ mic: false, cam: false });
          return;
        }
        const list = (await window.shell?.permissionsList?.()) as
          | Record<string, Record<string, string>>
          | undefined;
        const entry = list?.[origin] || {};
        if (!cancelled) {
          setMediaFlags({
            mic: entry.microphone === 'allow' || entry.media === 'allow',
            cam: entry.camera === 'allow' || entry.media === 'allow',
          });
        }
      } catch {
        if (!cancelled) setMediaFlags({ mic: false, cam: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active?.url, permAsk]);

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

  useEffect(() => {
    bindCommandHost({
      newTab: (url) => newTab(url),
      openTorTab: () => void openTorTab(),
      closeActive: () => closeTab(useStore.getState().activeId),
      reopenClosed: () => reopenClosedTab(),
      pinActive: () => {
        const id = useStore.getState().activeId;
        pinTab(id);
      },
      duplicateActive: () => duplicateTab(useStore.getState().activeId),
      muteActive: () => {
        const id = useStore.getState().activeId;
        muteTab(id);
      },
      newIdentity: () => window.dispatchEvent(new CustomEvent('djxxr-tor-new-identity')),
      navigate: (url) => navigateActive(url),
      setSettingsTab: (t) => setSettingsTab(t as 'general'),
      patchSettings: (p) => patchSettings(p),
      toggleSidebar: () =>
        patchSettings({ showSidebar: !useStore.getState().settings.showSidebar }),
      openTaskMgr: () => setTaskMgrOpen(true),
      forgetSite: () => {
        const url = useStore
          .getState()
          .tabs.find((t) => t.id === useStore.getState().activeId)?.url;
        if (url) void window.shell?.privacyForgetSite?.(url);
      },
      clearData: () => {
        void window.shell?.perfClearCache?.();
      },
      print: () => printActivePage(),
      zoom: (delta) => {
        bumpZoom(delta > 0 ? 0.1 : -0.1);
      },
    });
  });

  const pageUrlForShare =
    active &&
    !active.url.startsWith('about:') &&
    active.url !== HOME_URL &&
    active.url !== TOR_HOME_URL
      ? active.url
      : '';
  const pageBookmarked =
    !!active?.url && isBookmarkableUrl(active.url) && bookmarks.some((b) => b.url === active.url);

  const shell = (node: React.ReactNode) => (
    <MotionConfig reducedMotion={motionOff ? 'always' : 'never'}>
      {node}
      <Suspense fallback={null}>
        <TaskManagerOverlay open={taskMgrOpen} onClose={() => setTaskMgrOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onNavigate={(url, opts) => {
            if (opts?.newTab) newTab(normalizeInput(url, settings, bangs));
            else go(url);
          }}
          onSwitchTab={(id) => {
            setActive(id);
            setView('browser');
          }}
          onRunBang={(fill) => {
            setDraft(fill);
            document.getElementById('omnibox-input')?.focus();
          }}
        />
      </Suspense>
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
        } as React.CSSProperties
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
        <div
          className="tabs"
          onDragOver={(e) => {
            if (
              e.dataTransfer.types.includes('text/uri-list') ||
              e.dataTransfer.types.includes('Files')
            ) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'link';
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            const uri = e.dataTransfer.getData('text/uri-list').split('\n')[0]?.trim();
            if (uri) {
              const st = useStore.getState();
              const tab = st.tabs.find((t) => t.id === st.activeId);
              if (isTorTab(tab)) {
                const part = st.tabs.find((t) => t.mode === 'tor')?.partition;
                if (part) newTorTab({ url: uri, partition: part });
              } else {
                newTab(uri);
              }
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
          <LayoutGroup id="chrome-tabs">
            <AnimatePresence initial={false} mode="popLayout">
              {tabs.map((t) => (
                <motion.button
                  key={t.id}
                  type="button"
                  layout={!motionOff}
                  className={`tab ${t.id === activeId ? 'active' : ''} ${t.mode === 'tor' ? 'tor-tab' : ''} ${t.mode === 'private' ? 'private-tab' : ''} ${t.pinned ? 'pinned' : ''} ${t.muted ? 'muted-tab' : ''}`}
                  onClick={() => setActive(t.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setTabMenu({ x: e.clientX, y: e.clientY, tabId: t.id });
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      closeTab(t.id);
                    }
                  }}
                  initial={motionOff ? { opacity: 0 } : { opacity: 0, scaleX: 0.85 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  exit={motionOff ? { opacity: 0 } : { opacity: 0, scaleX: 0.85 }}
                  transition={{ duration: motionOff ? 0.12 : 0.2, ease: [0.16, 1, 0.3, 1] }}
                  style={{ originX: 0 }}
                  title={
                    t.mode === 'tor'
                      ? 'Karta Tor'
                      : t.pinned
                        ? t.title
                        : t.url
                          ? formatUrlPlain(t.url)
                          : undefined
                  }
                >
                  <PerfGate id={`Tab:${t.id}`}>
                    {t.id === activeId && !motionOff && (
                      <motion.span
                        className="tab-indicator"
                        layoutId="tab-active-indicator"
                        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                      />
                    )}
                    {t.id === activeId && motionOff && <span className="tab-indicator" />}
                    {t.mode === 'tor' ? (
                      <span className="tab-onion" aria-hidden>
                        ◉
                      </span>
                    ) : t.favicon ? (
                      <img
                        className="tab-fav"
                        src={t.favicon}
                        alt=""
                        width={14}
                        height={14}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <Globe size={12} strokeWidth={1.8} />
                    )}
                    <span className="tab-title">
                      {t.discarded && t.id !== activeId ? '○ ' : ''}
                      {t.title || 'Karta'}
                    </span>
                    {!t.pinned && (hotTabs[t.id] || 0) >= 3 && !t.discarded && (
                      <span className="tab-cpu-hint" title="Wysokie CPU — uśpij kartę">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateTab(t.id, { discarded: true });
                          }}
                        >
                          <Moon size={11} strokeWidth={1.75} />
                        </button>
                      </span>
                    )}
                    <span
                      className="tab-x"
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(t.id);
                      }}
                    >
                      <X size={12} />
                    </span>
                  </PerfGate>
                </motion.button>
              ))}
            </AnimatePresence>
          </LayoutGroup>
          <button
            type="button"
            className="tab-add"
            title="Nowa karta (Ctrl+T) · PPM / przytrzymaj: Tor"
            onClick={() => newTab()}
            onContextMenu={(e) => {
              e.preventDefault();
              setNewTabMenu({ x: e.clientX, y: e.clientY });
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              const target = e.currentTarget;
              const timer = window.setTimeout(() => {
                const r = target.getBoundingClientRect();
                setNewTabMenu({ x: r.left, y: r.bottom + 4 });
              }, 450);
              const clear = () => {
                window.clearTimeout(timer);
                target.removeEventListener('pointerup', clear);
                target.removeEventListener('pointerleave', clear);
              };
              target.addEventListener('pointerup', clear);
              target.addEventListener('pointerleave', clear);
            }}
          >
            <Plus size={15} strokeWidth={1.8} />
          </button>
        </div>

        <div className={`bar ${settings.uiGlass ? 'glass' : ''} ${activeIsTor ? 'tor-mode' : ''}`}>
          <div className="bar-nav">
            {!settings.showSidebar && (
              <button
                type="button"
                className="icon-btn"
                onClick={toggleSidebar}
                title="Pokaż sidebar (Ctrl+B)"
              >
                <PanelLeft size={16} strokeWidth={1.75} />
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              disabled={isHome || isTorHome || isHistoryPage || !nav.back}
              onClick={() => currentView()?.goBack()}
              title="Wstecz"
            >
              <ArrowLeft size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="icon-btn"
              disabled={isHome || isTorHome || isHistoryPage || !nav.forward}
              onClick={() => currentView()?.goForward()}
              title="Dalej"
            >
              <ArrowRight size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="icon-btn"
              disabled={isHome || isTorHome || isHistoryPage}
              onClick={() => currentView()?.reload()}
              title="Odśwież"
            >
              <RefreshCw size={16} strokeWidth={1.75} />
            </button>
          </div>

          <form
            className={`omnibox ${settings.uiGlass ? 'glass' : ''} ${activeIsTor ? 'tor-mode' : ''}`}
            onSubmit={(e) => {
              e.preventDefault();
              go(draft, { typed: true });
            }}
          >
            {activeIsTor ? (
              <span className="omnibox-sec tor" title="Połączenie przez Tor">
                <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>
                  ◉
                </span>
              </span>
            ) : /^http:\/\//i.test(active?.url || '') ? (
              <span className="omnibox-sec warn" title="Połączenie niezabezpieczone (HTTP)">
                <TriangleAlert size={16} strokeWidth={1.75} />
              </span>
            ) : /^https:\/\//i.test(active?.url || '') ? (
              <span className="omnibox-sec ok" title="Połączenie zabezpieczone (HTTPS)">
                <Lock size={16} strokeWidth={1.75} />
              </span>
            ) : (
              <span className="omnibox-sec" title="Strona startowa">
                <Globe size={16} strokeWidth={1.75} />
              </span>
            )}
            <OmniboxSuggest
              value={draft}
              onChange={setDraft}
              pageUrl={
                isHome || isTorHome || isInternalAbout
                  ? ''
                  : active?.url && !active.url.startsWith('about:')
                    ? active.url
                    : ''
              }
              onEditingChange={(editing) => {
                omniEditingRef.current = editing;
              }}
              onFocusChange={(focused) => {
                omniFocusedRef.current = focused;
                if (!focused && !omniEditingRef.current) {
                  /* synced */
                }
              }}
              onSubmit={(raw, opts) => {
                omniEditingRef.current = false;
                go(raw, opts);
              }}
              onSwitchTab={(tabId) => {
                omniEditingRef.current = false;
                setActive(tabId);
                setView('browser');
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setOmniMenu({ x: e.clientX, y: e.clientY });
              }}
              torMode={activeIsTor}
              placeholder={activeIsTor ? 'Adres przez Tor…' : settings.omniboxPlaceholder}
              bangs={bangs}
              shortcuts={shortcuts}
              tabs={tabs}
            />
            <div className="omnibox-actions">
              {!activeIsTor ? (
                <>
                  {/* Custom element from electron-chrome-extensions (injectBrowserAction in preload) */}
                  <browser-action-list
                    className="ext-browser-actions"
                    partition={
                      windowMode === 'private' && getWindowPartition()
                        ? getWindowPartition()!
                        : 'persist:main'
                    }
                    tab={String(guestWc[activeId] || '')}
                    alignment="bottom left"
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    title="Rozszerzenia"
                    aria-label="Rozszerzenia"
                    onClick={() => navigateActive(EXTENSIONS_URL)}
                  >
                    <Puzzle size={16} strokeWidth={2} />
                  </button>
                </>
              ) : null}
              {((zoomFlash != null && zoomFlash !== 100) ||
                (zoomPercent !== 100 && !isHome && !isTorHome && !isInternalAbout)) &&
              !isHome &&
              !isTorHome &&
              !isInternalAbout ? (
                <span
                  className={`omnibox-zoom-badge ${zoomFlash != null ? 'flash' : ''}`}
                  aria-live="polite"
                >
                  {zoomFlash != null ? zoomFlash : zoomPercent}%
                </span>
              ) : null}
              {popupBlocked && !isHome && !isTorHome && !isInternalAbout ? (
                <button
                  type="button"
                  className="icon-btn on"
                  title={`Zablokowano wyskakujące okno — kliknij, aby pozwolić\n${popupBlocked.url}`}
                  onClick={() => {
                    const blocked = popupBlocked;
                    setPopupBlocked(null);
                    if (blocked.origin) void window.shell?.popupAllow?.(blocked.origin);
                    void window.shell?.popupOpenAllowed?.(blocked.url, blocked.webContentsId);
                  }}
                >
                  <AppWindow size={16} strokeWidth={1.75} />
                </button>
              ) : null}
              {pageHasVideo && !isHome && !isTorHome && !isInternalAbout ? (
                <button
                  type="button"
                  className="icon-btn"
                  title="Obraz w obrazie (Alt+P)"
                  onClick={() => togglePictureInPicture()}
                >
                  <PictureInPicture2 size={16} strokeWidth={1.75} />
                </button>
              ) : null}
              {(mediaFlags.mic || mediaFlags.cam) && (
                <span className="media-use-badges" title="Strona ma dostęp do mediów">
                  {mediaFlags.mic && <Mic size={14} strokeWidth={1.75} />}
                  {mediaFlags.cam && <Video size={14} strokeWidth={1.75} />}
                </span>
              )}
              <div className="omnibox-bookmark-wrap">
                <button
                  ref={bookmarkStarRef}
                  type="button"
                  className={`icon-btn ${pageBookmarked ? 'on' : ''}`}
                  title={pageBookmarked ? 'Edytuj zakładkę (Ctrl+D)' : 'Dodaj zakładkę (Ctrl+D)'}
                  disabled={!isBookmarkableUrl(active?.url)}
                  onClick={() => openBookmarkDialog()}
                  style={{ opacity: isBookmarkableUrl(active?.url) ? 1 : 0.35 }}
                >
                  <Star
                    size={16}
                    strokeWidth={1.75}
                    fill={pageBookmarked ? 'currentColor' : 'none'}
                  />
                </button>
                {bookmarkPop ? (
                  <BookmarkPopover
                    open
                    onClose={() => setBookmarkPop(null)}
                    url={bookmarkPop.url}
                    title={bookmarkPop.title}
                    anchorRef={bookmarkStarRef}
                  />
                ) : null}
              </div>
              <button
                type="button"
                className={`icon-btn ${pwForPage > 0 && !activeIsTor ? 'on' : ''}`}
                title={
                  activeIsTor
                    ? 'Hasła wyłączone w trybie Tor'
                    : pwForPage > 0
                      ? `${pwForPage} zapisanych kont — otwórz Hasła`
                      : 'Menedżer haseł'
                }
                onClick={() => setSettingsTab('passwords')}
                disabled={!settings.passwordsEnabled || activeIsTor}
                style={{ opacity: settings.passwordsEnabled && !activeIsTor ? 1 : 0.35 }}
              >
                <KeyRound size={16} strokeWidth={1.75} />
                {pwForPage > 0 && (
                  <span className="adblock-count">{pwForPage > 9 ? '9+' : pwForPage}</span>
                )}
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Uprawnienia stron"
                onClick={() => setSettingsTab('privacy')}
              >
                <Fingerprint size={16} strokeWidth={1.75} />
              </button>
              <div className="bar-shield-wrap">
                <button
                  type="button"
                  className={`icon-btn adblock-btn ${settings.adblockEnabled ? 'on' : ''}`}
                  title={
                    settings.adblockEnabled
                      ? `Ochrona · dziś ${blockedToday} — kliknij panel tarczy`
                      : 'Ochrona wyłączona'
                  }
                  onClick={() => setShieldOpen((v) => !v)}
                >
                  <Shield size={16} strokeWidth={1.75} />
                  {settings.adblockEnabled && blockedToday > 0 && (
                    <span className="adblock-count">
                      {blockedToday > 99 ? '99+' : blockedToday}
                    </span>
                  )}
                </button>
                {!activeIsTor && (
                  <Suspense fallback={null}>
                    <ShieldPanel
                      open={shieldOpen}
                      onClose={() => setShieldOpen(false)}
                      pageUrl={active?.url || ''}
                      blockedToday={blockedToday}
                      protectionOn={
                        !!active?.url &&
                        !settings.privacySiteExceptions.some((ex) => {
                          try {
                            const h = new URL(active.url).hostname;
                            return h === ex || h.endsWith(`.${ex}`);
                          } catch {
                            return false;
                          }
                        })
                      }
                      onToggleProtection={(on) => {
                        try {
                          const h = new URL(active?.url || '').hostname.replace(/^www\./, '');
                          const base = h.split('.').slice(-2).join('.');
                          if (!on) {
                            patchSettings({
                              privacySiteExceptions: [
                                ...new Set([...(settings.privacySiteExceptions || []), base || h]),
                              ],
                            });
                            void window.shell?.privacyExceptionAdd?.(base || h);
                            const el = currentView();
                            try {
                              el?.reloadIgnoringCache?.();
                            } catch {
                              el?.reload?.();
                            }
                          } else {
                            patchSettings({
                              privacySiteExceptions: (settings.privacySiteExceptions || []).filter(
                                (x) => x !== base && x !== h,
                              ),
                            });
                            void window.shell?.privacyExceptionRemove?.(base || h);
                          }
                        } catch {
                          /* */
                        }
                      }}
                      onDisableOnThisPage={() => {
                        try {
                          const h = new URL(active?.url || '').hostname.replace(/^www\./, '');
                          const base = h.split('.').slice(-2).join('.');
                          patchSettings({
                            privacySiteExceptions: [
                              ...new Set([...(settings.privacySiteExceptions || []), base || h]),
                            ],
                          });
                          void window.shell?.privacyExceptionAdd?.(base || h);
                          const el = currentView();
                          try {
                            el?.reloadIgnoringCache?.();
                          } catch {
                            el?.reload?.();
                          }
                        } catch {
                          /* */
                        }
                      }}
                      onForget={() => {
                        void window.shell?.privacyForgetSite?.(active?.url || '');
                        setShieldOpen(false);
                      }}
                    />
                  </Suspense>
                )}
              </div>
            </div>
          </form>

          {activeIsTor && (
            <span className="tor-chip" title="Tryb Tor — izolowana sesja">
              Tor
              {torInfo?.exitIp ? <em>{torInfo.exitIp}</em> : null}
              <button
                type="button"
                className="tor-chip-newid"
                title="Nowa tożsamość (Ctrl+Shift+U)"
                onClick={() => void requestNewIdentity()}
              >
                Nowa tożsamość
              </button>
            </span>
          )}

          <div className="bar-actions">
            <DownloadsButton
              onOpenAll={() => {
                if (activeIsTor) return;
                navigateActive(DOWNLOADS_URL);
              }}
            />
            <MetricsDot onOpenTaskMgr={() => setTaskMgrOpen(true)} />
            <button
              type="button"
              className="icon-btn"
              title="Ustawienia (Ctrl+,)"
              onClick={() => setSettingsTab('general')}
            >
              <Settings2 size={16} strokeWidth={1.75} />
            </button>
            <AppMenu
              actions={{
                newTab: () => newTab(),
                newWindow: () => void window.shell?.newWindow?.(),
                newPrivateWindow: () => void window.shell?.newWindow?.({ boot: 'private' }),
                newTorWindow: () => void window.shell?.newWindow?.({ boot: 'tor' }),
                sidebarMode: (settings.sidebarMode ||
                  (settings.showSidebar ? 'on' : 'off')) as SidebarMode,
                setSidebarMode: (mode) => patchSettings({ sidebarMode: mode }),
                openPasswords: () => setSettingsTab('passwords'),
                openHistory: () => {
                  if (activeIsTor) return;
                  navigateActive(HISTORY_URL);
                },
                openBookmarks: () => {
                  if (activeIsTor) return;
                  navigateActive(BOOKMARKS_URL);
                },
                openDownloads: () => {
                  if (activeIsTor) return;
                  navigateActive(DOWNLOADS_URL);
                },
                openExtensions: () => {
                  if (activeIsTor) return;
                  navigateActive(EXTENSIONS_URL);
                },
                clearBrowsingData: () => setClearDataOpen(true),
                zoomOut: () => bumpZoom(-0.1),
                zoomIn: () => bumpZoom(0.1),
                zoomReset: () => applyZoom(1),
                zoomPercent,
                toggleFullscreen: () => {
                  void window.shell?.windowToggleFullscreen?.();
                },
                print: () => printActivePage(),
                findInPage: () => setFindOpen(true),
                savePage: () => {
                  window.dispatchEvent(new CustomEvent('djxxr-save-page'));
                },
                savePdf: () => saveActivePdf(),
                copyLink: () => {
                  if (pageUrlForShare) void navigator.clipboard.writeText(pageUrlForShare);
                },
                showQr: () => {
                  if (pageUrlForShare) setQrOpen(true);
                },
                openTaskManager: () => setTaskMgrOpen(true),
                openDevtools: () => {
                  try {
                    currentView()?.openDevTools?.();
                  } catch {
                    /* */
                  }
                },
                openDevtoolsSettings: () => setSettingsTab('advanced'),
                viewSource: () => {
                  const u = pageUrlForShare;
                  if (!u) return;
                  const src = u.startsWith('view-source:') ? u : `view-source:${u}`;
                  if (activeIsTor && active?.partition) {
                    newTorTab({ url: src, partition: active.partition });
                  } else {
                    newTab(src);
                  }
                },
                openAbout: () => {
                  if (activeIsTor) return;
                  navigateActive(ABOUT_URL);
                },
                openSettings: () => setSettingsTab('general'),
                quit: () => void window.shell?.quitApp?.(),
                allowInspect: Boolean(settings.allowInspect),
                hasPage: Boolean(pageUrlForShare),
              }}
            />
          </div>
        </div>

        <BookmarksBar onOpen={openBookmarkUrl} onEdit={(b) => openBookmarkDialog(b.url, b.title)} />

        {findOpen && (
          <FindBar
            query={findQuery}
            activeMatch={findActive}
            matchCount={findTotal}
            onQueryChange={(q) => {
              setFindQuery(q);
              runFind(q);
            }}
            onClose={closeFind}
            onNext={(backward) => runFind(findQuery, backward)}
          />
        )}
        {fsToast && htmlFullscreen && <div className="html-fs-toast">Esc aby wyjść</div>}
        {certWarn && (
          <div className="cert-warn-overlay" role="alertdialog">
            <div className="cert-warn-card">
              <TriangleAlert size={28} strokeWidth={1.6} />
              <h2>Ostrzeżenie certyfikatu</h2>
              <p>
                Połączenie nie jest zaufane ({certWarn.error || 'błąd certyfikatu'}).
                {certWarn.tor ? ' Tryb Tor — kontynuuj tylko jeśli ufasz tej stronie.' : ''}
              </p>
              {certWarn.issuer ? <p className="muted">Wystawca: {certWarn.issuer}</p> : null}
              <code className="cert-warn-url">{certWarn.url}</code>
              {!certWarn.tor ? (
                <label className="perm-remember">
                  <Switch
                    on={certRemember}
                    onChange={setCertRemember}
                    aria-label={`Zapamiętaj wyjątek dla ${certWarn.host || 'tej domeny'}`}
                  />
                  Zapamiętaj wyjątek dla {certWarn.host || 'tej domeny'}
                </label>
              ) : null}
              <div className="cert-warn-actions">
                <button
                  type="button"
                  className="sbtn ghost"
                  onClick={() => {
                    void window.shell?.certificateRespond?.(certWarn.webContentsId, false, false);
                    setCertWarn(null);
                  }}
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  className="sbtn danger-text"
                  onClick={() => {
                    void window.shell?.certificateRespond?.(
                      certWarn.webContentsId,
                      true,
                      certRemember && !certWarn.tor,
                    );
                    setCertWarn(null);
                  }}
                >
                  Kontynuuj mimo to
                </button>
              </div>
            </div>
          </div>
        )}
        {qrOpen && pageUrlForShare && (
          <Suspense fallback={null}>
            <QrShareDialog url={pageUrlForShare} onClose={() => setQrOpen(false)} />
          </Suspense>
        )}
        {clearDataOpen && (
          <Suspense fallback={null}>
            <ClearDataDialog
              open={clearDataOpen}
              onClose={() => setClearDataOpen(false)}
              onConfirm={async (range) => {
                await window.shell?.historyClear?.({ range });
                setClearDataOpen(false);
              }}
            />
          </Suspense>
        )}
        {aboutInfo && (
          <Suspense fallback={null}>
            <AboutDialog info={aboutInfo} onClose={() => setAboutInfo(null)} />
          </Suspense>
        )}

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
              {windowMode === 'private'
                ? 'Okno prywatne — historia i sesja kart nie są zapisywane. Pobrane pliki zostają na dysku, ale nie w liście.'
                : 'Okno Tor — ruch przez sieć Tor. Sesja tego okna jest izolowana (logika demona Tor bez zmian).'}
            </div>
          )}
          {crashOffer && (
            <div className="session-crash-banner" role="alertdialog">
              <div className="session-crash-text">
                <strong>Przeglądarka została nieoczekiwanie zamknięta.</strong>
                <span> Przywrócić karty?</span>
              </div>
              <div className="session-crash-actions">
                <button
                  type="button"
                  className="sbtn"
                  onClick={() => {
                    void (async () => {
                      const saved = await window.shell?.sessionLoad?.();
                      void window.shell?.sessionDismissCrash?.();
                      void window.shell?.sessionMarkClean?.();
                      setCrashOffer(false);
                      if (saved?.tabs?.length) {
                        restoreSessionTabs(
                          saved.tabs.map((t) => ({
                            id: t.id,
                            url: t.url,
                            title: t.title,
                            favicon: t.favicon,
                            pinned: Boolean(t.pinned),
                            navHistory: t.navHistory || null,
                            mode: 'normal' as const,
                            discarded: true,
                          })),
                          saved.activeId,
                          saved.closedTabs || [],
                        );
                      } else {
                        setSessionReady(true);
                      }
                    })();
                  }}
                >
                  Przywróć
                </button>
                <button
                  type="button"
                  className="sbtn danger-text"
                  onClick={() => {
                    void (async () => {
                      await window.shell?.sessionClear?.();
                      void window.shell?.sessionDismissCrash?.();
                      void window.shell?.sessionMarkClean?.();
                      setCrashOffer(false);
                      setSessionReady(true);
                    })();
                  }}
                >
                  Nie
                </button>
              </div>
            </div>
          )}
          {newTabMenu && (
            <div
              className="tab-ctx-backdrop"
              onMouseDown={() => setNewTabMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setNewTabMenu(null);
              }}
            >
              <div
                className="tab-ctx-menu"
                style={{ left: newTabMenu.x, top: newTabMenu.y }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    newTab();
                    setNewTabMenu(null);
                  }}
                >
                  Nowa karta
                  <kbd>Ctrl+T</kbd>
                </button>
                <button
                  type="button"
                  disabled={torBusy}
                  onClick={() => {
                    setNewTabMenu(null);
                    void openTorTab();
                  }}
                >
                  Nowa karta Tor
                  <kbd>Shift+Alt+N</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewTabMenu(null);
                    void window.shell?.newWindow?.({ boot: 'tor' });
                  }}
                >
                  Nowe okno Tor
                </button>
              </div>
            </div>
          )}
          {tabMenu && (
            <div
              className="tab-ctx-backdrop"
              onMouseDown={() => setTabMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setTabMenu(null);
              }}
            >
              <div
                className="tab-ctx-menu"
                style={{ left: tabMenu.x, top: tabMenu.y }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {(() => {
                  const tab = tabs.find((x) => x.id === tabMenu.tabId);
                  const tor = isTorTab(tab);
                  const priv = isPrivateTab(tab);
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          newTabBeside(tabMenu.tabId);
                          setTabMenu(null);
                        }}
                      >
                        Nowa karta obok
                        <kbd>Ctrl+T</kbd>
                      </button>
                      <button
                        type="button"
                        disabled={tor}
                        onClick={() => {
                          duplicateTab(tabMenu.tabId);
                          setTabMenu(null);
                        }}
                      >
                        Duplikuj
                      </button>
                      <button
                        type="button"
                        disabled={tor}
                        onClick={() => {
                          if (tab) pinTab(tab.id);
                          setTabMenu(null);
                        }}
                      >
                        {tab?.pinned ? 'Odepnij kartę' : 'Przypnij kartę'}
                      </button>
                      <button
                        type="button"
                        disabled={tor || !tab || tab.url.startsWith('about:')}
                        onClick={() => {
                          if (tab) muteTab(tab.id);
                          setTabMenu(null);
                        }}
                      >
                        {tab?.muted ? 'Włącz dźwięk karty' : 'Wycisz kartę'}
                      </button>
                      <button
                        type="button"
                        disabled={tor || !tab?.url || tab.url.startsWith('about:')}
                        onClick={() => {
                          const u = tab?.url;
                          setTabMenu(null);
                          if (u) void openTorTab(u);
                        }}
                      >
                        Otwórz w oknie Tor
                      </button>
                      <hr />
                      <button
                        type="button"
                        onClick={() => {
                          closeOtherTabs(tabMenu.tabId);
                          setTabMenu(null);
                        }}
                      >
                        Zamknij inne
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          closeTabsToRight(tabMenu.tabId);
                          setTabMenu(null);
                        }}
                      >
                        Zamknij po prawej
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          closeTab(tabMenu.tabId);
                          setTabMenu(null);
                        }}
                      >
                        Zamknij kartę
                        <kbd>Ctrl+W</kbd>
                      </button>
                      <hr />
                      <button
                        type="button"
                        disabled={!closedTabs.length || tor || priv}
                        onClick={() => {
                          reopenClosedTab();
                          setTabMenu(null);
                        }}
                      >
                        Otwórz ponownie zamkniętą
                        {closedTabs.length ? ` (${closedTabs.length})` : ''}
                        <kbd>Ctrl+Shift+T</kbd>
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
          {omniMenu && (
            <div
              className="tab-ctx-backdrop"
              onMouseDown={() => setOmniMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setOmniMenu(null);
              }}
            >
              <div
                className="tab-ctx-menu"
                style={{ left: omniMenu.x, top: omniMenu.y }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    document.execCommand('cut');
                    setOmniMenu(null);
                  }}
                >
                  Wytnij
                  <kbd>Ctrl+X</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    document.execCommand('copy');
                    setOmniMenu(null);
                  }}
                >
                  Kopiuj
                  <kbd>Ctrl+C</kbd>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const t = await navigator.clipboard.readText();
                      const el = document.getElementById(
                        'omnibox-input',
                      ) as HTMLInputElement | null;
                      if (el) {
                        const start = el.selectionStart ?? el.value.length;
                        const end = el.selectionEnd ?? el.value.length;
                        const next = el.value.slice(0, start) + t + el.value.slice(end);
                        setDraft(next);
                      }
                    } catch {
                      /* */
                    }
                    setOmniMenu(null);
                  }}
                >
                  Wklej
                  <kbd>Ctrl+V</kbd>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const t = (await navigator.clipboard.readText()).trim();
                      if (t) go(t, { typed: true });
                    } catch {
                      /* */
                    }
                    setOmniMenu(null);
                  }}
                >
                  Wklej i przejdź
                </button>
                <hr />
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById('omnibox-input')?.focus();
                    (document.getElementById('omnibox-input') as HTMLInputElement | null)?.select();
                    setOmniMenu(null);
                  }}
                >
                  Zaznacz wszystko
                  <kbd>Ctrl+A</kbd>
                </button>
              </div>
            </div>
          )}
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
                  Nowa karta
                  <kbd>Ctrl+T</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigateActive(HOME_URL);
                    setSidebarMenu(null);
                  }}
                >
                  Strona startowa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsTab('general');
                    setSidebarMenu(null);
                  }}
                >
                  Ustawienia
                </button>
                <hr />
                <button
                  type="button"
                  onClick={() => {
                    patchSettings({ showSidebar: false });
                    setSidebarMenu(null);
                  }}
                >
                  Ukryj pasek boczny
                  <kbd>Ctrl+B</kbd>
                </button>
              </div>
            </div>
          )}
          {httpsWarn && (
            <div className="https-warn-overlay" role="alertdialog" aria-label="Ostrzeżenie HTTPS">
              <div className="https-warn-card">
                <TriangleAlert size={28} strokeWidth={1.6} />
                <h2>Połączenie nie jest bezpieczne</h2>
                <p>
                  Strona nie odpowiada przez HTTPS. W trybie ścisłym możesz wejść mimo to — ruch
                  będzie nieszyfrowany.
                </p>
                <code className="https-warn-url">{httpsWarn.httpUrl}</code>
                <div className="https-warn-actions">
                  <button type="button" className="sbtn ghost" onClick={() => setHttpsWarn(null)}>
                    Anuluj
                  </button>
                  <button
                    type="button"
                    className="sbtn"
                    onClick={() => {
                      const u = httpsWarn.httpUrl;
                      setHttpsWarn(null);
                      navigateActive(u);
                    }}
                  >
                    Wejdź mimo to
                  </button>
                </div>
              </div>
            </div>
          )}
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
                title="Zamknij"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {permAsk && (
            <div className="perm-bar" role="alertdialog">
              <span>
                <strong>{permAsk.origin.replace(/^https:\/\//, '')}</strong> chce użyć:{' '}
                {permAsk.permission === 'microphone'
                  ? 'mikrofonu'
                  : permAsk.permission === 'camera'
                    ? 'kamery'
                    : permAsk.permission === 'geolocation'
                      ? 'lokalizacji'
                      : permAsk.permission === 'notifications'
                        ? 'powiadomień'
                        : permAsk.permission === 'display-capture'
                          ? 'ekranu'
                          : permAsk.permission}
              </span>
              <label className="perm-remember">
                <Switch on={permRemember} onChange={setPermRemember} aria-label="Zapamiętaj" />
                Zapamiętaj
              </label>
              <div className="pw-save-actions">
                <button
                  type="button"
                  className="sbtn"
                  onClick={() => {
                    void window.shell?.permissionsRespond?.(
                      permAsk.askId,
                      true,
                      permRemember,
                      permAsk.origin,
                      permAsk.permission,
                    );
                    setPermAsk(null);
                  }}
                >
                  Zezwól
                </button>
                <button
                  type="button"
                  className="sbtn ghost"
                  onClick={() => {
                    void window.shell?.permissionsRespond?.(
                      permAsk.askId,
                      false,
                      permRemember,
                      permAsk.origin,
                      permAsk.permission,
                    );
                    setPermAsk(null);
                  }}
                >
                  Zablokuj
                </button>
              </div>
            </div>
          )}
          {saveOffer && settings.passwordsOfferSave && !activeIsTor && (
            <div className="pw-save-bar" role="status">
              <KeyRound size={14} strokeWidth={1.75} />
              <span>
                {saveOffer.mode === 'update' ? 'Zaktualizować' : 'Zapisać'} hasło dla{' '}
                <strong>{saveOffer.origin.replace(/^https:\/\//, '')}</strong>
                {saveOffer.username ? ` (${saveOffer.username})` : ''}?
              </span>
              <div className="pw-save-actions">
                <button
                  type="button"
                  className="sbtn"
                  onClick={() => {
                    void window.shell?.passwordsConfirmSave?.().then(() => {
                      setSaveOffer(null);
                      setPwForPage((n) => n + (saveOffer.mode === 'create' ? 1 : 0));
                    });
                  }}
                >
                  Zapisz
                </button>
                <button
                  type="button"
                  className="sbtn ghost"
                  onClick={() => {
                    void window.shell?.passwordsDismissSave?.();
                    setSaveOffer(null);
                  }}
                >
                  Nie teraz
                </button>
                <button
                  type="button"
                  className="sbtn danger-text"
                  onClick={() => {
                    void window.shell?.passwordsNeverAdd?.(saveOffer.origin);
                    void window.shell?.passwordsDismissSave?.();
                    setSaveOffer(null);
                  }}
                >
                  Nigdy dla tej strony
                </button>
              </div>
            </div>
          )}
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
        </div>
      </div>
    </div>,
  );
}
