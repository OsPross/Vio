'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const session = require('../electron/session.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vio-session-'));
session._setRootForTests(tmp);

session.markDirtyOnBoot();
session.saveSnapshot({
  tabs: [{ id: 'a', url: 'about:home', title: 'Home', pinned: false, index: 0 }],
  activeId: 'a',
});
session.flushSync();

let raw = JSON.parse(fs.readFileSync(path.join(tmp, 'session.json'), 'utf8'));
assert.equal(raw.dirtyExit, true, 'in-session dirtyExit must be true');

session.markCleanExit();
raw = JSON.parse(fs.readFileSync(path.join(tmp, 'session.json'), 'utf8'));
assert.equal(raw.dirtyExit, false, 'clean exit must clear dirtyExit');

// Late save after clean exit must not resurrect dirtyExit
session.saveSnapshot({
  window: { width: 800, height: 600, isMaximized: false },
});
raw = JSON.parse(fs.readFileSync(path.join(tmp, 'session.json'), 'utf8'));
assert.equal(raw.dirtyExit, false, 'post-clean saveSnapshot must keep dirtyExit false');

session._setRootForTests(null);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('session-clean-exit.test.cjs OK');
