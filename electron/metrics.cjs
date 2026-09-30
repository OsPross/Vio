'use strict';

const os = require('node:os');
const { app, webContents } = require('electron');

const HISTORY_MAX = 60;
const DEFAULT_INTERVAL_MS = 2000;
const LOW_POWER_INTERVAL_MS = 5000;

/** @typedef {{ id: string, kind: 'tab'|'side'|'browser'|'gpu'|'utility'|'unknown', title?: string, url?: string, favicon?: string, webContentsId?: number|null }} GuestInfo */

/** @type {Map<number, number>} webContentsId → bytes (down+up cumulative since attach) */
const netBytes = new Map();
/** @type {Map<number, number>} bytes since last sample (delta) */
const netDelta = new Map();

/** @type {GuestInfo[]} */
let guests = [];
/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;
let intervalMs = DEFAULT_INTERVAL_MS;
let subscribers = 0;
/** @type {((payload: object) => void) | null} */
let pushFn = null;

/** @type {object[]} */
const history = [];

/** previous CPU times for system */
let prevCpu = null;
/** previous per-pid cpu for Electron processes: pid → { cpu, ts } */
const prevProcCpu = new Map();

const startedAt = Date.now();

function attachNetwork(ses) {
  if (!ses || attachNetwork._done) return;
  attachNetwork._done = true;
  try {
    ses.webRequest.onCompleted((details) => {
      try {
        const wcId = details.webContentsId;
        if (!wcId) return;
        let n = 0;
        const cl = details.responseHeaders && (details.responseHeaders['content-length'] || details.responseHeaders['Content-Length']);
        if (cl && cl[0]) n += Number(cl[0]) || 0;
        if (Array.isArray(details.uploadData)) {
          for (const u of details.uploadData) {
            if (u?.bytes) n += u.bytes.byteLength || u.bytes.length || 0;
          }
        }
        if (!n) n = 512; // minimalna jednostka aktywności sieciowej
        netBytes.set(wcId, (netBytes.get(wcId) || 0) + n);
        netDelta.set(wcId, (netDelta.get(wcId) || 0) + n);
      } catch {
        /* */
      }
    });
  } catch (err) {
    console.warn('[metrics] network attach', err);
  }
}

function setGuests(list) {
  if (!Array.isArray(list)) return;
  guests = list
    .filter((g) => g && typeof g.id === 'string')
    .map((g) => ({
      id: g.id,
      kind: g.kind === 'side' ? 'side' : g.kind === 'tab' ? 'tab' : 'tab',
      title: String(g.title || '').slice(0, 120),
      url: String(g.url || '').slice(0, 500),
      favicon: String(g.favicon || '').slice(0, 500),
      webContentsId: typeof g.webContentsId === 'number' ? g.webContentsId : null,
    }));
}

function setIntervalMs(ms) {
  const next = Math.max(1000, Math.min(15_000, Number(ms) || DEFAULT_INTERVAL_MS));
  if (next === intervalMs) return intervalMs;
  intervalMs = next;
  if (timer) {
    clearInterval(timer);
    timer = setInterval(tick, intervalMs);
  }
  return intervalMs;
}

function setLowPower(on) {
  return setIntervalMs(on ? LOW_POWER_INTERVAL_MS : DEFAULT_INTERVAL_MS);
}

function cpuTimesTotal(cpus) {
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

function systemCpuPercent() {
  const cur = cpuTimesTotal(os.cpus());
  if (!prevCpu) {
    prevCpu = cur;
    return 0;
  }
  const idle = cur.idle - prevCpu.idle;
  const total = cur.total - prevCpu.total;
  prevCpu = cur;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - idle / total) * 100));
}

function procCpuPercent(pid, cpuFromMetrics) {
  // app.getAppMetrics().cpu.percentCPUUsage is already a percent since last call in Electron
  if (cpuFromMetrics != null && Number.isFinite(cpuFromMetrics)) {
    return Math.max(0, Math.min(100, cpuFromMetrics));
  }
  return 0;
}

function memMb(bytes) {
  return Math.round((Number(bytes) || 0) / (1024 * 1024));
}

async function readGpu() {
  try {
    const info = await app.getGPUFeatureStatus?.();
    const basic = await app.getGPUInfo?.('basic');
    return {
      status: info || null,
      gpuDevice: basic?.gpuDevice?.[0]?.deviceString || basic?.auxAttributes?.glRenderer || null,
    };
  } catch {
    return { status: null, gpuDevice: null };
  }
}

