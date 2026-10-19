import { useCallback, useEffect, useRef, useState, type PointerEvent as RE } from 'react';
import { LayoutGroup, motion } from 'motion/react';
import {
  ExternalLink,
  Home,
  MessageCircle,
  PanelLeftClose,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { useT } from '../i18n';
import { useStore, type SideApp } from '../store';

const PANEL_W_MIN = 280;
const PANEL_W_MAX = 720;

function clampPanelWidth(n: number) {
  return Math.round(Math.min(PANEL_W_MAX, Math.max(PANEL_W_MIN, n)));
}

type WebviewEl = HTMLElement & {
  src: string;
  reload: () => void;
  insertCSS: (css: string) => Promise<string>;
  addEventListener: (type: string, listener: (...args: unknown[]) => void) => void;
  removeEventListener: (type: string, listener: (...args: unknown[]) => void) => void;
};

import { resolveFavicon, faviconImgFallback } from '../lib/favicon';

function SideAppIcon({ app }: { app: SideApp }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (app.id === 'messenger' || app.id === 'gemini') return;
    let cancelled = false;
    void (async () => {
      const cached = await window.shell?.faviconCacheGet?.(app.url);
      if (cancelled) return;
      if (cached) {
        setSrc(cached);
        return;
      }
      try {
        const origin = new URL(app.url).origin;
        const put = await window.shell?.faviconCachePut?.(app.url, `${origin}/favicon.ico`);
        if (!cancelled && put) setSrc(put);
        else if (!cancelled) setSrc(resolveFavicon(app.url));
      } catch {
        if (!cancelled) setSrc(resolveFavicon(app.url));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app.id, app.url]);

  if (app.id === 'messenger') return <MessageCircle size={18} strokeWidth={1.75} />;
  if (app.id === 'gemini') return <Sparkles size={18} strokeWidth={1.75} />;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={18}
        height={18}
        onError={(e) => faviconImgFallback(e, app.url)}
      />
    );
  }
  return <span className="side-rail-letter">{app.label.slice(0, 1)}</span>;
}

/** Sites that serve a desktop UI useless in a ~400px panel — use mobile Chrome UA. */
function wantsCompactSideUa(app: SideApp) {
  const key = `${app.id} ${app.url}`.toLowerCase();
  return /gmail|mail\.google\.com/.test(key);
}

function SideWebview({
  app,
  active,
  webRef,
  loadingLabel,
}: {
  app: SideApp;
  active: boolean;
  webRef: (el: WebviewEl | null) => void;
  loadingLabel: string;
}) {
  const local = useRef<WebviewEl | null>(null);
  const [loaded, setLoaded] = useState(false);
  const compact = wantsCompactSideUa(app);

  useEffect(() => {
    const el = local.current;
    if (!el) return;
    const onStop = () => setLoaded(true);
    const onReady = () => {
      setLoaded(true);
      if (!compact) return;
      // Narrow viewport hint — helps some Google UIs beyond UA alone.
      void el
        .insertCSS(
          'html,body{min-width:0!important;} body{-webkit-text-size-adjust:100%;}',
        )
        .catch(() => {});
    };
    el.addEventListener('did-stop-loading', onStop);
    el.addEventListener('dom-ready', onReady);
    return () => {
      el.removeEventListener('did-stop-loading', onStop);
      el.removeEventListener('dom-ready', onReady);
    };
  }, [app.id, compact]);

  return (
    <div className={`side-webview-wrap ${active ? 'on' : ''}`}>
      {!loaded && active && <div className="side-webview-loading">{loadingLabel}</div>}
      <webview
        ref={(node) => {
          local.current = node as unknown as WebviewEl | null;
          webRef(local.current);
        }}
        className="side-webview"
        src={app.url}
        partition="persist:main"
        // Marker read by electron/security.cjs → mobile Chrome UA (Gmail etc.)
        {...(compact ? { useragent: 'VioSideCompact' } : {})}
        allowpopups={'true' as unknown as boolean}
      />
    </div>
  );
}

