'use strict';

/**
 * Ghostery-backed adblocker + legacy YouTube/cosmetic helpers.
 * Filter lists cached under userData/adblock-lists (daily refresh).
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, net } = require('electron');
const legacy = require('./adblock.cjs');

const LIST_URLS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
  'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext',
];

/** @type {import('@ghostery/adblocker-electron').ElectronBlocker | null} */
let blocker = null;
/** @type {Set<import('electron').Session>} */
const attached = new Set();
/** @type {WeakSet<import('electron').Session>} */
const ghosteryOn = new WeakSet();
/** @type {Map<string, { url: string, host: string, at: number }[]>} */
const recentBlocked = new Map();
let updateLists = true;
let lastInitError = null;

function cacheDir() {
  return path.join(app.getPath('userData'), 'adblock-lists');
}

function cacheMetaPath() {
  return path.join(cacheDir(), 'meta.json');
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = net.fetch(url);
    req
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        resolve(await res.text());
      })
      .catch(reject);
  });
}

function pushBlocked(tabKey, url) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = url;
  }
  const list = recentBlocked.get(tabKey) || [];
  list.unshift({ url, host, at: Date.now() });
  recentBlocked.set(tabKey, list.slice(0, 80));
  legacy.bump?.();
}

function getRecentBlocked(tabKey) {
  return recentBlocked.get(tabKey) || [];
}

function clearRecentBlocked(tabKey) {
  if (tabKey) recentBlocked.delete(tabKey);
  else recentBlocked.clear();
}

async function loadOrFetchLists() {
  fs.mkdirSync(cacheDir(), { recursive: true });
  let meta = { at: 0 };
  try {
    meta = JSON.parse(fs.readFileSync(cacheMetaPath(), 'utf8'));
  } catch {
    /* */
  }
  const fresh = Date.now() - (meta.at || 0) < 24 * 60 * 60 * 1000;
  const bodies = [];
  for (let i = 0; i < LIST_URLS.length; i++) {
    const file = path.join(cacheDir(), `list-${i}.txt`);
    if (fresh && fs.existsSync(file)) {
      bodies.push(fs.readFileSync(file, 'utf8'));
      continue;
    }
    if (!updateLists && fs.existsSync(file)) {
      bodies.push(fs.readFileSync(file, 'utf8'));
      continue;
    }
    if (!updateLists && !fs.existsSync(file)) {
      continue;
    }
    try {
      const text = await fetchText(LIST_URLS[i]);
      fs.writeFileSync(file, text, 'utf8');
      bodies.push(text);
    } catch (err) {
      console.warn('[adblock+] fetch list', LIST_URLS[i], err.message || err);
      if (fs.existsSync(file)) bodies.push(fs.readFileSync(file, 'utf8'));
    }
  }
  if (bodies.length) {
    fs.writeFileSync(cacheMetaPath(), JSON.stringify({ at: Date.now(), n: bodies.length }), 'utf8');
  }
  return bodies;
}

async function init(opts = {}) {
  if (typeof opts.updateLists === 'boolean') updateLists = opts.updateLists;
  try {
    const { ElectronBlocker } = require('@ghostery/adblocker-electron');
    const cachedFetch = async (url) => {
      fs.mkdirSync(cacheDir(), { recursive: true });
      const key = cryptoHash(url);
      const file = path.join(cacheDir(), `${key}.txt`);
      let meta = { at: 0 };
      try {
        meta = JSON.parse(fs.readFileSync(cacheMetaPath(), 'utf8'));
      } catch {
        /* */
      }
      const fresh = Date.now() - (meta.at || 0) < 24 * 60 * 60 * 1000;
      if (fresh && fs.existsSync(file)) {
        return new Response(fs.readFileSync(file, 'utf8'), { headers: { 'content-type': 'text/plain' } });
      }
      if (!updateLists && fs.existsSync(file)) {
        return new Response(fs.readFileSync(file, 'utf8'), { headers: { 'content-type': 'text/plain' } });
      }
      if (!updateLists) {
        throw new Error('List updates disabled and no cache');
      }
      const text = await fetchText(url);
      fs.writeFileSync(file, text, 'utf8');
      return new Response(text, { headers: { 'content-type': 'text/plain' } });
    };

    blocker = await ElectronBlocker.fromLists(cachedFetch, LIST_URLS, {
      enableCompression: true,
    });
    fs.writeFileSync(cacheMetaPath(), JSON.stringify({ at: Date.now() }), 'utf8');

    blocker.on('request-blocked', (request) => {
      try {
        pushBlocked(String(request.tabId ?? 'global'), request.url);
        if (typeof legacy.bump === 'function') legacy.bump();
      } catch {
        /* */
      }
    });
    lastInitError = null;
    for (const ses of attached) {
      enableGhostery(ses);
    }
    return { ok: true, engine: 'ghostery', lists: LIST_URLS.length };
  } catch (err) {
    lastInitError = String(err.message || err);
    console.warn('[adblock+] ghostery init failed, legacy only', lastInitError);
    blocker = null;
    return { ok: false, error: lastInitError, engine: 'legacy' };
  }
}

function cryptoHash(s) {
  return require('node:crypto').createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
}

function enableGhostery(ses) {
  if (!blocker || !ses) return;
  if (ghosteryOn.has(ses)) return;
  try {
    if (typeof blocker.disableBlockingInSession === 'function') {
      try {
        blocker.disableBlockingInSession(ses);
      } catch {
        /* not previously enabled */
      }
    }
    blocker.enableBlockingInSession(ses);
    ghosteryOn.add(ses);
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes('second handler')) {
      ghosteryOn.add(ses);
      return;
    }
    console.warn('[adblock+] enableBlockingInSession', e);
  }
}

/**
 * Prefer Ghostery when ready. Legacy attach only as fallback — no double onBeforeRequest.
 * Legacy getCosmeticCss / getPageScript remain for YouTube + custom cosmetic inject.
 */
function attachToSession(ses) {
  attached.add(ses);
  if (blocker) {
    enableGhostery(ses);
    return;
  }
  legacy.attachToSession(ses);
}

function setConfig(next) {
  if (next && typeof next.updateLists === 'boolean') updateLists = next.updateLists;
  return legacy.setConfig(next);
}

function getStatus() {
  return {
    ...legacy.getStatus(),
    engine: blocker ? 'ghostery' : 'legacy',
    updateLists,
    lastInitError,
  };
}

module.exports = {
  init,
  attachToSession,
  setConfig,
  getStatus,
  getCosmeticCss: (...a) => legacy.getCosmeticCss(...a),
  getPageScript: (...a) => legacy.getPageScript(...a),
  shouldBlock: (...a) => legacy.shouldBlock(...a),
  setBlockedListener: (...a) => legacy.setBlockedListener(...a),
  getRecentBlocked,
  clearRecentBlocked,
  LIST_URLS,
};
