'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Proof / diagnostics: one execution per document in the webview main frame.
// will-attach-webview sets preload only on the guest main world — iframes must not load this file.
const __djxxrPreloadRunId = `wv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
try {
  const frame = typeof window !== 'undefined' && window === window.top ? 'main' : 'subframe';
  console.debug('[webview-preload] run', { id: __djxxrPreloadRunId, frame });
} catch {
  console.debug('[webview-preload] run', { id: __djxxrPreloadRunId });
}

// Fallback cosmetic CSS when Ghostery is down (getCosmeticCss returns '' while Ghostery session preload handles cosmetics).
function injectLegacyCosmeticCss() {
  void ipcRenderer
    .invoke('shell:adblock-cosmetic')
    .then((css) => {
      if (typeof css !== 'string' || !css.trim()) return;
      const STYLE_ID = 'djxxr-legacy-cosmetic';
      const apply = () => {
        try {
          if (document.getElementById(STYLE_ID)) return;
          const style = document.createElement('style');
          style.id = STYLE_ID;
          style.textContent = css;
          const root = document.head || document.documentElement;
          if (root) root.appendChild(style);
        } catch {
          /* */
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', apply, { once: true });
      } else {
        apply();
      }
    })
    .catch(() => {
      /* */
    });
}
injectLegacyCosmeticCss();

contextBridge.exposeInMainWorld('__djxxrPw', {
  post: (type, payload) => {
    if (typeof type !== 'string') return;
    ipcRenderer.sendToHost('djxxr-pw', { type, payload: payload || {} });
  },
  onCommand: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const handler = (_e, msg) => {
      try {
        cb(msg);
      } catch {
        /* */
      }
    };
    ipcRenderer.on('djxxr-pw-cmd', handler);
    return () => ipcRenderer.removeListener('djxxr-pw-cmd', handler);
  },
});

/** Video presence / playback → chrome PiP button */
let lastMediaSent = '';
function reportMedia() {
  try {
    const videos = Array.from(document.querySelectorAll('video'));
    const hasVideo = videos.some((v) => {
      try {
        return (v.readyState || 0) > 0 || (v.networkState || 0) > 0 || Boolean(v.src || v.currentSrc);
      } catch {
        return false;
      }
    });
    const playing = videos.some((v) => {
      try {
        return !v.paused && !v.ended && (v.readyState || 0) > 1;
      } catch {
        return false;
      }
    });
    const key = `${hasVideo ? 1 : 0}:${playing ? 1 : 0}`;
    if (key === lastMediaSent) return;
    lastMediaSent = key;
    ipcRenderer.sendToHost('djxxr-media', { hasVideo, playing });
  } catch {
    /* */
  }
}

function wireVideo(v) {
  if (!v || v.__djxxrMediaWired) return;
  v.__djxxrMediaWired = true;
  for (const ev of ['play', 'playing', 'pause', 'ended', 'emptied', 'loadeddata', 'durationchange']) {
    v.addEventListener(ev, reportMedia, { passive: true });
  }
}

function scanAndWire() {
  try {
    document.querySelectorAll('video').forEach(wireVideo);
  } catch {
    /* */
  }
  reportMedia();
}

function bootMediaWatch() {
  scanAndWire();
  try {
    const mo = new MutationObserver(() => scanAndWire());
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch {
    /* */
  }
  setInterval(reportMedia, 2000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootMediaWatch, { once: true });
} else {
  bootMediaWatch();
}

// PiP toggle runs in main via shell:picture-in-picture + executeJavaScript(..., userGesture=true).

function isEditableTarget(el) {
  if (!el || el === document || el === document.documentElement) return false;
  try {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    if (el.closest && el.closest('[contenteditable="true"]')) return true;
  } catch {
    /* */
  }
  return false;
}

const mouseDebug =
  typeof process !== 'undefined' &&
  (process.env.DJXXR_DEBUG_MOUSE === '1' || process.env.DJXXR_DEBUG_MOUSE === 'true');

function logMouse(kind, e) {
  if (!mouseDebug) return;
  try {
    console.log('[mouse-nav:guest]', kind, {
      button: e.button,
      buttons: e.buttons,
      type: e.type,
      target: (e.target && e.target.tagName) || null,
    });
  } catch {
    /* */
  }
}

function emitSideButtonNav(e) {
  if (e.button !== 3 && e.button !== 4) return false;
  logMouse('side-button', e);
  try {
    e.preventDefault();
    e.stopPropagation();
  } catch {
    /* */
  }
  ipcRenderer.sendToHost('djxxr-mouse-nav', {
    dir: e.button === 3 ? 'back' : 'forward',
    source: 'guest-mouseup',
  });
  return true;
}

// Primary path for X1/X2 over webview (Windows included — app-command alone is unreliable
// when focus is inside <webview>). preventDefault stops page-level handlers from double-nav.
window.addEventListener('mousedown', (e) => logMouse('mousedown', e), true);
window.addEventListener(
  'mouseup',
  (e) => {
    logMouse('mouseup', e);
    emitSideButtonNav(e);
  },
  true,
);
window.addEventListener('auxclick', (e) => logMouse('auxclick', e), true);
window.addEventListener(
  'pointerdown',
  (e) => {
    logMouse('pointerdown', e);
    if (e.button === 3 || e.button === 4) emitSideButtonNav(e);
  },
  true,
);

// Chrome: Backspace must NOT navigate history
window.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Backspace' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
  },
  true,
);
