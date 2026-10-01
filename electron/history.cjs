'use strict';

/**
 * Browsing history (main process) — JSONL + in-memory index.
 * Never records Tor / onion traffic. Queried via shell:history-* IPC.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

let app;
try {
  ({ app } = require('electron'));
} catch {
  app = null;
}

/** @type {string | null} */
let rootOverride = null;

function historyDir() {
  if (rootOverride) return rootOverride;
  try {
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'history');
    }
  } catch {
    /* */
  }
  return path.join(os.tmpdir(), 'djxxr-history');
}

/** Test helper — point storage at a temp dir */
function _setRootForTests(dir) {
  rootOverride = dir || null;
  loaded = false;
  visits.clear();
  queries = [];
  dirty = false;
}

/** @typedef {'7'|'30'|'90'|'always'|'off'} Retention */

/** @type {Retention} */
let retention = '90';

/** @typedef {{
 *   id: string,
 *   url: string,
 *   title: string,
 *   faviconKey: string,
 *   lastVisit: number,
 *   visitCount: number,
 *   typedCount: number,
 * }} Visit */

/** @typedef {{ q: string, at: number }} QueryItem */

/** @type {Map<string, Visit>} url → visit */
const visits = new Map();
/** @type {QueryItem[]} */
let queries = [];
let loaded = false;
let dirty = false;
let flushTimer = null;

const MAX_QUERIES = 80;
const DAY_MS = 24 * 60 * 60 * 1000;

function visitsPath() {
  return path.join(historyDir(), 'visits.jsonl');
}

function queriesPath() {
  return path.join(historyDir(), 'queries.json');
}

function faviconKeyFor(pageUrl) {
  let host = 'unknown';
  try {
    host = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    /* */
  }
  return crypto.createHash('sha1').update(host).digest('hex');
}

function uid() {
  return crypto.randomBytes(8).toString('hex');
}

function normalizeUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    u.hash = '';
    // Drop trivial trailing slash for http(s) roots only keep path as-is otherwise
    return u.href;
  } catch {
    return '';
  }
}

/** URLs that must never enter history */
function isExcludedUrl(url) {
  const s = String(url || '').trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  if (
    lower.startsWith('about:') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('chrome:') ||
    lower.startsWith('chrome-error:') ||
    lower.startsWith('chrome-extension:') ||
    lower.startsWith('devtools:') ||
    lower.startsWith('file:') ||
    lower.startsWith('javascript:')
  ) {
    return true;
  }
  if (/\.onion\b/i.test(s)) return true;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
    // Chromium error pages sometimes land as https://chromewebdata/ etc.
    if (u.hostname === 'chromewebdata' || u.hostname === 'chrome-error') return true;
  } catch {
    return true;
  }
  return false;
}

function retentionCutoffMs() {
  if (retention === 'always' || retention === 'off') return 0;
  const days = Number(retention);
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Date.now() - days * DAY_MS;
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  fs.mkdirSync(historyDir(), { recursive: true });
  try {
    const raw = fs.readFileSync(visitsPath(), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const row = JSON.parse(t);
        if (!row || !row.url || isExcludedUrl(row.url)) continue;
        const url = normalizeUrl(row.url) || row.url;
        visits.set(url, {
          id: String(row.id || uid()),
          url,
          title: String(row.title || ''),
          faviconKey: String(row.faviconKey || faviconKeyFor(url)),
          lastVisit: Number(row.lastVisit) || Date.now(),
          visitCount: Math.max(1, Number(row.visitCount) || 1),
          typedCount: Math.max(0, Number(row.typedCount) || 0),
        });
      } catch {
        /* skip bad line */
      }
    }
  } catch {
    /* missing file */
  }
  try {
    const q = JSON.parse(fs.readFileSync(queriesPath(), 'utf8'));
    if (Array.isArray(q)) {
      queries = q
        .filter((x) => x && typeof x.q === 'string' && x.q.trim())
        .map((x) => ({ q: String(x.q).trim(), at: Number(x.at) || Date.now() }))
        .slice(0, MAX_QUERIES);
    }
  } catch {
    queries = [];
  }
  pruneExpired(false);
}

function scheduleFlush() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      flushSync();
    } catch (err) {
      console.error('[history] flush', err);
    }
  }, 50);
}

