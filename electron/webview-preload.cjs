'use strict';

const { contextBridge, ipcRenderer } = require('electron');

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

ipcRenderer.on('djxxr-pip-toggle', async () => {
  try {
    if (!document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      reportMedia();
      return;
    }
    const videos = Array.from(document.querySelectorAll('video'));
    const preferred =
      videos.find((v) => !v.paused && !v.ended) ||
      videos.find((v) => (v.readyState || 0) > 1) ||
      videos[0];
    if (!preferred) return;
    await preferred.requestPictureInPicture();
    reportMedia();
  } catch (err) {
    console.warn('[djxxr-pip]', err);
  }
});
