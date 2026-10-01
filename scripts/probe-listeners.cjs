'use strict';

/**
 * MaxListeners stress: 30 tabs churn + 5 windows. PERF_PROBE_LISTENERS=1
 */
const { app, BrowserWindow } = require('electron');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run(getMainWindow) {
  if (app.isPackaged) return;
  const warnings = [];
  const orig = process.emitWarning;
  process.emitWarning = function patched(warning, ...args) {
    const msg = typeof warning === 'string' ? warning : warning?.message || String(warning);
    if (/MaxListeners/i.test(msg) || /MaxListeners/i.test(String(args[0] || ''))) {
      warnings.push({ msg, args: args.map(String), at: Date.now() });
    }
    return orig.call(this, warning, ...args);
  };
  process.on('warning', (w) => {
    if (/MaxListeners/i.test(String(w?.name || '')) || /MaxListeners/i.test(String(w?.message || ''))) {
      warnings.push({ msg: String(w.message || w), at: Date.now() });
    }
  });

  await app.whenReady();
  await sleep(2500);
  const win = getMainWindow?.();
  if (!win || win.isDestroyed()) {
    console.log('[probe-listeners] no window');
    app.quit();
    return;
  }

  const evalInApp = (code) => win.webContents.executeJavaScript(code, true);

  // open 30 tabs then close down to 1
  await evalInApp(`(() => {
    const st = window.__DJXXR_STORE__?.getState?.();
    if (!st) return { err: 'no-store' };
    for (let i = 0; i < 30; i++) st.newTab('https://example.com');
    return { tabs: st.tabs.length };
  })()`);
  await sleep(8000);
  await evalInApp(`(() => {
    const st = window.__DJXXR_STORE__?.getState?.();
    const ids = st.tabs.map(t => t.id);
    const keep = st.activeId || ids[0];
    for (const id of ids) if (id !== keep) st.closeTab(id);
    return { tabs: window.__DJXXR_STORE__.getState().tabs.length };
  })()`);
  await sleep(1500);

  // 5 secondary windows open+close
  for (let i = 0; i < 5; i++) {
    try {
      await evalInApp(`window.shell?.newWindow?.({})`);
    } catch {
      /* */
    }
    await sleep(600);
  }
  await sleep(1000);
  const all = BrowserWindow.getAllWindows();
  let closed = 0;
  for (const w of all) {
    if (w !== win && !w.isDestroyed()) {
      w.close();
      closed += 1;
    }
  }
  await sleep(1500);

  console.log(
    '[probe-listeners]',
    JSON.stringify({
      warnings: warnings.length,
      samples: warnings.slice(0, 5),
      secondaryClosed: closed,
      windowsLeft: BrowserWindow.getAllWindows().length,
    }),
  );
  process.emitWarning = orig;
  app.quit();
}

module.exports = { run };
