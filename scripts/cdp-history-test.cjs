'use strict';

/** Drive Electron via CDP: navigate 3 sites, open about:history, print history status. */
const http = require('http');

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const pages = await getJson('http://127.0.0.1:9222/json');
  const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
  if (!page) throw new Error('no page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });

  function send(method, params = {}) {
    const mid = ++id;
    return new Promise((resolve, reject) => {
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  // Confirm shell history API exists
  const api = await evaluate(`(async () => ({
    hasShell: !!window.shell,
    hasRecord: typeof window.shell?.historyRecordVisit,
    hasList: typeof window.shell?.historyList,
    status: await window.shell?.historyStatus?.(),
  }))()`);
  console.log('api', JSON.stringify(api, null, 2));

  // Record via IPC directly (proves main wiring)
  const direct = await evaluate(`(async () => {
    const a = await window.shell.historyRecordVisit({ url: 'https://example.com/cdp1', title: 'CDP1' });
    const b = await window.shell.historyRecordVisit({ url: 'https://wikipedia.org/wiki/CDP', title: 'CDP Wiki' });
    const c = await window.shell.historyRecordVisit({ url: 'https://github.com/cdp-test', title: 'CDP GH', typed: true });
    const list = await window.shell.historyList({ limit: 20 });
    return { a, b, c, total: list.total, urls: list.items.map(i => i.url).slice(0, 5) };
  })()`);
  console.log('direct', JSON.stringify(direct, null, 2));

  // Navigate via omnibox go path: set draft and submit
  // Focus omnibox and type URL
  async function goUrl(url) {
    await evaluate(`(async () => {
      const input = document.getElementById('omnibox-input');
      if (!input) throw new Error('no omnibox');
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputValueSetter.call(input, ${JSON.stringify(url)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      const form = input.closest('form');
      form?.requestSubmit?.() || form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return true;
    })()`);
    await sleep(3500);
  }

  await goUrl('https://example.com/');
  await goUrl('https://example.org/');
  await goUrl('https://example.net/');

  const afterNav = await evaluate(`(async () => {
    const list = await window.shell.historyList({ limit: 50 });
    return { total: list.total, urls: list.items.map(i => i.url) };
  })()`);
  console.log('afterNav', JSON.stringify(afterNav, null, 2));

  // Open history page via Ctrl+H simulation
  await evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true, bubbles: true }));
    return true;
  })()`);
  await sleep(800);

  const pageState = await evaluate(`({
    urlHint: document.querySelector('.history-page h1')?.textContent || null,
    countText: document.querySelector('.history-head .muted')?.textContent || null,
    rows: document.querySelectorAll('.history-row').length,
  })`);
  console.log('historyUi', JSON.stringify(pageState, null, 2));

  ws.close();
  const ok = (direct?.total || 0) >= 3;
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
