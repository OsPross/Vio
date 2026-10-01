'use strict';

/**
 * One real BrowserWindow listener per event; fans out to a Set of handlers.
 * Prevents MaxListenersExceededWarning when electron-chrome-extensions
 * registers focus/resized/closed per observeWindow() (re-added across tab churn).
 */

/** @type {WeakMap<object, { origOn: Function, origOnce: Function, origOff: Function, handlers: Map<string, Set<Function>>, attached: Set<string> }>} */
const state = new WeakMap();

const FANOUT = new Set(['focus', 'resized', 'closed']);

function ensure(win) {
  let s = state.get(win);
  if (s) return s;
  s = {
    origOn: win.on.bind(win),
    origOnce: win.once.bind(win),
    origOff: (win.off || win.removeListener).bind(win),
    handlers: new Map(),
    attached: new Set(),
  };
  state.set(win, s);
  return s;
}

function attachDispatcher(win, s, event) {
  if (s.attached.has(event)) return;
  s.attached.add(event);
  s.origOn(event, (...args) => {
    const handlers = s.handlers.get(event);
    if (!handlers) return;
    for (const h of [...handlers]) {
      try {
        h(...args);
      } catch (err) {
        console.warn('[window-events]', event, err && err.message);
      }
      // once() wrappers delete themselves after fire
      if (h.__djxxrOnce) {
        handlers.delete(h);
      }
    }
  });
}

function addHandler(win, s, event, listener, once) {
  let set = s.handlers.get(event);
  if (!set) {
    set = new Set();
    s.handlers.set(event, set);
  }
  for (const h of set) {
    if (h === listener || h.__djxxrInner === listener) {
      if (!once) return h;
      if (h.__djxxrOnce) return h;
    }
  }
  const wrapped = once
    ? Object.assign(
        (...args) => {
          listener(...args);
        },
        { __djxxrOnce: true, __djxxrInner: listener },
      )
    : listener;
  if (once) wrapped.__djxxrInner = listener;
  set.add(wrapped);
  attachDispatcher(win, s, event);
  return wrapped;
}

/**
 * Patch win.on / win.once / win.off so focus/resized/closed are coalesced.
 * Idempotent per window.
 * @param {import('electron').BrowserWindow} win
 */
function patchWindow(win) {
  if (!win || win.isDestroyed?.()) return;
  if (win.__djxxrWinFanout) return;
  const s = ensure(win);

  win.on = function patchedOn(event, listener) {
    if (!FANOUT.has(event) || typeof listener !== 'function') {
      return s.origOn(event, listener);
    }
    addHandler(win, s, event, listener, false);
    return win;
  };

  win.once = function patchedOnce(event, listener) {
    if (!FANOUT.has(event) || typeof listener !== 'function') {
      return s.origOnce(event, listener);
    }
    addHandler(win, s, event, listener, true);
    return win;
  };

  const remove = function patchedRemove(event, listener) {
    if (!FANOUT.has(event) || typeof listener !== 'function') {
      return s.origOff(event, listener);
    }
    const set = s.handlers.get(event);
    if (!set) return win;
    for (const h of [...set]) {
      if (h === listener || h.__djxxrInner === listener) set.delete(h);
    }
    return win;
  };
  win.off = remove;
  win.removeListener = remove;

  // Clear fanout Sets after closed (extensions observeWindow once('closed') re-stacks)
  s.origOn('closed', () => {
    s.handlers.clear();
    s.attached.clear();
  });

  win.__djxxrWinFanout = true;
}

function counts(win) {
  const s = state.get(win);
  if (!s) return { patched: false };
  const out = { patched: true, events: {} };
  for (const [ev, set] of s.handlers) out.events[ev] = set.size;
  return out;
}

module.exports = { patchWindow, counts, FANOUT };
