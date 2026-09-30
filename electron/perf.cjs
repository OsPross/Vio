/**
 * Boot + runtime performance helpers for Electron.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { app, session } = require('electron');

const DEFAULT_BOOT = {
  hardwareAcceleration: true,
  smoothScrolling: true,
  backgroundThrottling: true,
  cacheMb: 256,
  memoryCapMb: 0,
  reduceRenderers: false,
};

function bootPath() {
  return path.join(app.getPath('userData'), 'perf-boot.json');
}

function loadBoot() {
  try {
    const raw = fs.readFileSync(bootPath(), 'utf8');
    return { ...DEFAULT_BOOT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_BOOT };
  }
}

function saveBoot(partial) {
  const next = { ...loadBoot(), ...partial };
  try {
    fs.writeFileSync(bootPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (e) {
    console.error('[perf] saveBoot', e);
  }
  return next;
}

/** Call before app.ready */
function applyBootSwitches() {
  const boot = loadBoot();

  if (!boot.hardwareAcceleration) {
    try {
      app.disableHardwareAcceleration();
    } catch {
      /* */
    }
  }

  if (!boot.smoothScrolling) {
    app.commandLine.appendSwitch('disable-smooth-scrolling');
  }

  // Lżejszy renderer przy oszczędzaniu
  if (boot.reduceRenderers) {
    app.commandLine.appendSwitch('renderer-process-limit', '3');
    app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512 --optimize-for-size');
  } else if (boot.memoryCapMb && boot.memoryCapMb > 0) {
    app.commandLine.appendSwitch('js-flags', `--max-old-space-size=${boot.memoryCapMb}`);
  }

  // Mniej pracy w tle
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');

  if (boot.backgroundThrottling) {
    // przywróć throttling tła (domyślne zachowanie Chromium) — nie dokładamy disable
  } else {
    app.commandLine.appendSwitch('disable-background-timer-throttling');
  }

  return boot;
}

/**
 * @param {import('electron').Session} ses
 * @param {{ cacheMb?: number }} opts
 */
async function applySessionPerf(ses, opts = {}) {
  const mb = Math.max(32, Number(opts.cacheMb) || 256);
  try {
    // Disk cache size only — spellcheck is owned by electron/spellcheck.cjs
    // (historically this always called setSpellCheckerEnabled(false) and killed dictionaries).
    if (typeof ses.setCacheSize === 'function') {
      ses.setCacheSize(mb * 1024 * 1024);
    }
  } catch {
    /* */
  }
}

async function clearBrowsingCache() {
  const ses = session.fromPartition('persist:main');
  await ses.clearCache();
  await ses.clearStorageData({
    storages: ['shadercache', 'serviceworkers', 'cachestorage'],
  });
  return { ok: true };
}

async function getMemoryInfo() {
  try {
    const metrics = app.getAppMetrics();
    let workingSet = 0;
    let privateBytes = 0;
    for (const m of metrics) {
      workingSet += m.memory?.workingSetSize || 0;
      privateBytes += m.memory?.privateBytes || 0;
    }
    // Electron reports KB
    return {
      processes: metrics.length,
      workingSetMb: Math.round(workingSet / 1024),
      privateMb: Math.round(privateBytes / 1024),
      metrics: metrics.map((m) => ({
        type: m.type,
        cpu: m.cpu?.percentCPUUsage ?? 0,
        memMb: Math.round((m.memory?.workingSetSize || 0) / 1024),
      })),
    };
  } catch (e) {
    return { processes: 0, workingSetMb: 0, privateMb: 0, metrics: [], error: String(e) };
  }
}

module.exports = {
  loadBoot,
  saveBoot,
  applyBootSwitches,
  applySessionPerf,
  clearBrowsingCache,
  getMemoryInfo,
  DEFAULT_BOOT,
};
