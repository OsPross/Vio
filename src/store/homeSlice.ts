import type {
  HomeChromeId,
  HomeChromeItem,
  HomeWidget,
  HomeWidgetAnchor,
  HomeWidgetSize,
  HomeWidgetStyle,
  HomeWidgetType,
  Settings,
} from './types';
import { HOME_GRID_PX } from './constants';

const EXTRA_WIDGET_TYPES = new Set<HomeWidgetType>([
  'weather',
  'notes',
  'todo',
  'calendar',
  'recent',
  'downloads',
  'resources',
  'spotify',
]);

function isExtraWidgetType(t: string): t is HomeWidgetType {
  return EXTRA_WIDGET_TYPES.has(t as HomeWidgetType);
}

/** Map legacy grid cells (or invalid size) → S/M/L */
export function legacyWidgetSize(raw: unknown, w?: number): HomeWidgetSize {
  if (raw === 'S' || raw === 'M' || raw === 'L') return raw;
  if (typeof w === 'number') {
    if (w <= 3) return 'S';
    if (w <= 4) return 'M';
    return 'L';
  }
  return 'M';
}

const widgetUid = () => `w-${Math.random().toString(36).slice(2, 10)}`;

const SIZE_W_CELLS: Record<HomeWidgetSize, number> = { S: 28, M: 38, L: 58 }; // ~220/300/460 at 8px
const SIZE_H_CELLS: Record<HomeWidgetSize, number> = { S: 18, M: 20, L: 22 };
/** Spotify — szersza / niższa karta (landscape), bez pustego dołu. */
const SPOTIFY_W_CELLS: Record<HomeWidgetSize, number> = { S: 34, M: 44, L: 58 }; // ~272/352/464
const SPOTIFY_H_CELLS: Record<HomeWidgetSize, number> = { S: 22, M: 24, L: 28 }; // ~176/192/224 — Odśwież/Wyloguj fit

export function widgetSizeCells(size: HomeWidgetSize, type?: HomeWidgetType) {
  if (type === 'spotify') return { w: SPOTIFY_W_CELLS[size], h: SPOTIFY_H_CELLS[size] };
  return { w: SIZE_W_CELLS[size], h: SIZE_H_CELLS[size] };
}

/** Pack widgets into a centered row under the header (migration / defaults). */
export function layoutWidgetsInCenteredRow(widgets: HomeWidget[]): HomeWidget[] {
  if (!widgets.length) return [];
  const gap = 3; // cells ≈ 24px
  const widths = widgets.map((w) => widgetSizeCells(w.size).w);
  const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, widgets.length - 1);
  let cursor = -Math.floor(total / 2);
  // Default row sits under centered chrome (clock/search/shortcuts ~ y44+13) + 24px
  const y = 60;
  return widgets.map((w) => {
    const { w: ww } = widgetSizeCells(w.size);
    const x = cursor + Math.floor(ww / 2);
    cursor += ww + gap;
    return { ...w, anchor: 'center' as const, x, y };
  });
}

/** Left-edge aligned row at ~10% inset (matches CSS hw-place-left). */
export function layoutWidgetsInLeftRow(widgets: HomeWidget[]): HomeWidget[] {
  if (!widgets.length) return [];
  const gap = 3;
  let cursor = 0;
  const y = 60;
  return widgets.map((w) => {
    const { w: ww } = widgetSizeCells(w.size);
    // x = half-width in cells so left edge sits on the 10% anchor axis
    const x = Math.round(ww / 2) + cursor;
    cursor += ww + gap;
    return { ...w, anchor: 'left' as const, x, y };
  });
}

function parseAnchor(raw: unknown): HomeWidgetAnchor {
  if (raw === 'left' || raw === 'right' || raw === 'center') return raw;
  return 'center';
}

function parseWidgetStyle(raw: unknown): HomeWidgetStyle | undefined {
  if (raw === 'transparent' || raw === 'glass' || raw === 'solid') return raw;
  return undefined;
}

/** Default centered stack: clock → search → shortcuts (no overlap). */
export function defaultHomeChrome(): HomeChromeItem[] {
  // cells @ 8px — sizes from chromeSizeToPx
  // clock 168→21 cells, search 72→9, shortcuts 104→13; +2 gap
  return [
    { id: 'clock', anchor: 'center', x: 0, y: 8 },
    { id: 'search', anchor: 'center', x: 0, y: 31 },
    { id: 'shortcuts', anchor: 'center', x: 0, y: 44 },
  ];
}

/** Left stack — shared left edges at 10% (x = half-width in cells). */
export function layoutHomeChromeLeft(): HomeChromeItem[] {
  return [
    { id: 'clock', anchor: 'left', x: Math.round(560 / 2 / HOME_GRID_PX), y: 8 },
    { id: 'search', anchor: 'left', x: Math.round(640 / 2 / HOME_GRID_PX), y: 31 },
    { id: 'shortcuts', anchor: 'left', x: Math.round(640 / 2 / HOME_GRID_PX), y: 44 },
  ];
}

