/**
 * Home widgets: migration + snap + collision + CSS place + flex hysteresis.
 * Run: node test/home-widgets.test.mjs
 */
import assert from 'node:assert/strict';

const EXTRA = new Set(['weather', 'notes', 'todo', 'calendar', 'recent', 'downloads', 'resources', 'spotify']);
const SIZE_W = { S: 28, M: 38, L: 58 };
const HOME_GRID_PX = 8;
const SIZE_PX = { S: 220, M: 300, L: 460 };
const SIZE_H = { S: 18 * HOME_GRID_PX, M: 20 * HOME_GRID_PX, L: 22 * HOME_GRID_PX };
const EDGE_INSET_RATIO = 0.1;

function legacySize(raw, w) {
  if (raw === 'S' || raw === 'M' || raw === 'L') return raw;
  if (typeof w === 'number') {
    if (w <= 3) return 'S';
    if (w <= 4) return 'M';
    return 'L';
  }
  return 'M';
}

function layoutRow(widgets) {
  const gap = 3;
  const widths = widgets.map((w) => SIZE_W[w.size]);
  const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, widgets.length - 1);
  let cursor = -Math.floor(total / 2);
  return widgets.map((w) => {
    const ww = SIZE_W[w.size];
    const x = cursor + Math.floor(ww / 2);
    cursor += ww + gap;
    return { ...w, anchor: 'center', x, y: 60 };
  });
}

function looksUnplaced(w) {
  return (w.x === 0 && w.y === 0) || (w.x === 0 && w.y === 2);
}

function normalize(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  let legacy = false;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const type = String(item.type || '');
    if (!EXTRA.has(type) || seen.has(type)) continue;
    seen.add(type);
    if (!('anchor' in item) && !('x' in item)) legacy = true;
    out.push({
      id: item.id || 'w',
      type,
      size: legacySize(item.size, item.w),
      anchor: item.anchor === 'left' || item.anchor === 'right' ? item.anchor : 'center',
      x: typeof item.x === 'number' ? item.x : 0,
      y: typeof item.y === 'number' ? item.y : 0,
      settings: item.settings && typeof item.settings === 'object' ? item.settings : {},
      style: item.style === 'glass' || item.style === 'solid' || item.style === 'transparent' ? item.style : undefined,
    });
  }
  if (!out.length) return [];
  if (legacy || out.every(looksUnplaced)) return layoutRow(out);
  return out;
}

function overlaps(a, b, pad = 4) {
  return !(
    a.left + a.width + pad <= b.left ||
    b.left + b.width + pad <= a.left ||
    a.top + a.height + pad <= b.top ||
    b.top + b.height + pad <= a.top
  );
}

function placeLeftPx(anchor, xCells, width, canvasWidth) {
  const ox = xCells * HOME_GRID_PX;
  if (anchor === 'left') return canvasWidth * EDGE_INSET_RATIO + ox - width / 2;
  if (anchor === 'right') return canvasWidth * (1 - EDGE_INSET_RATIO) + ox - width / 2;
  return canvasWidth / 2 + ox - width / 2;
}