function flushSync() {
  if (!dirty && loaded) {
    /* still allow force compact */
  }
  ensureLoaded();
  dirty = false;
  fs.mkdirSync(historyDir(), { recursive: true });
  const lines = [];
  for (const v of visits.values()) {
    lines.push(JSON.stringify(v));
  }
  fs.writeFileSync(visitsPath(), lines.length ? `${lines.join('\n')}\n` : '', 'utf8');
  fs.writeFileSync(queriesPath(), JSON.stringify(queries, null, 0), 'utf8');
}

function pruneExpired(persist = true) {
  if (retention === 'off') {
    if (visits.size) {
      visits.clear();
      if (persist) scheduleFlush();
    }
    return;
  }
  const cut = retentionCutoffMs();
  if (!cut) return;
  let changed = false;
  for (const [url, v] of visits) {
    if (v.lastVisit < cut) {
      visits.delete(url);
      changed = true;
    }
  }
  const before = queries.length;
  queries = queries.filter((q) => q.at >= cut);
  if (queries.length !== before) changed = true;
  if (changed && persist) scheduleFlush();
}

/**
 * Firefox-like frecency: visitCount * recencyBucket * typedBonus
 * Recency buckets roughly match Places: 4d / 14d / 31d / 90d / older
 */
function frecencyScore(visitCount, typedCount, lastVisit, now = Date.now()) {
  const age = Math.max(0, now - (lastVisit || 0));
  let recency = 10;
  if (age < 4 * DAY_MS) recency = 100;
  else if (age < 14 * DAY_MS) recency = 70;
  else if (age < 31 * DAY_MS) recency = 50;
  else if (age < 90 * DAY_MS) recency = 30;
  else recency = 10;
  const typedBonus = 1 + Math.min(10, typedCount || 0) * 0.35;
  return (Math.max(1, visitCount || 1) * recency * typedBonus) | 0;
}

function setConfig(next) {
  ensureLoaded();
  if (next && typeof next === 'object') {
    if (next.retention != null) {
      const r = String(next.retention);
      if (r === '7' || r === '30' || r === '90' || r === 'always' || r === 'off') {
        retention = r;
      }
    }
  }
  pruneExpired(true);
  return { retention, count: visits.size, queries: queries.length };
}

function getConfig() {
  ensureLoaded();
  return { retention, count: visits.size, queries: queries.length };
}

/**
 * @param {{ url: string, title?: string, typed?: boolean, tor?: boolean, soft?: boolean }} opts
 */
function recordVisit(opts) {
  ensureLoaded();
  if (!opts || opts.tor) return { ok: false, reason: 'tor' };
  if (retention === 'off') return { ok: false, reason: 'off' };
  const url = normalizeUrl(opts.url);
  if (!url || isExcludedUrl(url)) return { ok: false, reason: 'excluded' };

  const now = Date.now();
  const existing = visits.get(url);
  if (opts.soft) {
    if (!existing) {
      visits.set(url, {
        id: uid(),
        url,
        title: String(opts.title || '').trim().slice(0, 500),
        faviconKey: faviconKeyFor(url),
        lastVisit: now,
        visitCount: 1,
        typedCount: 0,
      });
      scheduleFlush();
      return { ok: true, soft: true, created: true };
    }
    if (opts.title && String(opts.title).trim()) {
      const t = String(opts.title).trim();
      if (t !== '…' && t.length < 500) existing.title = t;
    }
    visits.set(url, existing);
    scheduleFlush();
    return { ok: true, soft: true };
  }
  if (existing) {
    existing.lastVisit = now;
    existing.visitCount += 1;
    if (opts.typed) existing.typedCount += 1;
    if (opts.title && String(opts.title).trim()) {
      const t = String(opts.title).trim();
      if (t !== '…' && t.length < 500) existing.title = t;
    }
    visits.set(url, existing);
  } else {
    visits.set(url, {
      id: uid(),
      url,
      title: String(opts.title || '').trim().slice(0, 500),
      faviconKey: faviconKeyFor(url),
      lastVisit: now,
      visitCount: 1,
      typedCount: opts.typed ? 1 : 0,
    });
  }
  scheduleFlush();
  return { ok: true };
}

/**
 * Search / omnibox query strings (max 80) — same suggest pipeline.
 * @param {string} q
 * @param {{ tor?: boolean }} [opts]
 */
