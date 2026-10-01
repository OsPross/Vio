/**
 * Private partitions must never be persist:*.
 * Run: node test/partitions.test.mjs
 */
const assert = require('node:assert/strict');
const {
  assertEphemeralPrivate,
  createPrivatePartition,
  isLegacyPersistPrivate,
  isPrivatePartition,
} = require('../electron/lib/partition-names.cjs');

assert.equal(isPrivatePartition('private-11111111-2222-3333-4444-555555555555'), true);
assert.equal(isPrivatePartition('persist:main'), false);
assert.equal(isPrivatePartition('persist:private'), false);
assert.equal(isLegacyPersistPrivate('persist:private'), true);
assert.equal(isLegacyPersistPrivate('persist:private-foo'), true);
assert.equal(isLegacyPersistPrivate('private-abc'), false);

const name = createPrivatePartition();
assert.match(name, /^private-[0-9a-f-]+$/i);
assert.equal(name.startsWith('persist:'), false);
assert.deepEqual(assertEphemeralPrivate(name), { ok: true });
assert.equal(assertEphemeralPrivate('persist:private').ok, false);
assert.equal(assertEphemeralPrivate('persist:main').ok, false);

console.log('partitions.test.mjs: ok');
