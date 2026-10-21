'use strict';

/**
 * Window session persistence — tabs, closed stack, window bounds.
 * Tor tabs are never written to disk.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let app;
try {
  ({ app } = require('electron'));
} catch {
  app = null;
}

const VERSION = 1;
const MAX_CLOSED = 25;
const MAX_CLOSED_WINDOWS = 5;

/** @type {string | null} */
let rootOverride = null;

function sessionDir() {
  if (rootOverride) return rootOverride;
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    /* */
  }
  return path.join(os.tmpdir(), 'djxxr-session');
}

function _setRootForTests(dir) {
  rootOverride = dir || null;
  cached = null;
  crashOffer = false;
  crashOfferReady = false;
  cleanExitMarked = false;
  dirty = false;
}

/** @typedef {{
 *   url: string,
 *   title?: string,
 *   urlChain?: string[],
 *   index?: number,
 * }} NavHistory */

/** @typedef {{
 *   id: string,
 *   url: string,
 *   title: string,
 *   favicon?: string,
 *   pinned?: boolean,
 *   index?: number,
 *   navHistory?: NavHistory | null,
 * }} SessionTab */

/** @typedef {{
 *   id: string,
 *   url: string,
 *   title: string,
 *   favicon?: string,
 *   pinned?: boolean,
 *   index: number,
 *   navHistory?: NavHistory | null,
 *   closedAt: number,
 * }} ClosedTab */

/** @typedef {{
 *   version: number,
 *   dirtyExit: boolean,
 *   savedAt: number,
 *   activeId: string | null,
 *   tabs: SessionTab[],
 *   closedTabs: ClosedTab[],
 *   closedWindows: { tabs: ClosedTab[], closedAt: number }[],
 *   window: { x?: number, y?: number, width: number, height: number, isMaximized?: boolean },
 * }} SessionData */

/** @type {SessionData | null} */
let cached = null;
let dirty = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let flushTimer = null;
let cleanExitMarked = false;
/** Snapshot of dirtyExit at first load — for crash restore banner */
let crashOffer = false;
let crashOfferReady = false;

function sessionPath() {
  return path.join(sessionDir(), 'session.json');
}

function prevPath() {
  return path.join(sessionDir(), 'session.prev.json');
}

function tmpPath() {
  return path.join(sessionDir(), 'session.json.tmp');
}

function defaultSession() {
  return {
    version: VERSION,
    dirtyExit: false,
    savedAt: Date.now(),
    activeId: null,
    tabs: [],
    closedTabs: [],
    closedWindows: [],
    window: { width: 1360, height: 900, isMaximized: false },
  };
}

function isTorLike(tab) {
  if (!tab || typeof tab !== 'object') return true;
  if (tab.mode === 'tor') return true;
  if (tab.partition && String(tab.partition).startsWith('tor-')) return true;
  const url = String(tab.url || '');
  if (/\.onion\b/i.test(url)) return true;
  if (url === 'about:tor' || url.startsWith('about:tor')) return true;
  return false;
}

/**
 * Strip Tor / unsafe fields from a tab snapshot.
 * @param {Record<string, unknown>} tab
 * @returns {SessionTab | null}
 */
function sanitizeTab(tab) {
  if (isTorLike(tab)) return null;
  const url = String(tab.url || '').trim();
  if (!url) return null;
  const favicon = typeof tab.favicon === 'string' ? tab.favicon : undefined;
  // Prefer data: favicons; allow http(s) URLs as display hints only
  const safeFav =
    favicon && (favicon.startsWith('data:') || /^https?:/i.test(favicon)) ? favicon.slice(0, 200_000) : undefined;
  /** @type {SessionTab} */
  const out = {
    id: String(tab.id || Math.random().toString(36).slice(2, 10)),
    url,
    title: String(tab.title || 'Karta').slice(0, 500),
    pinned: Boolean(tab.pinned),
  };
  if (safeFav) out.favicon = safeFav;
  if (typeof tab.index === 'number') out.index = tab.index;
  if (tab.navHistory && typeof tab.navHistory === 'object') {
    const nh = tab.navHistory;
    const urlChain = Array.isArray(nh.urlChain)
      ? nh.urlChain.filter((u) => typeof u === 'string' && !/\.onion\b/i.test(u) && !String(u).startsWith('about:tor')).slice(0, 50)
      : undefined;
    out.navHistory = {
      url: typeof nh.url === 'string' ? nh.url : url,
      title: typeof nh.title === 'string' ? nh.title : out.title,
      urlChain,
      index: typeof nh.index === 'number' ? nh.index : undefined,
    };
  }
  return out;
}

