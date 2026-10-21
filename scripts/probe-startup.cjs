/**
 * Cold-start probe: ready → window visible → first React paint.
 * Env: PERF_STARTUP=1 (wired from main.cjs). Quits after one sample.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run(getMainWindow) {
  const { app } = require('electron');
  const t0 = Number(global.__DJXXR_PERF_T0) || Date.now();
  const outDir = path.join(__dirname, '..', 'tmp-verify', 'startup');
  fs.mkdirSync(outDir, { recursive: true });

  // Wait until window exists + visible (or timeout)
  let win = null;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    win = typeof getMainWindow === 'function' ? getMainWindow() : null;
    if (win && !win.isDestroyed()) {
      if (win.isVisible() || Number(global.__DJXXR_PERF_WINDOW_VISIBLE_AT)) break;
    }
    await sleep(50);
  }
  if (!win || win.isDestroyed()) {
    console.error('[probe-startup] no window');
    app.quit();
    return;
  }

  // Give renderer a beat to mount React
  await sleep(400);

  let renderer = null;
  try {
    renderer = await win.webContents.executeJavaScript(
      `(() => {
        const marks = performance.getEntriesByType('mark').map(m => ({
          name: m.name,
          startTime: Math.round(m.startTime),
        }));
        const home = !!document.querySelector('.hw-canvas, .home-root, .bar, #root > *');
        return {
          now: Math.round(performance.now()),
          home,
          store: !!window.__DJXXR_STORE__,
          marks,
        };
      })()`,
      true,
    );
  } catch (err) {
    renderer = { err: String(err && err.message ? err.message : err) };
  }

  const readyAt = Number(global.__DJXXR_PERF_READY_AT) || null;
  const createdAt = Number(global.__DJXXR_PERF_WINDOW_CREATED_AT) || null;
  const visibleAt = Number(global.__DJXXR_PERF_WINDOW_VISIBLE_AT) || null;
  const sample = {
    at: new Date().toISOString(),
    launchToReadyMs: readyAt ? readyAt - t0 : null,
    launchToWindowCreatedMs: createdAt ? createdAt - t0 : null,
    launchToWindowVisibleMs: visibleAt ? visibleAt - t0 : null,
    launchToProbeMs: Date.now() - t0,
    requireTimes: global.__DJXXR_REQUIRE_TIMES__ || null,
    phaseMs: global.__DJXXR_PERF_PHASES__ || null,
    renderer,
  };
  console.log('[probe-startup]', JSON.stringify(sample));
  const out = path.join(outDir, `startup-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify(sample, null, 2));
  console.log('[probe-startup] wrote', out);

  setTimeout(() => app.quit(), 200);
}

module.exports = { run };
