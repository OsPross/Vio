/** Chrome-like shortcuts — single source for labels, matching, and handler keys. */

export type ShortcutHandlerKey =
  | 'newTab'
  | 'newWindow'
  | 'newPrivateWindow'
  | 'newTorWindow'
  | 'closeTab'
  | 'reopenClosedTab'
  | 'nextTab'
  | 'prevTab'
  | 'activateTab1'
  | 'activateTab2'
  | 'activateTab3'
  | 'activateTab4'
  | 'activateTab5'
  | 'activateTab6'
  | 'activateTab7'
  | 'activateTab8'
  | 'activateTab9'
  | 'focusOmnibox'
  | 'reload'
  | 'hardReload'
  | 'back'
  | 'forward'
  | 'bookmarkPage'
  | 'bookmarksManager'
  | 'toggleBookmarksBar'
  | 'history'
  | 'downloads'
  | 'findInPage'
  | 'print'
  | 'savePage'
  | 'viewSource'
  | 'toggleFullscreen'
  | 'devtools'
  | 'clearBrowsingData'
  | 'escape'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'openSettings'
  | 'toggleSidebar'
  | 'commandPalette'
  | 'torNewIdentity'
  | 'taskManager'
  | 'pictureInPicture';

export type ShortcutInput = {
  key: string;
  code?: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
};

export type ChromeShortcutDef = {
  id: string;
  handlerKey: ShortcutHandlerKey;
  accelerator: string;
  description: string;
  /** Intercept in guest webview via before-input-event */
  guest: boolean;
  match: (input: ShortcutInput) => boolean;
};

const isMod = (i: ShortcutInput) => i.ctrl || i.meta;

const keyEq = (i: ShortcutInput, key: string) => i.key === key || i.key === key.toLowerCase() || i.key === key.toUpperCase();

function ctrlOnly(i: ShortcutInput) {
  return isMod(i) && !i.shift && !i.alt;
}

function ctrlShift(i: ShortcutInput) {
  return isMod(i) && i.shift && !i.alt;
}

function altOnly(i: ShortcutInput) {
  return i.alt && !isMod(i) && !i.shift;
}

