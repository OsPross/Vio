/**
 * Mouse X1/X2 navigation + diagnostics (DJXXR_DEBUG_MOUSE=1).
 *
 * Diagnosis (Windows / Electron 44):
 * - BrowserWindow 'app-command' does NOT fire for physical/SendInput XBUTTON.
 * - webContents 'before-mouse-event' DOES fire with button "back" | "forward"
 *   (guest = over page; host = over chrome UI).
 * - DOM mouseup/auxclick button 3/4 also fire when before-mouse does not preventDefault.
 *
 * All sources → shell:browser-nav → renderer navigateHistory(tabId, dir) with 150ms dedup.
 * Do NOT preventDefault — pages that handle X1/X2 still receive the event; dedup stops double nav.
 */
'use strict';

const { BrowserWindow } = require('electron');

/** @type {WeakSet<object>} */
const attached = new WeakSet();
/** @type {WeakMap<object, import('electron').BrowserWindow>} */
const guestHost = new WeakMap();
let lastNavAt = 0;
const DEDUP_MS = 150;

function debugEnabled() {
  return process.env.DJXXR_DEBUG_MOUSE === '1' || process.env.DJXXR_DEBUG_MOUSE === 'true';
}

function log(...args) {
  if (!debugEnabled()) return;
  console.log('[mouse-nav]', ...args);
}

function resolveHost(wc) {
  try {
    const mapped = guestHost.get(wc);
    if (mapped && !mapped.isDestroyed()) return mapped;
  } catch {
    /* */
  }
  try {
    const from = BrowserWindow.fromWebContents(wc);
    if (from && !from.isDestroyed()) return from;
  } catch {
    /* */
  }
  try {
    if (typeof wc.getOwnerBrowserWindow === 'function') {
      const ow = wc.getOwnerBrowserWindow();
      if (ow && !ow.isDestroyed()) return ow;
    }
  } catch {
    /* */
  }
  const all = BrowserWindow.getAllWindows();
  return all.find((w) => !w.isDestroyed()) || null;
}

/**
 * Soft IPC / direct guest nav dedup (renderer also dedups at 150ms).
 * @param {'back'|'forward'} dir
 * @param {string} source
 * @param {import('electron').WebContents} [fromWc]
 */
function emitNav(dir, source, fromWc) {
  const now = Date.now();
  if (now - lastNavAt < DEDUP_MS) {
    log('dedup-skip', { dir, source });
    return false;
  }
  lastNavAt = now;
  const host = fromWc ? resolveHost(fromWc) : BrowserWindow.getFocusedWindow();
  if (!host || host.isDestroyed()) {
    log('no-host', { dir, source });
    return false;
  }
  log('emit', { dir, source, hostId: host.id });

  // Guest: navigate the webContents directly (reliable vs renderer goBack race).
  let handled = false;
  try {
    const typ = typeof fromWc?.getType === 'function' ? fromWc.getType() : '';
    if (fromWc && !fromWc.isDestroyed() && typ === 'webview') {
      if (dir === 'back' && fromWc.canGoBack()) {
        fromWc.goBack();
        handled = true;
      } else if (dir === 'forward' && fromWc.canGoForward()) {
        fromWc.goForward();
        handled = true;
      }
    }
  } catch (err) {
    log('direct-nav-fail', err && err.message);
  }

  try {
    host.webContents.send('shell:browser-nav', { dir, source, handled });
  } catch (err) {
    log('emit-fail', err && err.message);
    return handled;
  }
  return true;
}

/**
 * @param {import('electron').WebContents} wc
 * @param {{ host?: import('electron').BrowserWindow, label?: string }} [opts]
 */
function attachSideButtons(wc, opts = {}) {
  if (!wc || wc.isDestroyed()) return;
  if (opts.host) guestHost.set(wc, opts.host);
  if (attached.has(wc)) {
    log('already-attached', opts.label || wc.id);
    return;
  }
  attached.add(wc);
  const label = opts.label || `wc:${wc.id}`;

  try {
    wc.on('before-mouse-event', (_event, mouse) => {
      const btn = mouse && mouse.button;
      const typ = mouse && mouse.type;
      if (btn === 'back' || btn === 'forward') {
        log('before-mouse', label, { type: typ, button: btn, x: mouse?.x, y: mouse?.y });
      } else if (debugEnabled() && (typ === 'mouseDown' || typ === 'mouseUp')) {
        log('before-mouse', label, { type: typ, button: btn, x: mouse?.x, y: mouse?.y });
      }
      if (typ !== 'mouseUp') return;
      if (btn !== 'back' && btn !== 'forward') return;
      // No preventDefault — page handlers still run; renderer dedups duplicate sources.
      emitNav(btn === 'back' ? 'back' : 'forward', `before-mouse:${label}`, wc);
    });
  } catch (err) {
    log('before-mouse attach fail', label, err && err.message);
  }

  if (debugEnabled()) {
    try {
      wc.on('before-input-event', (_e, input) => {
        if (input.type !== 'keyDown') return;
        log('before-input', label, { key: input.key, code: input.code });
      });
    } catch {
      /* */
    }
  }
}

/**
 * @param {import('electron').BrowserWindow} bw
 */
function attachAppCommandFallback(bw) {
  bw.on('app-command', (e, cmd) => {
    log('app-command', { cmd, winId: bw.id });
    if (cmd === 'browser-backward' || cmd === 'browser-forward') {
      e.preventDefault();
      emitNav(cmd === 'browser-backward' ? 'back' : 'forward', 'app-command', bw.webContents);
    }
  });
}

module.exports = {
  debugEnabled,
  log,
  attachSideButtons,
  attachAppCommandFallback,
  emitNav,
  /** @deprecated use attachSideButtons */
  attachMouseListeners: attachSideButtons,
};