function sanitizeClosed(tab) {
  const base = sanitizeTab(tab);
  if (!base) return null;
  return {
    ...base,
    index: typeof tab.index === 'number' ? tab.index : 0,
    closedAt: typeof tab.closedAt === 'number' ? tab.closedAt : Date.now(),
  };
}

/**
 * @param {Partial<SessionData> & { tabs?: unknown[], closedTabs?: unknown[] }} raw
 * @returns {SessionData}
 */
function normalize(raw) {
  const base = defaultSession();
  if (!raw || typeof raw !== 'object') return base;
  const tabs = Array.isArray(raw.tabs)
    ? raw.tabs.map(sanitizeTab).filter(Boolean)
    : [];
  const closedTabs = Array.isArray(raw.closedTabs)
    ? raw.closedTabs.map(sanitizeClosed).filter(Boolean).slice(0, MAX_CLOSED)
    : [];
  const closedWindows = Array.isArray(raw.closedWindows)
    ? raw.closedWindows
        .map((w) => {
          if (!w || typeof w !== 'object') return null;
          const tabs = Array.isArray(w.tabs)
            ? w.tabs.map(sanitizeClosed).filter(Boolean).slice(0, MAX_CLOSED)
            : [];
          if (!tabs.length) return null;
          return { tabs, closedAt: Number(w.closedAt) || Date.now() };
        })
        .filter(Boolean)
        .slice(0, MAX_CLOSED_WINDOWS)
    : [];
  // Pinned first, then by index
  tabs.sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return (a.index ?? 0) - (b.index ?? 0);
  });
  let activeId = typeof raw.activeId === 'string' ? raw.activeId : null;
  if (activeId && !tabs.some((t) => t.id === activeId)) {
    activeId = tabs[0]?.id || null;
  }
  const win = raw.window && typeof raw.window === 'object' ? raw.window : {};
  return {
    version: VERSION,
    dirtyExit: Boolean(raw.dirtyExit),
    savedAt: Number(raw.savedAt) || Date.now(),
    activeId,
    tabs,
    closedTabs,
    closedWindows,
    window: {
      x: typeof win.x === 'number' ? win.x : undefined,
      y: typeof win.y === 'number' ? win.y : undefined,
      width: Math.max(720, Number(win.width) || 1360),
      height: Math.max(480, Number(win.height) || 900),
      isMaximized: Boolean(win.isMaximized),
    },
  };
}

function readFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function load() {
  if (cached) return cached;
  let raw = readFile(sessionPath());
  if (!raw) raw = readFile(prevPath());
  cached = normalize(raw);
  if (!crashOfferReady) {
    crashOffer = Boolean(cached.dirtyExit) && cached.tabs.length > 0;
    crashOfferReady = true;
  }
  return cached;
}

function writeAtomic(data) {
  fs.mkdirSync(sessionDir(), { recursive: true });
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const tmp = tmpPath();
  const dest = sessionPath();
  const prev = prevPath();
  fs.writeFileSync(tmp, json, 'utf8');
  try {
    if (fs.existsSync(dest)) {
      try {
        fs.copyFileSync(dest, prev);
      } catch {
        /* */
      }
    }
    fs.renameSync(tmp, dest);
  } catch (err) {
    try {
      fs.writeFileSync(dest, json, 'utf8');
    } catch (e2) {
      console.error('[session] write failed', err, e2);
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* */
    }
  }
}

function flushSync() {
  if (!dirty && cached) {
    // still allow forced clean-exit write
  }
  const data = cached || defaultSession();
  data.savedAt = Date.now();
  data.version = VERSION;
  writeAtomic(data);
  dirty = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function scheduleFlush(ms = 1000) {
  dirty = true;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      flushSync();
    } catch (err) {
      console.error('[session] flush', err);
    }
  }, ms);
}

/**
 * Replace session snapshot from renderer (Tor already filtered client-side; we filter again).
 * @param {Partial<SessionData>} patch
 */
