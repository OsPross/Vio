import { useEffect, useRef, useState } from 'react';
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
import { useStore, type SideApp } from '../store';

type WebviewEl = HTMLElement & {
  src: string;
  reload: () => void;
  insertCSS: (css: string) => Promise<string>;
  addEventListener: (type: string, listener: (...args: unknown[]) => void) => void;
  removeEventListener: (type: string, listener: (...args: unknown[]) => void) => void;
};

import { resolveFavicon, faviconImgFallback } from '../lib/favicon';

async function injectCosmetic(el: WebviewEl) {
  try {
    const css = (await window.shell?.adblockCosmetic?.()) ?? '';
    if (!css) return;
    await el.insertCSS(css);
  } catch {
    /* */
  }
}

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
    return <img src={src} alt="" width={18} height={18} onError={(e) => faviconImgFallback(e, app.url)} />;
  }
  return <span className="side-rail-letter">{app.label.slice(0, 1)}</span>;
}

function SideWebview({
  app,
  active,
  webRef,
}: {
  app: SideApp;
  active: boolean;
  webRef: (el: WebviewEl | null) => void;
}) {
  const local = useRef<WebviewEl | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = local.current;
    if (!el) return;
    const onStop = () => setLoaded(true);
    const onReady = () => {
      setLoaded(true);
      void injectCosmetic(el);
    };
    el.addEventListener('did-stop-loading', onStop);
    el.addEventListener('dom-ready', onReady);
    el.addEventListener('did-finish-load', onReady);
    return () => {
      el.removeEventListener('did-stop-loading', onStop);
      el.removeEventListener('dom-ready', onReady);
      el.removeEventListener('did-finish-load', onReady);
    };
  }, [app.id]);

  return (
    <div className={`side-webview-wrap ${active ? 'on' : ''}`}>
      {!loaded && active && <div className="side-webview-loading">Ładowanie {app.label}…</div>}
      <webview
        ref={(node) => {
          local.current = node as unknown as WebviewEl | null;
          webRef(local.current);
        }}
        className="side-webview"
        src={app.url}
        partition="persist:main"
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
  const settings = useStore((s) => s.settings);
  const sideApps = useStore((s) => s.sideApps);
  const openSideApp = useStore((s) => s.openSideApp);
  const closeSidePanel = useStore((s) => s.closeSidePanel);
  const patchSettings = useStore((s) => s.patchSettings);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const views = useRef<Record<string, WebviewEl | null>>({});
  const [mounted, setMounted] = useState<Record<string, boolean>>({});

  const active = sideApps.find((a) => a.id === settings.activeSideAppId) ?? null;
  const panelOpen = settings.sidePanelOpen && !!active;
  const motionOff =
    settings.perfReduceMotion ||
    !settings.uiMotion ||
    (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const aiApp = sideApps.find((a) => a.id === 'gemini') ?? sideApps.find((a) => /gemini|chatgpt|ai/i.test(a.id + a.label));
  const otherApps = sideApps.filter((a) => a.id !== aiApp?.id);

  useEffect(() => {
    if (panelOpen && active) {
      setMounted((m) => (m[active.id] ? m : { ...m, [active.id]: true }));
    }
  }, [panelOpen, active]);

  return (
    <div className={`side-shell ${panelOpen ? 'panel-open' : ''} ${settings.uiGlass ? 'glass' : ''}`}>
      <aside className="side-rail">
        <LayoutGroup id="side-rail">
          <div className="side-rail-group" role="group" aria-label="Nawigacja">
            <button
              type="button"
              className="side-rail-btn"
              data-tip="Strona startowa"
              title="Strona startowa"
              onClick={onHome}
            >
              <Home size={18} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="side-rail-btn"
              data-tip="Szukaj"
              title="Szukaj"
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
                {panelOpen && active?.id === aiApp.id && motionOff && <span className="side-rail-indicator" />}
                <span className="side-rail-ico">
                  <SideAppIcon app={aiApp} />
                </span>
              </button>
            )}
          </div>

          <div className="side-rail-sep" aria-hidden />

          <div className="side-rail-group side-rail-apps" role="group" aria-label="Aplikacje">
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
              data-tip="Ukryj sidebar"
              title="Ukryj sidebar (Ctrl+B)"
              onClick={() => patchSettings({ showSidebar: false, sidePanelOpen: false })}
            >
              <PanelLeftClose size={18} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="side-rail-btn"
              data-tip="Ustawienia"
              title="Ustawienia"
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
                  title="Odśwież"
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
                  title="Otwórz w karcie"
                  onClick={() => onOpenTab(active.url)}
                >
                  <ExternalLink size={14} strokeWidth={1.75} />
                </button>
                <button type="button" className="icon-btn sm" title="Zamknij panel" onClick={closeSidePanel}>
                  <X size={14} />
                </button>
              </div>
            </header>

            <div className="side-panel-stage">
              {sideApps.map((app) =>
                mounted[app.id] ? (
                  <SideWebview
                    key={app.id}
                    app={app}
                    active={panelOpen && app.id === active.id}
                    webRef={(el) => {
                      views.current[app.id] = el;
                    }}
                  />
                ) : null,
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
