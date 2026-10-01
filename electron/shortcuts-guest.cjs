/** Guest webview shortcut detection — keep in sync with src/lib/shortcutsRegistry.ts */

function isMod(i) {
  return i.ctrl || i.meta;
}

function keyEq(i, key) {
  return i.key === key || i.key === key.toLowerCase() || i.key === key.toUpperCase();
}

function ctrlOnly(i) {
  return isMod(i) && !i.shift && !i.alt;
}

function ctrlShift(i) {
  return isMod(i) && i.shift && !i.alt;
}

function altOnly(i) {
  return i.alt && !isMod(i) && !i.shift;
}

const GUEST_MATCHERS = [
  (i) => ctrlOnly(i) && keyEq(i, 't'),
  (i) => ctrlOnly(i) && keyEq(i, 'n'),
  (i) => ctrlShift(i) && keyEq(i, 'n'),
  (i) => i.shift && i.alt && !isMod(i) && keyEq(i, 'n'),
  (i) => ctrlOnly(i) && keyEq(i, 'w'),
  (i) => ctrlShift(i) && keyEq(i, 't'),
  (i) => ctrlOnly(i) && i.key === 'Tab',
  (i) => ctrlShift(i) && i.key === 'Tab',
  (i) => ctrlOnly(i) && /^[1-9]$/.test(i.key),
  (i) => ctrlOnly(i) && keyEq(i, 'l'),
  (i) => altOnly(i) && keyEq(i, 'd'),
  (i) => altOnly(i) && keyEq(i, 'p'),
  (i) => !isMod(i) && !i.shift && !i.alt && i.key === 'F6',
  (i) => ctrlOnly(i) && keyEq(i, 'r'),
  (i) => !isMod(i) && !i.shift && !i.alt && i.key === 'F5',
  (i) => ctrlShift(i) && keyEq(i, 'r'),
  (i) => altOnly(i) && (i.key === 'ArrowLeft' || i.code === 'ArrowLeft'),
  (i) => altOnly(i) && (i.key === 'ArrowRight' || i.code === 'ArrowRight'),
  (i) => ctrlOnly(i) && keyEq(i, 'd'),
  (i) => ctrlOnly(i) && keyEq(i, 'h'),
  (i) => ctrlOnly(i) && keyEq(i, 'j'),
  (i) => ctrlOnly(i) && keyEq(i, 'f'),
  (i) => ctrlOnly(i) && keyEq(i, 'p'),
  (i) => ctrlOnly(i) && keyEq(i, 's'),
  (i) => ctrlOnly(i) && keyEq(i, 'u'),
  (i) => !isMod(i) && !i.shift && !i.alt && i.key === 'F11',
  (i) => !isMod(i) && !i.shift && !i.alt && i.key === 'F12',
  (i) => ctrlShift(i) && (i.key === 'Delete' || i.code === 'Delete'),
  (i) => ctrlOnly(i) && (i.key === '+' || i.key === '='),
  (i) => ctrlOnly(i) && i.key === '-',
  (i) => ctrlOnly(i) && i.key === '0',
  (i) => i.shift && !isMod(i) && !i.alt && i.key === 'Escape',
];

function normalizeInput(input) {
  return {
    key: String(input.key || ''),
    code: input.code,
    ctrl: Boolean(input.control ?? input.ctrl),
    shift: Boolean(input.shift),
    alt: Boolean(input.alt),
    meta: Boolean(input.meta),
  };
}

function isGuestChromeShortcut(input) {
  const i = normalizeInput(input);
  return GUEST_MATCHERS.some((fn) => fn(i));
}

module.exports = { isGuestChromeShortcut, normalizeInput };