function sampleSync() {
  const sysCpu = systemCpuPercent();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  let sysMemInfo = null;
  try {
    sysMemInfo = process.getSystemMemoryInfo?.() || null;
  } catch {
    /* */
  }

  const metrics = app.getAppMetrics();
  const pidMap = new Map();
  let browserCpu = 0;
  let browserMemKb = 0;

  for (const m of metrics) {
    const cpu = procCpuPercent(m.pid, m.cpu?.percentCPUUsage);
    const memKb = m.memory?.workingSetSize || 0;
    pidMap.set(m.pid, {
      pid: m.pid,
      type: m.type,
      name: m.name || m.type,
      cpu,
      memMb: Math.round(memKb / 1024),
      memKb,
    });
    browserCpu += cpu;
    browserMemKb += memKb;
  }

  /** @type {Map<number, number>} wcId → os pid */
  const wcPid = new Map();
  for (const g of guests) {
    if (g.webContentsId == null) continue;
    try {
      const wc = webContents.fromId(g.webContentsId);
      if (wc && !wc.isDestroyed()) {
        const pid = wc.getOSProcessId();
        if (pid) wcPid.set(g.webContentsId, pid);
      }
    } catch {
      /* */
    }
  }

  const rows = [];
  const assignedPids = new Set();

  for (const g of guests) {
    const pid = g.webContentsId != null ? wcPid.get(g.webContentsId) : null;
    const proc = pid != null ? pidMap.get(pid) : null;
    if (pid != null) assignedPids.add(pid);
    const netTotal = g.webContentsId != null ? netBytes.get(g.webContentsId) || 0 : 0;
    const netRate = g.webContentsId != null ? netDelta.get(g.webContentsId) || 0 : 0;
    rows.push({
      id: g.id,
      kind: g.kind,
      title: g.title || (g.kind === 'side' ? 'Aplikacja' : 'Karta'),
      url: g.url || '',
      favicon: g.favicon || '',
      pid: pid || null,
      cpu: proc ? proc.cpu : 0,
      memMb: proc ? proc.memMb : 0,
      netBytes: netTotal,
      netRate,
      sleeping: false,
    });
  }

  // Pozostałe procesy Electron
  for (const [pid, proc] of pidMap) {
    if (assignedPids.has(pid)) continue;
    rows.push({
      id: `proc-${pid}`,
      kind: proc.type === 'GPU' || proc.type === 'GPU Process' ? 'gpu' : proc.type === 'Browser' ? 'browser' : 'utility',
      title: proc.name || proc.type,
      url: '',
      favicon: '',
      pid,
      cpu: proc.cpu,
      memMb: proc.memMb,
      netBytes: 0,
      netRate: 0,
      sleeping: false,
    });
  }

  // reset deltas po próbce
  netDelta.clear();

  const snap = {
    ts: Date.now(),
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    system: {
      cpu: round1(sysCpu),
      memUsedMb: memMb(usedMem),
      memTotalMb: memMb(totalMem),
      memFreeMb: memMb(freeMem),
      memPercent: round1((usedMem / totalMem) * 100),
      sysMemInfo,
    },
    browser: {
      cpu: round1(Math.min(100, browserCpu)),
      memMb: Math.round(browserMemKb / 1024),
      processes: metrics.length,
    },
    rows,
  };

  history.push({
    ts: snap.ts,
    sysCpu: snap.system.cpu,
    sysMem: snap.system.memPercent,
    appCpu: snap.browser.cpu,
    appMem: snap.browser.memMb,
  });
  while (history.length > HISTORY_MAX) history.shift();

  return snap;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

let lastGpu = { status: null, gpuDevice: null };
let gpuTick = 0;

async function tick() {
  if (subscribers <= 0) return;
  try {
    const snap = sampleSync();
    gpuTick++;
    if (gpuTick % 5 === 1) {
      lastGpu = await readGpu();
    }
    const payload = {
      ...snap,
      gpu: lastGpu,
      history: history.slice(),
      intervalMs,
    };
    if (pushFn) pushFn(payload);
  } catch (err) {
    console.warn('[metrics] tick', err);
  }
}

function start() {
  if (timer) return;
  void tick();
  timer = setInterval(() => void tick(), intervalMs);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function subscribe() {
  subscribers += 1;
  if (subscribers === 1) start();
  return { ok: true, subscribers, intervalMs };
}

function unsubscribe() {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers === 0) stop();
  return { ok: true, subscribers };
}

function init(opts = {}) {
  if (typeof opts.onPush === 'function') pushFn = opts.onPush;
  if (typeof opts.intervalMs === 'number') setIntervalMs(opts.intervalMs);
  return { ok: true };
}

function getSnapshot() {
  return {
    ...sampleSync(),
    gpu: lastGpu,
    history: history.slice(),
    intervalMs,
    subscribers,
  };
}

module.exports = {
  init,
  attachNetwork,
  subscribe,
  unsubscribe,
  setGuests,
  setIntervalMs,
  setLowPower,
  getSnapshot,
  HISTORY_MAX,
  DEFAULT_INTERVAL_MS,
  LOW_POWER_INTERVAL_MS,
};
