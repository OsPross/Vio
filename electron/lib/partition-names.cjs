/**
 * Partition name rules (no Electron session).
 * Private windows MUST use ephemeral `private-<uuid>` — never `persist:private`.
 */
'use strict';

const { randomUUID } = require('node:crypto');

const PRIVATE_PARTITION_RE = /^private-[0-9a-f-]{8,}$/i;

function isPrivatePartition(name) {
  return PRIVATE_PARTITION_RE.test(String(name || ''));
}

/** True if name would create an on-disk Chromium profile (forbidden for private). */
function isLegacyPersistPrivate(name) {
  return String(name || '') === 'persist:private' || /^persist:private-/i.test(String(name || ''));
}

function createPrivatePartition() {
  return `private-${randomUUID()}`;
}

function assertEphemeralPrivate(name) {
  const n = String(name || '');
  if (isLegacyPersistPrivate(n)) return { ok: false, reason: 'persist-private-forbidden' };
  if (!isPrivatePartition(n)) return { ok: false, reason: 'not-private-pattern' };
  if (n.startsWith('persist:')) return { ok: false, reason: 'persist-prefix' };
  return { ok: true };
}

module.exports = {
  PRIVATE_PARTITION_RE,
  isPrivatePartition,
  isLegacyPersistPrivate,
  createPrivatePartition,
  assertEphemeralPrivate,
};
