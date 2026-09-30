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

  // Inject widgets + flip edit via Zustand if exposed, else localStorage + reload
  const injected = await win.webContents.executeJavaScript(`
    (() => {
      const KEY = Object.keys(localStorage).find((k) => k.includes('moja-przegladarka') || k.includes('przegladarka')) || null;
      const raw = KEY ? localStorage.getItem(KEY) : null;
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch {}
      // Try clicking personalize path with diagnostics
      const fab = document.querySelector('.home-fab');
      fab?.click();
      return {
        key: KEY,
        hasState: !!parsed,
        widgetCount: parsed?.state?.settings?.homeWidgets?.length
          ?? parsed?.settings?.homeWidgets?.length
          ?? null,
        fab: !!fab,
      };
    })()
  `);
  await sleep(700);
  const sheet = await win.webContents.executeJavaScript(`
    (() => {
      const tabs = [...document.querySelectorAll('.pz-sheet-tabs .ui-seg button')].map((b) => b.textContent.trim());
      const sheetOpen = !!document.querySelector('.pz-sheet');
      ([...document.querySelectorAll('.pz-sheet-tabs .ui-seg button')][2])?.click();
      return { sheetOpen, tabs };
    })()
  `);
  await sleep(500);
  const widgetsTab = await win.webContents.executeJavaScript(`
    (() => {
      const h3 = [...document.querySelectorAll('.pz-sheet-scroll h3')].map((h) => h.textContent);
      const rec = !!document.querySelector('.pz-rec-add');
      const editBtn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Edytuj układ'));
      const rows = document.querySelectorAll('.pz-widget-row').length;
      if (rec) document.querySelector('.pz-rec-add').click();
      return { h3, rec, hasEdit: !!editBtn, rows, editText: editBtn?.textContent };
    })()
  `);
  await sleep(600);
  const afterAdd = await win.webContents.executeJavaScript(`
    (() => {
      const editBtn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Edytuj układ'));
      editBtn?.click();
      return { clicked: !!editBtn, rows: document.querySelectorAll('.pz-widget-row').length };
    })()
  `);
  await sleep(1000);
  const editState = await win.webContents.executeJavaScript(`
    (() => {
      const home = document.querySelector('.home');
      const card = document.querySelector('.hw-card');
      return {
        editing: home?.classList.contains('is-editing-widgets'),
        customizing: home?.classList.contains('is-customizing'),
        sheetOpen: !!document.querySelector('.pz-sheet'),
        cards: document.querySelectorAll('.hw-card').length,
        editable: document.querySelectorAll('.hw-card.editable').length,
        bar: !!document.querySelector('.hw-edit-bar'),
        style: card?.getAttribute('style') || null,
        transform: card ? getComputedStyle(card).transform : null,
      };
    })()
  `);

  const out = { injected, sheet, widgetsTab, afterAdd, editState };
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(__dirname, '..', 'tmp-verify', 'edit-path.json'), JSON.stringify(out, null, 2));

  // If still not editing, force via DOM class + direct store patch through settings button path
  if (!editState.editing) {
    await win.webContents.executeJavaScript(`
      (() => {
        // Last resort: dispatch custom event / click fab-add path
        const home = document.querySelector('.home');
        // click personalize then edit again after ensuring widget
        document.querySelector('.home-fab')?.click();
      })()
    `);
    await sleep(500);
    await win.webContents.executeJavaScript(`
      ([...document.querySelectorAll('.pz-sheet-tabs .ui-seg button')][2])?.click()
    `);
    await sleep(400);
    await win.webContents.executeJavaScript(`
      (() => {
        const b = [...document.querySelectorAll('.pz-secondary-btn, button')].find((x) =>
          (x.textContent || '').includes('Edytuj układ'),
        );
        console.log('edit btn', b && b.outerHTML.slice(0, 200));
        b?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      })()
    `);
    await sleep(1000);
    const again = await win.webContents.executeJavaScript(`
      ({
        editing: document.querySelector('.home')?.classList.contains('is-editing-widgets'),
        cards: document.querySelectorAll('.hw-card').length,
        editable: document.querySelectorAll('.hw-card.editable').length,
        bar: !!document.querySelector('.hw-edit-bar'),
      })
    `);
    console.log('retry', JSON.stringify(again));
    out.retry = again;
    fs.writeFileSync(path.join(__dirname, '..', 'tmp-verify', 'edit-path.json'), JSON.stringify(out, null, 2));
  }

  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '..', 'tmp-verify', '09-edit-path.png'), img.toPNG());
  app.quit();
});