function recordQuery(q, opts) {
  ensureLoaded();
  if (opts?.tor) return { ok: false, reason: 'tor' };
  if (retention === 'off') return { ok: false, reason: 'off' };
  const t = String(q || '').trim();
  if (!t || t.length > 500) return { ok: false, reason: 'empty' };
  if (/^https?:/i.test(t) || t.startsWith('about:')) return { ok: false, reason: 'url' };
  queries = [{ q: t, at: Date.now() }, ...queries.filter((x) => x.q !== t)].slice(0, MAX_QUERIES);
  scheduleFlush();
  return { ok: true };
}

/**
 * One-shot migration from renderer Zustand localStorage queries.
 * @param {{ q: string, at?: number }[]} items
 */
function importQueries(items) {
  ensureLoaded();
  if (!Array.isArray(items) || !items.length) return { ok: true, imported: 0 };
  let imported = 0;
  const existing = new Set(queries.map((x) => x.q.toLowerCase()));
  const incoming = [];
  for (const it of items) {
    const q = String(it?.q || '').trim();
    if (!q || q.length > 500) continue;
    if (/^https?:/i.test(q) || q.startsWith('about:')) continue;
    if (existing.has(q.toLowerCase())) continue;
    existing.add(q.toLowerCase());
    incoming.push({ q, at: typeof it.at === 'number' ? it.at : Date.now() });
    imported += 1;
  }
  if (incoming.length) {
    queries = [...incoming, ...queries]
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_QUERIES);
    scheduleFlush();
  }
  return { ok: true, imported };
}

function matchText(hay, needle) {
  return String(hay || '')
    .toLowerCase()
    .includes(String(needle || '').toLowerCase());
}

/**
 * Ranked suggestions for omnibox.
 * @param {string} q
 * @param {{
 *   openTabs?: { id: string, title: string, url: string }[],
 *   shortcuts?: { id: string, label: string, url: string }[],
 *   bangs?: { key: string, label: string }[],
 *   suggestHistory?: boolean,
 *   suggestBangs?: boolean,
 *   limit?: number,
 *   tor?: boolean,
 * }} [opts]
 */
