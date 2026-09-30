const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await sleep(2500);

  // Force-enter edit via React store + ensure weather widget
  await win.webContents.executeJavaScript(`
    (() => {
      const fab = document.querySelector('.home-fab');
      fab?.click();
    })()
  `);
  await sleep(500);
  await win.webContents.executeJavaScript(`
    ([...document.querySelectorAll('.pz-sheet-tabs .ui-seg button')][2])?.click()
  `);
  await sleep(400);
  // Add if empty
  await win.webContents.executeJavaScript(`
    (() => {
      const add = document.querySelector('.pz-rec-add');
      if (add) add.click();
    })()
  `);
  await sleep(400);
  await win.webContents.executeJavaScript(`
    ([...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Edytuj układ')))?.click()
  `);
  await sleep(1000);

  const before = await win.webContents.executeJavaScript(`
    (() => {
      const card = document.querySelector('.hw-card.editable');
      const head = card?.querySelector('.hw-frame-head') || card;
      return {
        editing: !!document.querySelector('.home.is-editing-widgets'),
        hasBar: !!document.querySelector('.hw-edit-bar'),
        barPos: document.querySelector('.hw-edit-bar') ? getComputedStyle(document.querySelector('.hw-edit-bar')).position : null,
        style: card?.getAttribute('style'),
        transform: card ? getComputedStyle(card).transform : null,
        cursor: card ? getComputedStyle(card).cursor : null,
        headTag: head?.className || null,
      };
    })()
  `);

  const drag = await win.webContents.executeJavaScript(`
    (() => new Promise((resolve) => {
      const card = document.querySelector('.hw-card.editable');
      if (!card) return resolve({ ok: false, reason: 'no-card' });
      const head = card.querySelector('.hw-frame-title') || card.querySelector('.hw-frame-head') || card;
      const r = head.getBoundingClientRect();
      const sx = r.left + Math.min(40, r.width / 2);
      const sy = r.top + r.height / 2;
      const before = getComputedStyle(card).transform;

      const down = new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, composed: true,
        clientX: sx, clientY: sy, pointerId: 7, pointerType: 'mouse', buttons: 1, view: window,
      });
      head.dispatchEvent(down);
      // also on card in case head is interactive-skipped
      card.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, composed: true,
        clientX: sx, clientY: sy, pointerId: 7, pointerType: 'mouse', buttons: 1, view: window,
      }));

      let step = 0;
      const tick = () => {
        step += 1;
        const x = sx + step * 16;
        const y = sy + step * 6;
        const move = new PointerEvent('pointermove', {
          bubbles: true, cancelable: true, composed: true,
          clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse', buttons: 1, view: window,
        });
        card.dispatchEvent(move);
        if (step < 10) {
          requestAnimationFrame(tick);
        } else {
          const mid = getComputedStyle(card).transform;
          card.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true, cancelable: true, composed: true,
            clientX: sx + 160, clientY: sy + 60, pointerId: 7, pointerType: 'mouse', buttons: 0, view: window,
          }));
          requestAnimationFrame(() => {
            resolve({
              ok: true,
              before,
              mid,
              after: getComputedStyle(card).transform,
              style: card.getAttribute('style'),
              dragging: card.classList.contains('is-dragging'),
            });
          });
        }
      };
      requestAnimationFrame(tick);
    }))()
  `);

  const out = { before, drag };
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(__dirname, '..', 'tmp-verify', 'drag2.json'), JSON.stringify(out, null, 2));

  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '..', 'tmp-verify', '08-drag-proof.png'), img.toPNG());
  app.quit();
});
