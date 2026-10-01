import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
import { DownloadsButton, DownloadsPage } from './components/DownloadsUI';
import { CommandPalette } from './components/CommandPalette';
import { HistoryPage } from './components/HistoryPage';
import { ClearDataDialog } from './components/ClearDataDialog';
import { BookmarksPage } from './components/BookmarksPage';
import { ExtensionsPage } from './components/ExtensionsPage';
import { BookmarksBar } from './components/BookmarksBar';
import { BookmarkPopover } from './components/BookmarkPopover';
import { AppMenu, type SidebarMode } from './components/AppMenu';
import { AboutDialog, QrShareDialog } from './components/AppDialogs';
import { FindBar } from './components/FindBar';
import { ErrorPage } from './components/ErrorPage';
import { PerfGate } from './components/PerfGate';
import { hostFromPageUrl, zoomFactorForHost } from './lib/pageHost';
import { setWindowBoot, getWindowPartition } from './lib/windowBoot';
import { bindCommandHost } from './lib/commands';
import { AboutPage } from './components/AboutPage';
import { OmniboxSuggest } from './components/OmniboxSuggest';
import { SettingsPage } from './components/SettingsPage';
import { AppSidebar } from './components/AppSidebar';
import { MetricsDot, TaskManagerOverlay } from './components/metrics/ResourcesPanel';
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
  searchUrl,
  useStore,
  type Tab,
  type ThemeId,
} from './store';
import { pageScrollbarCss } from './lib/page-scrollbars';
import { buildSessionSnapshot } from './lib/sessionSnapshot';
import { TorLanding, type TorStatusInfo } from './components/TorLanding';
import { ShieldPanel } from './components/ShieldPanel';
import { Switch } from './components/ui/Switch';
import { letterFavicon } from './lib/favicon';
import { formatUrlPlain } from './lib/url-display';
import {
  chromeShortcutAllowedInEditable,
  isEditableDomTarget,
  matchChromeShortcut,
  shortcutInputFromKeyboardEvent,
  shortcutInputFromPayload,
  type ShortcutHandlerKey,
  type ShortcutInput,
} from './lib/shortcutsRegistry';

type WebviewEl = HTMLElement & {
  src: string;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  reloadIgnoringCache?: () => void;
  isLoading?: () => boolean;
  stop?: () => void;
  getURL: () => string;
  getTitle: () => string;
  getWebContentsId?: () => number;
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
  insertCSS: (css: string) => Promise<string>;
  removeInsertedCSS?: (key: string) => Promise<void>;
  send: (channel: string, ...args: unknown[]) => void;
  setZoomFactor?: (f: number) => void;
  getZoomFactor?: () => number;
  print?: () => void;
  openDevTools?: () => void;
  findInPage?: (text: string, opts?: object) => number;
  stopFindInPage?: (action: string) => void;
  addEventListener: (type: string, listener: (...args: unknown[]) => void) => void;
  removeEventListener: (type: string, listener: (...args: unknown[]) => void) => void;
};

/** URLs typed in omnibox — next matching visit gets typedCount++ */
const pendingTyped = new Set<string>();

function markTypedUrl(url: string) {
  try {
    const u = new URL(url);
    u.hash = '';
    pendingTyped.add(u.href);
  } catch {
    /* */
  }
}

function consumeTypedUrl(url: string) {
  try {
    const u = new URL(url);
    u.hash = '';
    if (pendingTyped.delete(u.href)) return true;
    // also try without trailing slash mismatch
    const alt = u.href.endsWith('/') ? u.href.slice(0, -1) : `${u.href}/`;
    if (pendingTyped.delete(alt)) return true;
  } catch {
    /* */
  }
  return false;
}

/** Dedup rapid double-fires (navigateActive + did-navigate / finish-load) */
const recentVisitAt = new Map<string, number>();

function visitKey(url: string) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return '';
  }
}

function recordVisitFromTab(tab: Tab, url: string, title: string, opts?: { typed?: boolean; soft?: boolean }) {
  if (tab.mode === 'tor') return;
  const key = visitKey(url);
  if (!key) return;
  const now = Date.now();
  if (opts?.soft) {
    void window.shell?.historyRecordVisit?.({ url: key, title, soft: true, tor: false });
    return;
  }
  const prev = recentVisitAt.get(key) || 0;
  if (now - prev < 2500) {
    void window.shell?.historyRecordVisit?.({ url: key, title, soft: true, tor: false });
    return;
  }
  recentVisitAt.set(key, now);
  void window.shell?.historyRecordVisit?.({
    url: key,
    title,
    typed: opts?.typed || consumeTypedUrl(url),
    soft: false,
    tor: false,
  });
}

type SaveOffer = {
  mode: 'create' | 'update';
  origin: string;
  username: string;
  id?: string;
};

/** Page scripts only — cosmetic CSS is injected in webview-preload (legacy) or Ghostery session preload. */
async function injectPageScripts(el: WebviewEl, passwordsOn: boolean) {
  try {
    let pageUrl = '';
    try {
      pageUrl = el.getURL();
    } catch {
      /* */
    }
    const js = (await window.shell?.adblockPageScript?.(pageUrl)) ?? '';
    if (js) await el.executeJavaScript(js);
    if (passwordsOn) {
      const pwJs = await window.shell?.passwordsPageScript?.();
      if (typeof pwJs === 'string' && pwJs) await el.executeJavaScript(pwJs);
    }
  } catch {
    /* */
  }
}

function pageOrigin(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return '';
    return u.origin;
  } catch {
    return '';
  }
}

