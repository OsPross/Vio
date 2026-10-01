/**
 * Live smoke Round 5 (loaded by main when SMOKE_ROUND5=1 && !app.isPackaged).
 * Covers: popup URL chrome, single preload, submenu×10, print/PDF/save.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(getMainWindow) {
  const results = [];
  const push = (item, result, detail) => {
    const row = { item, result, detail: detail || '', at: new Date().toISOString() };
    results.push(row);
    console.log(`[smoke5] ${item} → ${result}${detail ? ' | ' + detail : ''}`);
  };

  await sleep(3500);
  let win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  for (let i = 0; i < 20 && (!win || win.isDestroyed()); i++) {
    await sleep(500);
    win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  }
  if (!win || win.isDestroyed()) {
    console.error('[smoke5] no main window');
    process.exit(2);
  }

  const { BrowserWindow, app: electronApp } = require('electron');
  const wc = win.webContents;

  const preloadRuns = [];
  wc.on('console-message', (_e, _level, message) => {
    const msg = String(message || '');
    if (/\[webview-preload\] run/.test(msg)) preloadRuns.push(msg);
    if (/\[popup\]|\[smoke5\]|\[webview-preload\]/i.test(msg)) {
      console.log('[smoke5:app]', msg);
    }
  });

  const evalInApp = async (code) => {
    try {
      return await wc.executeJavaScript(code, true);
    } catch (err) {
      return { err: String(err && err.message ? err.message : err) };
    }
  };

  const openMenu = async () => {
    await evalInApp(`(() => {
      const btn = document.querySelector('.app-menu-trigger');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    await sleep(350);
  };

  const closeMenu = async () => {
    await evalInApp(`(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    })()`);
    await sleep(200);
  };

  /** Open ≡ → Więcej narzędzi (click) → wait for panel → click child */
  const clickMoreToolsItem = async (label) => {
    const step1 = await evalInApp(`(() => {
      const pop = document.querySelector('.app-menu-popover');
      if (!pop) return { ok: false, reason: 'no-popover' };
      const moreBtn = Array.from(pop.querySelectorAll('button[aria-haspopup="menu"], button.app-menu-item.has-sub, .app-menu-item.has-sub'))
        .find((n) => /Więcej narzędzi/i.test((n.textContent || '').trim()));
      if (!moreBtn) {
        const all = Array.from(pop.querySelectorAll('button')).map((n) => (n.textContent || '').trim().slice(0, 40));
        return { ok: false, reason: 'no-more', labels: all };
      }
      moreBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      moreBtn.click();
      return { ok: true, clickedMore: true };
    })()`);
    if (!step1?.ok) return step1;
    await sleep(250);
    return evalInApp(`(() => {
      const sub = document.querySelector('.app-menu-submenu');
      if (!sub) return { ok: false, reason: 'no-submenu-after-click' };
      const el = Array.from(sub.querySelectorAll('button')).find((n) =>
        (n.textContent || '').replace(/\\s+/g, ' ').trim().includes(${JSON.stringify(label)}),
      );
      if (!el) {
        return {
          ok: false,
          reason: 'child-not-found',
          labels: Array.from(sub.querySelectorAll('button')).map((n) => (n.textContent || '').trim().slice(0, 40)),
        };
      }
      el.click();
      return { ok: true, text: (el.textContent || '').trim().slice(0, 60) };
    })()`);
  };

  const storeSnap = async () =>
    evalInApp(`(() => {
      const st = window.__DJXXR_STORE__?.getState?.();
      if (!st) return { err: 'no-store' };
      const tab = st.tabs.find(t => t.id === st.activeId);
      return {
        view: st.view,
        tabCount: st.tabs.length,
        url: tab?.url,
        title: tab?.title,
        activeId: st.activeId,
      };
    })()`);

  const activeWcId = async () =>
    evalInApp(`(() => {
      const st = window.__DJXXR_STORE__?.getState?.();
      const wv = document.querySelector('webview:not(.hidden)');
      try { return wv?.getWebContentsId?.() ?? null; } catch { return null; }
    })()`);

  const navigate = async (url) => {
    await evalInApp(
      `window.__DJXXR_STORE__?.getState?.().updateTab(window.__DJXXR_STORE__.getState().activeId, { url: ${JSON.stringify(url)} })`,
    );
    await sleep(4500);
  };

  // --- Boot ---
  let snap = await storeSnap();
  push('boot', snap?.err ? 'FAIL' : 'OK', JSON.stringify(snap));

  // ========== 3. Submenu ×10 (no Shift+Esc) ==========
  let submenuOk = 0;
  for (let i = 1; i <= 10; i++) {
    await openMenu();
    await sleep(200);
    let clicked = await clickMoreToolsItem('Menedżer zadań');
    if (!clicked?.ok) {
      // Keyboard path: focus "Więcej narzędzi" → ArrowRight → Enter on Task Mgr
      clicked = await evalInApp(`(() => {
        const pop = document.querySelector('.app-menu-popover');
        if (!pop) return { ok: false, reason: 'no-popover-kb' };
        const more = Array.from(pop.querySelectorAll('button')).find((n) =>
          /Więcej narzędzi/i.test((n.textContent || '').trim()),
        );
        if (!more) return { ok: false, reason: 'no-more-kb' };
        more.focus();
        more.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        return { ok: true, via: 'keyboard-open' };
      })()`);
      await sleep(300);
      if (clicked?.ok) {
        clicked = await evalInApp(`(() => {
          const sub = document.querySelector('.app-menu-submenu');
          if (!sub) return { ok: false, reason: 'no-submenu-kb' };
          const el = Array.from(sub.querySelectorAll('button')).find((n) =>
            /Menedżer zadań/i.test((n.textContent || '').trim()),
          );
          if (!el) return { ok: false, reason: 'no-task-kb' };
          el.click();
          return { ok: true, via: 'keyboard', text: (el.textContent || '').trim().slice(0, 40) };
        })()`);
      }
    }
    await sleep(400);
    const open = await evalInApp(
      `!!document.querySelector('[class*="task"], [class*="resources"], [class*="metrics"], .mx-overlay')`,
    );
    await evalInApp(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => /Zamknij|Close|×/i.test(x.textContent||''));
      b?.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    })()`);
    await sleep(250);
    if (clicked?.ok && open) {
      submenuOk += 1;
      push(`submenu-taskmgr-${i}`, 'OK', JSON.stringify(clicked));
    } else {
      push(`submenu-taskmgr-${i}`, 'FAIL', JSON.stringify({ clicked, open }));
      break;
    }
  }
  push('submenu-taskmgr-10x', submenuOk === 10 ? 'OK' : 'FAIL', `${submenuOk}/10`);

  // ========== 2. Preload once on navigate ==========
  preloadRuns.length = 0;
  await navigate('https://example.com');
  await sleep(1500);
  // Listen to webview console via guest — host console may not see preload debug from guest.
  const preloadProbe = await evalInApp(`(async () => {
    const wv = document.querySelector('webview:not(.hidden)');
    if (!wv) return { err: 'no-wv' };
    try {
      const r = await wv.executeJavaScript(\`(function(){
        return {
          hasBridge: typeof window.__djxxrPw === 'object',
          isTop: window === window.top,
          href: location.href,
        };
      })()\`);
      // iframe probe: create iframe and check it does NOT get __djxxrPw from our preload
      const iframeCheck = await wv.executeJavaScript(\`(function(){
        return new Promise((resolve) => {
          const f = document.createElement('iframe');
          f.src = 'about:blank';
          f.onload = () => {
            try {
              const has = !!(f.contentWindow && f.contentWindow.__djxxrPw);
              f.remove();
              resolve({ iframeHasBridge: has });
            } catch (e) {
              f.remove();
              resolve({ iframeHasBridge: 'cross-origin-or-error', err: String(e) });
            }
          };
          document.body.appendChild(f);
        });
      })()\`);
      return { ...r, ...iframeCheck };
    } catch (e) {
      return { err: String(e) };
    }
  })()`);
  push(
    'preload-main-bridge',
    preloadProbe?.hasBridge && preloadProbe?.isTop ? 'OK' : 'FAIL',
    JSON.stringify(preloadProbe),
  );
  push(
    'preload-iframe-no-bridge',
    preloadProbe?.iframeHasBridge === false || preloadProbe?.iframeHasBridge === 'cross-origin-or-error'
      ? 'OK'
      : 'FAIL',
    JSON.stringify(preloadProbe),
  );

  // ========== 4. Print / PDF / Save ==========
  const outDir = path.join(__dirname, '..', 'tmp-verify', 'smoke-round5');
  fs.mkdirSync(outDir, { recursive: true });

  const testPrintSave = async (label, url) => {
    await navigate(url);
    await sleep(2000);
    const id = await activeWcId();
    if (typeof id !== 'number') {
      push(`${label}-wcId`, 'FAIL', String(id));
      return;
    }
    const pdfPath = path.join(outDir, `${label}.pdf`);
    const htmlPath = path.join(outDir, `${label}.html`);
    try {
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
    } catch {
      /* */
    }

    const printRes = await evalInApp(
      `window.shell.printPage(${id}, { silent: true }).then(r => r).catch(e => ({ err: String(e) }))`,
    );
    push(
      `${label}-print-silent`,
      printRes?.ok ? 'OK' : 'FAIL',
      JSON.stringify(printRes),
    );

    const pdfRes = await evalInApp(
      `window.shell.printToPdf(${id}, { forcePath: ${JSON.stringify(pdfPath)} }).then(r => r).catch(e => ({ err: String(e) }))`,
    );
    const pdfOk = pdfRes?.ok && fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 500;
    push(`${label}-pdf`, pdfOk ? 'OK' : 'FAIL', JSON.stringify({ ...pdfRes, exists: fs.existsSync(pdfPath), size: pdfOk ? fs.statSync(pdfPath).size : 0, path: pdfPath }));

    const saveRes = await evalInApp(
      `window.shell.savePage(${id}, { forcePath: ${JSON.stringify(htmlPath)} }).then(r => r).catch(e => ({ err: String(e) }))`,
    );
    const htmlOk = saveRes?.ok && fs.existsSync(htmlPath) && fs.statSync(htmlPath).size > 50;
    push(`${label}-save-html`, htmlOk ? 'OK' : 'FAIL', JSON.stringify({ ...saveRes, exists: fs.existsSync(htmlPath), size: htmlOk ? fs.statSync(htmlPath).size : 0, path: htmlPath }));
  };

  await testPrintSave('example', 'https://example.com');
  await testPrintSave('wikipedia-pl', 'https://pl.wikipedia.org/wiki/Polska');

  // Home: print/save disabled
  await evalInApp(`window.__DJXXR_STORE__?.getState?.().updateTab(window.__DJXXR_STORE__.getState().activeId, { url: 'about:home' })`);
  await sleep(1000);
  await openMenu();
  await sleep(300);
  const homeDisabled = await evalInApp(`(() => {
    const items = Array.from(document.querySelectorAll('.app-menu-popover button[role="menuitem"], .app-menu-popover button'));
    const by = (re) => items.find((n) => re.test((n.textContent || '').replace(/\\s+/g, ' ')));
    const print = by(/Drukuj/);
    const save = by(/Zapisz stronę/);
    const pdf = by(/Zapisz jako PDF/);
    const isDis = (el) => !el ? null : Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true';
    return {
      printDisabled: isDis(print),
      saveDisabled: isDis(save),
      pdfDisabled: isDis(pdf),
      printTitle: print?.getAttribute('title') || '',
      saveTitle: save?.getAttribute('title') || '',
      found: { print: !!print, save: !!save, pdf: !!pdf },
      sample: items.slice(0, 20).map((n) => (n.textContent || '').trim().slice(0, 36)),
    };
  })()`);
  await closeMenu();
  push(
    'home-print-save-disabled',
    homeDisabled?.printDisabled && homeDisabled?.saveDisabled && homeDisabled?.pdfDisabled ? 'OK' : 'WARN',
    JSON.stringify(homeDisabled),
  );

  // ========== 1. Popup chrome (programmatic window.open with features) ==========
  await navigate('https://example.com');
  await sleep(1000);
  const beforeIds = new Set(BrowserWindow.getAllWindows().map((w) => w.id));
  const openPopup = await evalInApp(`(async () => {
    const wv = document.querySelector('webview:not(.hidden)');
    if (!wv) return { err: 'no-wv' };
    try {
      return await wv.executeJavaScript(\`(function(){
        const w = window.open('https://accounts.google.com/', 'djxxr_smoke_popup', 'width=520,height=640');
        return { opened: !!w, href: location.href };
      })()\`);
    } catch (e) {
      return { err: String(e) };
    }
  })()`);
  await sleep(2500);
  const childWins = BrowserWindow.getAllWindows().filter((w) => !beforeIds.has(w.id) && !w.isDestroyed());
  let chromeOk = false;
  let chromeDetail = {};
  for (const child of childWins) {
    try {
      const hasChrome = Boolean(child.__djxxrPopupChromeView) || Boolean(child.__djxxrPopupChrome);
      const title = child.getTitle();
      const kids = (child.contentView && child.contentView.children && child.contentView.children.length) || 0;
      chromeDetail = { hasChrome, title, contentChildren: kids, id: child.id };
      if (hasChrome || kids >= 2) {
        chromeOk = true;
        break;
      }
    } catch (e) {
      chromeDetail = { err: String(e) };
    }
  }
  push(
    'popup-url-chrome',
    chromeOk ? 'OK' : childWins.length > 0 ? 'WARN' : 'FAIL',
    JSON.stringify({ openPopup, childWindows: childWins.length, chromeDetail }),
  );

  for (const child of childWins) {
    try {
      child.close();
    } catch {
      /* */
    }
  }

  const out = path.join(__dirname, '..', 'tmp-verify', 'smoke-round5-results.json');
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ results, at: new Date().toISOString(), outDir }, null, 2));
    console.log('[smoke5] wrote', out);
  } catch (err) {
    console.warn('[smoke5] write', err);
  }

  const fails = results.filter((r) => r.result === 'FAIL');
  console.log(`[smoke5] done: ${results.length} checks, ${fails.length} FAIL`);
  await sleep(600);
  electronApp.quit();
}

module.exports = { run };
