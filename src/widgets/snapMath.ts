import type { HomeChromeItem, HomeWidget, HomeWidgetAnchor, HomeWidgetSize } from '../store';
import { HOME_GRID_PX, chromeSizeToPx, widgetSizeCells } from '../store';
import { sizePx } from './registry';

export type GuideLine = { axis: 'x' | 'y'; pos: number; kind: 'center' | 'edge' | 'gap' };

export type CanvasMetrics = {
  width: number;
  height: number;
  /** CSS pixel X of left edge of header column (centered 640 band) */
  headerLeft: number;
  headerWidth: number;
  /** Bottom edge of header stack relative to canvas top (for default row layout) */
  headerBottom: number;
};

/** Left/right edge inset used by CSS `hw-place-left` / `hw-place-right` (10%). */
export const EDGE_INSET_RATIO = 0.1;

export function sizeToPx(size: HomeWidgetSize, type?: HomeWidget['type']) {
  const cells = widgetSizeCells(size, type);
  // Spotify ma własne proporcje (szersza / niższa); reszta — jak w registry ≈ cells×grid
  if (type === 'spotify') {
    return { w: cells.w * HOME_GRID_PX, h: cells.h * HOME_GRID_PX };
  }
  return { w: sizePx(size), h: cells.h * HOME_GRID_PX };
}

/** Anchor axis X in canvas pixels — mirrors CSS place rules. */
export function anchorX(anchor: HomeWidgetAnchor, metrics: CanvasMetrics) {
  if (anchor === 'left') return metrics.width * EDGE_INSET_RATIO;
  if (anchor === 'right') return metrics.width * (1 - EDGE_INSET_RATIO);
  return metrics.width / 2;
}

/**
 * Resting left edge from CSS formula (no JS layout needed for paint).
 * center: left = 50% + x*8 − w/2
 * left:   left = 10% + x*8 − w/2
 * right:  left = 90% + x*8 − w/2
 */
export function placeLeftPx(
  anchor: HomeWidgetAnchor,
  xCells: number,
  width: number,
  canvasWidth: number,
): number {
  const ox = xCells * HOME_GRID_PX;
  if (anchor === 'left') return canvasWidth * EDGE_INSET_RATIO + ox - width / 2;
  if (anchor === 'right') return canvasWidth * (1 - EDGE_INSET_RATIO) + ox - width / 2;
  return canvasWidth / 2 + ox - width / 2;
}

export function placeTopPx(yCells: number): number {
  return yCells * HOME_GRID_PX;
}

/** Convert stored grid coords → canvas pixel top-left (for drag / snap only). */
export function widgetToPx(
  w: HomeWidget,
  metrics: CanvasMetrics,
): { left: number; top: number; width: number; height: number } {
  const { w: width, h: height } = sizeToPx(w.size, w.type);
  return {
    left: placeLeftPx(w.anchor, w.x, width, metrics.width),
    top: placeTopPx(w.y),
    width,
    height,
  };
}

export function chromeToPx(
  c: HomeChromeItem,
  metrics: CanvasMetrics,
): { left: number; top: number; width: number; height: number } {
  const { w: width, h: height } = chromeSizeToPx(c.id);
  return {
    left: placeLeftPx(c.anchor, c.x, width, metrics.width),
    top: placeTopPx(c.y),
    width,
    height,
  };
}

/** Pixel center → stored grid relative to preferred anchor */
export function pxToWidgetPos(
  left: number,
  top: number,
  width: number,
  height: number,
  metrics: CanvasMetrics,
  preferred: HomeWidgetAnchor = 'center',
): { anchor: HomeWidgetAnchor; x: number; y: number } {
  const cx = left + width / 2;
  const ax = anchorX(preferred, metrics);
  return {
    anchor: preferred,
    x: Math.round((cx - ax) / HOME_GRID_PX),
    y: Math.round(top / HOME_GRID_PX),
  };
}

function overlaps(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number },
  pad = 4,
) {
  return !(
    a.left + a.width + pad <= b.left ||
    b.left + b.width + pad <= a.left ||
    a.top + a.height + pad <= b.top ||
    b.top + b.height + pad <= a.top
  );
}