export function AppSidebar({
  onHome,
  onOpenTab,
}: {
  onHome: () => void;
  onOpenTab: (url: string) => void;
}) {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const sideApps = useStore((s) => s.sideApps);
  const openSideApp = useStore((s) => s.openSideApp);
  const closeSidePanel = useStore((s) => s.closeSidePanel);
  const patchSettings = useStore((s) => s.patchSettings);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const views = useRef<Record<string, WebviewEl | null>>({});
  const [mounted, setMounted] = useState<Record<string, boolean>>({});
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  const active = sideApps.find((a) => a.id === settings.activeSideAppId) ?? null;
  const panelOpen = settings.sidePanelOpen && !!active;
  const motionOff =
    settings.perfReduceMotion ||
    !settings.uiMotion ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const aiApp =
    sideApps.find((a) => a.id === 'gemini') ??
    sideApps.find((a) => /gemini|chatgpt|ai/i.test(a.id + a.label));
  const otherApps = sideApps.filter((a) => a.id !== aiApp?.id);

  useEffect(() => {
    if (panelOpen && active) {
      setMounted((m) => (m[active.id] ? m : { ...m, [active.id]: true }));
    }
  }, [panelOpen, active]);

  const applyPanelWidth = useCallback(
    (w: number) => {
      const next = clampPanelWidth(w);
      const app = document.querySelector('.app') as HTMLElement | null;
      if (app) {
        app.style.setProperty('--panel-w', `${next}px`);
        if (app.classList.contains('side-panel-open') && !app.classList.contains('no-side')) {
          app.style.setProperty('--side-total', `${56 + next}px`);
        }
      }
      return next;
    },
    [],
  );

  const onResizePointerDown = (e: RE<HTMLDivElement>) => {
    if (!panelOpen) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startW: settings.sidePanelWidth };
    document.documentElement.classList.add('side-panel-resizing');
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* */
    }
  };

  const onResizePointerMove = (e: RE<HTMLDivElement>) => {
    const drag = resizeRef.current;
    if (!drag) return;
    applyPanelWidth(drag.startW + (e.clientX - drag.startX));
  };

  const onResizePointerUp = (e: RE<HTMLDivElement>) => {
    const drag = resizeRef.current;
    if (!drag) return;
    resizeRef.current = null;
    document.documentElement.classList.remove('side-panel-resizing');
    const next = applyPanelWidth(drag.startW + (e.clientX - drag.startX));
    patchSettings({ sidePanelWidth: next });
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
  };

  return (
    <div
      className={`side-shell ${panelOpen ? 'panel-open' : ''} ${settings.uiGlass ? 'glass' : ''}`}
    >
      <aside className="side-rail">
        <LayoutGroup id="side-rail">
          <div className="side-rail-group" role="group" aria-label={t('sidebar.navGroup')}>
            <button
              type="button"
              className="side-rail-btn"
              data-tip={t('sidebar.home')}
              title={t('sidebar.home')}
              onClick={onHome}
            >
              <Home size={18} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="side-rail-btn"
              data-tip={t('sidebar.search')}
              title={t('sidebar.search')}
              onClick={onHome}
            >
              <Search size={18} strokeWidth={1.75} />
            </button>
            {aiApp && (
              <button
                type="button"
                className={`side-rail-btn ${panelOpen && active?.id === aiApp.id ? 'on' : ''}`}
                data-tip={aiApp.label}
                title={aiApp.label}
                onClick={() => openSideApp(aiApp.id)}
              >
                {panelOpen && active?.id === aiApp.id && !motionOff && (
                  <motion.span
                    className="side-rail-indicator"
                    layoutId="side-rail-active"
                    transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                  />
                )}
                {panelOpen && active?.id === aiApp.id && motionOff && (
                  <span className="side-rail-indicator" />
                )}
                <span className="side-rail-ico">
                  <SideAppIcon app={aiApp} />
                </span>
              </button>
            )}
          </div>

          <div className="side-rail-sep" aria-hidden />

          <div className="side-rail-group side-rail-apps" role="group" aria-label={t('sidebar.appsGroup')}>
            {otherApps.map((app) => {
              const on = panelOpen && active?.id === app.id;
              return (
                <button
                  key={app.id}
                  type="button"
                  className={`side-rail-btn ${on ? 'on' : ''}`}
                  data-tip={app.label}
                  title={app.label}
                  onClick={() => openSideApp(app.id)}
                >
                  {on && !motionOff && (
                    <motion.span
                      className="side-rail-indicator"
                      layoutId="side-rail-active"
                      transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                    />
                  )}
                  {on && motionOff && <span className="side-rail-indicator" />}
                  <span className="side-rail-ico">
                    <SideAppIcon app={app} />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="side-rail-sep" aria-hidden />

          <div className="side-rail-foot">
            <button
              type="button"
              className="side-rail-btn"
              data-tip={
                settings.sidebarMode === 'auto' ? t('sidebar.closePanel') : t('sidebar.hideSidebar')
              }
              title={
                settings.sidebarMode === 'auto'
                  ? t('sidebar.closePanel')
                  : t('sidebar.hideSidebarShortcut')
              }
              onClick={() => {
                if (settings.sidebarMode === 'auto') {
                  closeSidePanel();
                  return;
                }
                patchSettings({ showSidebar: false, sidePanelOpen: false, sidebarMode: 'off' });
              }}
            >
              <PanelLeftClose size={18} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="side-rail-btn"
              data-tip={t('sidebar.settings')}
              title={t('sidebar.settings')}
              onClick={() => setSettingsTab('general')}
            >
              <Settings2 size={18} strokeWidth={1.75} />
            </button>
          </div>
        </LayoutGroup>
      </aside>

      <section className={`side-panel ${panelOpen ? 'open' : ''}`} aria-hidden={!panelOpen}>
        {active && (
          <>
            <header className="side-panel-bar">
              <div className="side-panel-title">
                <SideAppIcon app={active} />
                <strong>{active.label}</strong>
              </div>
              <div className="side-panel-actions">
                <button
                  type="button"
                  className="icon-btn sm"
                  title={t('common.refresh')}
                  onClick={() => {
                    try {
                      views.current[active.id]?.reload();
                    } catch {
                      /* */
                    }
                  }}
                >
                  <RefreshCw size={14} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="icon-btn sm"
                  title={t('sidebar.openInTab')}
                  onClick={() => onOpenTab(active.url)}
                >
                  <ExternalLink size={14} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="icon-btn sm"
                  title={t('sidebar.closePanel')}
                  onClick={closeSidePanel}
                >
                  <X size={14} />
                </button>
              </div>
            </header>

            <div className="side-panel-stage">
              {sideApps.map((app) =>
                mounted[app.id] ? (
                  <SideWebview
                    key={wantsCompactSideUa(app) ? `${app.id}-compact` : app.id}
                    app={app}
                    active={panelOpen && app.id === active.id}
                    loadingLabel={t('sidebar.loadingApp', { label: app.label })}
                    webRef={(el) => {
                      views.current[app.id] = el;
                    }}
                  />
                ) : null,
              )}
            </div>

            <div
              className="side-panel-resize"
              role="separator"
              aria-orientation="vertical"
              aria-label={t('sidebar.resizeAria')}
              title={t('sidebar.resizeTitle')}
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
              onDoubleClick={() => {
                const next = applyPanelWidth(420);
                patchSettings({ sidePanelWidth: next });
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}
