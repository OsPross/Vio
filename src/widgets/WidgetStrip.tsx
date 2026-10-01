import {
  useCallback,
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Activity,
  CalendarDays,
  Check,
  CheckSquare,
  Clock3,
  CloudSun,
  Download,
  History,
  LayoutGrid,
  RotateCcw,
  Search,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import {
  HOME_GRID_PX,
  chromeSizeToPx,
  layoutHomeChromeCentered,
  layoutWidgetsInCenteredRow,
  normalizeHomeChrome,
  useStore,
  widgetSizeCells,
  type HomeChromeId,
  type HomeChromeItem,
  type HomeWidget,
  type HomeWidgetSize,
  type HomeWidgetStyle,
  type HomeWidgetType,
} from '../store';
import { sizePx, WIDGET_REGISTRY } from './registry';
import { WidgetFrame } from './WidgetFrame';
import { WeatherWidget } from './WeatherWidget';
import { NotesWidget } from './NotesWidget';
import { TodoWidget } from './TodoWidget';
import { CalendarWidget } from './CalendarWidget';
import { RecentWidget } from './RecentWidget';
import { DownloadsWidget } from './DownloadsWidget';
import { ResourcesWidget } from './ResourcesWidget';
import { ClockWidget } from './ClockWidget';
import { SearchWidget } from './SearchWidget';
import { ShortcutsWidget } from './ShortcutsWidget';
import {
  chromeToPx,
  nextFlexFallback,
  placeCssVars,
  pxToWidgetPos,
  resolveCollision,
  sizeToPx,
  snapDrag,
  widgetToPx,
  type CanvasMetrics,
  type GuideLine,
} from './snapMath';
import { WidgetSettingsPopover, type SettingsTarget } from './WidgetSettingsPopover';

export const WIDGET_ICONS: Record<HomeWidgetType, LucideIcon> = {
  weather: CloudSun,
  notes: StickyNote,
  todo: CheckSquare,
  calendar: CalendarDays,
  recent: History,
  downloads: Download,
  resources: Activity,
};

const CHROME_META: Record<HomeChromeId, { label: string; icon: LucideIcon }> = {
  clock: { label: 'Zegar', icon: Clock3 },
  search: { label: 'Wyszukiwarka', icon: Search },
  shortcuts: { label: 'Skróty', icon: LayoutGrid },
};

export function WidgetBody({
  widget,
  size,
  onGo,
  reduced,
  onPatchWidgetSettings,
  preview,
}: {
  widget: HomeWidget;
  size: HomeWidgetSize;
  onGo?: (url: string, query?: string) => void;
  reduced?: boolean;
  onPatchWidgetSettings?: (id: string, settings: Record<string, unknown>) => void;
  preview?: boolean;
}) {
  switch (widget.type) {
    case 'weather':
      return (
        <WeatherWidget
          widget={widget}
          size={size}
          preview={preview}
          onPatchSettings={
            onPatchWidgetSettings
              ? (settings) => onPatchWidgetSettings(widget.id, settings)
              : undefined
          }
        />
      );
    case 'notes':
      return <NotesWidget size={size} preview={preview} />;
    case 'todo':
      return <TodoWidget size={size} preview={preview} />;
    case 'calendar':
      return <CalendarWidget size={size} preview={preview} />;
    case 'recent':
      return <RecentWidget onGo={onGo} size={size} preview={preview} />;
    case 'downloads':
      return <DownloadsWidget size={size} preview={preview} />;
    case 'resources':
      return <ResourcesWidget size={size} preview={preview} />;
    default:
      return null;
  }
}

type DragLive = {
  key: string;
  left: number;
  top: number;
  startClientX: number;
  startClientY: number;
  origLeft: number;
  origTop: number;
  active: boolean;
  pointerId: number;
};

const MAX_UNDO = 20;
const DRAG_THRESHOLD = 4;

function isInteractiveTarget(el: EventTarget | null) {
  if (!(el instanceof Element)) return false;
  return Boolean(
    el.closest(
      'input, textarea, button, select, a, [contenteditable="true"], .hw-frame-edit-chrome, .hw-btn, .hw-input, .hw-link, .hw-suggest-list, .hw-settings-pop, .home-suggest-portal',
    ),
  );
}

type PlaceBox = { left: number; top: number; width: number; height: number };

function guidesEqual(a: GuideLine[], b: GuideLine[]) {
  if (a.length !== b.length) return false;
  return a.every((g, i) => g.axis === b[i].axis && g.pos === b[i].pos && g.kind === b[i].kind);
}

export function WidgetStrip({
  widgets,
  onChange,
  editMode,
  onGo,
  reduced,
  widgetStyle,
  radius,
  locked,
  onExitEdit,
  preview = false,
}: {
  widgets: HomeWidget[];
  onChange: (next: HomeWidget[]) => void;
  editMode: boolean;
  onGo: (url: string, query?: string) => void;
  reduced: boolean;
  widgetStyle: string;
  radius: number;
  locked: boolean;
  onExitEdit?: () => void;
  /** Live preview in Personalize — no suggest portals / autofocus */
  preview?: boolean;
}) {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const chrome = normalizeHomeChrome(settings.homeChrome);

  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const metricsRef = useRef<CanvasMetrics | null>(null);
  const [metrics, setMetrics] = useState<CanvasMetrics | null>(null);
  const [flexFallback, setFlexFallback] = useState(false);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<{ widgets: HomeWidget[]; chrome: HomeChromeItem[] }[]>(
    [],
  );
  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget | null>(null);
  const [settingsAnchor, setSettingsAnchor] = useState<DOMRect | null>(null);
  const [animatingPlace, setAnimatingPlace] = useState(false);
  const altRef = useRef(false);
  const dragRef = useRef<DragLive | null>(null);
  const rafRef = useRef(0);
  const guidesRef = useRef<GuideLine[]>([]);

  const setChrome = (next: HomeChromeItem[]) => {
    patchSettings({ homeChrome: normalizeHomeChrome(next) });
  };

  const markCustom = useCallback(() => {
    if (settings.homeLayoutPreset !== 'custom') {
      patchSettings({ homeLayoutPreset: 'custom' });
    }
  }, [patchSettings, settings.homeLayoutPreset]);

  /* Measure canvas for drag/snap ONLY — resting paint uses CSS calc. */
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.offsetWidth || el.clientWidth;
      const height = el.offsetHeight || el.clientHeight;
      if (width < 2 || height < 2) return;
      const headerWidth = Math.min(640, width);
      const headerLeft = (width - headerWidth) / 2;
      const next: CanvasMetrics = {
        width,
        height: Math.max(height, 320),
        headerLeft,
        headerWidth,
        headerBottom: Math.round(height * 0.42),
      };
      metricsRef.current = next;
      setMetrics(next);
      setFlexFallback((prev) => nextFlexFallback(prev, width));
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') altRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') altRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const pushUndo = useCallback((w: HomeWidget[], c: HomeChromeItem[]) => {
    setUndoStack((s) => [
      ...s.slice(-(MAX_UNDO - 1)),
      { widgets: w.map((x) => ({ ...x })), chrome: c.map((x) => ({ ...x })) },
    ]);
  }, []);

  const undo = useCallback(() => {
    setUndoStack((s) => {
      if (!s.length) return s;
      const prev = s[s.length - 1];
      onChange(prev.widgets);
      setChrome(prev.chrome);
      return s.slice(0, -1);
    });
  }, [onChange, patchSettings]);

  useEffect(() => {
    if (!editMode || locked) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const m = metricsRef.current;
      if (!m || flexFallback || !selectedKey) return;
      e.preventDefault();
      const step = e.shiftKey ? 4 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      pushUndo(widgets, chrome);
      markCustom();
      if (selectedKey.startsWith('chrome:')) {
        const id = selectedKey.slice(7) as HomeChromeId;
        setChrome(
          chrome.map((c) => (c.id === id ? { ...c, x: c.x + dx, y: Math.max(0, c.y + dy) } : c)),
        );
      } else {
        onChange(
          widgets.map((w) =>
            w.id === selectedKey ? { ...w, x: w.x + dx, y: Math.max(0, w.y + dy) } : w,
          ),
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    editMode,
    locked,
    flexFallback,
    widgets,
    chrome,
    onChange,
    pushUndo,
    undo,
    selectedKey,
    markCustom,
  ]);

  const patchWidgetSettings = useCallback(
    (id: string, next: Record<string, unknown>) => {
      onChange(
        widgets.map((w) => (w.id === id ? { ...w, settings: { ...w.settings, ...next } } : w)),
      );
    },
    [onChange, widgets],
  );

  const allOtherBoxes = useCallback(
    (excludeKey: string, m: CanvasMetrics): PlaceBox[] => {
      const boxes: PlaceBox[] = [];
      for (const c of chrome) {
        const key = `chrome:${c.id}`;
        if (key === excludeKey) continue;
        if (c.id === 'clock' && !settings.homeShowClock && !settings.homeShowDate) continue;
        if (c.id === 'shortcuts' && !settings.homeShowApps) continue;
        boxes.push(chromeToPx(c, m));
      }
      for (const w of widgets) {
        if (w.id === excludeKey) continue;
        boxes.push(widgetToPx(w, m));
      }
      return boxes;
    },
    [chrome, widgets, settings.homeShowClock, settings.homeShowDate, settings.homeShowApps],
  );

  const clearDragVisual = (key: string) => {
    const el = cardRefs.current.get(key);
    if (!el) return;
    el.classList.remove('is-dragging');
    el.style.removeProperty('--hw-drag-left');
    el.style.removeProperty('--hw-drag-top');
  };

  const applyDragFrame = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      const m = metricsRef.current;
      if (!d || !m) return;
      const dx = e.clientX - d.startClientX;
      const dy = e.clientY - d.startClientY;
      if (!d.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        d.active = true;
        setSettingsTarget(null);
        setDraggingKey(d.key);
        cardRefs.current.get(d.key)?.classList.add('is-dragging');
      }
      let width = 300;
      let height = 160;
      if (d.key.startsWith('chrome:')) {
        const id = d.key.slice(7) as HomeChromeId;
        const c = chrome.find((x) => x.id === id);
        if (!c) return;
        const box = chromeToPx(c, m);
        width = box.width;
        height = box.height;
      } else {
        const w = widgets.find((x) => x.id === d.key);
        if (!w) return;
        const dim = sizeToPx(w.size);
        width = dim.w;
        height = dim.h;
      }
      const snapped = snapDrag({
        left: d.origLeft + dx,
        top: d.origTop + dy,
        width,
        height,
        metrics: m,
        others: allOtherBoxes(d.key, m),
        altKey: e.altKey || altRef.current,
      });
      d.left = snapped.left;
      d.top = snapped.top;
      const el = cardRefs.current.get(d.key);
      if (el) {
        el.style.setProperty('--hw-drag-left', `${d.left}px`);
        el.style.setProperty('--hw-drag-top', `${d.top}px`);
      }
      if (!guidesEqual(guidesRef.current, snapped.guides)) {
        guidesRef.current = snapped.guides;
        setGuides(snapped.guides);
      }
    },
    [widgets, chrome, allOtherBoxes],
  );

  const endDrag = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const d = dragRef.current;
    const m = metricsRef.current;
    if (!d) {
      setDraggingKey(null);
      setGuides([]);
      guidesRef.current = [];
      return;
    }
    dragRef.current = null;
    clearDragVisual(d.key);
    setDraggingKey(null);
    setGuides([]);
    guidesRef.current = [];
    if (!m || !d.active) return;

    let width = 300;
    let height = 160;
    let anchor: HomeChromeItem['anchor'] = 'center';
    if (d.key.startsWith('chrome:')) {
      const id = d.key.slice(7) as HomeChromeId;
      const c = chrome.find((x) => x.id === id);
      if (!c) return;
      const box = chromeToPx(c, m);
      width = box.width;
      height = box.height;
      anchor = c.anchor;
      const resolved = resolveCollision(d.left, d.top, width, height, allOtherBoxes(d.key, m), m);
      const pos = pxToWidgetPos(resolved.left, resolved.top, width, height, m, anchor);
      pushUndo(widgets, chrome);
      markCustom();
      setChrome(chrome.map((x) => (x.id === id ? { ...x, ...pos } : x)));
    } else {
      const w = widgets.find((x) => x.id === d.key);
      if (!w) return;
      const dim = sizeToPx(w.size);
      width = dim.w;
      height = dim.h;
      const resolved = resolveCollision(d.left, d.top, width, height, allOtherBoxes(d.key, m), m);
      const pos = pxToWidgetPos(resolved.left, resolved.top, width, height, m, w.anchor);
      pushUndo(widgets, chrome);
      markCustom();
      onChange(widgets.map((x) => (x.id === d.key ? { ...x, ...pos } : x)));
    }
  }, [widgets, chrome, onChange, pushUndo, allOtherBoxes, markCustom]);

  const onCardPointerDown = useCallback(
    (e: ReactPointerEvent, key: string, box: PlaceBox) => {
      if (!editMode || locked || flexFallback || !metricsRef.current) return;
      if (isInteractiveTarget(e.target)) return;
      setSelectedKey(key);
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const next: DragLive = {
        key,
        left: box.left,
        top: box.top,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origLeft: box.left,
        origTop: box.top,
        active: false,
        pointerId: e.pointerId,
      };
      dragRef.current = next;

      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current || ev.pointerId !== next.pointerId) return;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => applyDragFrame(ev));
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== next.pointerId) return;
        try {
          if (target.hasPointerCapture?.(ev.pointerId)) target.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        target.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointerup', onUp);
        target.removeEventListener('pointercancel', onUp);
        window.removeEventListener('pointercancel', onUp);
        endDrag();
      };
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
      window.addEventListener('pointercancel', onUp, { once: true });
    },
    [editMode, locked, flexFallback, applyDragFrame, endDrag],
  );

  const centerAll = () => {
    pushUndo(widgets, chrome);
    setChrome(layoutHomeChromeCentered());
    onChange(layoutWidgetsInCenteredRow(widgets));
    patchSettings({ homeLayoutPreset: 'centered', homeAlign: 'center', homeLayout: 'dashboard' });
    if (!reduced) {
      setAnimatingPlace(true);
      window.setTimeout(() => setAnimatingPlace(false), 320);
    }
  };

  const openSettings = (target: SettingsTarget, el: HTMLElement) => {
    setSettingsTarget(target);
    const card = el.closest('.hw-card') as HTMLElement | null;
    setSettingsAnchor((card || el).getBoundingClientRect());
  };

  const bindCardRef = (key: string, node: HTMLDivElement | null) => {
    if (node) cardRefs.current.set(key, node);
    else cardRefs.current.delete(key);
  };

  const visibleChrome = chrome.filter((c) => {
    if (c.id === 'clock')
      return settings.homeShowClock || settings.homeShowDate || settings.homeShowGreeting;
    if (c.id === 'shortcuts') return settings.homeShowApps;
    return true;
  });

  if (!visibleChrome.length && !widgets.length) return null;

  const restingBox = (
    key: string,
    item: HomeChromeItem | HomeWidget,
    kind: 'chrome' | 'widget',
  ): PlaceBox => {
    const m = metrics ?? {
      width: rootRef.current?.offsetWidth || 1280,
      height: rootRef.current?.offsetHeight || 800,
      headerLeft: 0,
      headerWidth: 640,
      headerBottom: 320,
    };
    if (kind === 'chrome') return chromeToPx(item as HomeChromeItem, m);
    return widgetToPx(item as HomeWidget, m);
  };

  return (
    <div className="hw-zone">
      {editMode && !locked && (
        <div className="hw-edit-bar">
          <button type="button" onClick={centerAll}>
            Wyśrodkuj wszystko
          </button>
          <button type="button" onClick={undo} disabled={!undoStack.length}>
            <RotateCcw size={13} /> Cofnij
          </button>
          <button type="button" className="primary" onClick={() => onExitEdit?.()}>
            <Check size={13} /> Gotowe
          </button>
        </div>
      )}
      <div
        ref={rootRef}
        className={[
          flexFallback ? 'hw-strip' : 'hw-canvas',
          editMode ? 'is-edit' : '',
          locked ? 'is-locked' : '',
          draggingKey ? 'is-dragging' : '',
          animatingPlace ? 'is-animating-place' : '',
          reduced ? 'is-reduced' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ '--hw-radius': `${radius}px` } as CSSProperties}
      >
        {!flexFallback &&
          guides.map((g, i) =>
            g.axis === 'x' ? (
              <div key={`gx-${i}`} className="hw-guide hw-guide-x" style={{ left: g.pos }} />
            ) : (
              <div key={`gy-${i}`} className="hw-guide hw-guide-y" style={{ top: g.pos }} />
            ),
          )}

        {visibleChrome.map((c) => {
          const meta = CHROME_META[c.id];
          const Icon = meta.icon;
          const key = `chrome:${c.id}`;
          const dim = chromeSizeToPx(c.id);
          let style: CSSProperties = { width: '100%', maxWidth: 640 };
          let box: PlaceBox = { left: 0, top: 0, width: dim.w, height: dim.h };
          if (!flexFallback) {
            box = restingBox(key, c, 'chrome');
            style = {
              ...placeCssVars(c.anchor, c.x, c.y, dim.w, dim.h),
              zIndex: draggingKey === key ? 8 : selectedKey === key ? 4 : 2,
            } as CSSProperties;
          }
          return (
            <div
              key={key}
              ref={(n) => bindCardRef(key, n)}
              className={[
                'hw-card',
                'hw-chrome',
                `hw-chrome-${c.id}`,
                !flexFallback ? `hw-place hw-place-${c.anchor}` : '',
                editMode ? 'editable' : '',
                draggingKey === key ? 'is-dragging' : '',
                selectedKey === key ? 'is-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={style}
              onPointerDown={(e) => onCardPointerDown(e, key, box)}
            >
              <WidgetFrame
                title={meta.label}
                icon={Icon}
                bare
                editMode={editMode}
                locked={locked}
                onOpenSettings={(el) => openSettings({ kind: 'chrome', id: c.id }, el)}
              >
                {c.id === 'clock' && <ClockWidget reduced={reduced} />}
                {c.id === 'search' && (
                  <SearchWidget onGo={onGo} reduced={reduced} inert={preview || editMode} />
                )}
                {c.id === 'shortcuts' && <ShortcutsWidget onGo={onGo} />}
              </WidgetFrame>
            </div>
          );
        })}

        {widgets.map((w) => {
          const meta = WIDGET_REGISTRY[w.type];
          const Icon = WIDGET_ICONS[w.type];
          const px = sizePx(w.size);
          const h = widgetSizeCells(w.size).h * HOME_GRID_PX;
          const resolvedStyle = (w.style || widgetStyle) as HomeWidgetStyle;
          // Hide weather on home until a city is set (configure in Personalize → Widgets)
          if (
            !preview &&
            w.type === 'weather' &&
            !String(w.settings?.location || '').trim()
          ) {
            return null;
          }
          let style: CSSProperties = { width: px, maxWidth: '100%' };
          let box: PlaceBox = { left: 0, top: 0, width: px, height: h };
          if (!flexFallback) {
            box = restingBox(w.id, w, 'widget');
            style = {
              ...placeCssVars(w.anchor, w.x, w.y, px, h),
              zIndex: draggingKey === w.id ? 6 : selectedKey === w.id ? 4 : 2,
            } as CSSProperties;
          }
          return (
            <div
              key={w.id}
              ref={(n) => bindCardRef(w.id, n)}
              className={[
                'hw-card',
                `hw-type-${w.type}`,
                `hw-style-${resolvedStyle}`,
                !flexFallback ? `hw-place hw-place-${w.anchor}` : '',
                editMode ? 'editable' : '',
                draggingKey === w.id ? 'is-dragging' : '',
                selectedKey === w.id ? 'is-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={style}
              onPointerDown={(e) => onCardPointerDown(e, w.id, box)}
            >
              <WidgetFrame
                title={meta.label}
                icon={Icon}
                editMode={editMode}
                locked={locked}
                onRemove={() => {
                  pushUndo(widgets, chrome);
                  onChange(widgets.filter((x) => x.id !== w.id));
                }}
                onOpenSettings={(el) =>
                  openSettings(
                    {
                      kind: 'widget',
                      id: w.id,
                      type: w.type,
                      size: w.size,
                      style: w.style,
                    },
                    el,
                  )
                }
              >
                <WidgetBody
                  widget={w}
                  size={w.size}
                  onGo={onGo}
                  reduced={reduced}
                  onPatchWidgetSettings={patchWidgetSettings}
                  preview={preview}
                />
              </WidgetFrame>
            </div>
          );
        })}
      </div>

      <WidgetSettingsPopover
        open={!!settingsTarget}
        anchorRect={settingsAnchor}
        target={settingsTarget}
        globalWidgetStyle={settings.homeWidgetStyle}
        clockStyle={settings.homeClockStyle}
        showSeconds={settings.homeShowSeconds}
        showDate={settings.homeShowDate}
        showClock={settings.homeShowClock}
        showApps={settings.homeShowApps}
        onClose={() => setSettingsTarget(null)}
        onWidgetSize={(size) => {
          if (settingsTarget?.kind !== 'widget') return;
          pushUndo(widgets, chrome);
          onChange(widgets.map((x) => (x.id === settingsTarget.id ? { ...x, size } : x)));
          setSettingsTarget({ ...settingsTarget, size });
        }}
        onWidgetStyle={(style) => {
          if (settingsTarget?.kind !== 'widget') return;
          pushUndo(widgets, chrome);
          onChange(
            widgets.map((x) => {
              if (x.id !== settingsTarget.id) return x;
              if (style === null) {
                const { style: _s, ...rest } = x;
                return rest;
              }
              return { ...x, style };
            }),
          );
          setSettingsTarget({ ...settingsTarget, style: style ?? undefined });
        }}
        onRemoveWidget={() => {
          if (settingsTarget?.kind !== 'widget') return;
          pushUndo(widgets, chrome);
          onChange(widgets.filter((x) => x.id !== settingsTarget.id));
          setSettingsTarget(null);
        }}
        onClockStyle={(homeClockStyle) => patchSettings({ homeClockStyle })}
        onToggleSeconds={(homeShowSeconds) => patchSettings({ homeShowSeconds })}
        onToggleDate={(homeShowDate) => patchSettings({ homeShowDate })}
        onToggleClock={(homeShowClock) => patchSettings({ homeShowClock })}
        onToggleApps={(homeShowApps) => patchSettings({ homeShowApps })}
      />
    </div>
  );
}
