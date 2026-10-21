import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as RE,
} from 'react';
import { LayoutGroup, motion } from 'motion/react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ExternalLink,
  Home,
  MessageCircle,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { useT } from '../i18n';
import {
  HOME_URL,
  TOR_HOME_URL,
  isBookmarkableUrl,
  useStore,
  type SideApp,
} from '../store';
import { resolveFavicon, faviconImgFallback } from '../lib/favicon';

const PANEL_W_MIN = 280;
const PANEL_W_MAX = 720;

function clampPanelWidth(n: number) {
  return Math.round(Math.min(PANEL_W_MAX, Math.max(PANEL_W_MIN, n)));
}

type WebviewEl = HTMLElement & {
  src: string;
  reload: () => void;
  insertCSS: (css: string) => Promise<string>;
  setAudioMuted?: (muted: boolean) => void;
  addEventListener: (type: string, listener: (...args: unknown[]) => void) => void;
  removeEventListener: (type: string, listener: (...args: unknown[]) => void) => void;
};

function parseTitleBadge(title: string): number {
  const m = String(title || '').match(/^\((\d{1,3})\)\s*/) || String(title || '').match(/\((\d{1,3})\)/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.min(99, n) : 0;
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

function wantsCompactSideUa(app: SideApp) {
  const key = `${app.id} ${app.url}`.toLowerCase();
  return /gmail|mail\.google\.com/.test(key);
}

function SideWebview({
  app,
  active,
  webRef,
  loadingLabel,
  onBadge,
}: {
  app: SideApp;
  active: boolean;
  webRef: (el: WebviewEl | null) => void;
  loadingLabel: string;
  onBadge: (id: string, count: number) => void;
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
      try {
        el.setAudioMuted?.(Boolean(app.muted));
      } catch {
        /* */
      }
      if (!compact) return;
      void el
        .insertCSS('html,body{min-width:0!important;} body{-webkit-text-size-adjust:100%;}')
        .catch(() => {});
    };
    const onTitle = (raw: unknown) => {
      const title = String((raw as { title?: string })?.title || '');
      onBadge(app.id, parseTitleBadge(title));
    };
    el.addEventListener('did-stop-loading', onStop);
    el.addEventListener('dom-ready', onReady);
    el.addEventListener('page-title-updated', onTitle);
    return () => {
      el.removeEventListener('did-stop-loading', onStop);
      el.removeEventListener('dom-ready', onReady);
      el.removeEventListener('page-title-updated', onTitle);
    };
  }, [app.id, app.muted, compact, onBadge]);

  useEffect(() => {
    const el = local.current;
    if (!el) return;
    try {
      el.setAudioMuted?.(Boolean(app.muted));
    } catch {
      /* */
    }
  }, [app.id, app.muted]);

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
        {...(compact ? { useragent: 'VioSideCompact' } : {})}
        allowpopups={'true' as unknown as boolean}
      />
    </div>
  );
}

function SortableAppBtn({
  app,
  on,
  badge,
  motionOff,
  onOpen,
  onContext,
}: {
  app: SideApp;
  on: boolean;
  badge: number;
  motionOff: boolean;
  onOpen: () => void;
  onContext: (e: ReactMouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: app.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`side-rail-btn ${on ? 'on' : ''} ${isDragging ? 'dragging' : ''}`}
      style={style}
      data-tip={app.label}
      title={app.label}
      onClick={onOpen}
      onContextMenu={onContext}
      {...attributes}
      {...listeners}
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
      {badge > 0 && (
        <span className={`side-rail-badge ${badge > 9 ? '' : badge === 1 ? 'dot' : ''}`}>
          {badge > 9 ? (badge > 99 ? '99+' : String(badge)) : badge === 1 ? '' : String(badge)}
        </span>
      )}
    </button>
  );
}

type CtxMenu = { x: number; y: number; appId: string } | null;