export const CHROME_SHORTCUTS: ChromeShortcutDef[] = [
  {
    id: 'new-tab',
    handlerKey: 'newTab',
    accelerator: 'Ctrl+T',
    description: 'Nowa karta',
    guest: true,
    match: (i) => ctrlOnly(i) && keyEq(i, 't'),
  },
  {
    id: 'new-window',
    handlerKey: 'newWindow',
    accelerator: 'Ctrl+N',
    description: 'Nowe okno',
    guest: true,
    match: (i) => ctrlOnly(i) && keyEq(i, 'n'),
  },
  {
    id: 'new-private',
    handlerKey: 'newPrivateWindow',
    accelerator: 'Ctrl+Shift+N',
    description: 'Nowe okno prywatne',
    guest: true,
    match: (i) => ctrlShift(i) && keyEq(i, 'n'),
  },
  {
    id: 'new-tor',
    handlerKey: 'newTorWindow',
    accelerator: 'Shift+Alt+N',
    description: 'Nowa karta Tor',
    guest: true,
    match: (i) => i.shift && i.alt && !isMod(i) && keyEq(i, 'n'),
  },
  {
    id: 'close-tab',
    handlerKey: 'closeTab',
    accelerator: 'Ctrl+W',
    description: 'Zamknij kartę',
    guest: true,
    match: (i) => ctrlOnly(i) && keyEq(i, 'w'),
  },
  {
    id: 'reopen-tab',
    handlerKey: 'reopenClosedTab',
    accelerator: 'Ctrl+Shift+T',
    description: 'Przywróć kartę',
    guest: true,
    match: (i) => ctrlShift(i) && keyEq(i, 't'),
  },
  {
    id: 'next-tab',
    handlerKey: 'nextTab',
    accelerator: 'Ctrl+Tab',
    description: 'Następna karta',
    guest: true,
    match: (i) => ctrlOnly(i) && i.key === 'Tab',
  },
  {
    id: 'prev-tab',
    handlerKey: 'prevTab',
    accelerator: 'Ctrl+Shift+Tab',
    description: 'Poprzednia karta',
    guest: true,
    match: (i) => ctrlShift(i) && i.key === 'Tab',
  },
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((n) => ({
    id: `tab-${n}`,
    handlerKey: `activateTab${n}` as ShortcutHandlerKey,
    accelerator: `Ctrl+${n}`,
    description: `Karta ${n}`,
    guest: true,
    match: (i: ShortcutInput) => ctrlOnly(i) && i.key === String(n),
  })),
  {
    id: 'focus-omnibox-ctrl-l',
    handlerKey: 'focusOmnibox',
    accelerator: 'Ctrl+L',
    description: 'Fokus paska adresu',
    guest: true,
    match: (i) => ctrlOnly(i) && keyEq(i, 'l'),
  },
  {
    id: 'focus-omnibox-alt-d',
    handlerKey: 'focusOmnibox',
    accelerator: 'Alt+D',
    description: 'Fokus paska adresu',
    guest: true,
    match: (i) => altOnly(i) && keyEq(i, 'd'),
  },
  {
    id: 'focus-omnibox-f6',
    handlerKey: 'focusOmnibox',
    accelerator: 'F6',
    description: 'Fokus paska adresu',
    guest: true,
    match: (i) => !isMod(i) && !i.shift && !i.alt && i.key === 'F6',
  },
  {
    id: 'reload',
    handlerKey: 'reload',
    accelerator: 'Ctrl+R',
    description: 'Odśwież',
    guest: true,
    match: (i) => ctrlOnly(i) && keyEq(i, 'r'),
  },
  {
    id: 'reload-f5',
    handlerKey: 'reload',
    accelerator: 'F5',
    description: 'Odśwież',
    guest: true,
    match: (i) => !isMod(i) && !i.shift && !i.alt && i.key === 'F5',
  },
  {
    id: 'hard-reload',
    handlerKey: 'hardReload',
    accelerator: 'Ctrl+Shift+R',
    description: 'Twarde odświeżenie',
    guest: true,
    match: (i) => ctrlShift(i) && keyEq(i, 'r'),
  },
  {
    id: 'back',
    handlerKey: 'back',
    accelerator: 'Alt+←',
    description: 'Wstecz',
    guest: true,
    match: (i) => altOnly(i) && (i.key === 'ArrowLeft' || i.code === 'ArrowLeft'),
  },
  {
    id: 'forward',
    handlerKey: 'forward',
    accelerator: 'Alt+→',
    description: 'Dalej',
    guest: true,
    match: (i) => altOnly(i) && (i.key === 'ArrowRight' || i.code === 'ArrowRight'),
  },
  {
    id: 'bookmark',
    handlerKey: 'bookmarkPage',
    accelerator: 'Ctrl+D',
    description: 'Dodaj zakładkę',
    guest: true,
    match: (i) => ctrlOnly(i) && keyEq(i, 'd'),
  },
  {
    id: 'history',
    handlerKey: 'history',
    accelerator: 'Ctrl+H',
    description: 'Historia',
    guest: true,
    match: (i) => ctrlOnly(i) && keyEq(i, 'h'),
  },
  {
    id: 'downloads',
    handlerKey: 'downloads',
    accelerator: 'Ctrl+J',
    description: 'Pobrania',
    guest: true,
    match: (i) => ctrlOnly(i) && keyEq(i, 'j'),
  },
  {
    id: 'bookmarks-manager',
    handlerKey: 'bookmarksManager',
    accelerator: 'Ctrl+Shift+O',
    description: 'Menedżer zakładek',
    guest: false,
    match: (i) => ctrlShift(i) && keyEq(i, 'o'),
  },
  {
    id: 'toggle-bookmarks-bar',
    handlerKey: 'toggleBookmarksBar',
    accelerator: 'Ctrl+Shift+B',
    description: 'Pasek zakładek',
    guest: false,
    match: (i) => ctrlShift(i) && keyEq(i, 'b'),
  },
  {
    id: 'find',
    handlerKey: 'findInPage',
    accelerator: 'Ctrl+F',
    description: 'Znajdź na stronie',
    guest: true,
    match: (i) => ctrlOnly(i) && keyEq(i, 'f'),
  },
  {
    id: 'print',
    handlerKey: 'print',
    accelerator: 'Ctrl+P',
    description: 'Drukuj',
    guest: true,
    match: (i) => ctrlOnly(i) && keyEq(i, 'p'),
  },
  {
    id: 'save',
    handlerKey: 'savePage',
    accelerator: 'Ctrl+S',
    description: 'Zapisz stronę',
    guest: true,
    match: (i) => ctrlOnly(i) && keyEq(i, 's'),
  },
  {
    id: 'view-source',
    handlerKey: 'viewSource',
    accelerator: 'Ctrl+U',
    description: 'Źródło strony',
    guest: true,
    match: (i) => ctrlOnly(i) && keyEq(i, 'u'),
  },
  {
    id: 'fullscreen',
    handlerKey: 'toggleFullscreen',
    accelerator: 'F11',
    description: 'Pełny ekran',
    guest: true,
    match: (i) => !isMod(i) && !i.shift && !i.alt && i.key === 'F11',
  },
  {
    id: 'devtools',
    handlerKey: 'devtools',
    accelerator: 'F12',
    description: 'Narzędzia deweloperskie',
    guest: true,
    match: (i) => !isMod(i) && !i.shift && !i.alt && i.key === 'F12',
  },
  {
    id: 'devtools-chrome',
    handlerKey: 'devtools',
    accelerator: 'Ctrl+Shift+I',
    description: 'Narzędzia deweloperskie',
    guest: true,
    match: (i) => ctrlShift(i) && keyEq(i, 'i'),
  },
  {
    id: 'picture-in-picture',
    handlerKey: 'pictureInPicture',
    accelerator: 'Alt+P',
    description: 'Obraz w obrazie',
    guest: true,
    match: (i) => i.alt && !i.ctrl && !i.meta && !i.shift && keyEq(i, 'p'),
  },
  {
    id: 'clear-data',
    handlerKey: 'clearBrowsingData',
    accelerator: 'Ctrl+Shift+Del',
    description: 'Usuń dane przeglądania',
    guest: true,
    match: (i) => ctrlShift(i) && (i.key === 'Delete' || i.code === 'Delete'),
  },
  {
    id: 'zoom-in',
    handlerKey: 'zoomIn',
    accelerator: 'Ctrl++',
    description: 'Powiększ',
    guest: true,
    match: (i) => ctrlOnly(i) && (i.key === '+' || i.key === '='),
  },
  {
    id: 'zoom-out',
    handlerKey: 'zoomOut',
    accelerator: 'Ctrl+-',
    description: 'Pomniejsz',
    guest: true,
    match: (i) => ctrlOnly(i) && i.key === '-',
  },
  {
    id: 'zoom-reset',
    handlerKey: 'zoomReset',
    accelerator: 'Ctrl+0',
    description: 'Reset zoomu',
    guest: true,
    match: (i) => ctrlOnly(i) && i.key === '0',
  },
  {
    id: 'settings',
    handlerKey: 'openSettings',
    accelerator: 'Ctrl+,',
    description: 'Ustawienia',
    guest: false,
    match: (i) => ctrlOnly(i) && i.key === ',',
  },
  {
    id: 'sidebar',
    handlerKey: 'toggleSidebar',
    accelerator: 'Ctrl+B',
    description: 'Sidebar',
    guest: false,
    match: (i) => ctrlOnly(i) && keyEq(i, 'b'),
  },
  {
    id: 'palette',
    handlerKey: 'commandPalette',
    accelerator: 'Ctrl+K',
    description: 'Paleta poleceń',
    guest: false,
    match: (i) => ctrlOnly(i) && keyEq(i, 'k'),
  },
  {
    id: 'palette-shift',
    handlerKey: 'commandPalette',
    accelerator: 'Ctrl+Shift+P',
    description: 'Paleta poleceń',
    guest: false,
    match: (i) => ctrlShift(i) && keyEq(i, 'p'),
  },
  {
    id: 'tor-identity',
    handlerKey: 'torNewIdentity',
    accelerator: 'Ctrl+Shift+U',
    description: 'Nowa tożsamość Tor',
    guest: false,
    match: (i) => ctrlShift(i) && keyEq(i, 'u'),
  },
  {
    id: 'task-mgr',
    handlerKey: 'taskManager',
    accelerator: 'Shift+Esc',
    description: 'Menedżer zadań',
    guest: true,
    match: (i) => i.shift && !isMod(i) && !i.alt && i.key === 'Escape',
  },
  {
    id: 'escape',
    handlerKey: 'escape',
    accelerator: 'Esc',
    description: 'Anuluj / zamknij',
    guest: false,
    match: (i) => !isMod(i) && !i.shift && !i.alt && i.key === 'Escape',
  },
];