function TabWebviewInner({
  tab,
  active,
  alive,
  onNav,
  onSaveOffer,
  onGuestMeta,
  passwordsEnabled,
  passwordsAutofill,
  zoomFactors,
  onZoomWheel,
  onFoundInPage,
  onLoadFailed,
  onHtmlFullscreen,
  darkPageScrollbars,
  appTheme,
  onMediaState,
  onBrowserNav,
}: {
  tab: Tab;
  active: boolean;
  alive: boolean;
  onNav: (canBack: boolean, canForward: boolean, url: string, title: string) => void;
  onSaveOffer: (offer: SaveOffer | null) => void;
  onGuestMeta?: (tabId: string, webContentsId: number | null) => void;
  passwordsEnabled: boolean;
  passwordsAutofill: boolean;
  zoomFactors: Record<string, number>;
  onZoomWheel?: (deltaY: number, url: string) => void;
  onFoundInPage?: (result: { activeMatchOrdinal?: number; matches?: number }) => void;
  onLoadFailed?: (payload: {
    errorCode: number;
    description: string;
    url: string;
    kind?: 'crash' | 'network';
  }) => void;
  onHtmlFullscreen?: (active: boolean) => void;
  darkPageScrollbars: boolean;
  appTheme: ThemeId;
  onMediaState?: (state: { hasVideo: boolean; playing: boolean }) => void;
  onBrowserNav?: (dir: 'back' | 'forward', source?: string) => void;
}) {
  const ref = useRef<WebviewEl | null>(null);
  const scrollbarCssKeyRef = useRef<string | null>(null);
  /** Full navigation generation — in-page SPA navigations must not re-run scrollbars / page scripts. */
  const docGenRef = useRef(0);
  const scrollbarsGenRef = useRef(-1);
  const pageScriptsGenRef = useRef(-1);
  const updateTab = useStore((s) => s.updateTab);
  const onNavRef = useRef(onNav);
  const onSaveOfferRef = useRef(onSaveOffer);
  const onGuestMetaRef = useRef(onGuestMeta);
  const onZoomWheelRef = useRef(onZoomWheel);
  const onFoundInPageRef = useRef(onFoundInPage);
  const onLoadFailedRef = useRef(onLoadFailed);
  const onHtmlFullscreenRef = useRef(onHtmlFullscreen);
  const onMediaStateRef = useRef(onMediaState);
  const onBrowserNavRef = useRef(onBrowserNav);
  onNavRef.current = onNav;
  onSaveOfferRef.current = onSaveOffer;
  onGuestMetaRef.current = onGuestMeta;
  onZoomWheelRef.current = onZoomWheel;
  onFoundInPageRef.current = onFoundInPage;
  onLoadFailedRef.current = onLoadFailed;
  onHtmlFullscreenRef.current = onHtmlFullscreen;
  onMediaStateRef.current = onMediaState;
  onBrowserNavRef.current = onBrowserNav;

  const applyPageScrollbars = useCallback(
    async (el: WebviewEl) => {
      const dropKey = async () => {
        const key = scrollbarCssKeyRef.current;
        if (!key) return;
        scrollbarCssKeyRef.current = null;
        try {
          await el.removeInsertedCSS?.(key);
        } catch {
          /* */
        }
      };
      if (tab.mode === 'tor' || !darkPageScrollbars) {
        await dropKey();
        return;
      }
      const css = pageScrollbarCss(appTheme);
      await dropKey();
      try {
        scrollbarCssKeyRef.current = await el.insertCSS(css);
      } catch {
        /* */
      }
    },
    [tab.mode, darkPageScrollbars, appTheme],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const sync = () => {
      try {
        const url = el.getURL();
        const title = el.getTitle() || 'Karta';
        const cur = useStore.getState().tabs.find((t) => t.id === tab.id);
        const patch: Partial<Tab> = {};
        if (!cur || cur.url !== url) patch.url = url;
        if (!cur || cur.title !== title) patch.title = title;
        // Do NOT bump lastActiveAt here — that forced store updates on every
        // did-stop-loading / title event and re-rendered the whole chrome.
        if (Object.keys(patch).length) updateTab(tab.id, patch);
        if (active) onNavRef.current(el.canGoBack(), el.canGoForward(), url, title);
        if (tab.mode !== 'tor' && title && title !== '…' && title !== 'Karta' && /^https?:/i.test(url)) {
          recordVisitFromTab(tab, url, title, { soft: true });
        }
      } catch {
        /* */
      }
    };

    const onCommitted = () => {
      sync();
      try {
        if (tab.mode !== 'tor') {
          recordVisitFromTab(tab, el.getURL(), el.getTitle() || '');
        }
      } catch {
        /* */
      }
    };

    const onFinish = () => {
      try {
        if (tab.mode !== 'tor') {
          // Catches navigations that finished before did-navigate listener was attached
          recordVisitFromTab(tab, el.getURL(), el.getTitle() || '');
        }
      } catch {
        /* */
      }
    };

    const onStartNavigation = (raw: unknown) => {
      const ev = raw as { isMainFrame?: boolean; isInPlace?: boolean };
      if (ev.isMainFrame === false || ev.isInPlace) return;
      docGenRef.current += 1;
      scrollbarsGenRef.current = -1;
      pageScriptsGenRef.current = -1;
    };

    const reportGuest = () => {
      try {
        const id = el.getWebContentsId?.() ?? null;
        onGuestMetaRef.current?.(tab.id, typeof id === 'number' ? id : null);
      } catch {
        onGuestMetaRef.current?.(tab.id, null);
      }
    };

    const onStart = (e: unknown) => {
      const url = (e as { url?: string }).url;
      if (url && active) onNavRef.current(el.canGoBack(), el.canGoForward(), url, el.getTitle() || '…');
    };

    const applyStoredZoom = () => {
      try {
        const url = el.getURL();
        const factor = zoomFactorForHost(zoomFactors, hostFromPageUrl(url));
        el.setZoomFactor?.(factor);
      } catch {
        /* */
      }
    };

    const onReady = () => {
      reportGuest();
      applyStoredZoom();
      const gen = docGenRef.current;
      if (pageScriptsGenRef.current !== gen) {
        pageScriptsGenRef.current = gen;
        void injectPageScripts(el, passwordsEnabled);
      }
      if (scrollbarsGenRef.current !== gen) {
        scrollbarsGenRef.current = gen;
        void applyPageScrollbars(el);
      }
    };

    const onNavigateZoom = () => {
      applyStoredZoom();
      const cur = useStore.getState().tabs.find((t) => t.id === tab.id);
      if (cur?.loadError) updateTab(tab.id, { loadError: null });
    };

    const onFound = (raw: unknown) => {
      if (!active) return;
      const ev = raw as {
        result?: { activeMatchOrdinal?: number; matches?: number; finalUpdate?: boolean };
      };
      if (ev.result) onFoundInPageRef.current?.(ev.result);
    };

    const onFailLoad = (raw: unknown) => {
      const ev = raw as {
        errorCode?: number;
        errorDescription?: string;
        validatedURL?: string;
        isMainFrame?: boolean;
      };
      if (!ev.isMainFrame || ev.errorCode === -3) return;
      onLoadFailedRef.current?.({
        errorCode: ev.errorCode ?? 0,
        description: String(ev.errorDescription || ''),
        url: String(ev.validatedURL || tab.url),
        kind: 'network',
      });
    };

    const onCrashed = () => {
      let url = tab.url;
      try {
        url = el.getURL?.() || tab.url;
      } catch {
        /* */
      }
      onLoadFailedRef.current?.({
        errorCode: -9001,
        description: 'Proces renderowania strony został zakończony.',
        url,
        kind: 'crash',
      });
    };

    const onRenderGone = (raw: unknown) => {
      const ev = raw as { reason?: string };
      let url = tab.url;
      try {
        url = el.getURL?.() || tab.url;
      } catch {
        /* */
      }
      onLoadFailedRef.current?.({
        errorCode: -9001,
        description: `Proces strony: ${ev.reason || 'crashed'}`,
        url,
        kind: 'crash',
      });
    };

    const onUnresponsive = () => {
      let url = tab.url;
      try {
        url = el.getURL?.() || tab.url;
      } catch {
        /* */
      }
      onLoadFailedRef.current?.({
        errorCode: -9001,
        description: 'Strona nie odpowiada.',
        url,
        kind: 'crash',
      });
    };

    const onEnterFs = () => onHtmlFullscreenRef.current?.(true);
    const onLeaveFs = () => onHtmlFullscreenRef.current?.(false);

    const onWheel = (ev: WheelEvent) => {
      if (!active || !ev.ctrlKey) return;
      ev.preventDefault();
      let url = '';
      try {
        url = el.getURL();
      } catch {
        return;
      }
      onZoomWheelRef.current?.(ev.deltaY, url);
    };

    const onFavicon = (raw: unknown) => {
      if (tab.mode === 'tor') {
        // Only accept data: from the page itself (loaded via Tor). Never clearnet CDN.
        const favs = (raw as { favicons?: string[] }).favicons;
        const src = favs?.find((f) => typeof f === 'string' && f.startsWith('data:'));
        const next = src || letterFavicon(el.getURL?.() || 'tor');
        const cur = useStore.getState().tabs.find((t) => t.id === tab.id);
        if (cur?.favicon !== next) updateTab(tab.id, { favicon: next });
        return;
      }
      const favs = (raw as { favicons?: string[] }).favicons;
      const src = favs?.find((f) => typeof f === 'string' && f.length > 0);
      if (!src) return;
      try {
        const page = el.getURL();
        const cur = useStore.getState().tabs.find((t) => t.id === tab.id);
        if (src.startsWith('data:')) {
          if (cur?.favicon !== src) updateTab(tab.id, { favicon: src });
          void window.shell?.faviconCachePut?.(page, src);
          return;
        }
        // Show page favicon immediately; cache as data: in background for later
        if (cur?.favicon !== src) updateTab(tab.id, { favicon: src });
        void window.shell?.faviconCachePut?.(page, src).then((local) => {
          if (typeof local === 'string' && local.startsWith('data:')) {
            const latest = useStore.getState().tabs.find((t) => t.id === tab.id);
            if (latest?.favicon !== local) updateTab(tab.id, { favicon: local });
          }
        });
      } catch {
        /* */
      }
    };

    const onIpc = (raw: unknown) => {
      const e = raw as { channel?: string; args?: unknown[] };
      if (e.channel === 'djxxr-media') {
        const msg = e.args?.[0] as { hasVideo?: boolean; playing?: boolean } | undefined;
        onMediaStateRef.current?.({
          hasVideo: Boolean(msg?.hasVideo),
          playing: Boolean(msg?.playing),
        });
        return;
      }
      if (e.channel === 'djxxr-mouse-nav') {
        const msg = e.args?.[0] as { dir?: string; source?: string } | undefined;
        if (msg?.dir === 'back' || msg?.dir === 'forward') {
          onBrowserNavRef.current?.(msg.dir, msg.source || 'guest-mouseup');
        }
        return;
      }
      if (tab.mode === 'tor') return; // no password IPC in Tor
      if (e.channel !== 'djxxr-pw') return;
      const msg = e.args?.[0] as { type?: string; payload?: Record<string, unknown> } | undefined;
      if (!msg?.type) return;

      let realUrl = '';
      try {
        realUrl = el.getURL();
      } catch {
        return;
      }
      const origin = pageOrigin(realUrl);
      if (!origin) return;

      void (async () => {
        if (msg.type === 'login-submit' && passwordsEnabled) {
          const payload = msg.payload || {};
          if (String(payload.origin || '') !== origin) return;
          const st = await window.shell?.passwordsStatus?.();
          if (!st?.unlocked) return;
          const offer = await window.shell?.passwordsShouldSave?.(
            realUrl,
            String(payload.username || ''),
            String(payload.password || ''),
          );
          if (offer && 'offer' in offer && offer.offer && offer.origin) {
            onSaveOfferRef.current({
              mode: (offer.mode as 'create' | 'update') || 'create',
              origin: offer.origin,
              username: offer.username || '',
              id: offer.id,
            });
          }
          return;
        }

        if (msg.type === 'scan' && passwordsEnabled && passwordsAutofill) {
          const st = await window.shell?.passwordsStatus?.();
          if (!st?.unlocked) {
            try {
              el.send('djxxr-pw-cmd', { type: 'accounts', accounts: [] });
            } catch {
              /* */
            }
            return;
          }
          const list = await window.shell?.passwordsFind?.(realUrl);
          const accounts = Array.isArray(list) ? list.map((a) => ({ id: a.id, username: a.username })) : [];
          try {
            el.send('djxxr-pw-cmd', { type: 'accounts', accounts });
          } catch {
            /* */
          }
          return;
        }

        if (msg.type === 'fill-request' && passwordsEnabled && passwordsAutofill) {
          const id = String(msg.payload?.id || '');
          if (!id) return;
          const creds = await window.shell?.passwordsAutofill?.(id, realUrl);
          if (!creds || !('password' in creds)) return;
          try {
            el.send('djxxr-pw-cmd', {
              type: 'fill',
              username: creds.username,
              password: creds.password,
            });
          } catch {
            /* */
          }
        }
      })();
    };

    el.addEventListener('did-navigate', onCommitted);
    el.addEventListener('did-navigate', onNavigateZoom);
    el.addEventListener('did-navigate-in-page', sync);
    el.addEventListener('page-title-updated', sync);
    el.addEventListener('did-stop-loading', sync);
    el.addEventListener('did-start-loading', onStart);
    el.addEventListener('did-start-navigation', onStartNavigation);
    el.addEventListener('dom-ready', onReady);
    el.addEventListener('did-finish-load', onFinish);
    el.addEventListener('found-in-page', onFound);
    el.addEventListener('did-fail-load', onFailLoad);
    el.addEventListener('crashed', onCrashed);
    el.addEventListener('render-process-gone', onRenderGone as EventListener);
    el.addEventListener('unresponsive', onUnresponsive);
    el.addEventListener('enter-html-full-screen', onEnterFs);
    el.addEventListener('leave-html-full-screen', onLeaveFs);
    el.addEventListener('wheel', onWheel as EventListener, { passive: false });
    el.addEventListener('page-favicon-updated', onFavicon);
    el.addEventListener('ipc-message', onIpc);

    // Webview often finishes first navigation before React attaches listeners
    try {
      const cur = el.getURL?.() || '';
      if (cur && tab.mode !== 'tor' && /^https?:/i.test(cur)) {
        recordVisitFromTab(tab, cur, el.getTitle?.() || '');
      }
    } catch {
      /* */
    }

    return () => {
      el.removeEventListener('did-navigate', onCommitted);
      el.removeEventListener('did-navigate', onNavigateZoom);
      el.removeEventListener('did-navigate-in-page', sync);
      el.removeEventListener('page-title-updated', sync);
      el.removeEventListener('did-stop-loading', sync);
      el.removeEventListener('did-start-loading', onStart);
      el.removeEventListener('did-start-navigation', onStartNavigation);
      el.removeEventListener('dom-ready', onReady);
      el.removeEventListener('did-finish-load', onFinish);
      el.removeEventListener('found-in-page', onFound);
      el.removeEventListener('did-fail-load', onFailLoad);
      el.removeEventListener('crashed', onCrashed);
      el.removeEventListener('render-process-gone', onRenderGone as EventListener);
      el.removeEventListener('unresponsive', onUnresponsive);
      el.removeEventListener('enter-html-full-screen', onEnterFs);
      el.removeEventListener('leave-html-full-screen', onLeaveFs);
      el.removeEventListener('wheel', onWheel as EventListener);
      el.removeEventListener('page-favicon-updated', onFavicon);
      el.removeEventListener('ipc-message', onIpc);
    };
  }, [
    tab.id,
    tab.mode,
    // Intentionally omit tab.url — sync updates url and must not re-bind listeners
    // (that caused Maximum update depth with live webviews).
    active,
    updateTab,
    passwordsEnabled,
    passwordsAutofill,
    zoomFactors,
    applyPageScrollbars,
  ]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    void applyPageScrollbars(el);
  }, [applyPageScrollbars]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    try {
      onNav(el.canGoBack(), el.canGoForward(), el.getURL(), el.getTitle() || 'Karta');
    } catch {
      /* */
    }
  }, [active, onNav]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      const wv = el as unknown as { setAudioMuted?: (m: boolean) => void };
      wv.setAudioMuted?.(Boolean(tab.muted));
    } catch {
      /* */
    }
  }, [tab.id, tab.muted, alive]);

  if (
    tab.url === HOME_URL ||
    tab.url === TOR_HOME_URL ||
    tab.url === ABOUT_URL ||
    tab.url.startsWith('about:') ||
    tab.url.startsWith('djxxr://')
  )
    return null;
  if (!alive) return null;

  const partition =
    tab.mode === 'tor' && tab.partition
      ? tab.partition
      : tab.mode === 'private'
        ? tab.partition || getWindowPartition() || ''
        : 'persist:main';

  // Never mount a private webview on a missing/ephemeral-less partition
  if (tab.mode === 'private' && !partition) return null;

  return (
    <webview
      ref={ref as unknown as React.Ref<HTMLElement>}
      className={active ? '' : 'hidden'}
      src={tab.url}
      partition={partition}
      allowpopups={'true' as unknown as boolean}
      webpreferences="contextIsolation=yes,nativeWindowOpen=yes,spellcheck=yes"
    />
  );
}