export function AppSidebar({
  onHome,
  onOpenTab,
  onCollapseSidebar,
}: {
  onHome: () => void;
  onOpenTab: (url: string) => void;
  /** Auto mode: hide the overlay rail (AppChrome setSidebarAutoOpen(false)). */
  onCollapseSidebar?: () => void;
}) {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const sideApps = useStore((s) => s.sideApps);
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeId);
  const openSideApp = useStore((s) => s.openSideApp);
  const closeSidePanel = useStore((s) => s.closeSidePanel);
  const addSideApp = useStore((s) => s.addSideApp);
  const removeSideApp = useStore((s) => s.removeSideApp);
  const reorderSideApps = useStore((s) => s.reorderSideApps);
  const setSideAppMuted = useStore((s) => s.setSideAppMuted);
  const patchSettings = useStore((s) => s.patchSettings);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const views = useRef<Record<string, WebviewEl | null>>({});
  const [mounted, setMounted] = useState<Record<string, boolean>>({});
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [ctx, setCtx] = useState<CtxMenu>(null);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  const active = sideApps.find((a) => a.id === settings.activeSideAppId) ?? null;
  const panelOpen = settings.sidePanelOpen && !!active;
  const motionOff =
    settings.perfReduceMotion ||
    !settings.uiMotion ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onBadge = useCallback((id: string, count: number) => {
    setBadges((prev) => (prev[id] === count ? prev : { ...prev, [id]: count }));
  }, []);

  useEffect(() => {
    if (panelOpen && active) {
      setMounted((m) => (m[active.id] ? m : { ...m, [active.id]: true }));
    }
  }, [panelOpen, active]);

  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [ctx]);

  const applyPanelWidth = useCallback((w: number) => {
    const next = clampPanelWidth(w);
    const app = document.querySelector('.app') as HTMLElement | null;
    if (app) {
      app.style.setProperty('--panel-w', `${next}px`);
      if (app.classList.contains('side-panel-open') && !app.classList.contains('no-side')) {
        app.style.setProperty('--side-total', `${56 + next}px`);
      }
    }
    return next;
  }, []);

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

  const onDragEnd = (ev: DragEndEvent) => {
    const { active: a, over } = ev;
    if (!over || a.id === over.id) return;
    const ids = sideApps.map((x) => x.id);
    const oldIndex = ids.indexOf(String(a.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    reorderSideApps(arrayMove(ids, oldIndex, newIndex));
  };

  const activeTab = tabs.find((x) => x.id === activeId) ?? tabs[0];
  const pinUrl = activeTab?.url || '';
  const canPin = Boolean(pinUrl && isBookmarkableUrl(pinUrl));

  const pinActivePage = (e?: { preventDefault?: () => void; stopPropagation?: () => void }) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!canPin) return;
    if (sideApps.some((a) => a.url === pinUrl)) {
      const existing = sideApps.find((a) => a.url === pinUrl);
      if (existing) openSideApp(existing.id);
      return;
    }
    const label = (activeTab?.title && activeTab.title !== '…' ? activeTab.title : pinUrl).slice(
      0,
      48,
    );
    addSideApp({ label, url: pinUrl });
  };

  const toggleSidebarChrome = (e?: { preventDefault?: () => void; stopPropagation?: () => void }) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (settings.sidebarMode === 'auto') {
      closeSidePanel();
      onCollapseSidebar?.();
      return;
    }
    // Pinned rail: hide entirely (same as Ctrl+B / menu).
    patchSettings({ showSidebar: false, sidePanelOpen: false, sidebarMode: 'off' });
  };

  const ctxApp = ctx ? sideApps.find((a) => a.id === ctx.appId) : null;

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
          </div>

          <div className="side-rail-sep" aria-hidden />

          <div className="side-rail-group side-rail-apps" role="group" aria-label={t('sidebar.appsGroup')}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={sideApps.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                {sideApps.map((app) => {
                  const on = panelOpen && active?.id === app.id;
                  return (
                    <SortableAppBtn
                      key={app.id}
                      app={app}
                      on={on}
                      badge={badges[app.id] || 0}
                      motionOff={motionOff}
                      onOpen={() => openSideApp(app.id)}
                      onContext={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCtx({ x: e.clientX, y: e.clientY, appId: app.id });
                      }}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>

          <div className="side-rail-sep" aria-hidden />

          <div className="side-rail-foot">
            <button
              type="button"
              className="side-rail-btn"
              data-tip={canPin ? t('sidebar.addApp') : t('sidebar.addAppDisabled')}
              title={canPin ? t('sidebar.addApp') : t('sidebar.addAppDisabled')}
              disabled={!canPin}
              onClick={pinActivePage}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Plus size={18} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="side-rail-btn"
              data-tip={
                settings.sidebarMode === 'auto' ? t('sidebar.collapseRail') : t('sidebar.hideSidebar')
              }
              title={
                settings.sidebarMode === 'auto'
                  ? t('sidebar.collapseRail')
                  : t('sidebar.hideSidebarShortcut')
              }
              onClick={toggleSidebarChrome}
              onPointerDown={(e) => e.stopPropagation()}
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
                    onBadge={onBadge}
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

      {ctx && ctxApp && (
        <div
          className="side-rail-ctx"
          style={{ left: ctx.x, top: ctx.y }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              openSideApp(ctxApp.id);
              setCtx(null);
            }}
          >
            {t('sidebar.ctxOpen')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenTab(ctxApp.url);
              setCtx(null);
            }}
          >
            {t('sidebar.openInTab')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const next = !ctxApp.muted;
              setSideAppMuted(ctxApp.id, next);
              try {
                views.current[ctxApp.id]?.setAudioMuted?.(next);
              } catch {
                /* */
              }
              setCtx(null);
            }}
          >
            {ctxApp.muted ? t('sidebar.ctxUnmute') : t('sidebar.ctxMute')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              removeSideApp(ctxApp.id);
              setCtx(null);
            }}
          >
            {t('sidebar.ctxUnpin')}
          </button>
        </div>
      )}
    </div>
  );
}