/** Top / minimal — search near top; clock & shortcuts hidden via flags. */
export function layoutHomeChromeTop(): HomeChromeItem[] {
  return [
    { id: 'clock', anchor: 'center', x: 0, y: 8 },
    { id: 'search', anchor: 'center', x: 0, y: 6 },
    { id: 'shortcuts', anchor: 'center', x: 0, y: 20 },
  ];
}

/** Keep centered stack from stacking on top of each other (legacy / bad saves). */
export function packHomeChromeVertical(items: HomeChromeItem[]): HomeChromeItem[] {
  const order: HomeChromeId[] = ['clock', 'search', 'shortcuts'];
  const map = new Map(items.map((i) => [i.id, { ...i }]));
  const stacked = order.every((id) => {
    const it = map.get(id);
    return !!it && it.anchor === 'center' && it.x === 0;
  });
  if (!stacked) return order.map((id) => map.get(id)!).filter(Boolean);

  let cursor = 0;
  for (const id of order) {
    const it = map.get(id)!;
    const hCells = Math.ceil(chromeSizeToPx(id).h / HOME_GRID_PX);
    if (it.y < cursor) it.y = cursor;
    cursor = it.y + hCells + 2;
  }
  return order.map((id) => map.get(id)!);
}

export function normalizeHomeChrome(raw: unknown): HomeChromeItem[] {
  const defs = defaultHomeChrome();
  if (!Array.isArray(raw)) return packHomeChromeVertical(defs);
  const merged = defs.map((d) => {
    const found = (raw as unknown[]).find(
      (x) => x && typeof x === 'object' && (x as HomeChromeItem).id === d.id,
    ) as HomeChromeItem | undefined;
    if (!found) return { ...d };
    return {
      id: d.id,
      anchor: parseAnchor(found.anchor),
      x: typeof found.x === 'number' ? found.x : d.x,
      y: typeof found.y === 'number' ? found.y : d.y,
    };
  });
  return packHomeChromeVertical(merged);
}

export function chromeSizeToPx(id: HomeChromeId): { w: number; h: number } {
  /* Search / clock column — wider than the shortcuts icon row. */
  const w = 540;
  switch (id) {
    case 'clock':
      return { w, h: 168 };
    case 'search':
      return { w, h: 72 };
    case 'shortcuts':
      return { w: 480, h: 104 };
    default:
      return { w: 400, h: 120 };
  }
}

export function layoutHomeChromeCentered(): HomeChromeItem[] {
  return defaultHomeChrome();
}

/**
 * Place a newly added widget under shortcuts, centered, with ≥24px gap.
 * Never lands at 0,0. Caps Y so the card stays in a typical viewport (no off-page scroll).
 */
export function placeNewHomeWidget(
  existing: HomeWidget[],
  chrome: HomeChromeItem[],
  widget: Omit<HomeWidget, 'anchor' | 'x' | 'y'> & Partial<Pick<HomeWidget, 'anchor' | 'x' | 'y'>>,
): HomeWidget {
  const ch = normalizeHomeChrome(chrome);
  const shortcuts = ch.find((c) => c.id === 'shortcuts');
  const scBottom = (shortcuts?.y ?? 44) + Math.ceil(chromeSizeToPx('shortcuts').h / HOME_GRID_PX);
  const dim = widgetSizeCells(widget.size, widget.type);
  // ~576px band under chrome — keep full card visible without page scroll
  const maxY = Math.max(3, 72 - dim.h - 1);
  let y = scBottom + 3; // 24px
  for (const w of existing) {
    const bottom = w.y + widgetSizeCells(w.size, w.type).h;
    if (bottom + 3 > y) y = bottom + 3;
  }
  if (y < 3) y = 3;
  let x = 0;
  if (y > maxY) {
    // Stack would go off-screen — sit on the visible row and offset horizontally
    y = Math.min(scBottom + 3, maxY);
    const slot = existing.length % 4;
    x = (slot - 1.5) * (dim.w + 3);
  }
  return {
    ...widget,
    anchor: 'center',
    x: Math.round(x),
    y: Math.min(y, maxY),
  };
}

/** Optional panels under the fixed header — no clock/search/shortcuts. */
export function defaultHomeWidgets(extra?: Partial<Settings>): HomeWidget[] {
  const widgets: HomeWidget[] = [];
  if (extra?.homeShowNotes) {
    widgets.push({
      id: 'w-notes',
      type: 'notes',
      size: 'M',
      anchor: 'center',
      x: 0,
      y: 60,
      settings: {},
    });
  }
  if (extra?.homeShowRecent) {
    widgets.push({
      id: 'w-recent',
      type: 'recent',
      size: 'M',
      anchor: 'center',
      x: 0,
      y: 60,
      settings: {},
    });
  }
  if (extra?.homeShowStats) {
    widgets.push({
      id: 'w-resources',
      type: 'resources',
      size: 'M',
      anchor: 'center',
      x: 0,
      y: 60,
      settings: {},
    });
  }
  return layoutWidgetsInCenteredRow(widgets);
}

