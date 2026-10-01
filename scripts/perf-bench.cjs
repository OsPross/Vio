/**
 * Live performance baseline (PERF_BENCH=1, !app.isPackaged only).
 * Measurement only — no optimizations.
 *
 * Env:
 *   PERF_BENCH=1
 *   PERF_BENCH_QUIT=1          quit when done
 *   PERF_BENCH_IDLE_MS=600000  idle with 10 tabs (default 10 min)
 *   PERF_BENCH_IDLE_BG_MS=60000 background idle CPU sample
 *   PERF_BENCH_RUN=1           run index (for 3× median)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { app, BrowserWindow, ipcMain, webContents } = require('electron');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SITES_10 = [
  'https://www.youtube.com/',
  'https://en.wikipedia.org/wiki/Main_Page',
  'https://www.reddit.com/',
  'https://github.com/',
  'https://www.onet.pl/',
  'https://www.wp.pl/',
  'https://allegro.pl/',
  'https://x.com/',
  'https://www.google.com/',
  'https://example.com/',
];

function outDir() {
  let d;
  try {
    if (app.isPackaged) {
      d = path.join(app.getPath('userData'), 'perf-bench');
    } else {
      d = path.join(__dirname, '..', 'tmp-verify', 'perf');
    }
  } catch {
    d = path.join(__dirname, '..', 'tmp-verify', 'perf');
  }
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function listGuestWebContents() {
  const guests = [];
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed?.()) continue;
    let type = 'unknown';
    try {
      type = typeof wc.getType === 'function' ? wc.getType() : 'unknown';
    } catch {
      /* */
    }
    if (type !== 'webview') continue;
    let osPid = null;
    let procId = null;
    let url = '';
    try {
      osPid = typeof wc.getOSProcessId === 'function' ? wc.getOSProcessId() : null;
    } catch {
      /* */
    }
    try {
      procId = typeof wc.getProcessId === 'function' ? wc.getProcessId() : null;
    } catch {
      /* */
    }
    try {
      url = String(wc.getURL?.() || '').slice(0, 160);
    } catch {
      /* */
    }
    guests.push({ wcId: wc.id, osPid, procId, url });
  }
  return guests;
}

function sampleMetrics(opts = {}) {
  const uiPid = opts.uiPid || null;
  const guestMeta = listGuestWebContents();
  const guestOsPids = new Set(guestMeta.map((g) => g.osPid).filter((p) => typeof p === 'number' && p > 0));
  const list = app.getAppMetrics();
  const byType = {};
  let totalWsKb = 0;
  let totalCpu = 0;
  let uiRenderer = null;
  const guests = [];
  const guestByPid = new Map();
  for (const g of guestMeta) {
    if (typeof g.osPid !== 'number') continue;
    if (!guestByPid.has(g.osPid)) guestByPid.set(g.osPid, []);
    guestByPid.get(g.osPid).push(g);
  }
  const processes = list.map((m) => {
    const type = String(m.type || 'unknown');
    const memKb = m.memory?.workingSetSize || 0;
    const cpu = m.cpu?.percentCPUUsage ?? 0;
    totalWsKb += memKb;
    totalCpu += cpu;
    if (!byType[type]) byType[type] = { count: 0, memKb: 0, cpu: 0, pids: [] };
    byType[type].count += 1;
    byType[type].memKb += memKb;
    byType[type].cpu += cpu;
    byType[type].pids.push(m.pid);
    const row = {
      pid: m.pid,
      type,
      cpu,
      memMb: Math.round(memKb / 1024),
      privateMb: Math.round((m.memory?.privateBytes || 0) / 1024),
      sandboxed: Boolean(m.sandboxed),
      name: m.name || null,
      role: null,
      guestUrls: null,
    };
    if (uiPid && m.pid === uiPid) {
      row.role = 'renderer-ui';
      uiRenderer = { pid: m.pid, type, cpu, memMb: row.memMb };
    } else if (guestOsPids.has(m.pid)) {
      row.role = 'guest';
      row.guestUrls = (guestByPid.get(m.pid) || []).map((g) => g.url);
      guests.push({ pid: m.pid, cpu, memMb: row.memMb, urls: row.guestUrls });
    } else if (type === 'Browser') {
      row.role = 'browser';
    } else if (type === 'GPU') {
      row.role = 'gpu';
    } else if (type === 'Utility') {
      row.role = 'utility';
    } else if (type === 'Tab' && !(uiPid && m.pid === uiPid)) {
      // leftover Tab metrics not matched to a live webview OS pid
      row.role = 'tab-unmatched';
    }
    return row;
  });
  const types = {};
  for (const [k, v] of Object.entries(byType)) {
    types[k] = {
      count: v.count,
      memMb: Math.round(v.memKb / 1024),
      cpu: Math.round(v.cpu * 100) / 100,
    };
  }
  return {
    at: Date.now(),
    processCount: processes.length,
    totalMemMb: Math.round(totalWsKb / 1024),
    totalCpu: Math.round(totalCpu * 100) / 100,
    byType: types,
    uiRenderer,
    guestWebContents: guestMeta,
    guests: {
      count: guests.length,
      webContentsCount: guestMeta.length,
      memMb: guests.reduce((a, g) => a + g.memMb, 0),
      cpu: Math.round(guests.reduce((a, g) => a + g.cpu, 0) * 100) / 100,
      processes: guests,
    },
    processes,
  };
}