export function shortcutInputFromKeyboardEvent(e: KeyboardEvent): ShortcutInput {
  return {
    key: e.key,
    code: e.code,
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey,
  };
}

export function shortcutInputFromPayload(payload: {
  key?: string;
  code?: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}): ShortcutInput {
  return {
    key: String(payload.key ?? ''),
    code: payload.code,
    ctrl: Boolean(payload.ctrl),
    shift: Boolean(payload.shift),
    alt: Boolean(payload.alt),
    meta: Boolean(payload.meta),
  };
}

export function matchChromeShortcut(input: ShortcutInput): ShortcutHandlerKey | null {
  for (const def of CHROME_SHORTCUTS) {
    if (def.match(input)) return def.handlerKey;
  }
  return null;
}

export function isGuestChromeShortcut(input: ShortcutInput): boolean {
  for (const def of CHROME_SHORTCUTS) {
    if (def.guest && def.match(input)) return true;
  }
  return false;
}

/**
 * Chrome chrome shortcuts that MUST fire even when focus is in an input /
 * textarea / contenteditable (omnibox, YouTube search, Google Docs, Discord…).
 * Everything else is left to the field (Backspace, Ctrl+A/C/V/X/Z, arrows…).
 */
const ALLOWED_IN_EDITABLE = new Set<ShortcutHandlerKey>([
  'newTab',
  'newWindow',
  'newPrivateWindow',
  'newTorWindow',
  'closeTab',
  'reopenClosedTab',
  'nextTab',
  'prevTab',
  'activateTab1',
  'activateTab2',
  'activateTab3',
  'activateTab4',
  'activateTab5',
  'activateTab6',
  'activateTab7',
  'activateTab8',
  'activateTab9',
  'focusOmnibox',
  'reload',
  'hardReload',
  'findInPage',
  'print',
  'zoomIn',
  'zoomOut',
  'zoomReset',
  'toggleFullscreen',
  'devtools',
  'back',
  'forward',
  'taskManager',
  'commandPalette',
]);

