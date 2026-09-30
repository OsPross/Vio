const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'tmp-verify');
const DEV = process.env.VITE_DEV_SERVER || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function js(win, code) {
  return win.webContents.executeJavaScript(code, true);
}
async function shot(win, name) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());
  console.log('saved', name);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    show: false,
    backgroundColor: '#08090c',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
    },
  });
  await win.loadURL(DEV);
  for (let i = 0; i < 40; i++) {
    if (await js(win, `!!document.querySelector('.hw-canvas')`)) break;
    await sleep(200);
  }
  // seed left + history
  await js(
    win,
    `(${function () {
      const key = Object.keys(localStorage).find((k) => k.includes('moja-przegladarka'));
      const raw = JSON.parse(localStorage.getItem(key) || '{}');
      raw.state.history = [
        { q: 'verify-alpha', at: Date.now() },
        { q: 'verify-beta', at: Date.now() - 1 },
      ];
      Object.assign(raw.state.settings, {
        theme: 'midnight',
        homeLayoutPreset: 'left',
        homeAlign: 'left',
        homeShowClock: true,
        homeShowApps: true,
        homeWidgetStyle: 'glass',
        homeChrome: [
          { id: 'clock', anchor: 'left', x: 35, y: 8 },
          { id: 'search', anchor: 'left', x: 40, y: 31 },
          { id: 'shortcuts', anchor: 'left', x: 40, y: 44 },
        ],
        homeWidgets: [
          {
            id: 'w-weather-verify',
            type: 'weather',
            size: 'M',
            anchor: 'left',
            x: 19,
            y: 60,
            settings: {},
          },
        ],
      });
      localStorage.setItem(key, JSON.stringify(raw));
      location.reload();
    }.toString()})()`,
  );
  for (let i = 0; i < 40; i++) {
    if (await js(win, `!!document.querySelector('.hw-place-left')`)) break;
    await sleep(200);
  }
  win.showInactive();
  await sleep(400);
  const leftProbe = await js(
    win,
    `(() => {
      const canvas = document.querySelector('.hw-canvas');
      const card = document.querySelector('.hw-chrome-search');
      if (!canvas || !card) return null;
      const cr = canvas.getBoundingClientRect();
      const r = card.getBoundingClientRect();
      return {
        leftEdgePct: ((r.left - cr.left) / canvas.offsetWidth) * 100,
        hasLeftClass: card.classList.contains('hw-place-left'),
        anchor: getComputedStyle(card).left,
      };
    })()`,
  );
  console.log('leftProbe', JSON.stringify(leftProbe));
  await shot(win, 'fix-left');

  // edit + gear on weather (bottom card)
  await js(win, `document.querySelector('.home-fab')?.click()`);
  await sleep(400);
  await js(win, `([...document.querySelectorAll('.pz-sheet-tabs .ui-seg button')][2])?.click()`);
  await sleep(300);
  await js(
    win,
    `([...document.querySelectorAll('button')].find(b=>(b.textContent||'').includes('Edytuj układ')))?.click()`,
  );
  await sleep(700);
  await js(win, `document.querySelector('.hw-type-weather .hw-icon-btn')?.click()`);
  await sleep(400);
  const pop = await js(
    win,
    `(() => {
      const pop = document.querySelector('.hw-settings-pop');
      const card = document.querySelector('.hw-type-weather');
      if (!pop || !card) return null;
      const pr = pop.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      const overlap = !(pr.right < cr.left || pr.left > cr.right || pr.bottom < cr.top || pr.top > cr.bottom);
      return { overlap, popLeft: pr.left, cardRight: cr.right };
    })()`,
  );
  console.log('popProbe', JSON.stringify(pop));
  await shot(win, 'fix-gear');

  // sheet clock styles
  await js(win, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(200);
  await js(win, `document.querySelector('.home-fab')?.click()`);
  await sleep(400);
  await js(win, `([...document.querySelectorAll('.pz-sheet-tabs .ui-seg button')][3])?.click()`);
  await sleep(500);
  await shot(win, 'fix-clock-cards');

  // suggest
  await js(win, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(300);
  await js(
    win,
    `(() => {
      const input = document.querySelector('.home-search input');
      input?.focus();
      input?.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      return !!input;
    })()`,
  );
  await sleep(500);
  const sug = await js(win, `!!document.querySelector('.home-suggest-portal')`);
  console.log('suggest', sug);
  await shot(win, 'fix-suggest');

  app.quit();
});