function dirSizeBytes(root, maxDepth = 6, depth = 0) {
  if (!root || !fs.existsSync(root) || depth > maxDepth) return 0;
  let total = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    const p = path.join(root, ent.name);
    try {
      if (ent.isDirectory()) total += dirSizeBytes(p, maxDepth, depth + 1);
      else if (ent.isFile()) total += fs.statSync(p).size;
    } catch {
      /* */
    }
  }
  return total;
}

function fileSize(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function countEmitter(em) {
  if (!em || typeof em.eventNames !== 'function') return { events: 0, listeners: 0, detail: {} };
  const names = em.eventNames();
  const detail = {};
  let listeners = 0;
  for (const n of names) {
    const c = em.listenerCount(n);
    detail[String(n)] = c;
    listeners += c;
  }
  return { events: names.length, listeners, detail };
}

function snapshotListeners() {
  const wcs = webContents.getAllWebContents();
  const perWc = wcs.map((wc) => {
    let type = 'unknown';
    try {
      type = typeof wc.getType === 'function' ? wc.getType() : 'unknown';
    } catch {
      /* */
    }
    return {
      id: wc.id,
      type,
      destroyed: wc.isDestroyed?.() || false,
      ...countEmitter(wc),
    };
  });
  let windowFanout = null;
  try {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (win) {
      windowFanout = {
        focus: win.listenerCount('focus'),
        resized: win.listenerCount('resized'),
        closed: win.listenerCount('closed'),
        fanoutRegistry: require('../electron/window-events.cjs').counts(win),
      };
    }
  } catch {
    /* */
  }
  let guestFanout = null;
  try {
    const guest = wcs.find((wc) => {
      try {
        return wc.getType?.() === 'webview';
      } catch {
        return false;
      }
    });
    if (guest) {
      guestFanout = {
        didStopLoading: guest.listenerCount('did-stop-loading'),
        fanoutRegistry: require('../electron/webcontents-events.cjs').counts(guest),
      };
    }
  } catch {
    /* */
  }
  return {
    at: Date.now(),
    ipcMain: countEmitter(ipcMain),
    app: countEmitter(app),
    webContentsCount: wcs.length,
    webContents: perWc,
    webContentsListenersTotal: perWc.reduce((a, x) => a + x.listeners, 0),
    windowFanout,
    guestFanout,
  };
}

function buildChunkSizes() {
  const dist = path.join(__dirname, '..', 'dist', 'assets');
  if (!fs.existsSync(dist)) return { ok: false, error: 'no dist/assets — run npm run build' };
  const files = fs
    .readdirSync(dist)
    .filter((f) => /\.(js|css)$/i.test(f))
    .map((f) => {
      const sz = fileSize(path.join(dist, f));
      return { name: f, bytes: sz, kb: Math.round(sz / 1024) };
    })
    .sort((a, b) => b.bytes - a.bytes);
  return {
    ok: true,
    totalKb: Math.round(files.reduce((a, f) => a + f.bytes, 0) / 1024),
    files,
  };
}

function userDataSizes() {
  const root = app.getPath('userData');
  const historyDir = path.join(root, 'history');
  const cacheCandidates = [
    path.join(root, 'Cache'),
    path.join(root, 'Code Cache'),
    path.join(root, 'GPUCache'),
    path.join(root, 'DawnGraphiteCache'),
    path.join(root, 'DawnWebGPUCache'),
  ];
  let cacheBytes = 0;
  for (const c of cacheCandidates) cacheBytes += dirSizeBytes(c, 4);
  const visitsJsonlBytes = fileSize(path.join(historyDir, 'visits.jsonl'));
  // Product uses visits.jsonl; report also as history.jsonl alias for the brief.
  return {
    userDataRoot: root,
    userDataBytes: dirSizeBytes(root, 5),
    userDataMb: Math.round(dirSizeBytes(root, 5) / (1024 * 1024)),
    visitsJsonlBytes,
    historyJsonlBytes: visitsJsonlBytes,
    historyJsonlNote: 'alias of history/visits.jsonl',
    queriesJsonBytes: fileSize(path.join(historyDir, 'queries.json')),
    cacheBytes,
    cacheMb: Math.round(cacheBytes / (1024 * 1024)),
  };
}

async function seedHistory5000() {
  const history = require('../electron/history.cjs');
  const t0 = Date.now();
  for (let i = 0; i < 5000; i++) {
    history.recordVisit({
      url: `https://perf-bench.example/item/${i}`,
      title: `Perf history ${i}`,
      typed: i % 7 === 0,
    });
  }
  if (typeof history.flushSync === 'function') history.flushSync();
  return { seeded: 5000, ms: Date.now() - t0 };
}

async function run(getMainWindow) {
  const IDLE_MS = Math.max(5_000, Number(process.env.PERF_BENCH_IDLE_MS) || 600_000);
  const BG_MS = Math.max(5_000, Number(process.env.PERF_BENCH_IDLE_BG_MS) || 60_000);
  const runIdx = Number(process.env.PERF_BENCH_RUN) || 1;
  const tLaunch = Number(global.__DJXXR_PERF_T0) || Date.now();
  const result = {
    kind: 'perf-baseline',
    run: runIdx,
    startedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    versions: process.versions,
    config: { IDLE_MS, BG_MS },
    marks: {},
    scenarios: {},
    listeners: {},
    disk: {},
    build: {},
    react: {},
    ui: {},
  };

  console.log(`[perf-bench] run=${runIdx} idleMs=${IDLE_MS} bgMs=${BG_MS}`);

  await sleep(2500);
  let win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  for (let i = 0; i < 40 && (!win || win.isDestroyed()); i++) {
    await sleep(250);
    win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  }
  if (!win || win.isDestroyed()) {
    console.error('[perf-bench] no window');
    process.exit(2);
  }

  const wc = win.webContents;
  let uiPid = null;
  try {
    uiPid = typeof wc.getOSProcessId === 'function' ? wc.getOSProcessId() : null;
  } catch {
    uiPid = null;
  }
  const snap = () => sampleMetrics({ uiPid });

  const evalInApp = async (code, timeoutMs = 120_000) => {
    try {
      const p = wc.executeJavaScript(code, true);
      if (!timeoutMs) return await p;
      let timer;
      const timed = new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error(`evalInApp timeout ${timeoutMs}ms`)), timeoutMs);
      });
      try {
        return await Promise.race([p, timed]);
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      return { err: String(err && err.message ? err.message : err) };
    }
  };

  // --- Startup marks ---
  const tVisible = Date.now();
  try {
    if (!win.isVisible()) win.show();
  } catch {
    /* */
  }
  await sleep(800);
  const interactive = await evalInApp(`(() => {
    try {
      performance.mark('djxxr-home-interactive');
      const nav = performance.getEntriesByType('navigation')[0];
      const marks = performance.getEntriesByType('mark').map(m => ({ name: m.name, startTime: m.startTime }));
      const store = !!window.__DJXXR_STORE__;
      const home = !!document.querySelector('.hw-canvas, .home-root, .hw-notes, .omnibox, #root');
      return {
        store,
        home,
        marks,
        navDuration: nav ? nav.duration : null,
        now: performance.now(),
      };
    } catch (e) {
      return { err: String(e) };
    }
  })()`);
  result.marks = {
    launchToReadyMs: Number(global.__DJXXR_PERF_READY_AT)
      ? Number(global.__DJXXR_PERF_READY_AT) - tLaunch
      : null,
    launchToWindowCreatedMs: Number(global.__DJXXR_PERF_WINDOW_CREATED_AT)
      ? Number(global.__DJXXR_PERF_WINDOW_CREATED_AT) - tLaunch
      : null,
    launchToWindowVisibleMs: Number(global.__DJXXR_PERF_WINDOW_VISIBLE_AT)
      ? Number(global.__DJXXR_PERF_WINDOW_VISIBLE_AT) - tLaunch
      : tVisible - tLaunch,
    launchToInteractiveMs: Date.now() - tLaunch,
    requireTimes: global.__DJXXR_REQUIRE_TIMES__ || null,
    heavyDoneAt: global.__DJXXR_PERF_HEAVY_DONE_AT || null,
    renderer: interactive,
    appReadyAt: global.__DJXXR_PERF_READY_AT || null,
    launchAt: tLaunch,
    packaged: app.isPackaged,
  };
  console.log('[perf-bench] startup', result.marks.launchToInteractiveMs, 'ms');

  // Reset any restored session tabs so RAM/guest counts are not polluted
  const reset = await evalInApp(`(() => {
    const st = window.__DJXXR_STORE__?.getState?.();
    if (!st) return { err: 'no-store' };
    const ids = st.tabs.map(t => t.id);
    const keep = st.activeId || ids[0];
    for (const id of ids) {
      if (id !== keep) {
        try { st.closeTab(id); } catch {}
      }
    }
    st.updateTab?.(st.activeId, { url: 'about:home', discarded: false });
    st.setView?.('browser');
    return { tabs: window.__DJXXR_STORE__.getState().tabs.length, activeId: window.__DJXXR_STORE__.getState().activeId };
  })()`);
  console.log('[perf-bench] reset tabs', reset);
  await sleep(800);

  // --- empty home metrics ---
  await evalInApp(`(() => {
    const st = window.__DJXXR_STORE__?.getState?.();
    if (!st) return false;
    const id = st.activeId;
    st.updateTab?.(id, { url: 'about:home' });
    st.setView?.('browser');
    return true;
  })()`);
  await sleep(1500);
  // warm getAppMetrics
  snap();
  await sleep(1200);
  result.scenarios.emptyHome = snap();

  // --- listeners before ---
  result.listeners.before20Tabs = snapshotListeners();

  // --- open 10 tabs ---
  console.log('[perf-bench] opening 10 tabs…');
  const open10Start = Date.now();
  const loadFails = [];
  const failHook = (_e, contents) => {
    try {
      if (contents.getType?.() !== 'webview') return;
      const onFail = (_ev, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame || errorCode === -3) return;
        loadFails.push({
          at: Date.now(),
          wcId: contents.id,
          errorCode,
          errorDescription: String(errorDescription || ''),
          url: String(validatedURL || ''),
        });
      };
      contents.on('did-fail-load', onFail);
    } catch {
      /* */
    }
  };
  app.on('web-contents-created', failHook);

  await evalInApp(`(async () => {
    const st = window.__DJXXR_STORE__?.getState?.();
    if (!st) return { err: 'no-store' };
    const urls = ${JSON.stringify(SITES_10)};
    st.updateTab(st.activeId, { url: urls[0] });
    for (let i = 1; i < urls.length; i++) {
      st.newTab(urls[i], { background: true });
      await new Promise(r => setTimeout(r, 400));
    }
    return { tabs: window.__DJXXR_STORE__.getState().tabs.length };
  })()`);
  // Activate every tab once so each guest process is created (Chrome-like keep-alive).
  console.log('[perf-bench] activating each of 10 tabs once…');
  await evalInApp(`(async () => {
    const st = window.__DJXXR_STORE__?.getState?.();
    if (!st) return { err: 'no-store' };
    const ids = st.tabs.map(t => t.id);
    for (const id of ids) {
      st.setActive(id);
      await new Promise(r => setTimeout(r, 350));
    }
    if (ids[0]) st.setActive(ids[0]);
    return { activated: ids.length };
  })()`);
  // Staggered settle — heavy sites (reddit/google) need more than 18s under load
  const LOAD_WAIT_MS = Math.max(25_000, Number(process.env.PERF_BENCH_LOAD_WAIT_MS) || 45_000);
  await sleep(LOAD_WAIT_MS);
  try {
    app.removeListener('web-contents-created', failHook);
  } catch {
    /* */
  }
  const tabLoadStatus = await evalInApp(`(() => {
    const st = window.__DJXXR_STORE__?.getState?.();
    if (!st) return { err: 'no-store' };
    return st.tabs.map(t => ({ id: t.id, url: t.url, title: t.title, loadError: t.loadError || null }));
  })()`);
  result.scenarios.tabs10 = {
    ...snap(),
    openMs: Date.now() - open10Start,
    loadWaitMs: LOAD_WAIT_MS,
    tabCount: await evalInApp(`window.__DJXXR_STORE__?.getState?.().tabs.length`),
    tabLoadStatus,
    didFailLoad: loadFails.slice(0, 40),
  };
  console.log('[perf-bench] tabs10 mem', result.scenarios.tabs10.totalMemMb, 'MB', 'guests', result.scenarios.tabs10.guests?.count);

  // --- tab switch & new tab timing ---
  const switchSamples = [];
  for (let i = 0; i < 8; i++) {
    const ms = await evalInApp(`(async () => {
      const st = window.__DJXXR_STORE__.getState();
      const tabs = st.tabs;
      if (tabs.length < 2) return null;
      const cur = st.activeId;
      const other = tabs.find(t => t.id !== cur)?.id || tabs[0].id;
      const t0 = performance.now();
      st.setActive(other);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const dt = performance.now() - t0;
      st.setActive(cur);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return dt;
    })()`);
    if (typeof ms === 'number') switchSamples.push(ms);
    await sleep(80);
  }
  const newTabSamples = [];
  for (let i = 0; i < 5; i++) {
    const ms = await evalInApp(`(async () => {
      const st = window.__DJXXR_STORE__.getState();
      const before = st.tabs.length;
      const t0 = performance.now();
      st.newTab('about:home', { background: false });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const dt = performance.now() - t0;
      const id = window.__DJXXR_STORE__.getState().activeId;
      if (window.__DJXXR_STORE__.getState().tabs.length > before) {
        window.__DJXXR_STORE__.getState().closeTab(id);
      }
      return dt;
    })()`);
    if (typeof ms === 'number') newTabSamples.push(ms);
    await sleep(120);
  }
  result.ui.tabSwitchMs = switchSamples;
  result.ui.newTabMs = newTabSamples;
  result.ui.tabSwitchMedianMs = median(switchSamples);
  result.ui.newTabMedianMs = median(newTabSamples);

  // --- idle 10 tabs ---
  console.log(`[perf-bench] idle ${IDLE_MS}ms with 10 tabs…`);
  const idleStart = Date.now();
  await sleep(IDLE_MS);
  result.scenarios.tabs10AfterIdle = {
    ...snap(),
    idleMs: Date.now() - idleStart,
  };
  console.log('[perf-bench] after idle mem', result.scenarios.tabs10AfterIdle.totalMemMb, 'MB');

  // --- grow to 30 tabs (optional; PERF_BENCH_MAX_TABS=10 skips) ---
  const maxTabs = Math.max(10, Number(process.env.PERF_BENCH_MAX_TABS) || 30);
  if (maxTabs >= 30) {
    console.log('[perf-bench] opening to 30 tabs…');
    await evalInApp(`(() => {
      const st = window.__DJXXR_STORE__.getState();
      const need = 30 - st.tabs.length;
      for (let i = 0; i < need; i++) {
        st.newTab('https://example.com/?n=' + i, { background: true });
      }
      return st.tabs.length;
    })()`);
    console.log('[perf-bench] activating each of 30 tabs once…');
    await evalInApp(`(async () => {
      const st = window.__DJXXR_STORE__.getState();
      const ids = st.tabs.map(t => t.id);
      for (const id of ids) {
        st.setActive(id);
        await new Promise(r => setTimeout(r, 200));
      }
      if (ids[0]) st.setActive(ids[0]);
      return { activated: ids.length };
    })()`);
    await sleep(20_000);
    result.scenarios.tabs30 = {
      ...snap(),
      tabCount: await evalInApp(`window.__DJXXR_STORE__?.getState?.().tabs.length`),
    };
    console.log(
      '[perf-bench] tabs30 mem',
      result.scenarios.tabs30.totalMemMb,
      'MB guests',
      result.scenarios.tabs30.guests?.count,
      'wc',
      result.scenarios.tabs30.guests?.webContentsCount,
    );
  } else {
    console.log('[perf-bench] skip tabs30 (MAX_TABS=' + maxTabs + ')');
    result.scenarios.tabs30 = { skipped: true, maxTabs };
  }

  // --- open+close 20 tabs listener delta ---
  const beforeOc = snapshotListeners();
  await evalInApp(`(() => {
    const st = window.__DJXXR_STORE__.getState();
    const ids = [];
    for (let i = 0; i < 20; i++) {
      st.newTab('https://example.com/oc-' + i, { background: true });
    }
    const after = window.__DJXXR_STORE__.getState().tabs;
    // close the newest 20 non-active if possible
    const extras = after.filter(t => t.url.includes('/oc-')).map(t => t.id);
    for (const id of extras) st.closeTab(id);
    return { closed: extras.length, tabs: window.__DJXXR_STORE__.getState().tabs.length };
  })()`);
  await sleep(2000);
  const afterOc = snapshotListeners();
  result.listeners.openClose20 = {
    before: beforeOc,
    after: afterOc,
    deltaWc: afterOc.webContentsCount - beforeOc.webContentsCount,
    deltaWcListeners: afterOc.webContentsListenersTotal - beforeOc.webContentsListenersTotal,
    deltaIpcListeners: afterOc.ipcMain.listeners - beforeOc.ipcMain.listeners,
  };

  // --- background idle CPU 60s (blur only — minimize can stall guest/webview IPC on Win) ---
  console.log(`[perf-bench] background idle ${BG_MS}ms…`);
  try {
    win.blur();
  } catch {
    /* */
  }
  // prime CPU counters
  snap();
  await sleep(1500);
  const bgSamples = [];
  const bgEnd = Date.now() + BG_MS;
  while (Date.now() < bgEnd) {
    bgSamples.push(snap());
    await sleep(2000);
  }
  try {
    win.focus();
    win.show();
  } catch {
    /* */
  }
  await sleep(800);
  result.scenarios.backgroundIdle = {
    sampleCount: bgSamples.length,
    samples: bgSamples.map((s) => ({
      totalCpu: s.totalCpu,
      totalMemMb: s.totalMemMb,
      uiRendererCpu: s.uiRenderer?.cpu ?? null,
      byType: s.byType,
    })),
    medianTotalCpu: median(bgSamples.map((s) => s.totalCpu)),
    medianUiRendererCpu: median(bgSamples.map((s) => s.uiRenderer?.cpu).filter((n) => typeof n === 'number')),
    medianGuestTabCpu: median(bgSamples.map((s) => s.guests?.cpu || 0)),
    medianBrowserCpu: median(bgSamples.map((s) => s.byType.Browser?.cpu || 0)),
    medianGpuCpu: median(bgSamples.map((s) => s.byType.GPU?.cpu || 0)),
    uiPid,
  };

  // --- UI FPS / long tasks: menu, history scroll, tab churn, motion ---
  console.log('[perf-bench] UI FPS / longtasks…');
  try {
    await seedHistory5000();
  } catch (err) {
    result.ui.historySeedError = String(err && err.message ? err.message : err);
  }

  result.ui.menuOpen = await evalInApp(`(async () => {
    const longTasks = [];
    let po;
    try {
      po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) longTasks.push({ name: e.name, duration: e.duration, startTime: e.startTime });
      });
      po.observe({ entryTypes: ['longtask'] });
    } catch {}
    let frames = 0;
    let running = true;
    const loop = () => { if (!running) return; frames++; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const t0 = performance.now();
    const btn = document.querySelector('.app-menu-trigger');
    btn?.click();
    await new Promise(r => setTimeout(r, 1200));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    running = false;
    const dt = performance.now() - t0;
    try { po?.disconnect(); } catch {}
    return { frames, dt, fps: frames / (dt / 1000), longTasks: longTasks.slice(0, 40), longTaskCount: longTasks.length, clicked: !!btn };
  })()`);

  result.ui.historyScroll = await evalInApp(`(async () => {
    const st = window.__DJXXR_STORE__.getState();
    st.updateTab(st.activeId, { url: 'about:history' });
    await new Promise(r => setTimeout(r, 1200));
    const longTasks = [];
    let po;
    try {
      po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) longTasks.push({ duration: e.duration, startTime: e.startTime });
      });
      po.observe({ entryTypes: ['longtask'] });
    } catch {}
    let frames = 0;
    let running = true;
    const loop = () => { if (!running) return; frames++; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const scroller = document.querySelector('.history-page, .history-list, [data-history], .hw-history, main, .stage') || document.scrollingElement;
    const t0 = performance.now();
    for (let i = 0; i < 40; i++) {
      if (scroller) scroller.scrollTop = (scroller.scrollTop || 0) + 180;
      window.scrollBy(0, 180);
      await new Promise(r => setTimeout(r, 16));
    }
    running = false;
    const dt = performance.now() - t0;
    try { po?.disconnect(); } catch {}
    return { frames, dt, fps: frames / (dt / 1000), longTaskCount: longTasks.length, longTasks: longTasks.slice(0, 40) };
  })()`);

  result.ui.tabChurnMotion = await evalInApp(`(async () => {
    const st = window.__DJXXR_STORE__.getState();
    const ids = st.tabs.map(t => t.id);
    const longTasks = [];
    let po;
    try {
      po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) longTasks.push({ duration: e.duration });
      });
      po.observe({ entryTypes: ['longtask'] });
    } catch {}
    let frames = 0;
    let running = true;
    const loop = () => { if (!running) return; frames++; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) {
      st.setActive(ids[i % ids.length]);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    running = false;
    const dt = performance.now() - t0;
    try { po?.disconnect(); } catch {}
    return { frames, dt, fps: frames / (dt / 1000), longTaskCount: longTasks.length };
  })()`);

  // Tab strip reorder + layout motion (proxy for przeciąganie kart — no native tab DnD)
  result.ui.tabDragMotion = await evalInApp(`(async () => {
    const store = window.__DJXXR_STORE__;
    const longTasks = [];
    let po;
    try {
      po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) longTasks.push({ duration: e.duration });
      });
      po.observe({ entryTypes: ['longtask'] });
    } catch {}
    let frames = 0;
    let running = true;
    const loop = () => { if (!running) return; frames++; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      const tabs = [...store.getState().tabs];
      if (tabs.length < 2) break;
      const a = i % tabs.length;
      const b = (i + 1) % tabs.length;
      const next = tabs.slice();
      const tmp = next[a];
      next[a] = next[b];
      next[b] = tmp;
      store.setState({ tabs: next });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    running = false;
    const dt = performance.now() - t0;
    try { po?.disconnect(); } catch {}
    return { frames, dt, fps: frames / (dt / 1000), longTaskCount: longTasks.length, note: 'reorder via setState + motion layout' };
  })()`);

  // --- React profiler / idle renders ---
  result.react = await evalInApp(
    `(async () => {
    const probe = window.__DJXXR_PERF__;
    if (!probe) return { enabled: false };
    probe.reset();
    await new Promise(r => setTimeout(r, 30000));
    const idle = probe.snapshot();
    probe.reset();
    const st = window.__DJXXR_STORE__.getState();
    st.updateTab(st.activeId, { url: 'https://example.com/perf-load-' + Date.now() });
    await new Promise(r => setTimeout(r, 5000));
    const load = probe.snapshot();
    return { enabled: true, idle30s: idle, loadOnePage5s: load };
  })()`,
    90_000,
  );

  // --- disk + build ---
  result.disk = userDataSizes();
  result.disk.localStorage = await evalInApp(`(() => {
    try {
      const key = 'moja-przegladarka-v8';
      const raw = localStorage.getItem(key) || '';
      return { key, chars: raw.length, bytesApprox: raw.length * 2 };
    } catch (e) {
      return { err: String(e) };
    }
  })()`);
  result.build = buildChunkSizes();
  result.uiPid = uiPid;

  result.finishedAt = new Date().toISOString();
  const file = path.join(outDir(), `baseline-${stamp()}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  // also write/overwrite run-indexed pointer for median merger
  const runPtr = path.join(outDir(), `baseline-run${runIdx}.json`);
  fs.writeFileSync(runPtr, JSON.stringify(result, null, 2));
  console.log('[perf-bench] wrote', file);
  console.log('[perf-bench] wrote', runPtr);
  console.log('[perf-bench] done');

  if (process.env.PERF_BENCH_QUIT === '1') {
    await sleep(500);
    app.quit();
  }
  return { file, result };
}

function median(arr) {
  const a = (arr || []).filter((n) => typeof n === 'number' && !Number.isNaN(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

module.exports = { run, sampleMetrics, median };
