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
  await sleep(2800);

  // Known-good path from probe-edit-path retry
  await win.webContents.executeJavaScript(`document.querySelector('.home-fab')?.click()`);
  await sleep(700);
  await win.webContents.executeJavaScript(
    `([...document.querySelectorAll('.pz-sheet-tabs .ui-seg button')][2])?.click()`,
  );
  await sleep(800);
  await win.webContents.executeJavaScript(`
    (() => {
      const b = [...document.querySelectorAll('.pz-secondary-btn, button')].find((x) =>
        (x.textContent || '').includes('Edytuj układ'),
      );
      b?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return !!b;
    })()
  `);
  await sleep(1200);

  let state = await win.webContents.executeJavaScript(`
    ({
      editing: !!document.querySelector('.home.is-editing-widgets'),
      editable: document.querySelectorAll('.hw-card.editable').length,
      bar: !!document.querySelector('.hw-edit-bar'),
      transform: document.querySelector('.hw-card') && getComputedStyle(document.querySelector('.hw-card')).transform,
      zapisz: (() => {
        const b = [...document.querySelectorAll('.hw-btn')].find((x) => (x.textContent || '').includes('Zapisz'));
        if (!b) return null;
        const cs = getComputedStyle(b);
        return { disabled: b.disabled, opacity: cs.opacity, filter: cs.filter, bg: cs.backgroundColor, color: cs.color };
      })(),
      scale: document.querySelector('.scaled-preview-stage') && getComputedStyle(document.querySelector('.scaled-preview-stage')).transform,
    })
  `);
  console.log('state1', JSON.stringify(state));

  if (!state.editing) {
    await win.webContents.executeJavaScript(`document.querySelector('.home-fab')?.click()`);
    await sleep(600);
    await win.webContents.executeJavaScript(
      `([...document.querySelectorAll('.pz-sheet-tabs .ui-seg button')][2])?.click()`,
    );
    await sleep(800);
    await win.webContents.executeJavaScript(`
      [...document.querySelectorAll('.pz-secondary-btn, button')]
        .find((x) => (x.textContent || '').includes('Edytuj układ'))
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    `);
    await sleep(1200);
    state = await win.webContents.executeJavaScript(`
      ({
        editing: !!document.querySelector('.home.is-editing-widgets'),
        editable: document.querySelectorAll('.hw-card.editable').length,
        bar: !!document.querySelector('.hw-edit-bar'),
        barPos: document.querySelector('.hw-edit-bar') && getComputedStyle(document.querySelector('.hw-edit-bar')).position,
        barBottom: document.querySelector('.hw-edit-bar') && getComputedStyle(document.querySelector('.hw-edit-bar')).bottom,
        transform: document.querySelector('.hw-card.editable') && getComputedStyle(document.querySelector('.hw-card.editable')).transform,
        cursor: document.querySelector('.hw-card.editable') && getComputedStyle(document.querySelector('.hw-card.editable')).cursor,
      })
    `);
    console.log('state2', JSON.stringify(state));
  }

  const drag = await win.webContents.executeJavaScript(`
    (() => new Promise((resolve) => {
      const card = document.querySelector('.hw-card.editable');
      if (!card) return resolve({ ok: false, reason: 'no-card' });
      const title = card.querySelector('.hw-frame-title') || card;
      const r = title.getBoundingClientRect();
      const sx = r.left + 10;
      const sy = r.top + r.height / 2;
      const before = getComputedStyle(card).transform;
      const beforeStyle = card.getAttribute('style');
      title.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, composed: true,
        clientX: sx, clientY: sy, pointerId: 11, pointerType: 'mouse', buttons: 1, view: window,
      }));
      let i = 0;
      const tick = () => {
        i += 1;
        card.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, cancelable: true, composed: true,
          clientX: sx + i * 24, clientY: sy + i * 10, pointerId: 11, pointerType: 'mouse', buttons: 1, view: window,
        }));
        if (i < 15) requestAnimationFrame(tick);
        else {
          const mid = getComputedStyle(card).transform;
          const midStyle = card.getAttribute('style');
          card.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true, cancelable: true, composed: true,
            clientX: sx + 360, clientY: sy + 150, pointerId: 11, pointerType: 'mouse', buttons: 0, view: window,
          }));
          setTimeout(() => {
            resolve({
              ok: true,
              before,
              mid,
              after: getComputedStyle(card).transform,
              beforeStyle,
              midStyle,
              afterStyle: card.getAttribute('style'),
              moved: before !== getComputedStyle(card).transform || (midStyle && midStyle !== beforeStyle),
            });
          }, 100);
        }
      };
      requestAnimationFrame(tick);
    }))()
  `);
  console.log('drag', JSON.stringify(drag));

  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '..', 'tmp-verify', '15-drag-final.png'), img.toPNG());
  fs.writeFileSync(
    path.join(__dirname, '..', 'tmp-verify', '15-drag-final.json'),
    JSON.stringify({ state, drag }, null, 2),
  );
  app.quit();
});
