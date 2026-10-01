'use strict';

/**
 * One real WebContents listener per event; fans out to a Set of handlers.
 * Prevents MaxListenersExceededWarning when electron-chrome-extensions
 * observeTab() re-attaches did-stop-loading / navigation events on the same WC
 * (e.g. host chrome WC returned from createTab placeholder, or tab churn).
 */

/** @type {WeakMap<object, { origOn: Function, origOnce: Function, origOff: Function, handlers: Map<string, Set<Function>>, attached: Set<string> }>} */
const state = new WeakMap();

/** Events that extensions observeTab stacks onto a WC. */
const FANOUT = new Set([
  'page-title-updated',
  'did-start-loading',
  'did-stop-loading',
  'media-started-playing',
  'media-paused',
  'did-start-navigation',
  'did-redirect-navigation',
  'did-navigate-in-page',
  'tab-updated',
  'page-favicon-updated',
  'did-frame-finish-load',
  'will-navigate',
]);

function ensure(wc) {
  let s = state.get(wc);
  if (s) return s;
  s = {
    origOn: wc.on.bind(wc),
    origOnce: wc.once.bind(wc),
    origOff: (wc.off || wc.removeListener).bind(wc),
    handlers: new Map(),
    attached: new Set(),
  };
  state.set(wc, s);
  return s;
}

function attachDispatcher(wc, s, event) {
  if (s.attached.has(event)) return;
  s.attached.add(event);
  s.origOn(event, (...args) => {
    const handlers = s.handlers.get(event);
    if (!handlers) return;
    for (const h of [...handlers]) {
      try {
        h(...args);
      } catch (err) {
        console.warn('[webcontents-events]', event, err && err.message);
      }
      if (h.__djxxrOnce) handlers.delete(h);
    }
  });
}

function addHandler(wc, s, event, listener, once) {
  let set = s.handlers.get(event);
  if (!set) {
    set = new Set();
    s.handlers.set(event, set);
  }
  const wrapped = once
    ? Object.assign((...args) => listener(...args), { __djxxrOnce: true, __djxxrInner: listener })
    : listener;
  set.add(wrapped);
  attachDispatcher(wc, s, event);
  return wrapped;
}

/**
 * @param {import('electron').WebContents} wc
 */
function patchWebContents(wc) {
  if (!wc || wc.isDestroyed?.()) return;
  if (wc.__djxxrWcFanout) return;
  const s = ensure(wc);

  wc.on = function patchedOn(event, listener) {
    if (!FANOUT.has(event) || typeof listener !== 'function') {
      return s.origOn(event, listener);
    }
    addHandler(wc, s, event, listener, false);
    return wc;
  };

  wc.once = function patchedOnce(event, listener) {
    if (!FANOUT.has(event) || typeof listener !== 'function') {
      return s.origOnce(event, listener);
    }
    addHandler(wc, s, event, listener, true);
    return wc;
  };

  const remove = function patchedRemove(event, listener) {
    if (!FANOUT.has(event) || typeof listener !== 'function') {
      return s.origOff(event, listener);
    }
    const set = s.handlers.get(event);
    if (!set) return wc;
    for (const h of [...set]) {
      if (h === listener || h.__djxxrInner === listener) set.delete(h);
    }
    return wc;
  };
  wc.off = remove;
  wc.removeListener = remove;

  wc.__djxxrWcFanout = true;
}

function counts(wc) {
  const s = state.get(wc);
  if (!s) return { patched: false };
  const out = { patched: true, events: {} };
  for (const [ev, set] of s.handlers) out.events[ev] = set.size;
  return out;
}

module.exports = { patchWebContents, counts, FANOUT };
