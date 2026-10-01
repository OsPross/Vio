/**
 * Notes layout captures — run via main:
 *   $env:CAPTURE_NOTES='1'; $env:CAPTURE_NOTES_QUIT='1'; $env:VITE_DEV_SERVER='http://127.0.0.1:5173'; npx electron .
 */
'use strict';

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'tmp-verify', 'notes-r8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(getMainWindow) {
  fs.mkdirSync(OUT, { recursive: true });
  await sleep(3500);
  let win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  for (let i = 0; i < 30 && (!win || win.isDestroyed()); i++) {
    await sleep(400);
    win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  }
  if (!win || win.isDestroyed()) {
    console.error('[capture-notes] no window');
    process.exit(2);
  }

  const evalInApp = (code) => win.webContents.executeJavaScript(code, true);

  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, img.toPNG());
    console.log('[capture-notes] saved', name);
  };

  // Place notes widget on home, hide other chrome for clean shots
  await evalInApp(`(() => {
    const st = window.__DJXXR_STORE__?.getState?.();
    if (!st) return false;
    st.patchSettings({
      theme: 'midnight',
      homeLayoutPreset: 'left',
      homeChrome: [],
      homeShowClock: false,
      homeShowApps: false,
      homeWidgets: [{
        id: 'w-notes-r8', type: 'notes', size: 'L', anchor: 'left', x: 6, y: 6, settings: {}
      }],
    });
    const tab = st.tabs.find(t => t.id === st.activeId);
    if (tab) st.updateTab(tab.id, { url: 'about:home' });
    st.setView('browser');
    return true;
  })()`);
  await sleep(1200);
  await evalInApp(`(() => {
    document.querySelectorAll('.hw-clock, .home-search, .hw-search, .home-dock, .hw-shortcuts, .hw-history, .home-suggest, .hw-recent, .home-history')
      .forEach((el) => { el.style.visibility = 'hidden'; });
    return true;
  })()`);

  const seedViaIpc = async (count) => {
    await evalInApp(`(async () => {
      const list = await window.shell.notesList({});
      for (const n of (list?.notes || [])) await window.shell.notesDelete(n.id);
      for (let i = 0; i < ${count}; i++) {
        await window.shell.notesCreate({
          body: 'Notatka ' + (i + 1) + '\\nDruga linia podglądu przykładowego tekstu.',
        });
      }
      return true;
    })()`);
    // Remount by briefly clearing widgets
    await evalInApp(`(() => {
      const st = window.__DJXXR_STORE__?.getState?.();
      const w = st.settings.homeWidgets;
      st.patchSettings({ homeWidgets: [] });
      setTimeout(() => st.patchSettings({ homeWidgets: w }), 50);
      return true;
    })()`);
    await sleep(800);
  };

  const forceWidth = async (w) => {
    win.setSize(Math.max(w + 80, 480), 900);
    await sleep(200);
    return evalInApp(`(() => {
      document.querySelectorAll('.hw-clock, .home-search, .hw-search, .home-dock, .hw-shortcuts, .home-history, .hw-recent')
        .forEach((el) => { el.style.visibility = 'hidden'; });
      const notes = document.querySelector('.hw-notes');
      const frame = notes?.closest('.hw-frame') || notes?.parentElement;
      if (frame) {
        frame.style.width = '${w}px';
        frame.style.height = '700px';
        frame.style.maxWidth = '${w}px';
        frame.style.left = '40px';
        frame.style.top = '80px';
        frame.style.position = 'fixed';
        frame.style.zIndex = '20';
      }
      if (notes) {
        notes.style.minHeight = '640px';
        notes.style.height = '100%';
        notes.style.width = '100%';
      }
      window.dispatchEvent(new Event('resize'));
      // Force layout read so ResizeObserver / resize listener sync is-wide
      void notes?.getBoundingClientRect();
      const list = notes?.querySelector('.hw-notes-list-pane');
      const editor = notes?.querySelector('.hw-notes-editor-pane');
      return {
        notesW: notes?.clientWidth || 0,
        wide: notes?.classList.contains('is-wide') || false,
        narrow: notes?.classList.contains('is-narrow') || false,
        listW: list ? Math.round(list.getBoundingClientRect().width) : 0,
        editorW: editor ? Math.round(editor.getBoundingClientRect().width) : 0,
        listVisible: Boolean(list),
      };
    })()`);
  };

  const cases = [
    { name: 'empty', count: 0 },
    { name: 'one', count: 1 },
    { name: 'fifty', count: 50 },
  ];

  const metrics = [];
  for (const c of cases) {
    console.log('[capture-notes] case', c.name);
    await seedViaIpc(c.count);
    for (const w of [360, 800, 1280]) {
      const m = await forceWidth(w);
      await sleep(500);
      const m2 = await evalInApp(`(() => {
        const notes = document.querySelector('.hw-notes');
        const list = notes?.querySelector('.hw-notes-list-pane');
        const editor = notes?.querySelector('.hw-notes-editor-pane');
        return {
          notesW: notes?.clientWidth || 0,
          wide: notes?.classList.contains('is-wide') || false,
          narrow: notes?.classList.contains('is-narrow') || false,
          listW: list ? Math.round(list.getBoundingClientRect().width) : 0,
          editorW: editor ? Math.round(editor.getBoundingClientRect().width) : 0,
          listVisible: Boolean(list),
        };
      })()`);
      const row = { case: c.name, target: w, ...(m2 || m) };
      console.log('[capture-notes] width', w, JSON.stringify(row));
      metrics.push(row);
      await shot(`notes-${c.name}-w${w}`);
    }
  }

  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log('[capture-notes] done', OUT);
  if (process.env.CAPTURE_NOTES_QUIT === '1') {
    await sleep(400);
    require('electron').app.quit();
  }
}

module.exports = { run };