const TabWebview = memo(TabWebviewInner, (prev, next) => {
  const a = prev.tab;
  const b = next.tab;
  return (
    prev.active === next.active &&
    prev.alive === next.alive &&
    prev.passwordsEnabled === next.passwordsEnabled &&
    prev.passwordsAutofill === next.passwordsAutofill &&
    prev.darkPageScrollbars === next.darkPageScrollbars &&
    prev.appTheme === next.appTheme &&
    prev.zoomFactors === next.zoomFactors &&
    a.id === b.id &&
    a.url === b.url &&
    a.title === b.title &&
    a.favicon === b.favicon &&
    a.mode === b.mode &&
    a.partition === b.partition &&
    a.muted === b.muted &&
    a.discarded === b.discarded &&
    JSON.stringify(a.loadError ?? null) === JSON.stringify(b.loadError ?? null)
  );
});

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
  const openSideApp = useStore((s) => s.openSideApp);

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
    !!active && activeIsTor && (active.url === TOR_HOME_URL || active.url === HOME_URL || active.url === 'about:blank');
  const [draft, setDraft] = useState(isHome || isTorHome ? '' : (active?.url ?? ''));
  /** Omnibox: user is editing — ignore navigations / tab URL sync for draft */
  const omniEditingRef = useRef(false);
  const omniFocusedRef = useRef(false);
  const [nav, setNav] = useState({ back: false, forward: false });
  const [blockedToday, setBlockedToday] = useState(0);
  const [saveOffer, setSaveOffer] = useState<SaveOffer | null>(null);
  const [pwForPage, setPwForPage] = useState(0);
  const [taskMgrOpen, setTaskMgrOpen] = useState(false);
  const [guestWc, setGuestWc] = useState<Record<string, number>>({});
  const tabMediaRef = useRef<Record<string, { hasVideo: boolean; playing: boolean }>>({});
  const prevActiveIdRef = useRef(activeId);
  const [hotTabs, setHotTabs] = useState<Record<string, number>>({});
  const [permAsk, setPermAsk] = useState<{
    askId: string;
    origin: string;
    permission: string;
  } | null>(null);
  const [mediaFlags, setMediaFlags] = useState<{ mic: boolean; cam: boolean }>({ mic: false, cam: false });
  const [torInfo, setTorInfo] = useState<TorStatusInfo | null>(null);
  const [torBusy, setTorBusy] = useState(false);
  const [torError, setTorError] = useState<string | null>(null);
  const [torProgress, setTorProgress] = useState<string | null>(null);
  const [shieldOpen, setShieldOpen] = useState(false);
  const [httpsWarn, setHttpsWarn] = useState<{ httpUrl: string; httpsUrl: string } | null>(null);
  const [popupBlocked, setPopupBlocked] = useState<{
    url: string;
    origin: string;
    webContentsId: number;
  } | null>(null);
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
  const [certWarn, setCertWarn] = useState<{
    webContentsId: number;
    url: string;
    host: string;
    error: string;
    issuer?: string;
    tor?: boolean;
  } | null>(null);
  const [certRemember, setCertRemember] = useState(false);
  const zoomFlashTimer = useRef<number | null>(null);
  const navHistoryRef = useRef<Record<string, Tab['navHistory']>>({});
  const sessionBooted = useRef(false);

  const metricsActive =
    taskMgrOpen ||
    (view === 'settings' && settingsTab === 'resources') ||
    (isHome && settings.homeShowStats);
  const metricsData = useMetrics(metricsActive, settings.perfLowPowerClock);

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
  useMetricsGuests(metricsActive, metricsGuests);

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
    const wcId = guestWc[activeId];
    if (typeof wcId === 'number') void window.shell?.extensionsSelectTab?.(wcId);
  }, [activeId, guestWc]);

  useEffect(() => {
    const offAct = window.shell?.onExtensionsActivateTab?.((payload) => {
      const id = Number(payload?.webContentsId);
      if (!Number.isFinite(id)) return;
      const entry = Object.entries(guestWc).find(([, wc]) => wc === id);
      if (entry) setActive(entry[0]);
    });
    const offClose = window.shell?.onExtensionsCloseTab?.((payload) => {
      const id = Number(payload?.webContentsId);
      if (!Number.isFinite(id)) return;
      const entry = Object.entries(guestWc).find(([, wc]) => wc === id);
      if (entry) closeTab(entry[0]);
    });
    return () => {
      offAct?.();
      offClose?.();
    };
  }, [guestWc, setActive, closeTab]);

  useEffect(() => {
    applyThemeToDom(settings);
    const prefersReduce =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      memoryCapMb: settings.perfMode === 'saver' ? 512 : settings.perfMode === 'performance' ? 1024 : 768,
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
          const tabs = boot.restoreTabs.map((t, i) => ({
            id: Math.random().toString(36).slice(2, 10),
            url: t.url,
            title: t.title || t.url,
            favicon: t.favicon,
            pinned: Boolean(t.pinned),
            navHistory: (t.navHistory as Tab['navHistory']) || null,
            mode: 'normal' as const,
            discarded: i !== 0,
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
          return;
        }

        if (mode === 'pages' && pages.length) {
          const tabs = pages.map((url, i) => ({
            id: Math.random().toString(36).slice(2, 10),
            url,
            title: url,
            mode: 'normal' as const,
            pinned: false,
            discarded: i !== 0,
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

  // Secondary window close → push closed-window stack for Ctrl+Shift+T
  useEffect(() => {
    const off = window.shell?.onWindowClosing?.(() => {
      try {
        useStore.getState().pushClosedWindow();
      } catch {
        /* */
      }
      void window.shell?.windowClosingAck?.();
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        if (useStore.getState().settings.sidebarMode !== 'auto') return;
        e.preventDefault();
        setSidebarAutoOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    const unsub = window.shell?.onPermissionAsk?.((req) => {
      setPermAsk({
        askId: String(req.askId || ''),
        origin: String(req.origin || ''),
        permission: String(req.permission || ''),
      });
    });
    return () => unsub?.();
  }, []);

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
        const list = (await window.shell?.permissionsList?.()) as Record<string, Record<string, string>> | undefined;
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

  useEffect(() => {
    void window.shell?.passwordsIdle?.(settings.passwordsIdleMinutes);
  }, [settings.passwordsIdleMinutes]);

  useEffect(() => {
    const ping = () => void window.shell?.passwordsActivity?.();
    window.addEventListener('pointerdown', ping);
    window.addEventListener('keydown', ping);
    return () => {
      window.removeEventListener('pointerdown', ping);
      window.removeEventListener('keydown', ping);
    };
  }, []);

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
    const rules = settings.adblockCustomRules
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    void window.shell
      ?.adblockConfig?.({
        enabled: settings.adblockEnabled,
        network: settings.adblockNetwork,
        cosmetic: settings.adblockCosmetic,
        trackers: settings.adblockTrackers,
        customRules: rules,
      })
      .then((st) => {
        if (st?.blockedToday != null) setBlockedToday(st.blockedToday);
      });
    void window.shell?.privacyConfig?.({
      enabled: settings.adblockEnabled,
      stripTracking: settings.privacyStripTracking,
      secGpc: settings.privacySecGpc,
      dnt: settings.privacyDnt,
      referrerPolicy: settings.privacyReferrerPolicy,
      thirdPartyCookies: settings.privacyThirdPartyCookies,
      httpsOnly: settings.privacyHttpsOnly,
      chromeUa: settings.privacyChromeUa,
      webRtc: settings.privacyWebRtc,
      fingerprint: settings.privacyFingerprint,
      siteExceptions: settings.privacySiteExceptions,
      doh: settings.privacyAllowAppNetwork ? settings.privacyDoh : 'off',
      dohCustom: settings.privacyDohCustom,
      adblockUpdateLists: settings.privacyAllowAppNetwork && settings.adblockUpdateLists,
      clearOnQuit: settings.privacyClearOnQuit,
      clearOnQuitKeep: settings.privacyClearOnQuitKeep,
    });
    void window.shell?.historyConfig?.({ retention: settings.historyRetention || '90' });
    void window.shell?.downloadsConfig?.({
      folder: settings.downloadsFolder || undefined,
      askWhere: settings.downloadsAskWhere,
    });
  }, [
    settings.adblockEnabled,
    settings.adblockNetwork,
    settings.adblockCosmetic,
    settings.adblockTrackers,
    settings.adblockCustomRules,
    settings.adblockUpdateLists,
    settings.privacyStripTracking,
    settings.privacySecGpc,
    settings.privacyDnt,
    settings.privacyReferrerPolicy,
    settings.privacyThirdPartyCookies,
    settings.privacyHttpsOnly,
    settings.privacyChromeUa,
    settings.privacyWebRtc,
    settings.privacyFingerprint,
    settings.privacySiteExceptions,
    settings.privacyDoh,
    settings.privacyDohCustom,
    settings.privacyAllowAppNetwork,
    settings.privacyClearOnQuit,
    settings.privacyClearOnQuitKeep,
    settings.historyRetention,
    settings.downloadsFolder,
    settings.downloadsAskWhere,
  ]);

  useEffect(() => {
    const off = window.shell?.onAdblockBlocked?.((n) => setBlockedToday(n));
    return () => off?.();
  }, []);

  useEffect(() => {
    const off = window.shell?.onHttpsWarn?.((payload) => {
      if (payload?.httpUrl) setHttpsWarn({ httpUrl: payload.httpUrl, httpsUrl: payload.httpsUrl || '' });
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    const off = window.shell?.onPopupBlocked?.((payload) => {
      if (!payload?.url) return;
      setPopupBlocked({
        url: String(payload.url),
        origin: String(payload.origin || ''),
        webContentsId: Number(payload.webContentsId) || 0,
      });
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    // Re-apply optional Tor daemon autostart after migration removed Startup shortcuts
    if (settings.torDaemonAutostart) {
      void window.shell?.torDaemonAutostart?.(true);
    }
  }, [settings.torDaemonAutostart]);

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

  useEffect(() => {
    let applied = false;
    const apply = (payload: { mode?: string; partition?: string | null }) => {
      const m = payload.mode === 'private' || payload.mode === 'tor' ? payload.mode : 'normal';
      setWindowMode(m);
      setWindowPartition(typeof payload.partition === 'string' ? payload.partition : null);
      setWindowBoot({ mode: m, partition: payload.partition });
      if (applied || m === 'normal') return;
      applied = true;
      // Ephemeral windows: discard restored/normal tabs
      useStore.setState({ tabs: [], activeId: '', closedTabs: [] });
      setSessionReady(true);
      if (m === 'private') {
        document.title = 'Prywatne — djxxr';
        useStore.getState().newPrivateTab(HOME_URL);
      } else if (m === 'tor') {
        document.title = 'Tor — djxxr';
        void openTorTab();
      }
    };
    void window.shell?.getWindowBoot?.().then((r) => {
      if (r && r.mode && r.mode !== 'normal') apply(r);
    });
    const off = window.shell?.onWindowBoot?.(apply);
    return () => off?.();
  }, [openTorTab]);

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
    const off = window.shell?.onTorProgress?.((ev) => {
      const msg = typeof ev?.message === 'string' ? ev.message : null;
      if (msg) setTorProgress(msg);
    });
    return () => off?.();
  }, []);

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

  // Clear blocked-popup badge when navigating away
  useEffect(() => {
    setPopupBlocked(null);
    setPageHasVideo(false);
  }, [activeId, active?.url]);

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
    const off = window.shell?.onOpenUrl?.((payload) => {
      const url = typeof payload === 'string' ? payload : payload?.url;
      const viaTor = typeof payload === 'object' && Boolean(payload?.tor);
      const viaPrivate = typeof payload === 'object' && Boolean(payload?.private);
      const background = typeof payload === 'object' && Boolean(payload?.background);
      if (!url) return;
      if (viaTor) {
        const part = tabs.find((t) => t.mode === 'tor')?.partition;
        if (part) newTorTab({ url, partition: part, background });
        else void openTorTab(url);
        return;
      }
      if (viaPrivate) {
        newTab(url, { private: true, background });
        return;
      }
      newTab(url, { background });
    });
    return () => off?.();
  }, [newTab, newTorTab, tabs, openTorTab]);

  useEffect(() => {
    const off = window.shell?.onContextAction?.((payload) => {
      const action = String(payload?.action || '');
      const url = typeof payload?.url === 'string' ? payload.url : '';
      const text = typeof payload?.text === 'string' ? payload.text : '';
      const tor = Boolean(payload?.tor);
      const priv = Boolean(payload?.private);
      if (action === 'open-window' && url) {
        if (tor) {
          const part = useStore.getState().tabs.find((t) => t.mode === 'tor')?.partition;
          if (part) newTorTab({ url, partition: part });
          else void openTorTab(url);
        } else {
          newTab(url, { private: priv });
        }
        return;
      }
      if (action === 'search-selection' && text.trim()) {
        const st = useStore.getState().settings;
        const qUrl = searchUrl(st, text.trim());
        if (tor) {
          const part = useStore.getState().tabs.find((t) => t.mode === 'tor')?.partition;
          if (part) newTorTab({ url: qUrl, partition: part });
          else void openTorTab(qUrl);
        } else {
          newTab(qUrl, { private: priv });
        }
      }
    });
    return () => off?.();
  }, [newTab, newTorTab, openTorTab]);

  useEffect(() => {
    void window.shell?.setDevtoolsEnabled?.(Boolean(settings.allowInspect));
  }, [settings.allowInspect]);

  const onNav = useCallback((canBack: boolean, canForward: boolean, url: string, _title?: string) => {
    setNav((prev) =>
      prev.back === canBack && prev.forward === canForward ? prev : { back: canBack, forward: canForward },
    );
    if (omniEditingRef.current && omniFocusedRef.current) return;
    if (!url.startsWith('about:')) {
      setDraft((d) => (d === url ? d : url));
    }
  }, []);

  /** Deduped history nav — mouseup (primary) + app-command (fallback) share one gate */
  const browserNavAt = useRef(0);
  const doBrowserNav = useCallback((dir: 'back' | 'forward', source = 'unknown') => {
    const now = Date.now();
    if (now - browserNavAt.current < 180) {
      if (typeof window !== 'undefined' && (window as unknown as { __DJXXR_DEBUG_MOUSE?: boolean }).__DJXXR_DEBUG_MOUSE) {
        console.log('[mouse-nav:ui] dedup-skip', { dir, source });
      }
      return;
    }
    browserNavAt.current = now;
    if (typeof window !== 'undefined' && (window as unknown as { __DJXXR_DEBUG_MOUSE?: boolean }).__DJXXR_DEBUG_MOUSE) {
      console.log('[mouse-nav:ui] nav', { dir, source });
    }
    const st = useStore.getState();
    if (st.view === 'settings') {
      if (dir === 'back') st.setView('browser');
      return;
    }
    const tab = st.tabs.find((t) => t.id === st.activeId);
    if (!tab) return;
    // Internal pages without webview: no history stack — event still consumed (no double fire)
    if (tab.url === HOME_URL || tab.url === TOR_HOME_URL || tab.url.startsWith('about:')) {
      return;
    }
    const el = currentView();
    try {
      if (dir === 'back') el?.goBack?.();
      else el?.goForward?.();
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    const off = window.shell?.onBrowserNav?.((payload) => {
      if (payload?.dir === 'back' || payload?.dir === 'forward') {
        doBrowserNav(payload.dir, payload.source || 'app-command');
      }
    });
    return () => off?.();
  }, [doBrowserNav]);

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
      e.preventDefault();
      doBrowserNav(e.button === 3 ? 'back' : 'forward', 'chrome-mouseup');
    };

    const onUp = (e: MouseEvent) => {
      logUi('mouseup', e);
      onSide(e);
    };
    const onDown = (e: MouseEvent) => logUi('mousedown', e);
    const onAux = (e: MouseEvent) => logUi('auxclick', e);
    const onPtr = (e: PointerEvent) => {
      logUi('pointerdown', e);
      onSide(e);
    };
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
    const off = window.shell?.onCertificateError?.((payload) => {
      if (!payload || typeof payload.webContentsId !== 'number') return;
      setCertRemember(false);
      setCertWarn(payload);
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    if (!htmlFullscreen) {
      setFsToast(false);
      return;
    }
    setFsToast(true);
    const t = window.setTimeout(() => setFsToast(false), 4000);
    return () => window.clearTimeout(t);
  }, [htmlFullscreen]);

  const handleChromeShortcut = useCallback(
    (input: ShortcutInput): boolean => {
      const isMod = input.ctrl || input.meta;

      if (isMod && input.shift && (input.key === 'M' || input.key === 'm')) {
        openSideApp('messenger');
        return true;
      }
      if (isMod && input.shift && (input.key === 'G' || input.key === 'g')) {
        openSideApp('gemini');
        return true;
      }

      const handler = matchChromeShortcut(input);
      if (!handler) return false;

      const runHandler = (key: ShortcutHandlerKey): boolean => {
        switch (key) {
          case 'newTab':
            newTab();
            return true;
          case 'newWindow':
            void window.shell?.newWindow?.();
            return true;
          case 'newPrivateWindow':
            void window.shell?.newWindow?.({ boot: 'private' });
            return true;
          case 'newTorWindow':
            void window.shell?.newWindow?.({ boot: 'tor' });
            return true;
          case 'closeTab':
            closeTab(activeId);
            return true;
          case 'reopenClosedTab':
            reopenClosedTab();
            return true;
          case 'nextTab': {
            const st = useStore.getState();
            const idx = st.tabs.findIndex((t) => t.id === st.activeId);
            if (idx < 0 || st.tabs.length < 2) return true;
            setActive(st.tabs[(idx + 1) % st.tabs.length].id);
            return true;
          }
          case 'prevTab': {
            const st = useStore.getState();
            const idx = st.tabs.findIndex((t) => t.id === st.activeId);
            if (idx < 0 || st.tabs.length < 2) return true;
            setActive(st.tabs[(idx - 1 + st.tabs.length) % st.tabs.length].id);
            return true;
          }
          case 'activateTab1':
          case 'activateTab2':
          case 'activateTab3':
          case 'activateTab4':
          case 'activateTab5':
          case 'activateTab6':
          case 'activateTab7':
          case 'activateTab8':
          case 'activateTab9': {
            const st = useStore.getState();
            const n = Number(key.replace('activateTab', ''));
            if (n === 9 && st.tabs.length) {
              setActive(st.tabs[st.tabs.length - 1].id);
            } else if (n >= 1 && n <= 8 && st.tabs[n - 1]) {
              setActive(st.tabs[n - 1].id);
            }
            return true;
          }
          case 'focusOmnibox': {
            const el = document.getElementById('omnibox-input') as HTMLInputElement | null;
            if (el) {
              el.focus();
              el.select();
            }
            return true;
          }
          case 'reload':
          case 'hardReload': {
            if (isHome || isTorHome || isInternalAbout) return true;
            const el = currentView();
            if (key === 'hardReload') {
              try {
                el?.reloadIgnoringCache?.();
              } catch {
                el?.reload?.();
              }
            } else {
              el?.reload?.();
            }
            return true;
          }
          case 'back':
            doBrowserNav('back');
            return true;
          case 'forward':
            doBrowserNav('forward');
            return true;
          case 'bookmarkPage':
            openBookmarkDialog();
            return true;
          case 'bookmarksManager': {
            const st = useStore.getState();
            const tab = st.tabs.find((t) => t.id === st.activeId);
            if (isTorTab(tab)) return true;
            st.updateTab(st.activeId, { url: BOOKMARKS_URL, title: 'Zakładki' });
            st.setView('browser');
            return true;
          }
          case 'toggleBookmarksBar': {
            const cur = useStore.getState().settings.showBookmarksBar;
            patchSettings({ showBookmarksBar: !cur });
            return true;
          }
          case 'history': {
            const st = useStore.getState();
            const tab = st.tabs.find((t) => t.id === st.activeId);
            if (isTorTab(tab)) return true;
            st.updateTab(st.activeId, { url: HISTORY_URL, title: 'Historia' });
            st.setView('browser');
            return true;
          }
          case 'downloads': {
            const st = useStore.getState();
            const tab = st.tabs.find((t) => t.id === st.activeId);
            if (isTorTab(tab)) return true;
            st.updateTab(st.activeId, { url: DOWNLOADS_URL, title: 'Pobrania' });
            st.setView('browser');
            return true;
          }
          case 'findInPage':
            setFindOpen(true);
            window.setTimeout(() => document.getElementById('find-in-page-input')?.focus(), 0);
            return true;
          case 'print':
            printActivePage();
            return true;
          case 'savePage':
            window.dispatchEvent(new CustomEvent('djxxr-save-page'));
            return true;
          case 'viewSource': {
            const st = useStore.getState();
            const tab = st.tabs.find((t) => t.id === st.activeId);
            const u = tab?.url;
            if (!u || u === HOME_URL || u === TOR_HOME_URL) return true;
            const src = u.startsWith('view-source:') ? u : `view-source:${u}`;
            if (isTorTab(tab) && tab?.partition) {
              newTorTab({ url: src, partition: tab.partition });
            } else {
              newTab(src);
            }
            return true;
          }
          case 'toggleFullscreen':
            void window.shell?.windowToggleFullscreen?.();
            return true;
          case 'devtools':
            try {
              currentView()?.openDevTools?.();
            } catch {
              /* */
            }
            return true;
          case 'pictureInPicture':
            togglePictureInPicture();
            return true;
          case 'clearBrowsingData':
            setClearDataOpen(true);
            return true;
          case 'zoomIn':
            bumpZoom(0.1);
            return true;
          case 'zoomOut':
            bumpZoom(-0.1);
            return true;
          case 'zoomReset':
            applyZoom(1);
            return true;
          case 'openSettings':
            setSettingsTab('general');
            return true;
          case 'toggleSidebar':
            patchSettings({ showSidebar: !useStore.getState().settings.showSidebar });
            return true;
          case 'commandPalette':
            setPaletteOpen(true);
            return true;
          case 'torNewIdentity': {
            const st = useStore.getState();
            const tab = st.tabs.find((t) => t.id === st.activeId);
            if (!isTorTab(tab) && !st.tabs.some((t) => t.mode === 'tor')) return false;
            window.dispatchEvent(new CustomEvent('djxxr-tor-new-identity'));
            return true;
          }
          case 'taskManager':
            setTaskMgrOpen((v) => !v);
            return true;
          case 'escape': {
            // HTML video fullscreen: let Chromium handle Esc first
            if (htmlFullscreen) return false;
            const el = currentView();
            let loading = false;
            try {
              loading = Boolean(el?.isLoading?.());
            } catch {
              /* */
            }
            if (loading) {
              try {
                el?.stop?.();
              } catch {
                /* */
              }
              return true;
            }
            if (taskMgrOpen) {
              setTaskMgrOpen(false);
              return true;
            }
            if (findOpen) {
              closeFind();
              return true;
            }
            if (tabMenu) {
              setTabMenu(null);
              return true;
            }
            if (newTabMenu) {
              setNewTabMenu(null);
              return true;
            }
            if (omniMenu) {
              setOmniMenu(null);
              return true;
            }
            if (sidebarMenu) {
              setSidebarMenu(null);
              return true;
            }
            if (paletteOpen) {
              setPaletteOpen(false);
              return true;
            }
            if (shieldOpen) {
              setShieldOpen(false);
              return true;
            }
            if (view === 'settings') {
              setView('browser');
              return true;
            }
            return false;
          }
          default:
            return false;
        }
      };

      return runHandler(handler);
    },
    [
      activeId,
      applyZoom,
      bumpZoom,
      closeFind,
      closeTab,
      findOpen,
      htmlFullscreen,
      isInternalAbout,
      isHome,
      isTorHome,
      newTab,
      newTorTab,
      omniMenu,
      openBookmarkDialog,
      openSideApp,
      openTorTab,
      paletteOpen,
      patchSettings,
      reopenClosedTab,
      setActive,
      setSettingsTab,
      setView,
      settings.allowInspect,
      shieldOpen,
      sidebarMenu,
      tabMenu,
      taskMgrOpen,
      togglePictureInPicture,
      view,
      doBrowserNav,
    ],
  );

  useEffect(() => {
    const trap =
      findOpen ||
      taskMgrOpen ||
      !!tabMenu ||
      !!omniMenu ||
      !!sidebarMenu ||
      paletteOpen ||
      shieldOpen ||
      view === 'settings';
    void window.shell?.setShortcutTrap?.(trap);
  }, [findOpen, taskMgrOpen, tabMenu, omniMenu, sidebarMenu, paletteOpen, shieldOpen, view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableDomTarget(e.target)) {
        // Chrome: browser chrome shortcuts still fire in fields; editing keys stay with the field.
        const input = shortcutInputFromKeyboardEvent(e);
        const handler = matchChromeShortcut(input);
        if (!chromeShortcutAllowedInEditable(handler)) return;
        if (handleChromeShortcut(input)) e.preventDefault();
        return;
      }
      if (handleChromeShortcut(shortcutInputFromKeyboardEvent(e))) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [handleChromeShortcut]);

  useEffect(() => {
    const off = window.shell?.onShortcut?.((payload) => {
      handleChromeShortcut(shortcutInputFromPayload(payload));
    });
    return () => off?.();
  }, [handleChromeShortcut]);

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
    const nextUrl = tor && (url === HOME_URL || url === 'about:home') ? TOR_HOME_URL : url;
    const title =
      nextUrl === HISTORY_URL
        ? 'Historia'
        : nextUrl === DOWNLOADS_URL
          ? 'Pobrania'
          : nextUrl === BOOKMARKS_URL
            ? 'Zakładki'
            : nextUrl === EXTENSIONS_URL
              ? 'Rozszerzenia'
              : nextUrl === ABOUT_URL || nextUrl === 'about:about'
                ? 'O djxxr'
                : nextUrl === HOME_URL || nextUrl === TOR_HOME_URL
                  ? tor
                    ? 'Tor'
                    : 'Nowa karta'
                  : '…';
    if (!tor && /^https?:/i.test(nextUrl)) {
      recordVisitFromTab(active, nextUrl, '', { typed: !!opts?.typed });
    }
    updateTab(active.id, {
      url: nextUrl,
      title,
      ...(tor ? { mode: 'tor' as const } : {}),
    });
    const isInternal =
      nextUrl === HOME_URL ||
      nextUrl === TOR_HOME_URL ||
      nextUrl === HISTORY_URL ||
      nextUrl === DOWNLOADS_URL ||
      nextUrl === BOOKMARKS_URL ||
      nextUrl === EXTENSIONS_URL ||
      nextUrl === ABOUT_URL ||
      nextUrl === 'about:about' ||
      nextUrl.startsWith('about:');
    if (!tor && !isInternal) {
      requestAnimationFrame(() => {
        const el = currentView();
        if (el && el.src !== nextUrl) el.src = nextUrl;
      });
    }
    setDraft(
      nextUrl === HOME_URL ||
        nextUrl === TOR_HOME_URL ||
        nextUrl === HISTORY_URL ||
        nextUrl === DOWNLOADS_URL ||
        nextUrl === BOOKMARKS_URL ||
        nextUrl === EXTENSIONS_URL ||
        nextUrl === ABOUT_URL ||
        nextUrl === 'about:about'
        ? ''
        : nextUrl,
    );
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
    const isQuery = !!raw.trim() && !/^https?:/i.test(raw.trim()) && !raw.trim().startsWith('about:');
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
    (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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
        const url = useStore.getState().tabs.find((t) => t.id === useStore.getState().activeId)?.url;
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
    active && !active.url.startsWith('about:') && active.url !== HOME_URL && active.url !== TOR_HOME_URL
      ? active.url
      : '';
  const pageBookmarked =
    !!active?.url && isBookmarkableUrl(active.url) && bookmarks.some((b) => b.url === active.url);

  const shell = (node: React.ReactNode) => (
    <MotionConfig reducedMotion={motionOff ? 'always' : 'never'}>
      {node}
      <TaskManagerOverlay open={taskMgrOpen} onClose={() => setTaskMgrOpen(false)} />
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
    </MotionConfig>
  );

  if (view === 'settings') {
    return shell(
      <div className={`app settings-mode ${settings.uiGlass ? 'glass-on' : ''}`}>
        <div className="drag-strip absolute-drag" />
        <SettingsPage />
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
        settings.sidebarMode === 'auto' &&
        (sidebarAutoOpen || settings.sidePanelOpen)
          ? 'sidebar-auto-open'
          : '',
        (settings.sidebarMode === 'on' || settings.sidebarMode === 'auto') &&
        settings.sidePanelOpen
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
            if (t.closest('webview') || t.closest('input') || t.closest('textarea') || t.closest('a')) return;
            e.preventDefault();
            setSidebarMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <AppSidebar
            onHome={() => navigateActive(HOME_URL)}
            onOpenTab={(url) => newTab(url)}
          />
        </div>
      )}

      <div className="main">
        <div
          className="tabs"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('text/uri-list') || e.dataTransfer.types.includes('Files')) {
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
                const fileUrl = path.startsWith('file:') ? path : `file:///${path.replace(/\\/g, '/').replace(/^\/+/, '')}`;
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
              <button type="button" className="icon-btn" onClick={toggleSidebar} title="Pokaż sidebar (Ctrl+B)">
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
                  {/* eslint-disable-next-line react/no-unknown-property */}
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
                  <Star size={16} strokeWidth={1.75} fill={pageBookmarked ? 'currentColor' : 'none'} />
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
                {pwForPage > 0 && <span className="adblock-count">{pwForPage > 9 ? '9+' : pwForPage}</span>}
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
                    <span className="adblock-count">{blockedToday > 99 ? '99+' : blockedToday}</span>
                  )}
                </button>
                {!activeIsTor && (
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
                sidebarMode: (settings.sidebarMode || (settings.showSidebar ? 'on' : 'off')) as SidebarMode,
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

        <BookmarksBar
          onOpen={openBookmarkUrl}
          onEdit={(b) => openBookmarkDialog(b.url, b.title)}
        />

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
          <QrShareDialog url={pageUrlForShare} onClose={() => setQrOpen(false)} />
        )}
        {clearDataOpen && (
          <ClearDataDialog
            open={clearDataOpen}
            onClose={() => setClearDataOpen(false)}
            onConfirm={async (range) => {
              await window.shell?.historyClear?.({ range });
              setClearDataOpen(false);
            }}
          />
        )}
        {aboutInfo && <AboutDialog info={aboutInfo} onClose={() => setAboutInfo(null)} />}

        <div
          className="stage"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/uri-list')) {
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
                      const el = document.getElementById('omnibox-input') as HTMLInputElement | null;
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
                  Strona nie odpowiada przez HTTPS. W trybie ścisłym możesz wejść mimo to — ruch będzie nieszyfrowany.
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
              <button type="button" className="icon-btn sm" onClick={() => setTorError(null)} title="Zamknij">
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
            <HistoryPage
              onOpen={(url) => {
                navigateActive(url);
              }}
              onOpenNewTab={(url) => newTab(url)}
            />
          )}
          {isDownloadsPage && active && <DownloadsPage />}
          {isBookmarksPage && active && (
            <BookmarksPage
              onOpen={openBookmarkUrl}
              onEditBookmark={(b) => openBookmarkDialog(b.url, b.title)}
            />
          )}
          {isExtensionsPage && active && <ExtensionsPage />}
          {isAboutPage && <AboutPage />}
          {isTorHome && active && (
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
              (t.id === activeId || (!settings.perfLazyTabs && !t.discarded));
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
