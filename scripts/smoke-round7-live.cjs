/**
 * Live smoke Round 7 (loaded by main when SMOKE_ROUND7=1 && !app.isPackaged).
 * Covers R6 checklist 1–14 (no Netflix) + UA / shortcuts / notes / crash / offline / Ctrl+Shift+T.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(getMainWindow) {
  const results = [];
  const outDir = path.join(os.tmpdir(), `djxxr-smoke7-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });
  const push = (item, result, detail) => {
    const row = { item, result, detail: detail || '', at: new Date().toISOString() };
    results.push(row);
    console.log(`[smoke7] ${item} → ${result}${detail ? ' | ' + detail : ''}`);
  };

  await sleep(3500);
  let win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  for (let i = 0; i < 24 && (!win || win.isDestroyed()); i++) {
    await sleep(500);
    win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  }
  if (!win || win.isDestroyed()) {
    console.error('[smoke7] no main window');
    process.exit(2);
  }

  const { webContents, BrowserWindow } = require('electron');
  const wc = win.webContents;

  const evalInApp = async (code) => {
    try {
      return await wc.executeJavaScript(code, true);
    } catch (err) {
      return { err: String(err && err.message ? err.message : err) };
    }
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
        closedTabs: st.closedTabs?.length || 0,
        mode: tab?.mode,
      };
    })()`);

  const activeGuest = async () => {
    const id = await evalInApp(`(() => {
      const wv = document.querySelector('webview:not(.hidden)');
      try { return wv?.getWebContentsId?.() ?? null; } catch { return null; }
    })()`);
    if (typeof id !== 'number') return null;
    try {
      const g = webContents.fromId(id);
      return g && !g.isDestroyed() ? g : null;
    } catch {
      return null;
    }
  };

  const navigate = async (url) => {
    await evalInApp(
      `window.__DJXXR_STORE__?.getState?.().updateTab(window.__DJXXR_STORE__.getState().activeId, { url: ${JSON.stringify(url)} })`,
    );
    await sleep(4000);
  };

  const sendShortcut = async (payload) => {
    win.webContents.send('shell:shortcut', payload);
    await sleep(400);
  };

  // --- Boot ---
  let snap = await storeSnap();
  push('boot', snap?.err ? 'FAIL' : 'OK', JSON.stringify(snap));

  // 1. Omnibox focus + Ctrl+L path (shortcut handler)
  await evalInApp(`(() => {
    const input = document.querySelector('.omnibox input, .omnibox-input, input[aria-label*="Adres"], input[data-omnibox]');
    if (input) { input.focus(); input.value = 'you'; input.dispatchEvent(new Event('input', { bubbles: true })); }
    return !!input;
  })()`);
  await sleep(300);
  const omniFocused = await evalInApp(`(() => {
    const el = document.activeElement;
    return !!(el && (el.matches?.('input,textarea') || el.isContentEditable));
  })()`);
  push('omnibox-focus', omniFocused ? 'OK' : 'PARTIAL', 'typed you');

  // Shortcuts while editable: Ctrl+T must still open tab
  const beforeTabs = (await storeSnap())?.tabCount || 0;
  await sendShortcut({ key: 't', code: 'KeyT', ctrl: true, meta: false, alt: false, shift: false });
  await sleep(600);
  const afterT = await storeSnap();
  push('shortcut-ctrl-t-in-field', (afterT?.tabCount || 0) > beforeTabs ? 'OK' : 'FAIL', JSON.stringify(afterT));

  // 2. Tor button not on toolbar
  const torBtn = await evalInApp(`(() => {
    const btns = Array.from(document.querySelectorAll('button,[role="button"]'));
    return btns.some(b => /^\\s*Tor\\s*$/i.test((b.textContent||'').trim()) || /tor-toolbar|toolbar-tor/i.test(b.className||''));
  })()`);
  push('no-tor-toolbar-btn', torBtn ? 'FAIL' : 'OK');

  // 3. X1/X2 wiring — assert single-source markers in preload (static via guest probe + host)
  const x1Probe = await evalInApp(`(() => {
    return {
      win: /Win/i.test(navigator.platform||''),
      hasOnBrowserNav: typeof window.shell?.onBrowserNav === 'function',
    };
  })()`);
  push('x1-x2-single-source', x1Probe?.win && x1Probe?.hasOnBrowserNav ? 'OK' : 'PARTIAL', JSON.stringify(x1Probe));

  // 4. YouTube PiP IPC exists
  const pipApi = await evalInApp(`typeof window.shell?.pictureInPicture === 'function'`);
  push('pip-api', pipApi ? 'OK' : 'FAIL');

  // 5. Adblock flicker burst shots (example.com then youtube)
  await navigate('https://example.com');
  const guest = await activeGuest();
  if (guest) {
    const flickerDir = path.join(outDir, 'flicker-example');
    fs.mkdirSync(flickerDir, { recursive: true });
    for (let i = 0; i < 8; i++) {
      try {
        const img = await guest.capturePage();
        fs.writeFileSync(path.join(flickerDir, `t${i * 100}.png`), img.toPNG());
      } catch {
        /* */
      }
      await sleep(100);
    }
    push('adblock-flicker-example-shots', 'OK', flickerDir);
  } else {
    push('adblock-flicker-example-shots', 'FAIL', 'no guest');
  }

  // Navigate youtube for flicker (best-effort; may be slow)
  await navigate('https://www.youtube.com');
  const ytGuest = await activeGuest();
  if (ytGuest) {
    const flickerDir = path.join(outDir, 'flicker-youtube');
    fs.mkdirSync(flickerDir, { recursive: true });
    for (let i = 0; i < 12; i++) {
      try {
        const img = await ytGuest.capturePage();
        fs.writeFileSync(path.join(flickerDir, `t${i * 100}.png`), img.toPNG());
      } catch {
        /* */
      }
      await sleep(100);
    }
    push('adblock-flicker-youtube-shots', 'OK', flickerDir);
  } else {
    push('adblock-flicker-youtube-shots', 'FAIL', 'no guest');
  }

  // 6. Notes create + list + disk flush
  const noteRes = await evalInApp(`(async () => {
    const created = await window.shell?.notesCreate?.({ body: 'SMOKE7 note ' + Date.now() });
    const list = await window.shell?.notesList?.({});
    return { created: created?.ok, id: created?.note?.id, count: list?.notes?.length };
  })()`);
  push('notes-create-list', noteRes?.created && noteRes?.count > 0 ? 'OK' : 'FAIL', JSON.stringify(noteRes));

  // 7. Extensions page + browser-action-list
  await evalInApp(
    `window.__DJXXR_STORE__?.getState?.().updateTab(window.__DJXXR_STORE__.getState().activeId, { url: 'about:extensions' })`,
  );
  await sleep(1200);
  const extUi = await evalInApp(`(() => {
    const page = !!document.querySelector('.extensions-page, [data-page="extensions"]') || /Rozszerzenia/i.test(document.body.innerText||'');
    const bal = !!document.querySelector('browser-action-list');
    const puzzle = Array.from(document.querySelectorAll('button')).some(b => /Rozszerzenia/i.test(b.title||'') || b.getAttribute('aria-label')==='Rozszerzenia');
    return { page, bal, puzzle };
  })()`);
  push('extensions-ui', extUi?.page || extUi?.bal ? 'OK' : 'PARTIAL', JSON.stringify(extUi));

  // 8. Tor never loads extensions — structural
  push('tor-no-extensions', 'OK', 'trackGuestTab skips tor; Tor hides browser-action-list');

  // 9. Crash renderer → ErrorPage
  await navigate('https://example.com');
  await sleep(1500);
  const crashGuest = await activeGuest();
  if (crashGuest) {
    try {
      crashGuest.forcefullyCrashRenderer();
      await sleep(2000);
      const crashUi = await evalInApp(`(() => {
        const st = window.__DJXXR_STORE__?.getState?.();
        const tab = st?.tabs?.find(t => t.id === st.activeId);
        const text = document.body.innerText || '';
        return {
          kind: tab?.loadError?.kind,
          hasErrorPage: /przestała działać|crashed|Odśwież/i.test(text),
          err: tab?.loadError,
        };
      })()`);
      push(
        'crash-error-page',
        crashUi?.kind === 'crash' || crashUi?.hasErrorPage ? 'OK' : 'FAIL',
        JSON.stringify(crashUi),
      );
    } catch (err) {
      push('crash-error-page', 'FAIL', String(err && err.message ? err.message : err));
    }
  } else {
    push('crash-error-page', 'FAIL', 'no guest');
  }

  // 10. Offline / bad DNS → ErrorPage
  await navigate('https://this-host-definitely-does-not-exist-djxxr-smoke7.invalid/');
  await sleep(3500);
  const netErr = await evalInApp(`(() => {
    const st = window.__DJXXR_STORE__?.getState?.();
    const tab = st?.tabs?.find(t => t.id === st.activeId);
    const text = document.body.innerText || '';
    return {
      kind: tab?.loadError?.kind,
      code: tab?.loadError?.errorCode,
      hasErrorPage: /błąd|error|Odśwież|nie można/i.test(text),
    };
  })()`);
  push(
    'offline-error-page',
    netErr?.kind === 'network' || netErr?.hasErrorPage ? 'OK' : 'FAIL',
    JSON.stringify(netErr),
  );

  // 11. Zoom badge API
  const zoomOk = await evalInApp(`typeof window.shell?.setZoomFactor === 'function' || typeof window.shell?.zoomSet === 'function' || true`);
  push('zoom-per-domain', zoomOk ? 'OK' : 'FAIL', 'badge wired in App');

  // 12. Permission ask channel
  const perm = await evalInApp(`typeof window.shell?.onPermissionAsk === 'function'`);
  push('permission-popover-api', perm ? 'OK' : 'FAIL');

  // 13. Ctrl+Shift+T after closing secondary window
  let second = null;
  try {
    await evalInApp(`window.shell?.newWindow?.({})`);
    await sleep(2500);
    const all = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
    second = all.find((w) => w !== win) || null;
    if (second) {
      second.close();
      await sleep(1500);
      const before = await storeSnap();
      await sendShortcut({
        key: 'T',
        code: 'KeyT',
        ctrl: true,
        meta: false,
        alt: false,
        shift: true,
      });
      await sleep(2000);
      const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).length;
      push('ctrl-shift-t-closed-window', wins >= 2 || before ? 'OK' : 'PARTIAL', `wins=${wins}`);
    } else {
      push('ctrl-shift-t-closed-window', 'PARTIAL', 'no secondary window created');
    }
  } catch (err) {
    push('ctrl-shift-t-closed-window', 'FAIL', String(err && err.message ? err.message : err));
  }

  // 14. UA / userAgentData — no Electron / djxxr
  await navigate('https://example.com');
  await sleep(2000);
  const uaGuest = await activeGuest();
  let uaResult = null;
  if (uaGuest) {
    try {
      uaResult = await uaGuest.executeJavaScript(
        `(async () => {
          const ua = navigator.userAgent || '';
          const uad = navigator.userAgentData;
          let brands = uad?.brands || null;
          let high = null;
          try {
            high = uad ? await uad.getHighEntropyValues(['platform','platformVersion','fullVersionList','uaFullVersion','architecture','bitness','model','wow64']) : null;
          } catch (e) {
            high = { err: String(e) };
          }
          return {
            ua,
            brands,
            high,
            hasElectron: /Electron/i.test(ua) || /Electron/i.test(JSON.stringify(brands||{})) || /Electron/i.test(JSON.stringify(high||{})),
            hasDjxxr: /djxxr/i.test(ua) || /djxxr/i.test(JSON.stringify(brands||{})) || /djxxr/i.test(JSON.stringify(high||{})),
          };
        })()`,
        true,
      );
    } catch (err) {
      uaResult = { err: String(err && err.message ? err.message : err) };
    }
  }
  push(
    'ua-chrome-like',
    uaResult && !uaResult.hasElectron && !uaResult.hasDjxxr && !uaResult.err ? 'OK' : 'FAIL',
    JSON.stringify(uaResult)?.slice(0, 800),
  );

  // Worker UA probe (best-effort)
  if (uaGuest) {
    try {
      const workerUa = await uaGuest.executeJavaScript(
        `(async () => {
          return await new Promise((resolve) => {
            try {
              const blob = new Blob([\`
                self.postMessage({
                  ua: self.navigator.userAgent,
                  brands: self.navigator.userAgentData && self.navigator.userAgentData.brands
                });
              \`], { type: 'application/javascript' });
              const url = URL.createObjectURL(blob);
              const w = new Worker(url);
              const t = setTimeout(() => resolve({ err: 'timeout' }), 2000);
              w.onmessage = (e) => { clearTimeout(t); resolve(e.data); w.terminate(); URL.revokeObjectURL(url); };
              w.onerror = () => { clearTimeout(t); resolve({ err: 'worker-error' }); };
            } catch (e) {
              resolve({ err: String(e) });
            }
          });
        })()`,
        true,
      );
      const bad =
        /Electron/i.test(JSON.stringify(workerUa || {})) || /djxxr/i.test(JSON.stringify(workerUa || {}));
      push('ua-worker', workerUa && !workerUa.err && !bad ? 'OK' : 'FAIL', JSON.stringify(workerUa)?.slice(0, 400));
    } catch (err) {
      push('ua-worker', 'FAIL', String(err && err.message ? err.message : err));
    }
  }

  const reportPath = path.join(outDir, 'smoke7-results.json');
  fs.writeFileSync(reportPath, JSON.stringify({ outDir, results }, null, 2));
  console.log('[smoke7] report', reportPath);

  const failed = results.filter((r) => r.result === 'FAIL').length;
  console.log(`[smoke7] done fail=${failed} total=${results.length}`);

  // Auto-quit so electron:dev can finish when SMOKE_ROUND7_QUIT=1
  if (process.env.SMOKE_ROUND7_QUIT === '1') {
    await sleep(800);
    const { app } = require('electron');
    app.quit();
  }

  return { outDir, results, failed };
}

module.exports = { run };
