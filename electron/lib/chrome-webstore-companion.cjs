/**
 * Chrome Web Store companion (preload / isolated world).
 * Native "Add to Chrome" needs chrome.webstorePrivate — never available in Electron.
 * We hide Google's "switch to Chrome" promos and offer "Dodaj do Vio" that installs via CRX.
 */
'use strict';

/**
 * @param {{
 *   install: (id: string) => Promise<{ ok?: boolean, canceled?: boolean, error?: string, extension?: { id?: string } }>,
 *   listInstalled: () => Promise<string[]>,
 * }} api
 */
function startChromeWebStoreCompanion(api) {
  try {
    const host = String(location.hostname || '');
    const isStore =
      host === 'chromewebstore.google.com' ||
      (host === 'chrome.google.com' && /\/webstore\b/i.test(location.pathname));
    if (!isStore || window.__vioCwsCompanion) return;
    window.__vioCwsCompanion = true;
  } catch {
    return;
  }

  const BTN_ID = 'vio-add-to-vio';

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

  function makeButton() {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = 'Dodaj do Vio';
    btn.style.cssText = [
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
    return btn;
  }

  function textMatches(el, re) {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 160) return false;
    return re.test(t);
  }

  function findVisibleNativeAdd() {
    const needles = [/^\s*Dodaj do Chrome\s*$/i, /^\s*Add to Chrome\s*$/i];
    const spans = document.querySelectorAll('span, button, div[role="button"]');
    for (const el of spans) {
      const label = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!needles.some((re) => re.test(label))) continue;
      const btn = el.closest('button') || (el.getAttribute?.('role') === 'button' ? el : null) || el;
      const container = btn.closest('div.OdjmDb') || btn.parentElement || btn;
      if (!container) continue;
      if (container.style?.display === 'none') continue;
      const r = container.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      return container;
    }
    return null;
  }

  function findInstallBanner() {
    const re =
      /przełącz się na Chrome|przelacz sie na Chrome|Switch to Chrome to install|Aby zainstalować rozszerzenia/i;
    const divs = document.querySelectorAll('div');
    for (const div of divs) {
      if (!textMatches(div, re)) continue;
      if (div.querySelector(`#${BTN_ID}`)) continue;
      const r = div.getBoundingClientRect();
      if (r.width < 40 || r.height < 20) continue;
      // Prefer compact banner rows, not the whole page
      if (r.height > 120) continue;
      return div;
    }
    return null;
  }

  function containsActionUi(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.id === BTN_ID || node.querySelector?.(`#${BTN_ID}`)) return true;
    const t = (node.textContent || '').slice(0, 80);
    if (/Dodaj do Chrome|Add to Chrome|Dodaj do Vio/i.test(t) && t.length < 40) return true;
    return false;
  }

  function hideSwitchPromos() {
    const needles = [
      /Switch to Chrome\?/i,
      /recommends using Chrome/i,
      /Zainstaluj Chrome/i,
      /Google zaleca.*Chrome/i,
      /przełącz się na Chrome/i,
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
    const id = extractId();
    if (!id) return;

    if (placedPath && placedPath !== location.pathname) {
      document.getElementById(BTN_ID)?.remove();
      placedPath = '';
    }

    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      const native = findVisibleNativeAdd();
      const banner = !native ? findInstallBanner() : null;
      const anchor = native || banner;
      if (!anchor?.parentElement) return;
      placedPath = location.pathname;
      btn = makeButton();
      anchor.parentElement.insertBefore(btn, anchor);
      anchor.style.setProperty('display', 'none', 'important');
      if (banner) banner.setAttribute('data-vio-promo-hidden', '1');
      if (native) findInstallBanner()?.style.setProperty('display', 'none', 'important');
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
  setInterval(tick, 2000);
}

module.exports = { startChromeWebStoreCompanion };
