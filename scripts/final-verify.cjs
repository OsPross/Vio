const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(win, name) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '..', 'tmp-verify', `${name}.png`), img.toPNG());
  console.log('saved', name);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 920,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
    },
  });
  await win.loadURL(process.env.VITE_DEV_SERVER || 'http://127.0.0.1:5173');
  await sleep(2800);

  // Open sheet → widgets → edit
  await win.webContents.executeJavaScript(`document.querySelector('.home-fab')?.click()`);
  await sleep(600);
  await shot(win, '10-preview-look');

  await win.webContents.executeJavaScript(`
    ([...document.querySelectorAll('.pz-sheet-tabs .ui-seg button')][2])?.click()
  `);
  await sleep(500);
  await win.webContents.executeJavaScript(`
    ([...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Edytuj układ')))
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  `);
  await sleep(1000);

  const before = await win.webContents.executeJavaScript(`
    (() => {
      const card = document.querySelector('.hw-card.editable');
      return {
        editing: !!document.querySelector('.home.is-editing-widgets'),
        bar: !!document.querySelector('.hw-edit-bar'),
        barPos: document.querySelector('.hw-edit-bar') && getComputedStyle(document.querySelector('.hw-edit-bar')).position,
        barBottom: document.querySelector('.hw-edit-bar') && getComputedStyle(document.querySelector('.hw-edit-bar')).bottom,
        transform: card && getComputedStyle(card).transform,
        cursor: card && getComputedStyle(card).cursor,
        style: card && card.getAttribute('style'),
      };
    })()
  `);
  console.log('before', JSON.stringify(before));
  await shot(win, '11-edit');

  const drag = await win.webContents.executeJavaScript(`
    (() => new Promise((resolve) => {
      const card = document.querySelector('.hw-card.editable');
      if (!card) return resolve({ ok: false });
      // Hit empty padding on the frame header area (not inputs)
      const title = card.querySelector('.hw-frame-title');
      const target = title || card;
      const r = target.getBoundingClientRect();
      const sx = r.left + 8;
      const sy = r.top + r.height / 2;
      const beforeT = getComputedStyle(card).transform;
      target.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, composed: true,
        clientX: sx, clientY: sy, pointerId: 9, pointerType: 'mouse', buttons: 1, view: window,
      }));
      let i = 0;
      const step = () => {
        i += 1;
        card.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, cancelable: true, composed: true,
          clientX: sx + i * 20, clientY: sy + i * 8, pointerId: 9, pointerType: 'mouse', buttons: 1, view: window,
        }));
        if (i < 12) requestAnimationFrame(step);
        else {
          const mid = getComputedStyle(card).transform;
          card.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true, cancelable: true, composed: true,
            clientX: sx + 240, clientY: sy + 96, pointerId: 9, pointerType: 'mouse', buttons: 0, view: window,
          }));
          requestAnimationFrame(() => resolve({
            ok: true,
            beforeT,
            mid,
            after: getComputedStyle(card).transform,
            style: card.getAttribute('style'),
            changed: beforeT !== getComputedStyle(card).transform || mid !== beforeT,
          }));
        }
      };
      requestAnimationFrame(step);
    }))()
  `);
  console.log('drag', JSON.stringify(drag));
  await sleep(400);
  await shot(win, '12-after-drag');

  // Clock styles
  await win.webContents.executeJavaScript(`document.querySelector('.home-fab')?.click()`);
  await sleep(500);
  await win.webContents.executeJavaScript(`
    ([...document.querySelectorAll('.pz-sheet-tabs .ui-seg button')][3])?.click()
  `);
  await sleep(500);
  await shot(win, '13-clock-styles');

  // Look accent
  await win.webContents.executeJavaScript(`
    ([...document.querySelectorAll('.pz-sheet-tabs .ui-seg button')][0])?.click()
  `);
  await sleep(400);
  await win.webContents.executeJavaScript(`
    const s = document.querySelector('.pz-sheet-scroll');
    if (s) s.scrollTop = 9999;
  `);
  await sleep(400);
  await shot(win, '14-look-accent');

  fs.writeFileSync(
    path.join(__dirname, '..', 'tmp-verify', 'final-probe.json'),
    JSON.stringify({ before, drag }, null, 2),
  );
  app.quit();
});
