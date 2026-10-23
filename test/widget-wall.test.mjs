/**
 * Home widgets never land on clock / search / shortcuts (invisible wall), never stack,
 * and return to their spot when the window grows back.
 * Run: npx tsx test/widget-wall.test.mjs
 */
import assert from 'node:assert/strict';
import {
  CHROME_WALL_GAP,
  anchorFor,
  chromeToPx,
  layoutWidgetsVisual,
  widgetToPx,
  widgetsFitCanvas,
} from '../src/widgets/snapMath.ts';
import { defaultHomeChrome, layoutWidgetsInCenteredRow } from '../src/store/homeSlice.ts';

const metrics = (width, height) => ({
  width,
  height,
  headerLeft: (width - 580) / 2,
  headerWidth: 580,
  headerBottom: Math.round(height * 0.42),
});

const hit = (a, b, gap = 0) =>
  !(
    a.left + a.width + gap <= b.left ||
    b.left + b.width + gap <= a.left ||
    a.top + a.height + gap <= b.top ||
    b.top + b.height + gap <= a.top
  );

const widgets = layoutWidgetsInCenteredRow([
  { id: 'a', type: 'weather', size: 'M', anchor: 'center', x: 0, y: 0, settings: {} },
  { id: 'b', type: 'resources', size: 'M', anchor: 'center', x: 0, y: 0, settings: {} },
  { id: 'c', type: 'todo', size: 'M', anchor: 'center', x: 0, y: 0, settings: {} },
]);

function check(width, height) {
  const m = metrics(width, height);
  const walls = defaultHomeChrome().map((c) => chromeToPx(c, m));
  if (!widgetsFitCanvas(widgets, m, walls)) return null; // UI switches to the stacked strip
  const placed = layoutWidgetsVisual(widgets, m, walls).map((w) => widgetToPx(w, m));
  for (const [i, box] of placed.entries()) {
    for (const wall of walls) {
      assert.ok(
        !hit(box, wall, CHROME_WALL_GAP - 8),
        `${width}x${height}: widget ${i} overlaps chrome ${JSON.stringify(box)} vs ${JSON.stringify(wall)}`,
      );
    }
    for (const other of placed.slice(0, i)) {
      assert.ok(!hit(box, other), `${width}x${height}: widgets stack ${JSON.stringify(box)}`);
    }
    assert.ok(box.left >= 12 && box.left + box.width <= width - 12, `${width}x${height}: off-canvas x`);
    assert.ok(box.top >= 12 && box.top + box.height <= height - 12, `${width}x${height}: off-canvas y`);
  }
  return placed;
}

// "Center all" in a short window used to clamp the row onto the search bar
for (const [w, h] of [
  [1300, 760],
  [1300, 620],
  [1100, 600],
  [1600, 900],
  [1920, 1000],
  [1000, 700],
])
  check(w, h);

// Typical windows keep the free layout; a 1100×600 canvas can't fit 3 M cards beside the wall
assert.ok(check(1600, 900) && check(1300, 760) && check(1920, 1000), 'roomy windows stay free-placed');
assert.equal(check(1100, 600), null, 'cramped window falls back to the stacked strip');

// Resize down and back up → identical layout (view-only relayout, store untouched)
const big = JSON.stringify(check(1600, 900));
check(1200, 700);
assert.equal(JSON.stringify(check(1600, 900)), big, 'layout restores after resize');

// Free spot stays put when nothing is in the way
{
  const m = metrics(1600, 900);
  const lone = [{ id: 'z', type: 'weather', size: 'M', anchor: 'left', x: 4, y: 10, settings: {} }];
  const [out] = layoutWidgetsVisual(lone, m, defaultHomeChrome().map((c) => chromeToPx(c, m)));
  assert.equal(out, lone[0]);
}

assert.equal(anchorFor(100, metrics(1200, 800)), 'left');
assert.equal(anchorFor(600, metrics(1200, 800)), 'center');
assert.equal(anchorFor(1100, metrics(1200, 800)), 'right');

console.log('widget-wall.test.mjs: ok');
