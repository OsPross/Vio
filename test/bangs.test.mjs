/**
 * Bang list + resolveBang (DuckDuckGo-style).
 * Run: node --experimental-strip-types test/bangs.test.mjs
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_BANGS,
  resolveBang,
  migrateBangsToDdg,
} from '../src/lib/bangs.ts';

const bangs = DEFAULT_BANGS;

{
  const g = bangs.find((b) => b.key === 'g');
  assert.ok(g && /google\.com\/search/i.test(g.url), '!g must be Google search');
  assert.ok(g && !/mail\.google/i.test(g.url), '!g must not be Gmail');
}

{
  const gmail = bangs.find((b) => b.key === 'gmail');
  assert.ok(gmail && /mail\.google/i.test(gmail.url), '!gmail exists');
}

for (const k of ['g', 'yt', 'w', 'gh', 'a', 'm', 'gmail', 'tr']) {
  assert.ok(
    bangs.some((b) => b.key === k),
    `missing bang !${k}`,
  );
}

{
  assert.match(String(resolveBang('!g pogoda', bangs)), /google\.com\/search\?q=pogoda/i);
  assert.match(String(resolveBang('pogoda !g', bangs)), /google\.com\/search\?q=pogoda/i);
  assert.match(String(resolveBang('!yt cats', bangs)), /youtube\.com\/results/i);
  assert.match(String(resolveBang('!gh electron', bangs)), /github\.com\/search/i);
  assert.match(String(resolveBang('!w Polska', bangs)), /wikipedia\.org/i);
  assert.match(String(resolveBang('!a headphones', bangs)), /amazon\.com/i);
  assert.match(String(resolveBang('!m Warszawa', bangs)), /google\.com\/maps/i);
  assert.match(String(resolveBang('!tr hello', bangs)), /translate\.google/i);
  assert.match(String(resolveBang('!gmail invoice', bangs)), /mail\.google/i);
}

{
  const legacy = migrateBangsToDdg([
    { key: 'g', label: 'Gmail', url: 'https://mail.google.com/mail/u/0/#search/%s' },
    { key: 'yt', label: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
  ]);
  const migG = legacy.find((b) => b.key === 'g');
  assert.ok(migG && /google\.com\/search/i.test(migG.url));
  assert.ok(legacy.some((b) => b.key === 'gmail'));
}

console.log('bangs.test.mjs: ok');
