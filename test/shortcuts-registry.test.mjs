/**
 * Shortcuts allowlist in editable fields.
 * Run: node --experimental-strip-types test/shortcuts-registry.test.mjs
 */
import assert from 'node:assert/strict';
import {
  acceleratorForHandler,
  acceleratorForMenuId,
  chromeShortcutAllowedInEditable,
  isEditableDomTarget,
  matchChromeShortcut,
} from '../src/lib/shortcutsRegistry.ts';

assert.equal(chromeShortcutAllowedInEditable('newTab'), true);
assert.equal(chromeShortcutAllowedInEditable('closeTab'), true);
assert.equal(chromeShortcutAllowedInEditable('findInPage'), true);
assert.equal(chromeShortcutAllowedInEditable('commandPalette'), true);
// typing helpers / page-only must NOT steal from inputs
assert.equal(chromeShortcutAllowedInEditable('viewSource'), false);
assert.equal(chromeShortcutAllowedInEditable(null), false);
assert.equal(chromeShortcutAllowedInEditable('nope'), false);

assert.ok(acceleratorForHandler('newTab'));
assert.equal(acceleratorForMenuId('new-tab'), acceleratorForHandler('newTab'));
assert.equal(acceleratorForMenuId('quit'), 'Alt+F4');

{
  const hit = matchChromeShortcut({
    key: 't',
    code: 'KeyT',
    ctrl: true,
    meta: false,
    alt: false,
    shift: false,
  });
  assert.equal(hit, 'newTab');
}

// isEditableDomTarget needs DOM — skip soft if no document
if (typeof document !== 'undefined') {
  const input = document.createElement('input');
  assert.equal(isEditableDomTarget(input), true);
} else {
  assert.equal(isEditableDomTarget(null), false);
  assert.equal(isEditableDomTarget(undefined), false);
}

console.log('shortcuts-registry.test.mjs: ok');
