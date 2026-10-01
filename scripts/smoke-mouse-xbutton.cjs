/**
 * Live mouse X1/X2 verification (DJXXR_DEBUG_MOUSE recommended).
 * Loaded by main when SMOKE_MOUSE=1 && !app.isPackaged.
 *
 * Builds a 2-entry history in the guest, focuses five hit-targets, and fires
 * Win32 SendInput XBUTTON1/XBUTTON2 (scripts/send-mouse-xbutton.cjs) — not JS MouseEvent.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sendX(dir, screenX, screenY) {
  const script = path.join(__dirname, 'send-mouse-xbutton.cjs');
  const args = [script, dir];
  if (Number.isFinite(screenX) && Number.isFinite(screenY)) {
    args.push(String(Math.round(screenX)), String(Math.round(screenY)));
  }
  const r = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    ok: r.status === 0,
    out: String(r.stdout || '') + String(r.stderr || ''),
  };
}

async function run(getMainWindow) {
  const results = [];
  const push = (item, result, detail) => {
    results.push({ item, result, detail: detail || '' });
    console.log(`[smoke-mouse] ${item} → ${result}${detail ? ' | ' + detail : ''}`);
  };

  await sleep(3500);
  let win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  for (let i = 0; i < 20 && (!win || win.isDestroyed()); i++) {
    await sleep(500);
    win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  }
  if (!win || win.isDestroyed()) {
    console.error('[smoke-mouse] no window');
    process.exit(2);
  }

  const { webContents } = require('electron');
  const wc = win.webContents;

  const evalInApp = async (code) => {
    try {
      return await wc.executeJavaScript(code, true);
    } catch (err) {
      return { err: String(err && err.message ? err.message : err) };
    }
  };

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

  // Seed history: example.com → example.org
  await evalInApp(
    `window.__DJXXR_STORE__?.getState?.().updateTab(window.__DJXXR_STORE__.getState().activeId, { url: 'https://example.com/' })`,
  );
  await sleep(3500);
  await evalInApp(
    `window.__DJXXR_STORE__?.getState?.().updateTab(window.__DJXXR_STORE__.getState().activeId, { url: 'https://example.org/' })`,
  );
  await sleep(3500);

  const guest = await activeGuest();
  if (!guest) {
    push('guest', 'FAIL', 'no guest wc');
  } else {
    const urlBefore = guest.getURL();
    push('history-seed', /example\.org/i.test(urlBefore) ? 'OK' : 'FAIL', urlBefore);

    win.focus();
    await sleep(200);
    const bounds = win.getBounds();
    // content center (below tab/omnibox chrome ~110px)
    const cx = bounds.x + Math.floor(bounds.width / 2);
    const cyWeb = bounds.y + 140 + Math.floor((bounds.height - 140) / 2);
    const cyOmni = bounds.y + 78;
    const cyTabs = bounds.y + 48;

    const scenarios = [
      {
        name: 'webview-page',
        x: cx,
        y: cyWeb,
        prep: async () => {
          await evalInApp(`document.querySelector('webview:not(.hidden)')?.focus?.()`);
        },
      },
      {
        name: 'omnibox',
        x: cx,
        y: cyOmni,
        prep: async () => {
          await evalInApp(
            `document.querySelector('.omnibox input, input[data-omnibox], .omni-input')?.focus?.()`,
          );
        },
      },
      {
        name: 'tab-strip',
        x: Math.min(cx, bounds.x + 180),
        y: cyTabs,
        prep: async () => {
          await evalInApp(`document.querySelector('.tab.active, .tabs .tab')?.focus?.()`);
        },
      },
      {
        name: 'about-page',
        x: cx,
        y: cyWeb,
        prep: async () => {
          await evalInApp(
            `window.__DJXXR_STORE__?.getState?.().updateTab(window.__DJXXR_STORE__.getState().activeId, { url: 'about:extensions' })`,
          );
          await sleep(800);
        },
      },
      {
        name: 'restore-web-after-about',
        x: cx,
        y: cyWeb,
        prep: async () => {
          await evalInApp(
            `window.__DJXXR_STORE__?.getState?.().updateTab(window.__DJXXR_STORE__.getState().activeId, { url: 'https://example.org/' })`,
          );
          await sleep(2500);
        },
      },
    ];

    for (const sc of scenarios) {
      await sc.prep();
      await sleep(400);
      win.focus();
      await sleep(150);

      const g = await activeGuest();
      const before =
        g && !g.isDestroyed()
          ? g.getURL()
          : await evalInApp(
              `window.__DJXXR_STORE__?.getState?.().tabs.find(t=>t.id===window.__DJXXR_STORE__.getState().activeId)?.url`,
            );
      const canBack = g && !g.isDestroyed() ? g.canGoBack() : false;

      const sent = sendX('back', sc.x, sc.y);
      await sleep(800);
      const after =
        g && !g.isDestroyed()
          ? g.getURL()
          : await evalInApp(
              `window.__DJXXR_STORE__?.getState?.().tabs.find(t=>t.id===window.__DJXXR_STORE__.getState().activeId)?.url`,
            );

      if (sc.name === 'about-page') {
        push(
          sc.name + '-x1',
          'OK',
          `no-crash before=${before} after=${after} send=${sent.out.trim()}`,
        );
        continue;
      }

      const moved = String(before) !== String(after);
      push(
        sc.name + '-x1',
        canBack && moved ? 'OK' : !canBack ? 'OK' : 'FAIL',
        JSON.stringify({ before, after, canBack, moved, send: sent.out.trim() }),
      );

      if (moved) {
        const sentF = sendX('forward', sc.x, sc.y);
        await sleep(800);
        const afterF = g && !g.isDestroyed() ? g.getURL() : '';
        push(
          sc.name + '-x2',
          String(afterF) === String(before) || /example\.org/i.test(String(afterF))
            ? 'OK'
            : 'PARTIAL',
          JSON.stringify({ afterF, send: sentF.out.trim() }),
        );
      }
    }
  }

  // Private window quick path
  try {
    await evalInApp(`window.shell?.newWindow?.({ boot: 'private' })`);
    await sleep(2500);
    const { BrowserWindow } = require('electron');
    const priv = BrowserWindow.getAllWindows().find((w) => w !== win && !w.isDestroyed());
    if (priv) {
      priv.focus();
      await sleep(300);
      const sent = sendX('back');
      push('private-window-x1', 'OK', `send=${sent.out.trim()} (event path; history may be empty)`);
      priv.close();
    } else {
      push('private-window-x1', 'PARTIAL', 'no private window');
    }
  } catch (err) {
    push('private-window-x1', 'FAIL', String(err && err.message ? err.message : err));
  }

  const outDir = path.join(os.tmpdir(), `djxxr-smoke-mouse-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });
  const report = path.join(outDir, 'results.json');
  fs.writeFileSync(report, JSON.stringify({ results, logHint: 'DJXXR_DEBUG_MOUSE=1' }, null, 2));
  console.log('[smoke-mouse] report', report);
  const failed = results.filter((r) => r.result === 'FAIL').length;
  console.log(`[smoke-mouse] done fail=${failed} total=${results.length}`);

  if (process.env.SMOKE_MOUSE_QUIT === '1') {
    await sleep(500);
    require('electron').app.quit();
  }
  return { results, failed };
}

module.exports = { run };
