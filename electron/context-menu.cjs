/**
 * Native page context menu for guest webContents (webview tabs).
 * Prefer native Menu for reliability; React chrome menus stay in renderer.
 */
const { Menu, clipboard, nativeImage, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

/** @typedef {{
 *   getMainWindow: () => import('electron').BrowserWindow | null,
 *   isTor: (wc: Electron.WebContents) => boolean,
 *   isPrivate?: (wc: Electron.WebContents) => boolean,
 *   openUrl: (url: string, opts?: { tor?: boolean, private?: boolean, background?: boolean }) => void,
 *   askRenderer: (action: string, payload?: Record<string, unknown>) => void,
 *   canInspect?: () => boolean,
 * }} CtxDeps */

/**
 * @param {Electron.WebContents} wc
 * @param {CtxDeps} deps
 */
function attachContextMenu(wc, deps) {
  if (!wc || wc.isDestroyed()) return;
  if (wc.__djxxrCtxMenu) return;
  wc.__djxxrCtxMenu = true;

  // Spellcheck for guest editing (pl + en). Do not alter privacy preset flags.
  try {
    const ses = wc.session;
    if (ses && typeof ses.setSpellCheckerLanguages === 'function') {
      ses.setSpellCheckerLanguages(['pl', 'en-US']);
    }
    if (ses && typeof ses.setSpellCheckerEnabled === 'function') {
      ses.setSpellCheckerEnabled(true);
    }
  } catch {
    /* */
  }

  wc.on('context-menu', (event, params) => {
    try {
      event.preventDefault();
    } catch {
      /* */
    }
    showGuestContextMenu(wc, params, deps);
  });
}

/**
 * @param {Electron.WebContents} wc
 * @param {Electron.ContextMenuParams} params
 * @param {CtxDeps} deps
 */
function showGuestContextMenu(wc, params, deps) {
  if (!wc || wc.isDestroyed()) return;
  const tor = Boolean(deps.isTor(wc));
  const priv = !tor && Boolean(deps.isPrivate?.(wc));
  const win = deps.getMainWindow?.();
  const openSame = (url, extra = {}) =>
    deps.openUrl(url, { tor, private: priv, ...extra });
  const hasLink = Boolean(params.linkURL);
  const hasImg =
    params.mediaType === 'image' ||
    Boolean(params.hasImageContents) ||
    (Boolean(params.srcURL) && /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?|$)/i.test(params.srcURL));
  const hasMedia = params.mediaType === 'video' || params.mediaType === 'audio';
  const hasSelection = Boolean(params.selectionText && params.selectionText.trim());
  const isEditable = Boolean(params.isEditable);
  const selection = (params.selectionText || '').trim();
  const lookLikeUrl = /^(https?:\/\/|www\.)/i.test(selection) || /^[\w.-]+\.[a-z]{2,}([/:?].*)?$/i.test(selection);

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [];

  const pushSep = () => {
    if (template.length && template[template.length - 1].type !== 'separator') {
      template.push({ type: 'separator' });
    }
  };

  // —— Link ——
  if (hasLink) {
    template.push(
      {
        label: 'Otwórz link w nowej karcie',
        click: () => openSame(params.linkURL, { background: false }),
      },
      {
        label: 'Otwórz link w karcie w tle',
        click: () => openSame(params.linkURL, { background: true }),
      },
      {
        label: 'Otwórz link w nowym oknie',
        click: () => deps.askRenderer('open-window', { url: params.linkURL, tor, private: priv }),
      },
      {
        label: 'Otwórz link w oknie prywatnym',
        enabled: !tor && !priv,
        click: () => deps.openUrl(params.linkURL, { private: true }),
      },
      {
        label: 'Otwórz link w Torze',
        enabled: !tor,
        click: () => deps.openUrl(params.linkURL, { tor: true }),
      },
      { type: 'separator' },
      {
        label: 'Kopiuj adres linku',
        click: () => clipboard.writeText(params.linkURL),
      },
      {
        label: 'Zapisz link jako…',
        click: () => {
          try {
            wc.session.downloadURL(params.linkURL);
          } catch (err) {
            console.error('[ctx] save link', err);
          }
        },
      },
    );
    pushSep();
  }

  // —— Image ——
  if (hasImg && params.srcURL) {
    const imgUrl = params.srcURL;
    template.push(
      {
        label: 'Otwórz obraz w nowej karcie',
        click: () => openSame(imgUrl),
      },
      {
        label: 'Zapisz obraz jako…',
        click: () => {
          try {
            // Same session/partition as this guest (Tor-safe)
            wc.session.downloadURL(imgUrl);
          } catch (err) {
            console.error('[ctx] save image', err);
          }
        },
      },
      {
        label: 'Kopiuj obraz',
        click: () => {
          try {
            wc.copyImageAt(params.x, params.y);
          } catch (err) {
            console.error('[ctx] copyImageAt', err);
          }
        },
      },
      {
        label: 'Kopiuj adres obrazu',
        click: () => clipboard.writeText(imgUrl),
      },
      {
        label: 'Szukaj obrazu w Google Lens',
        enabled: !tor && /^https?:/i.test(imgUrl),
        click: () => {
          const lens = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imgUrl)}`;
          deps.openUrl(lens, { tor: false });
        },
      },
    );
    pushSep();
  }

  // —— Video / audio ——
  if (hasMedia) {
    const mediaUrl = params.srcURL || '';
    template.push(
      {
        label: 'Odtwórz / Pauza',
        click: () => {
          wc
            .executeJavaScript(
              `(() => { const el = document.elementFromPoint(${params.x}, ${params.y})?.closest?.('video,audio'); if (el) { if (el.paused) el.play(); else el.pause(); } })()`,
              true,
            )
            .catch(() => {});
        },
      },
      {
        label: 'Wycisz / Włącz dźwięk',
        click: () => {
          wc
            .executeJavaScript(
              `(() => { const el = document.elementFromPoint(${params.x}, ${params.y})?.closest?.('video,audio'); if (el) el.muted = !el.muted; })()`,
              true,
            )
            .catch(() => {});
        },
      },
      {
        label: 'Pętla',
        click: () => {
          wc
            .executeJavaScript(
              `(() => { const el = document.elementFromPoint(${params.x}, ${params.y})?.closest?.('video,audio'); if (el) el.loop = !el.loop; })()`,
              true,
            )
            .catch(() => {});
        },
      },
      {
        label: 'Pokaż kontrolki',
        click: () => {
          wc
            .executeJavaScript(
              `(() => { const el = document.elementFromPoint(${params.x}, ${params.y})?.closest?.('video,audio'); if (el) el.controls = true; })()`,
              true,
            )
            .catch(() => {});
        },
      },
      {
        label: 'Obraz w obrazie',
        enabled: params.mediaType === 'video',
        click: () => {
          wc
            .executeJavaScript(
              `(() => { const el = document.elementFromPoint(${params.x}, ${params.y})?.closest?.('video'); if (el && document.pictureInPictureEnabled) { if (document.pictureInPictureElement) document.exitPictureInPicture(); else el.requestPictureInPicture(); } })()`,
              true,
            )
            .catch(() => {});
        },
      },
      {
        label: params.mediaType === 'audio' ? 'Zapisz audio jako…' : 'Zapisz wideo jako…',
        enabled: Boolean(mediaUrl),
        click: () => {
          try {
            if (mediaUrl) wc.session.downloadURL(mediaUrl);
          } catch (err) {
            console.error('[ctx] save media', err);
          }
        },
      },
      {
        label: 'Kopiuj adres mediów',
        enabled: Boolean(mediaUrl),
        click: () => clipboard.writeText(mediaUrl),
      },
    );
    pushSep();
  }

  // —— Selection ——
  if (hasSelection && !isEditable) {
    template.push({
      label: 'Kopiuj',
      role: 'copy',
      accelerator: 'CmdOrCtrl+C',
    });
    template.push({
      label: `Szukaj „${selection.slice(0, 32)}${selection.length > 32 ? '…' : ''}”`,
      click: () => deps.askRenderer('search-selection', { text: selection, tor, private: priv }),
    });
    if (lookLikeUrl) {
      const url = /^https?:\/\//i.test(selection) ? selection : `https://${selection}`;
      template.push({
        label: 'Otwórz jako link',
        click: () => openSame(url),
      });
    }
    pushSep();
  }

  // —— Editable ——
  if (isEditable) {
    const suggestions = Array.isArray(params.dictionarySuggestions)
      ? params.dictionarySuggestions.slice(0, 6)
      : [];
    for (const word of suggestions) {
      template.push({
        label: word,
        click: () => {
          try {
            wc.replaceMisspelling(word);
          } catch {
            /* */
          }
        },
      });
    }
    if (params.misspelledWord) {
      template.push({
        label: 'Dodaj do słownika',
        click: () => {
          try {
            wc.session.addWordToSpellCheckerDictionary(params.misspelledWord);
          } catch {
            /* */
          }
        },
      });
    }
    if (suggestions.length || params.misspelledWord) pushSep();

    template.push(
      { label: 'Cofnij', role: 'undo', accelerator: 'CmdOrCtrl+Z', enabled: params.editFlags?.canUndo !== false },
      { label: 'Ponów', role: 'redo', accelerator: 'CmdOrCtrl+Y', enabled: params.editFlags?.canRedo !== false },
      { type: 'separator' },
      { label: 'Wytnij', role: 'cut', accelerator: 'CmdOrCtrl+X', enabled: params.editFlags?.canCut !== false },
      { label: 'Kopiuj', role: 'copy', accelerator: 'CmdOrCtrl+C', enabled: params.editFlags?.canCopy !== false },
      { label: 'Wklej', role: 'paste', accelerator: 'CmdOrCtrl+V', enabled: params.editFlags?.canPaste !== false },
      {
        label: 'Wklej jako zwykły tekst',
        accelerator: 'CmdOrCtrl+Shift+V',
        enabled: params.editFlags?.canPaste !== false,
        click: () => {
          try {
            wc.pasteAndMatchStyle();
          } catch {
            /* */
          }
        },
      },
      {
        label: 'Zaznacz wszystko',
        role: 'selectAll',
        accelerator: 'CmdOrCtrl+A',
        enabled: params.editFlags?.canSelectAll !== false,
      },
    );
    pushSep();
  }

  // —— Navigation / page ——
  template.push(
    {
      label: 'Wstecz',
      accelerator: 'Alt+Left',
      enabled: wc.canGoBack(),
      click: () => wc.goBack(),
    },
    {
      label: 'Dalej',
      accelerator: 'Alt+Right',
      enabled: wc.canGoForward(),
      click: () => wc.goForward(),
    },
    {
      label: 'Odśwież',
      accelerator: 'CmdOrCtrl+R',
      click: () => wc.reload(),
    },
    { type: 'separator' },
    {
      label: 'Zapisz stronę jako…',
      accelerator: 'CmdOrCtrl+S',
      click: async () => {
        const parent = win && !win.isDestroyed() ? win : BrowserWindow.getFocusedWindow();
        const { canceled, filePath } = await dialog.showSaveDialog(parent || undefined, {
          title: 'Zapisz stronę',
          defaultPath: 'page.html',
          filters: [
            { name: 'Strona WWW', extensions: ['html', 'htm'] },
            { name: 'Wszystkie pliki', extensions: ['*'] },
          ],
        });
        if (canceled || !filePath) return;
        try {
          await wc.savePage(filePath, 'HTMLComplete');
        } catch (err) {
          console.error('[ctx] savePage', err);
        }
      },
    },
    {
      label: 'Drukuj…',
      accelerator: 'CmdOrCtrl+P',
      click: () => {
        try {
          wc.print({});
        } catch (err) {
          console.error('[ctx] print', err);
        }
      },
    },
    {
      label: 'Wyświetl źródło strony',
      accelerator: 'CmdOrCtrl+U',
      click: () => {
        let url = '';
        try {
          url = wc.getURL();
        } catch {
          /* */
        }
        if (!url || url === 'about:blank') return;
        const src = url.startsWith('view-source:') ? url : `view-source:${url}`;
        openSame(src);
      },
    },
  );

  if (deps.canInspect?.()) {
    template.push({
      label: 'Zbadaj element',
      accelerator: 'CmdOrCtrl+Shift+I',
      click: () => {
        try {
          wc.inspectElement(params.x, params.y);
          if (!wc.isDevToolsOpened()) wc.openDevTools({ mode: 'detach' });
        } catch (err) {
          console.error('[ctx] inspect', err);
        }
      },
    });
  }

  const menu = Menu.buildFromTemplate(template);
  menu.popup({
    window: win && !win.isDestroyed() ? win : undefined,
    x: typeof params.x === 'number' ? Math.round(params.x) : undefined,
    y: typeof params.y === 'number' ? Math.round(params.y) : undefined,
  });
}

module.exports = {
  attachContextMenu,
  showGuestContextMenu,
};