function suggest(q, opts = {}) {
  ensureLoaded();
  if (opts.tor) return { completion: null, groups: [] };

  const limit = Math.min(8, Math.max(1, Number(opts.limit) || 8));
  const raw = String(q || '');
  const t = raw.trim().toLowerCase();
  const now = Date.now();

  /** @type {{ kind: string, title: string, subtitle?: string, url?: string, fill?: string, id?: string, tabId?: string, faviconKey?: string, score?: number }[]} */
  const items = [];

  let completion = null;
  if (t && !t.includes(' ') && !t.startsWith('!') && !/^https?:/i.test(t) && opts.suggestHistory !== false) {
    // Inline autocomplete: ONLY host/URL prefix (never mid-string). Frecency + bookmarks + shortcuts.
    /** @type {{ fill: string, score: number }[]} */
    const candidates = [];
    const considerHost = (hostRaw, scoreBase) => {
      const host = String(hostRaw || '')
        .replace(/^www\./i, '')
        .toLowerCase();
      if (!host || host.length <= t.length) return;
      if (!host.startsWith(t.toLowerCase())) return;
      candidates.push({ fill: host, score: scoreBase });
    };
    for (const v of visits.values()) {
      let host = '';
      try {
        host = new URL(v.url).hostname;
      } catch {
        continue;
      }
      const score =
        frecencyScore(v.visitCount, v.typedCount, v.lastVisit, now) + 50 + v.typedCount * 20;
      considerHost(host, score);
    }
    if (Array.isArray(opts.bookmarks)) {
      for (const b of opts.bookmarks) {
        if (!b?.url) continue;
        try {
          considerHost(new URL(b.url).hostname, 600);
        } catch {
          /* */
        }
      }
    }
    if (Array.isArray(opts.shortcuts)) {
      for (const s of opts.shortcuts) {
        if (!s?.url) continue;
        try {
          considerHost(new URL(s.url).hostname, 550);
        } catch {
          /* */
        }
      }
    }
    // Popular topsites boost for common prefixes
    for (const top of [
      'youtube.com',
      'google.com',
      'github.com',
      'wikipedia.org',
      'reddit.com',
      'facebook.com',
      'twitter.com',
      'x.com',
      'amazon.com',
      'netflix.com',
      'discord.com',
      'stackoverflow.com',
    ]) {
      considerHost(top, 200);
    }
    candidates.sort((a, b) => b.score - a.score || a.fill.length - b.fill.length);
    if (candidates[0]) {
      completion = { host: candidates[0].fill, fill: candidates[0].fill };
    }
  }

  if (t.startsWith('!') && opts.suggestBangs !== false) {
    const key = t.slice(1);
    const bangs = Array.isArray(opts.bangs) ? opts.bangs : [];
    for (const b of bangs) {
      if (!b?.key) continue;
      if (b.key.startsWith(key) || String(b.label || '').toLowerCase().includes(key)) {
        items.push({
          kind: 'bang',
          title: `!${b.key}`,
          subtitle: b.label || '',
          fill: `!${b.key} `,
          score: 900 + (b.key === key ? 50 : 0),
        });
      }
    }
  } else if (t && opts.suggestHistory !== false) {
    for (const v of visits.values()) {
      let host = '';
      let pathPart = '';
      try {
        const u = new URL(v.url);
        host = u.hostname;
        pathPart = u.pathname + u.search;
      } catch {
        continue;
      }
      if (
        !matchText(host, t) &&
        !matchText(pathPart, t) &&
        !matchText(v.title, t) &&
        !matchText(v.url, t)
      ) {
        continue;
      }
      items.push({
        kind: 'history',
        id: v.id,
        title: v.title || host,
        subtitle: v.url,
        url: v.url,
        faviconKey: v.faviconKey,
        score: frecencyScore(v.visitCount, v.typedCount, v.lastVisit, now),
      });
    }
    for (const qi of queries) {
      if (!matchText(qi.q, t)) continue;
      items.push({
        kind: 'query',
        title: qi.q,
        subtitle: 'Zapytanie',
        fill: qi.q,
        score: frecencyScore(2, 0, qi.at, now) + 5,
      });
    }
  } else if (!t && opts.suggestHistory !== false) {
    const recent = [...visits.values()]
      .sort((a, b) => b.lastVisit - a.lastVisit)
      .slice(0, 5);
    for (const v of recent) {
      items.push({
        kind: 'history',
        id: v.id,
        title: v.title || v.url,
        subtitle: v.url,
        url: v.url,
        faviconKey: v.faviconKey,
        score: frecencyScore(v.visitCount, v.typedCount, v.lastVisit, now),
      });
    }
  }

  if (t && Array.isArray(opts.bookmarks)) {
    for (const b of opts.bookmarks) {
      if (!b?.url) continue;
      if (!matchText(b.title, t) && !matchText(b.url, t)) continue;
      items.push({
        kind: 'bookmark',
        title: b.title || b.url,
        subtitle: b.url,
        url: b.url,
        score: 750,
      });
    }
  }

  if (t && Array.isArray(opts.openTabs)) {
    for (const tab of opts.openTabs) {
      if (!tab?.url || isExcludedUrl(tab.url)) continue;
      if (!matchText(tab.title, t) && !matchText(tab.url, t)) continue;
      items.push({
        kind: 'tab',
        tabId: tab.id,
        title: tab.title || tab.url,
        subtitle: 'Przełącz na kartę',
        url: tab.url,
        score: 800,
      });
    }
  }

  if (t && Array.isArray(opts.shortcuts)) {
    for (const s of opts.shortcuts) {
      if (!s?.url) continue;
      if (!matchText(s.label, t) && !matchText(s.url, t)) continue;
      items.push({
        kind: 'shortcut',
        title: s.label || s.url,
        subtitle: 'Skrót',
        url: s.url,
        score: 700,
      });
    }
  }

  // Sort within kinds later; first global by score then take diversity
  items.sort((a, b) => (b.score || 0) - (a.score || 0));

  const kindOrder = ['history', 'bookmark', 'query', 'tab', 'shortcut', 'bang'];
  const kindLabel = {
    history: 'Historia',
    bookmark: 'Zakładki',
    query: 'Zapytania',
    tab: 'Karty',
    shortcut: 'Skróty',
    bang: 'Bangs',
  };

  /** @type {{ label: string, items: typeof items }[]} */
  const groups = [];
  const used = new Set();
  let remaining = limit;

  // Reserve 1 slot for completion row if present (rendered separately client-side)
  if (completion) remaining = Math.max(1, remaining - 0);

  for (const kind of kindOrder) {
    if (remaining <= 0) break;
    const slice = items.filter((it) => it.kind === kind && !used.has(`${it.kind}:${it.url || it.title || it.fill}`));
    if (!slice.length) continue;
    const take = slice.slice(0, remaining);
    for (const it of take) used.add(`${it.kind}:${it.url || it.title || it.fill}`);
    groups.push({ label: kindLabel[kind] || kind, items: take });
    remaining -= take.length;
  }

  return { completion, groups, tookMs: 0 };
}