export function snapDrag(opts: {
  left: number;
  top: number;
  width: number;
  height: number;
  metrics: CanvasMetrics;
  others: { left: number; top: number; width: number; height: number }[];
  altKey: boolean;
  threshold?: number;
}): { left: number; top: number; guides: GuideLine[] } {
  const th = opts.threshold ?? 6;
  let { left, top } = opts;
  const { width, height, metrics, others, altKey } = opts;
  const guides: GuideLine[] = [];
  if (altKey) return { left, top, guides };

  const snapLinesX: { pos: number; kind: GuideLine['kind'] }[] = [
    { pos: metrics.width / 2, kind: 'center' },
    { pos: metrics.headerLeft, kind: 'edge' },
    { pos: metrics.headerLeft + metrics.headerWidth, kind: 'edge' },
    { pos: metrics.headerLeft + metrics.headerWidth / 2, kind: 'center' },
    { pos: metrics.width * EDGE_INSET_RATIO, kind: 'edge' },
    { pos: metrics.width * (1 - EDGE_INSET_RATIO), kind: 'edge' },
  ];
  const snapLinesY: { pos: number; kind: GuideLine['kind'] }[] = [
    { pos: 0, kind: 'edge' },
    { pos: metrics.headerBottom, kind: 'edge' },
  ];

  for (const o of others) {
    snapLinesX.push(
      { pos: o.left, kind: 'edge' },
      { pos: o.left + o.width, kind: 'edge' },
      { pos: o.left + o.width / 2, kind: 'center' },
    );
    snapLinesY.push(
      { pos: o.top, kind: 'edge' },
      { pos: o.top + o.height, kind: 'edge' },
      { pos: o.top + o.height / 2, kind: 'center' },
    );
  }

  // Grid 8px
  left = Math.round(left / HOME_GRID_PX) * HOME_GRID_PX;
  top = Math.round(top / HOME_GRID_PX) * HOME_GRID_PX;

  let snappedX = false;
  const targetsX = [left, left + width / 2, left + width];
  for (const line of snapLinesX) {
    if (snappedX) break;
    for (let i = 0; i < targetsX.length; i++) {
      const t = targetsX[i];
      if (Math.abs(t - line.pos) <= th) {
        left += line.pos - t;
        guides.push({ axis: 'x', pos: line.pos, kind: line.kind });
        snappedX = true;
        break;
      }
    }
  }

  let snappedY = false;
  const targetsY = [top, top + height / 2, top + height];
  for (const line of snapLinesY) {
    if (snappedY) break;
    for (let i = 0; i < targetsY.length; i++) {
      const t = targetsY[i];
      if (Math.abs(t - line.pos) <= th) {
        top += line.pos - t;
        guides.push({ axis: 'y', pos: line.pos, kind: line.kind });
        snappedY = true;
        break;
      }
    }
  }

  return { left, top, guides };
}

export function resolveCollision(
  left: number,
  top: number,
  width: number,
  height: number,
  others: { left: number; top: number; width: number; height: number }[],
  metrics: CanvasMetrics,
): { left: number; top: number } {
  let L = left;
  let T = top;
  const box = () => ({ left: L, top: T, width, height });
  for (let iter = 0; iter < 24; iter++) {
    const hit = others.find((o) => overlaps(box(), o));
    if (!hit) break;
    const right = hit.left + hit.width + 8;
    const down = hit.top + hit.height + 8;
    if (right + width <= metrics.width - 8) L = right;
    else {
      L = Math.max(8, hit.left);
      T = down;
    }
  }
  L = Math.max(8, Math.min(L, metrics.width - width - 8));
  T = Math.max(0, Math.min(T, Math.max(0, metrics.height - height - 8)));
  return { left: L, top: T };
}

/**
 * Flex fallback hysteresis on *canvas* width (offsetWidth of .hw-canvas / band),
 * not shell column and not raw window width alone.
 * On below 880, off above 920 — avoids flicker at the threshold.
 */
export function nextFlexFallback(prev: boolean, canvasWidth: number): boolean {
  if (canvasWidth < 880) return true;
  if (canvasWidth > 920) return false;
  return prev;
}

/** @deprecated prefer nextFlexFallback with hysteresis; kept for narrow smoke checks */
export function shouldUseFlexFallback(canvasWidth: number) {
  return canvasWidth < 880;
}

/** CSS custom properties for resting placement (paint without JS metrics). */
export function placeCssVars(
  anchor: HomeWidgetAnchor,
  x: number,
  y: number,
  width: number,
  height: number,
): Record<string, string> {
  return {
    '--hw-x': `${x * HOME_GRID_PX}px`,
    '--hw-y': `${y * HOME_GRID_PX}px`,
    '--hw-w': `${width}px`,
    '--hw-h': `${height}px`,
  };
}
