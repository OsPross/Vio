'use strict';

/**
 * One real BrowserWindow listener per event; fans out to a Set of handlers.
 * Prevents MaxListenersExceededWarning when electron-chrome-extensions
 * registers focus/resized per addTab().
 */

/** @type {WeakMap<object, { origOn: Function, handlers: Map<string, Set<Function>>, attached: Set<string> }>} */
const state = new WeakMap();

const FANOUT = new Set(['focus', 'resized']);

function ensure(win) {
  let s = state.get(win);
  if (s) return s;
  s = {
    origOn: win.on.bind(win),
    handlers: new Map(),
    attached: new Set(),
  };
  state.set(win, s);
  return s;
}

/**
 * Patch win.on so focus/resized are coalesced. Idempotent per window.
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
    let set = s.handlers.get(event);
    if (!set) {
      set = new Set();
      s.handlers.set(event, set);
    }
    set.add(listener);
    if (!s.attached.has(event)) {
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
        }
      });
    }
    return win;
  };
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