/**
 * @param {{ q?: string, limit?: number, offset?: number }} [opts]
 */
function list(opts = {}) {
  ensureLoaded();
  pruneExpired(true);
  const q = String(opts.q || '')
    .trim()
    .toLowerCase();
  const limit = Math.min(5000, Math.max(1, Number(opts.limit) || 500));
  const offset = Math.max(0, Number(opts.offset) || 0);
  let rows = [...visits.values()];
  if (q) {
    rows = rows.filter(
      (v) => matchText(v.url, q) || matchText(v.title, q) || matchText(hostnameOf(v.url), q),
    );
  }
  rows.sort((a, b) => b.lastVisit - a.lastVisit);
  const total = rows.length;
  return {
    total,
    items: rows.slice(offset, offset + limit),
    queries: queries.slice(0, MAX_QUERIES),
    retention,
  };
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function deleteById(id) {
  ensureLoaded();
  const want = String(id || '');
  for (const [url, v] of visits) {
    if (v.id === want) {
      visits.delete(url);
      scheduleFlush();
      return { ok: true };
    }
  }
  return { ok: false };
}

function deleteByUrl(url) {
  ensureLoaded();
  const n = normalizeUrl(url);
  if (n && visits.delete(n)) {
    scheduleFlush();
    return { ok: true };
  }
  return { ok: false };
}

function deleteDomain(host) {
  ensureLoaded();
  const h = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
  if (!h) return { ok: false, removed: 0 };
  let removed = 0;
  for (const [url, v] of visits) {
    const vh = hostnameOf(v.url).toLowerCase().replace(/^www\./, '');
    if (vh === h || vh.endsWith(`.${h}`)) {
      visits.delete(url);
      removed += 1;
    }
  }
  if (removed) scheduleFlush();
  return { ok: true, removed };
}

/**
 * @param {{ range?: 'hour'|'day'|'week'|'all'|number }} [opts]
 */
function clear(opts = {}) {
  ensureLoaded();
  const range = opts.range ?? 'all';
  if (range === 'all') {
    visits.clear();
    queries = [];
    scheduleFlush();
    return { ok: true };
  }
  let cut = 0;
  if (range === 'hour') cut = Date.now() - 60 * 60 * 1000;
  else if (range === 'day') cut = Date.now() - DAY_MS;
  else if (range === 'week') cut = Date.now() - 7 * DAY_MS;
  else if (typeof range === 'number') cut = Date.now() - range;
  if (!cut) {
    visits.clear();
    queries = [];
  } else {
    for (const [url, v] of visits) {
      if (v.lastVisit >= cut) visits.delete(url);
    }
    queries = queries.filter((qi) => qi.at < cut);
  }
  scheduleFlush();
  return { ok: true };
}

function removeQuery(q) {
  ensureLoaded();
  const t = String(q || '').trim();
  const before = queries.length;
  queries = queries.filter((x) => x.q !== t);
  if (queries.length !== before) scheduleFlush();
  return { ok: true };
}

// Eager load after app ready is preferred; safe if called early once paths exist
function init() {
  if (!app || typeof app.isReady !== 'function') {
    ensureLoaded();
    pruneExpired(true);
    return;
  }
  if (!app.isReady()) {
    app.whenReady().then(() => {
      ensureLoaded();
      pruneExpired(true);
    });
  } else {
    ensureLoaded();
    pruneExpired(true);
  }
}

module.exports = {
  init,
  setConfig,
  getConfig,
  recordVisit,
  recordQuery,
  importQueries,
  suggest,
  list,
  deleteById,
  deleteByUrl,
  deleteDomain,
  clear,
  removeQuery,
  flushSync,
  faviconKeyFor,
  isExcludedUrl,
  frecencyScore,
  _setRootForTests,
};