/** Header presets write concrete homeChrome positions (+ pack widgets). */
export function applyHomeLayoutPreset(
  preset: 'centered' | 'search' | 'top' | 'left',
  currentWidgets?: HomeWidget[],
): Partial<Settings> {
  const extras = normalizeHomeWidgets(currentWidgets ?? []);
  const id = preset === 'search' ? 'top' : preset;

  if (id === 'top') {
    return {
      homeLayoutPreset: 'top',
      homeLayout: 'minimal',
      homeAlign: 'center',
      homeShowClock: false,
      homeShowDate: false,
      homeShowGreeting: false,
      homeShowApps: false,
      homeChrome: layoutHomeChromeTop(),
      homeWidgets: extras,
    };
  }
  if (id === 'left') {
    return {
      homeLayoutPreset: 'left',
      homeLayout: 'stack',
      homeAlign: 'left',
      homeShowClock: true,
      homeShowDate: true,
      homeShowGreeting: true,
      homeShowApps: true,
      homeChrome: layoutHomeChromeLeft(),
      homeWidgets: layoutWidgetsInLeftRow(
        extras.length ? extras : defaultHomeWidgets({ homeShowApps: true }),
      ),
    };
  }
  return {
    homeLayoutPreset: 'centered',
    homeLayout: 'dashboard',
    homeAlign: 'center',
    homeShowClock: true,
    homeShowDate: true,
    homeShowGreeting: true,
    homeShowApps: true,
    homeChrome: layoutHomeChromeCentered(),
    homeWidgets: layoutWidgetsInCenteredRow(
      extras.length ? extras : defaultHomeWidgets({ homeShowApps: true }),
    ),
  };
}

/** True when widget looks unplaced / legacy default (should re-pack). */
function looksUnplaced(w: HomeWidget): boolean {
  if (w.x === 0 && w.y === 0) return true;
  // Old defaults before free-place: y:2 under a flex header
  if (w.x === 0 && w.y === 2) return true;
  return false;
}

/** Strip hero types; migrate size + free-place coords; keep notes settings. */
export function normalizeHomeWidgets(raw: unknown): HomeWidget[] {
  if (!Array.isArray(raw)) return [];
  const parsed: HomeWidget[] = [];
  const seen = new Set<HomeWidgetType>();
  let needsRowLayout = false;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const w = item as Record<string, unknown>;
    const type = String(w.type || '');
    if (!isExtraWidgetType(type)) continue;
    if (seen.has(type)) continue;
    seen.add(type);
    const id = typeof w.id === 'string' && w.id ? w.id : widgetUid();
    const size = legacyWidgetSize(w.size, typeof w.w === 'number' ? w.w : undefined);
    const settings =
      w.settings && typeof w.settings === 'object' && !Array.isArray(w.settings)
        ? (w.settings as Record<string, unknown>)
        : {};
    // Legacy strip format: size only, no meaningful xy → pack row
    const legacyStrip = !('anchor' in w) && !('x' in w);
    if (legacyStrip) needsRowLayout = true;
    const style = parseWidgetStyle(w.style);
    parsed.push({
      id,
      type,
      size,
      anchor: parseAnchor(w.anchor),
      x: typeof w.x === 'number' && Number.isFinite(w.x) ? Math.round(w.x) : 0,
      y: typeof w.y === 'number' && Number.isFinite(w.y) ? Math.round(w.y) : 0,
      settings,
      ...(style ? { style } : {}),
    });
  }
  if (!parsed.length) return [];
  if (needsRowLayout || parsed.every(looksUnplaced)) {
    return layoutWidgetsInCenteredRow(parsed);
  }
  const placed = parsed.filter((w) => !looksUnplaced(w));
  const orphans = parsed.filter(looksUnplaced);
  if (!orphans.length) return parsed;
  const acc = [...placed];
  const chrome = defaultHomeChrome();
  for (const w of orphans) {
    acc.push(placeNewHomeWidget(acc, chrome, w));
  }
  return acc;
}

export function migrateHomeWidgets(settings: Settings): HomeWidget[] {
  if (Array.isArray(settings.homeWidgets) && settings.homeWidgets.length > 0) {
    const normalized = normalizeHomeWidgets(settings.homeWidgets);
    if (normalized.length > 0) return normalized;
  }
  return defaultHomeWidgets(settings);
}

/** Home layout lives in settings — no dedicated Zustand fields. */
export type HomeSlice = object;

export function createHomeSlice(): HomeSlice {
  return {};
}
