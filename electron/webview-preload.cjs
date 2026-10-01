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

// Mouse X1/X2: on Windows, BrowserWindow 'app-command' is the sole source (avoids double-back).
// Other platforms keep this fallback.
if (process.platform !== 'win32') {
  window.addEventListener(
    'mouseup',
    (e) => {
      if (e.button === 3 || e.button === 4) {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch {
          /* */
        }
        ipcRenderer.sendToHost('djxxr-mouse-nav', { dir: e.button === 3 ? 'back' : 'forward' });
      }
    },
    true,
  );
}

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
