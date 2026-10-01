/**
 * Live probe: background tabs stay alive (Chrome-like keep) + adblock boot timing.
 * Loaded when PERF_VERIFY_TABS=1 (or run via smoke harness).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(getMainWindow) {
  const out = {
    at: new Date().toISOString(),
    backgroundOpen: null,
    keepAlive: null,
    adblock: null,
    listeners: null,
    ok: false,
  };
  await sleep(2500);
  let win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  for (let i = 0; i < 20 && (!win || win.isDestroyed()); i++) {
    await sleep(400);
    win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  }
  if (!win || win.isDestroyed()) {
    console.error('[perf-verify-tabs] no window');
    process.exitCode = 2;
    return out;
  }
  const { webContents } = require('electron');
  const wc = win.webContents;
  const evalInApp = (code) => wc.executeJavaScript(code, true);

  // --- 1) Background tab (Ctrl+click style): newTab background must mount webview & start load ---
  const bg = await evalInApp(`(async () => {
    const st = window.__DJXXR_STORE__.getState();
    const before = document.querySelectorAll('webview').length;
    const idBefore = st.activeId;
    st.newTab('https://example.com/?bg=' + Date.now(), { background: true });
    await new Promise(r => setTimeout(r, 1500));
    const st2 = window.__DJXXR_STORE__.getState();
    const tabs = st2.tabs;
    const bgTab = tabs.find(t => t.id !== idBefore && t.url.includes('example.com/?bg='));
    const webviews = [...document.querySelectorAll('webview')].map(el => {
      let id = null, src = '';
      try { id = el.getWebContentsId?.() ?? null; } catch {}
      try { src = el.getAttribute('src') || ''; } catch {}
      return { id, src, hidden: el.classList.contains('hidden') };
    });
    return {
      activeUnchanged: st2.activeId === idBefore,
      bgTab: bgTab ? { id: bgTab.id, url: bgTab.url, discarded: !!bgTab.discarded } : null,
      webviewCountBefore: before,
      webviewCountAfter: webviews.length,
      webviews,
      bgWebviewMounted: bgTab ? webviews.some(w => w.src && w.src.includes('example.com/?bg=')) : false,
    };
  })()`);
  out.backgroundOpen = bg;

  // Wait for bg guest to finish loading without activating
  await sleep(3000);
  const bgLive = await evalInApp(`(() => {
    const st = window.__DJXXR_STORE__.getState();
    const bg = st.tabs.find(t => t.url.includes('example.com/?bg='));
    if (!bg) return { err: 'no-bg' };
    const wvs = [...document.querySelectorAll('webview')];
    let guestUrl = null;
    let guestId = null;
    for (const el of wvs) {
      try {
        const src = el.getAttribute('src') || '';
        if (src.includes('example.com/?bg=')) {
          guestId = el.getWebContentsId?.() ?? null;
          guestUrl = src;
        }
      } catch {}
    }
    return { bgId: bg.id, discarded: !!bg.discarded, guestId, guestUrl, title: bg.title };
  })()`);
  out.backgroundOpen = { ...bg, afterLoad: bgLive };

  // --- 2) Keep-alive: visit tab, switch away, webview stays mounted, no reload ---
  const keep = await evalInApp(`(async () => {
    const st = window.__DJXXR_STORE__.getState();
    st.newTab('https://example.com/?keep=' + Date.now(), { background: false });
    await new Promise(r => setTimeout(r, 2500));
    const st1 = window.__DJXXR_STORE__.getState();
    const keepId = st1.activeId;
    const wv = document.querySelector('webview:not(.hidden)');
    let wcId = null;
    try { wcId = wv?.getWebContentsId?.() ?? null; } catch {}
    // mark DOM so we can detect reload
    if (wv) {
      try {
        await wv.executeJavaScript("window.__DJXXR_KEEP_MARK = 'alive-' + Date.now(); document.title = document.title + ' [keep]'; true");
      } catch (e) {
        return { err: 'mark-failed', detail: String(e.message || e), wcId };
      }
    }
    const mark = wv ? await wv.executeJavaScript('window.__DJXXR_KEEP_MARK', true).catch(e => String(e)) : null;
    // switch to other tab
    const other = st1.tabs.find(t => t.id !== keepId)?.id;
    if (other) st1.setActive(other);
    await new Promise(r => setTimeout(r, 1500));
    const st2 = window.__DJXXR_STORE__.getState();
    const stillMounted = [...document.querySelectorAll('webview')].some(el => {
      try { return el.getWebContentsId?.() === wcId; } catch { return false; }
    });
    // switch back
    st2.setActive(keepId);
    await new Promise(r => setTimeout(r, 800));
    const wv2 = [...document.querySelectorAll('webview')].find(el => {
      try { return el.getWebContentsId?.() === wcId; } catch { return false; }
    });
    let mark2 = null;
    let sameWc = false;
    if (wv2) {
      sameWc = true;
      try { mark2 = await wv2.executeJavaScript('window.__DJXXR_KEEP_MARK', true); } catch (e) { mark2 = String(e.message || e); }
    }
    return {
      keepId,
      wcId,
      mark,
      stillMountedWhileBackground: stillMounted,
      sameWcAfterReturn: sameWc,
      markSurvived: mark && mark2 === mark,
      discarded: !!st2.tabs.find(t => t.id === keepId)?.discarded,
    };
  })()`);
  out.keepAlive = keep;

  // --- 3) Adblock timing + recent blocked ---
  try {
    const adblock = require('../electron/adblock-plus.cjs');
    out.adblock = {
      status: adblock.getStatus(),
      boot: adblock.getBootTiming(),
      recentBlocked: (adblock.getRecentBlocked('global') || []).slice(0, 15),
    };
  } catch (e) {
    out.adblock = { err: String(e.message || e) };
  }

  // --- 4) Listener counts after opening several tabs ---
  await evalInApp(`(async () => {
    const st = window.__DJXXR_STORE__.getState();
    for (let i = 0; i < 12; i++) {
      st.newTab('https://example.com/?n=' + i, { background: true });
      await new Promise(r => setTimeout(r, 100));
    }
    const ids = st.tabs.map(t => t.id);
    for (const id of ids.slice(0, 12)) {
      st.setActive(id);
      await new Promise(r => setTimeout(r, 80));
    }
    return ids.length;
  })()`);
  await sleep(2000);
  try {
    const { BrowserWindow } = require('electron');
    const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed());
    const guests = webContents.getAllWebContents().filter((g) => {
      try {
        return g.getType?.() === 'webview';
      } catch {
        return false;
      }
    });
    out.listeners = {
      window: {
        focus: w?.listenerCount('focus'),
        resized: w?.listenerCount('resized'),
        closed: w?.listenerCount('closed'),
        fanout: require('../electron/window-events.cjs').counts(w),
      },
      guests: guests.slice(0, 5).map((g) => ({
        id: g.id,
        didStopLoading: g.listenerCount('did-stop-loading'),
        fanout: require('../electron/webcontents-events.cjs').counts(g),
      })),
      guestCount: guests.length,
    };
  } catch (e) {
    out.listeners = { err: String(e.message || e) };
  }

  out.ok =
    Boolean(out.backgroundOpen?.bgWebviewMounted) &&
    Boolean(out.backgroundOpen?.activeUnchanged) &&
    Boolean(out.keepAlive?.stillMountedWhileBackground) &&
    Boolean(out.keepAlive?.markSurvived) &&
    (out.listeners?.window?.focus || 0) <= 3 &&
    (out.listeners?.window?.closed || 0) <= 5;

  const dir = path.join(os.tmpdir(), 'djxxr-perf-verify');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `tabs-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log('[perf-verify-tabs]', JSON.stringify(out, null, 2));
  console.log('[perf-verify-tabs] wrote', file, 'ok=', out.ok);
  return out;
}

module.exports = { run };

if (require.main === module) {
  console.error('Load from Electron main with PERF_VERIFY_TABS=1');
  process.exit(1);
}
