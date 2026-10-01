'use strict';

/**
 * One-shot main-process heap + RSS probe (PERF_PROBE_HEAP=1).
 * Quits after ~4s on about:home. Not a full bench.
 */
const fs = require('node:fs');
const path = require('node:path');
const v8 = require('node:v8');
const { app } = require('electron');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run(getMainWindow) {
  if (app.isPackaged) return;
  await app.whenReady();
  await sleep(3500);
  const win = getMainWindow?.();
  try {
    if (win && !win.isDestroyed()) {
      await win.webContents.executeJavaScript(`(() => {
        const st = window.__DJXXR_STORE__?.getState?.();
        if (!st) return false;
        st.updateTab?.(st.activeId, { url: 'about:home' });
        st.setView?.('browser');
        return true;
      })()`);
    }
  } catch {
    /* */
  }
  await sleep(1500);

  const mu = process.memoryUsage();
  const metrics = app.getAppMetrics?.() || [];
  const browser = metrics.find((m) => m.type === 'Browser');
  const spaces = v8.getHeapSpaceStatistics?.() || [];
  const outDir = path.join(process.cwd(), 'tmp-verify', 'perf2');
  fs.mkdirSync(outDir, { recursive: true });
  const snapPath = path.join(outDir, `main-heap-${Date.now()}.heapsnapshot`);
  let wrote = null;
  try {
    wrote = v8.writeHeapSnapshot(snapPath);
  } catch (e) {
    wrote = String(e.message || e);
  }

  const report = {
    at: new Date().toISOString(),
    rssMb: Math.round((mu.rss || 0) / 1024 / 1024),
    heapUsedMb: Math.round((mu.heapUsed || 0) / 1024 / 1024),
    heapTotalMb: Math.round((mu.heapTotal || 0) / 1024 / 1024),
    externalMb: Math.round((mu.external || 0) / 1024 / 1024),
    arrayBuffersMb: Math.round((mu.arrayBuffers || 0) / 1024 / 1024),
    browserMemMb: browser ? Math.round((browser.memory?.workingSetSize || 0) / 1024) : null,
    heapSpaces: spaces
      .map((s) => ({
        name: s.space_name,
        usedMb: Math.round((s.space_used_size || 0) / 1024 / 1024),
        sizeMb: Math.round((s.space_size || 0) / 1024 / 1024),
      }))
      .sort((a, b) => b.usedMb - a.usedMb)
      .slice(0, 8),
    snapshot: wrote,
    adblock: (() => {
      try {
        return require('../electron/adblock-plus.cjs').getStatus?.();
      } catch {
        return null;
      }
    })(),
  };
  const jsonPath = path.join(outDir, 'main-heap-probe.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log('[probe-heap]', JSON.stringify(report));
  app.quit();
}

module.exports = { run };
