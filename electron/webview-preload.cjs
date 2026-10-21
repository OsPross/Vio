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

/**
 * Chrome Web Store companion — MUST stay inlined (sandboxed preload cannot require local files).
 * Native "Dodaj do Chrome" needs chrome.webstorePrivate; we offer "Dodaj do Vio" + CRX install.
 */
function isChromeWebStoreHost() {
  try {
    const host = String(location.hostname || '');
    if (host === 'chromewebstore.google.com') return true;
    if (host === 'chrome.google.com' && /\/webstore\b/i.test(String(location.pathname || ''))) return true;
  } catch {
    /* */
  }
  return false;
}

function startChromeWebStoreCompanion() {
  if (!isChromeWebStoreHost()) return;
  try {
    if (window.__vioCwsCompanion) return;
    window.__vioCwsCompanion = true;
  } catch {
    return;
  }

  const BTN_ID = 'vio-add-to-vio';
  const api = {
    install: (id) => ipcRenderer.invoke('shell:extensions-install-store', id),
    listInstalled: () =>
      ipcRenderer
        .invoke('shell:extensions-list')
        .then((res) =>
          Array.isArray(res?.extensions)
            ? res.extensions.map((x) => String(x.chromeId || x.electronId || x.id || '').toLowerCase())
            : [],
        )
        .catch(() => []),
  };

  function extractId() {
    const path = String(location.pathname || '');
    const m =
      /\/detail\/[^/]+\/([a-p]{32})/i.exec(path) ||
      /\/webstore\/detail\/[^/]+\/([a-p]{32})/i.exec(path);
    return m ? m[1].toLowerCase() : null;
  }

  function setState(btn, text, tone) {
    btn.textContent = text;
    btn.disabled = tone === 'busy' || tone === 'ok';
    btn.style.pointerEvents = tone === 'busy' || tone === 'ok' ? 'none' : 'auto';
    btn.style.opacity = tone === 'busy' ? '0.85' : '1';
    if (tone === 'ok') btn.style.background = '#1e8e3e';
    else if (tone === 'err') btn.style.background = '#d93025';
    else btn.style.background = '#1a73e8';
  }

  function wireClick(btn) {
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const id = extractId();
      if (!id) {
        setState(btn, 'Brak ID rozszerzenia', 'err');
        return;
      }
      setState(btn, 'Instalowanie…', 'busy');
      try {
        const res = await api.install(id);
        if (res?.canceled) {
          setState(btn, 'Dodaj do Vio', 'idle');
          return;
        }
        if (res?.ok) {
          setState(btn, 'Dodano do Vio', 'ok');
          return;
        }
        setState(btn, res?.error ? String(res.error).slice(0, 42) : 'Instalacja nieudana', 'err');
        setTimeout(() => setState(btn, 'Dodaj do Vio', 'idle'), 3200);
      } catch (err) {
        setState(btn, String(err?.message || err).slice(0, 42), 'err');
        setTimeout(() => setState(btn, 'Dodaj do Vio', 'idle'), 3200);
      }
    });
  }

  function makeButton(floating) {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = 'Dodaj do Vio';
    btn.style.cssText = floating
      ? [
          'position:fixed',
          'top:12px',
          'right:16px',
          'z-index:2147483646',
          'display:inline-flex',
          'align-items:center',
          'justify-content:center',
          'height:40px',
          'padding:0 22px',
          'border:0',
          'border-radius:20px',
          'font:500 14px "Google Sans",Roboto,Arial,sans-serif',
          'color:#fff',
          'cursor:pointer',
          'background:#1a73e8',
          'box-shadow:0 2px 8px rgba(0,0,0,.28)',
        ].join(';')
      : [
          'display:inline-flex',
          'align-items:center',
          'justify-content:center',
          'height:40px',
          'padding:0 22px',
          'margin:0 8px 0 0',
          'border:0',
          'border-radius:20px',
          'font:500 14px "Google Sans",Roboto,Arial,sans-serif',
          'color:#fff',
          'cursor:pointer',
          'white-space:nowrap',
          'background:#1a73e8',
          'box-shadow:0 1px 2px rgba(60,64,67,.3),0 1px 3px 1px rgba(60,64,67,.15)',
          'z-index:2147483646',
        ].join(';');
    wireClick(btn);
    return btn;
  }

  function findVisibleNativeAdd() {
    const needles = [/^\s*Dodaj do Chrome\s*$/i, /^\s*Add to Chrome\s*$/i];
    const spans = document.querySelectorAll('span, button, div[role="button"]');
    for (const el of spans) {
      const label = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!needles.some((re) => re.test(label))) continue;
      const btn = el.closest('button') || (el.getAttribute && el.getAttribute('role') === 'button' ? el : null) || el;
      const container = (btn.closest && btn.closest('div.OdjmDb')) || btn.parentElement || btn;
      if (!container || (container.style && container.style.display === 'none')) continue;
      const r = container.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      return container;
    }
    return null;
  }

  function findInstallBanner() {
    const re =
      /przełącz się na Chrome|przelacz sie na Chrome|Switch to Chrome to install|Aby zainstalować rozszerzenia/i;
    const nodes = document.querySelectorAll('div,section,header');
    let best = null;
    let bestH = Infinity;
    for (const el of nodes) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 200 || !re.test(t)) continue;
      if (el.querySelector('#' + BTN_ID)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 16 || r.height > 160) continue;
      if (r.height < bestH) {
        best = el;
        bestH = r.height;
      }
    }
    return best;
  }

  function containsActionUi(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.id === BTN_ID || (node.querySelector && node.querySelector('#' + BTN_ID))) return true;
    const t = (node.textContent || '').slice(0, 80);
    return /Dodaj do Chrome|Add to Chrome|Dodaj do Vio/i.test(t) && t.length < 40;
  }

  function hideSwitchPromos() {
    const needles = [
      /Switch to Chrome\?/i,
      /recommends using Chrome/i,
      /Zainstaluj Chrome/i,
      /Google zaleca.*Chrome/i,
      /przełącz się na Chrome/i,
      /Aby zainstalować rozszerzenia i motywy/i,
    ];
    const nodes = document.querySelectorAll('span,div');
    for (const el of nodes) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 220) continue;
      if (!needles.some((re) => re.test(text))) continue;
      if (containsActionUi(el)) continue;
      let node = el;
      for (let up = 0; up < 6 && node.parentElement; up++) {
        const p = node.parentElement;
        if (containsActionUi(p)) break;
        const r = p.getBoundingClientRect();
        if (r.height > window.innerHeight * 0.45 || r.width > window.innerWidth * 0.92) break;
        node = p;
      }
      if (containsActionUi(node)) continue;
      if (node.getAttribute('data-vio-promo-hidden')) continue;
      node.setAttribute('data-vio-promo-hidden', '1');
      node.style.setProperty('display', 'none', 'important');
    }
  }

  let placedPath = '';

  async function placeButton() {
    if (!isChromeWebStoreHost()) return;
    const id = extractId();
    if (!id) return;

    if (placedPath && placedPath !== location.pathname) {
      const old = document.getElementById(BTN_ID);
      if (old) old.remove();
      placedPath = '';
    }

    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      const native = findVisibleNativeAdd();
      const banner = !native ? findInstallBanner() : null;
      const anchor = native || banner;
      placedPath = location.pathname;
      if (anchor && anchor.parentElement) {
        btn = makeButton(false);
        anchor.parentElement.insertBefore(btn, anchor);
        anchor.style.setProperty('display', 'none', 'important');
        if (banner) banner.setAttribute('data-vio-promo-hidden', '1');
      } else {
        // Always visible fallback — store layout changes often
        btn = makeButton(true);
        (document.documentElement || document.body).appendChild(btn);
      }
    }

    try {
      const installed = await api.listInstalled();
      if (Array.isArray(installed) && installed.includes(id) && btn) {
        setState(btn, 'Dodano do Vio', 'ok');
      }
    } catch {
      /* */
    }
  }

  function tick() {
    void placeButton();
    hideSwitchPromos();
  }

  tick();
  let t = null;
  const schedule = () => {
    if (t) return;
    t = setTimeout(() => {
      t = null;
      tick();
    }, 280);
  };
  try {
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch {
    /* */
  }
  setInterval(tick, 1500);
}