function snapDrag({ left, top, width, height, metrics, others, altKey, threshold = 6 }) {
  const guides = [];
  if (altKey) return { left, top, guides };

  const snapLinesX = [
    { pos: metrics.width / 2, kind: 'center' },
    { pos: metrics.headerLeft, kind: 'edge' },
    { pos: metrics.headerLeft + metrics.headerWidth, kind: 'edge' },
    { pos: metrics.headerLeft + metrics.headerWidth / 2, kind: 'center' },
  ];
  const snapLinesY = [{ pos: 0, kind: 'edge' }];
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

  left = Math.round(left / HOME_GRID_PX) * HOME_GRID_PX;
  top = Math.round(top / HOME_GRID_PX) * HOME_GRID_PX;

  let snappedX = false;
  const targetsX = [left, left + width / 2, left + width];
  for (const line of snapLinesX) {
    if (snappedX) break;
    for (const t of targetsX) {
      if (Math.abs(t - line.pos) <= threshold) {
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
    for (const t of targetsY) {
      if (Math.abs(t - line.pos) <= threshold) {
        top += line.pos - t;
        guides.push({ axis: 'y', pos: line.pos, kind: line.kind });
        snappedY = true;
        break;
      }
    }
  }

  return { left, top, guides };
}

function resolveCollision(left, top, width, height, others, metrics) {
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
  T = Math.max(0, T);
  return { left: L, top: T };
}

function nextFlexFallback(prev, canvasWidth) {
  if (canvasWidth < 880) return true;
  if (canvasWidth > 920) return false;
  return prev;
}

function shouldUseFlexFallback(canvasWidth) {
  return canvasWidth < 880;
}

// --- assertions ---
{
  const n = normalize([
    { id: 'a', type: 'clock', size: 'L' },
    { id: 'b', type: 'notes', size: 'M', settings: { text: 'hello' } },
    { id: 'c', type: 'weather', w: 3, h: 3 },
  ]);
  assert.equal(n.length, 2);
  assert.equal(n[0].type, 'notes');
  assert.equal(n[0].settings.text, 'hello');
  assert.equal(n[1].size, 'S');
  assert.equal(n[0].anchor, 'center');
  assert.ok(typeof n[0].x === 'number');
  assert.ok(n[0].y >= 3, 'migrated row must not sit at 0,0');
}

{
  const n = normalize([
    { id: '1', type: 'todo', size: 'S', anchor: 'center', x: 5, y: 8, settings: {} },
  ]);
  assert.equal(n[0].x, 5);
  assert.equal(n[0].y, 8);
}

{
  // 0,0 weather migrates out of corner
  const n = normalize([
    { id: 'w', type: 'weather', size: 'M', anchor: 'center', x: 0, y: 0, settings: {} },
  ]);
  assert.ok(!(n[0].x === 0 && n[0].y === 0));
  assert.equal(n[0].anchor, 'center');
}

{
  const row = layoutRow([
    { id: '1', type: 'notes', size: 'M' },
    { id: '2', type: 'todo', size: 'M' },
  ]);
  assert.ok(row[0].x < 0 || row[1].x > 0);
}

{
  assert.equal(shouldUseFlexFallback(720), true);
  assert.equal(shouldUseFlexFallback(1280), false);
  // hysteresis
  assert.equal(nextFlexFallback(false, 870), true);
  assert.equal(nextFlexFallback(true, 900), true); // stay on in dead band
  assert.equal(nextFlexFallback(true, 930), false);
  assert.equal(nextFlexFallback(false, 900), false); // stay off in dead band
}

{
  const metrics = { width: 1000, height: 400, headerLeft: 180, headerWidth: 640, headerBottom: 200 };
  const w = SIZE_PX.M;
  const h = SIZE_H.M;
  const near = snapDrag({
    left: metrics.width / 2 - w / 2 + 4,
    top: 16,
    width: w,
    height: h,
    metrics,
    others: [],
    altKey: false,
  });
  assert.equal(near.left, metrics.width / 2 - w / 2);
  assert.ok(near.guides.some((g) => g.axis === 'x' && g.pos === metrics.width / 2));

  const nosnap = snapDrag({
    left: 103,
    top: 17,
    width: w,
    height: h,
    metrics,
    others: [],
    altKey: true,
  });
  assert.equal(nosnap.left, 103);
  assert.equal(nosnap.guides.length, 0);

  const grid = snapDrag({
    left: 103,
    top: 17,
    width: w,
    height: h,
    metrics,
    others: [],
    altKey: false,
  });
  assert.equal(grid.left % HOME_GRID_PX, 0);
  assert.equal(grid.top % HOME_GRID_PX, 0);
}

{
  const metrics = { width: 1000, height: 400, headerLeft: 180, headerWidth: 640, headerBottom: 200 };
  const a = { left: 100, top: 20, width: 300, height: 160 };
  const overlapping = resolveCollision(110, 30, 300, 160, [a], metrics);
  assert.ok(!overlaps({ ...overlapping, width: 300, height: 160 }, a));
  assert.ok(overlapping.left >= a.left + a.width || overlapping.top >= a.top + a.height);
}

{
  const metrics = { width: 800, height: 300, headerLeft: 80, headerWidth: 640, headerBottom: 160 };
  const far = snapDrag({
    left: 40,
    top: 40,
    width: 220,
    height: 144,
    metrics,
    others: [],
    altKey: false,
    threshold: 6,
  });
  assert.ok(!far.guides.some((g) => g.pos === metrics.width / 2));
}

{
  // Stored free-place coords must survive canvas shrink/grow (visual clamp is view-only)
  const stored = { id: '1', type: 'notes', size: 'M', anchor: 'left', x: -10, y: 8 };
  const w = SIZE_PX.M;
  const leftNarrow = placeLeftPx(stored.anchor, stored.x, w, 700);
  const leftWide = placeLeftPx(stored.anchor, stored.x, w, 1400);
  assert.ok(leftWide < 1400 / 2, 'wide canvas places from stored left anchor');
  assert.notEqual(leftNarrow, leftWide, 'pixel left changes with canvas; stored cells stay fixed');
  assert.equal(stored.x, -10);
  assert.equal(stored.y, 8);
}

{
  // Center anchor x=0 stays centered across canvas width changes (CSS formula)
  const width = 300;
  for (const canvasW of [1440, 1100, 1440]) {
    const left = placeLeftPx('center', 0, width, canvasW);
    const center = left + width / 2;
    assert.equal(center, canvasW / 2, `center must stay mid at canvas ${canvasW}`);
  }
  // Left edge shared at 10% when x = half-width cells
  const searchW = 640;
  const xCells = Math.round(searchW / 2 / HOME_GRID_PX);
  for (const canvasW of [1440, 1100]) {
    const left = placeLeftPx('left', xCells, searchW, canvasW);
    assert.ok(Math.abs(left - canvasW * 0.1) < 1, 'left edge ~10%');
  }
}

console.log('home-widgets.test.mjs: ok');
