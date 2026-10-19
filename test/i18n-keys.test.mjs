import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pl = JSON.parse(readFileSync(join(root, 'src/i18n/locales/pl.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(root, 'src/i18n/locales/en.json'), 'utf8'));

function flatten(dict, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.push(path);
    else if (v && typeof v === 'object') out.push(...flatten(v, path));
  }
  return out.sort();
}

const plKeys = flatten(pl);
const enKeys = flatten(en);
const plSet = new Set(plKeys);
const enSet = new Set(enKeys);

const missingInEn = plKeys.filter((k) => !enSet.has(k));
const missingInPl = enKeys.filter((k) => !plSet.has(k));

assert.deepEqual(missingInEn, [], `EN missing keys: ${missingInEn.join(', ')}`);
assert.deepEqual(missingInPl, [], `PL missing keys: ${missingInPl.join(', ')}`);
assert.ok(plKeys.length > 50, 'expected a non-trivial catalog');

console.log(`i18n-keys.test.mjs: ok (${plKeys.length} keys)`);