// Poll: preload often starts on about:blank before navigating to the store.
setInterval(() => {
  try {
    startChromeWebStoreCompanion();
  } catch (err) {
    console.warn('[webview-preload] cws companion', err && err.message);
  }
}, 800);
try {
  startChromeWebStoreCompanion();
} catch (err) {
  console.warn('[webview-preload] cws companion', err && err.message);
}

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
  // Do not preventDefault — page may handle X1/X2; chrome dedups via navigateHistory.
  ipcRenderer.sendToHost('djxxr-mouse-nav', {
    dir: e.button === 3 ? 'back' : 'forward',
    source: 'guest-mouseup',
  });
  return true;
}

// Guest DOM path (mouseup only — pointerdown would race before-mouse and double-step).
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
window.addEventListener('pointerdown', (e) => logMouse('pointerdown', e), true);

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

// Shift + hover link → host shows floating preview (Tor/private ignored in renderer).
(function bootLinkPreview() {
  const SHOW_MS = 300;
  let shiftDown = false;
  let hoverTimer = null;
  let lastHref = '';
  let lastX = 0;
  let lastY = 0;

  function clearHoverTimer() {
    if (hoverTimer != null) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  }

  function httpHrefFromTarget(t) {
    try {
      const a = t && t.closest ? t.closest('a[href]') : null;
      if (!a) return '';
      const href = String(a.href || '');
      if (!/^https?:\/\//i.test(href)) return '';
      return href;
    } catch {
      return '';
    }
  }

  function emitShow(href, x, y) {
    try {
      ipcRenderer.sendToHost('djxxr-link-preview', {
        type: 'show',
        url: href,
        x: Math.round(x),
        y: Math.round(y),
      });
    } catch {
      /* */
    }
  }

  function emitHide() {
    clearHoverTimer();
    lastHref = '';
    try {
      ipcRenderer.sendToHost('djxxr-link-preview', { type: 'hide' });
    } catch {
      /* */
    }
  }

  function scheduleShow(href, x, y) {
    if (!shiftDown || !href) return;
    if (href === lastHref && hoverTimer == null) return;
    clearHoverTimer();
    lastHref = href;
    lastX = x;
    lastY = y;
    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      if (!shiftDown || lastHref !== href) return;
      emitShow(href, lastX, lastY);
    }, SHOW_MS);
  }

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Shift') return;
      shiftDown = true;
    },
    true,
  );
  window.addEventListener(
    'keyup',
    (e) => {
      if (e.key !== 'Shift') return;
      shiftDown = false;
      emitHide();
    },
    true,
  );
  window.addEventListener(
    'blur',
    () => {
      shiftDown = false;
      emitHide();
    },
    true,
  );
  window.addEventListener(
    'mousemove',
    (e) => {
      if (!shiftDown) return;
      const href = httpHrefFromTarget(e.target);
      if (!href) {
        if (lastHref) emitHide();
        return;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      if (href !== lastHref) scheduleShow(href, e.clientX, e.clientY);
    },
    true,
  );
  window.addEventListener(
    'mouseover',
    (e) => {
      if (!shiftDown) return;
      const href = httpHrefFromTarget(e.target);
      if (!href) return;
      scheduleShow(href, e.clientX, e.clientY);
    },
    true,
  );
  window.addEventListener(
    'mouseout',
    (e) => {
      const to = e.relatedTarget;
      const next = httpHrefFromTarget(to);
      const prev = httpHrefFromTarget(e.target);
      if (prev && next === prev) return;
      if (prev && next !== prev) {
        // Leaving this link — host applies ~200 ms grace if cursor enters popover
        clearHoverTimer();
        try {
          ipcRenderer.sendToHost('djxxr-link-preview', { type: 'leave' });
        } catch {
          /* */
        }
        lastHref = '';
      }
    },
    true,
  );
})();