export function chromeShortcutAllowedInEditable(handler: ShortcutHandlerKey | null | undefined): boolean {
  return !!handler && ALLOWED_IN_EDITABLE.has(handler);
}

/** INPUT / TEXTAREA / SELECT / contenteditable (incl. nested, like Google Docs). */
export function isEditableDomTarget(el: EventTarget | null | undefined): boolean {
  if (!el || !(el instanceof Element)) return false;
  try {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    const html = el as HTMLElement;
    if (html.isContentEditable) return true;
    if (el.closest?.('[contenteditable="true"], [contenteditable=""]')) return true;
  } catch {
    /* */
  }
  return false;
}

export function acceleratorForHandler(handlerKey: ShortcutHandlerKey): string | undefined {
  return CHROME_SHORTCUTS.find((d) => d.handlerKey === handlerKey)?.accelerator;
}

export function acceleratorForMenuId(menuId: string): string | undefined {
  const map: Record<string, string> = {
    'new-tab': 'newTab',
    'new-win': 'newWindow',
    'new-priv': 'newPrivateWindow',
    'new-tor': 'newTorWindow',
    history: 'history',
    bookmarks: 'bookmarksManager',
    downloads: 'downloads',
    clear: 'clearBrowsingData',
    fs: 'toggleFullscreen',
    print: 'print',
    find: 'findInPage',
    save: 'savePage',
    devtools: 'devtools',
    source: 'viewSource',
    task: 'taskManager',
    quit: 'Alt+F4',
  };
  const mapped = map[menuId];
  if (!mapped) return undefined;
  if (mapped.includes('+') || mapped === 'Alt+F4') return mapped;
  return acceleratorForHandler(mapped as ShortcutHandlerKey);
}