function saveSnapshot(patch) {
  const cur = load();
  const next = normalize({
    ...cur,
    ...patch,
    dirtyExit: cleanExitMarked ? false : true,
    tabs: Array.isArray(patch.tabs) ? patch.tabs : cur.tabs,
    closedTabs: Array.isArray(patch.closedTabs) ? patch.closedTabs : cur.closedTabs,
    closedWindows: Array.isArray(patch.closedWindows) ? patch.closedWindows : cur.closedWindows,
    window: patch.window ? { ...cur.window, ...patch.window } : cur.window,
    activeId: patch.activeId !== undefined ? patch.activeId : cur.activeId,
  });
  // If clean exit already marked this shutdown, keep dirtyExit false
  if (cleanExitMarked) next.dirtyExit = false;
  else next.dirtyExit = true;
  cached = next;
  // After clean-exit, flush immediately so a delayed timer cannot rewrite dirtyExit:true
  if (cleanExitMarked) flushSync();
  else scheduleFlush(1000);
  return { ok: true, count: next.tabs.length, closed: next.closedTabs.length };
}

function markCleanExit() {
  if (cleanExitMarked && cached && cached.dirtyExit === false) {
    return { ok: true, already: true };
  }
  cleanExitMarked = true;
  const cur = load();
  cur.dirtyExit = false;
  cur.savedAt = Date.now();
  cached = cur;
  dirty = true;
  flushSync();
  return { ok: true };
}

function markDirtyOnBoot() {
  // This run is dirty until clean quit — so a crash is detected next launch
  const cur = load();
  if (!cleanExitMarked) {
    cur.dirtyExit = true;
    cached = cur;
    scheduleFlush(1500);
  }
}

function getStatus() {
  const cur = load();
  return {
    dirtyExit: crashOffer,
    tabCount: cur.tabs.length,
    closedCount: cur.closedTabs.length,
    savedAt: cur.savedAt,
    hasSession: cur.tabs.length > 0,
  };
}

function dismissCrashOffer() {
  crashOffer = false;
  const cur = load();
  cur.dirtyExit = false;
  cached = cur;
  dirty = true;
  flushSync();
  return { ok: true };
}

function clearSession() {
  cached = defaultSession();
  dirty = true;
  flushSync();
  return { ok: true };
}

/**
 * Read navigation history from a guest WebContents if API exists.
 * @param {Electron.WebContents} wc
 */
function readNavHistory(wc) {
  try {
    if (!wc || wc.isDestroyed()) return null;
    const nh = wc.navigationHistory;
    if (!nh || typeof nh.getAllEntries !== 'function') return null;
    const entries = nh.getAllEntries() || [];
    const index = typeof nh.getActiveIndex === 'function' ? nh.getActiveIndex() : entries.length - 1;
    const urlChain = entries
      .map((e) => (e && typeof e.url === 'string' ? e.url : ''))
      .filter((u) => u && !/\.onion\b/i.test(u) && !u.startsWith('about:tor'))
      .slice(0, 50);
    const active = entries[index] || entries[entries.length - 1];
    return {
      url: active?.url || '',
      title: active?.title || '',
      urlChain,
      index: Math.max(0, index),
    };
  } catch {
    return null;
  }
}

function pushClosedWindow(tabs) {
  const cur = load();
  const cleaned = (Array.isArray(tabs) ? tabs : [])
    .map((t, i) => sanitizeClosed({ ...t, index: typeof t?.index === 'number' ? t.index : i }))
    .filter(Boolean);
  if (!cleaned.length) return { ok: false, error: 'empty' };
  cur.closedWindows = [{ tabs: cleaned, closedAt: Date.now() }, ...(cur.closedWindows || [])].slice(
    0,
    MAX_CLOSED_WINDOWS,
  );
  cached = cur;
  scheduleFlush(200);
  return { ok: true, count: cur.closedWindows.length };
}

function popClosedWindow() {
  const cur = load();
  const win = (cur.closedWindows || []).shift();
  cached = cur;
  scheduleFlush(200);
  return win || null;
}

module.exports = {
  MAX_CLOSED,
  MAX_CLOSED_WINDOWS,
  load,
  saveSnapshot,
  markCleanExit,
  markDirtyOnBoot,
  getStatus,
  dismissCrashOffer,
  clearSession,
  flushSync,
  sanitizeTab,
  isTorLike,
  readNavHistory,
  defaultSession,
  pushClosedWindow,
  popClosedWindow,
  _setRootForTests,
};
