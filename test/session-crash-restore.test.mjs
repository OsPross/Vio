/**
 * Guards the crash-restore contract: while the offer is pending we must not
 * treat the default "Nowa karta" UI as a savable session (that used to wipe
 * session.json before Przywróć).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/hooks/useSessionPersist.ts'), 'utf8');

assert.match(
  src,
  /pendingCrashRef/,
  'crash snapshot must be frozen in a ref (not re-loaded from disk on Accept)',
);
assert.match(
  src,
  /crashOfferRef\.current = true/,
  'crash offer must arm the save-block flag',
);
assert.match(
  src,
  /if \(crashOfferRef\.current\) return/,
  'persistSessionNow must no-op while crash offer is open',
);
assert.match(
  src,
  /if \(!st\.sessionReady\) return/,
  'persistSessionNow must no-op until sessionReady',
);

// Crash branch must NOT call setSessionReady(true) before the user chooses.
const crashBlock = src.slice(
  src.indexOf("status?.dirtyExit && saved?.tabs?.length"),
  src.indexOf('if (mode === \'session\' && saved?.tabs?.length)'),
);
assert.ok(crashBlock.includes('setCrashOffer(true)'));
assert.ok(
  !crashBlock.includes('setSessionReady(true)'),
  'must not set sessionReady while showing crash offer (autosave would wipe tabs)',
);

assert.match(src, /acceptCrashRestore/, 'Accept handler exported');
assert.match(src, /declineCrashRestore/, 'Decline handler exported');
const acceptStart = src.indexOf('const acceptCrashRestore');
const acceptEnd = src.indexOf('const declineCrashRestore');
const acceptBody = src.slice(acceptStart, acceptEnd);
assert.ok(
  !/sessionMarkClean\s*\?/.test(acceptBody) && !/sessionMarkClean\s*\(/.test(acceptBody),
  'acceptCrashRestore must not call sessionMarkClean',
);

console.log('session-crash-restore.test.mjs: ok');
