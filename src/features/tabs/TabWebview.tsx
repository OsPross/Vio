import { memo, useCallback, useEffect, useRef } from 'react';
import { hostFromPageUrl, zoomFactorForHost } from '../../lib/pageHost';
import { getWindowPartition } from '../../lib/windowBoot';
import { pageScrollbarCss } from '../../lib/page-scrollbars';
import { letterFavicon } from '../../lib/favicon';
import {
  HOME_URL,
  TOR_HOME_URL,
  ABOUT_URL,
  useStore,
  type Tab,
  type ThemeId,
} from '../../store';

export type WebviewEl = HTMLElement & {
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

export function markTypedUrl(url: string) {
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

export function recordVisitFromTab(
  tab: Tab,
  url: string,
  title: string,
  opts?: { typed?: boolean; soft?: boolean },
) {
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

export type SaveOffer = {
  mode: 'create' | 'update';
  origin: string;
  username: string;
  id?: string;
};

function isGoogleAccountsPage(url: string) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'accounts.google.com' || h.endsWith('.accounts.google.com');
  } catch {
    return false;
  }
}

/** Page scripts only — cosmetic CSS is injected in webview-preload (legacy) or Ghostery session preload. */
async function injectPageScripts(el: WebviewEl, passwordsOn: boolean) {
  try {
    let pageUrl = '';
    try {
      pageUrl = el.getURL();
    } catch {
      /* */
    }
    // Zero script injection on Google login pages (detection / policy)
    if (isGoogleAccountsPage(pageUrl)) return;
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
  /** Latest tab.url for one-shot src init — never bind src={tab.url} (YT miniplayer SPA). */
  const tabUrlRef = useRef(tab.url);
  tabUrlRef.current = tab.url;
  const scrollbarCssKeyRef = useRef<string | null>(null);
  /** Full navigation generation — in-page SPA navigations must not re-run scrollbars / page scripts. */
  const docGenRef = useRef(0);
  const scrollbarsGenRef = useRef(-1);
  const pageScriptsGenRef = useRef(-1);
  const updateTab = useStore((s) => s.updateTab);

  /**
   * Set src only once per webview element. Syncing tab.url from did-navigate-in-page
   * (YouTube miniplayer → home) must NOT rewrite the src attribute — that forces a
   * full reload and kills the miniplayer. Omnibox navigation uses el.src directly.
   */
  const bindWebviewRef = useCallback(
    (node: HTMLElement | null) => {
      const el = node as unknown as WebviewEl | null;
      ref.current = el;
      if (!el) return;
      const flag = el as unknown as { __djxxrSrcInit?: boolean };
      if (flag.__djxxrSrcInit) return;
      flag.__djxxrSrcInit = true;
      try {
        el.src = tabUrlRef.current;
      } catch {
        /* */
      }
    },
    [tab.id],
  );
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
        if (
          tab.mode !== 'tor' &&
          title &&
          title !== '…' &&
          title !== 'Karta' &&
          /^https?:/i.test(url)
        ) {
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
      if (url && active)
        onNavRef.current(el.canGoBack(), el.canGoForward(), url, el.getTitle() || '…');
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
          const accounts = Array.isArray(list)
            ? list.map((a) => ({ id: a.id, username: a.username }))
            : [];
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
      ref={bindWebviewRef as unknown as React.Ref<HTMLElement>}
      className={active ? '' : 'hidden'}
      data-tab-id={tab.id}
      partition={partition}
      allowpopups={'true' as unknown as boolean}
      webpreferences="contextIsolation=yes,sandbox=yes,nativeWindowOpen=yes,spellcheck=yes"
    />
  );
}

export const TabWebview = memo(TabWebviewInner, (prev, next) => {
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
