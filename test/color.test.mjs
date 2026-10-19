import assert from 'node:assert/strict';
import { hexToHsv, hsvToHex, normalizeHex } from '../src/lib/color.ts';

assert.equal(normalizeHex('6b9eff'), '#6b9eff');
assert.equal(normalizeHex('#abc'), '#aabbcc');
assert.equal(normalizeHex('nope', '#111111'), '#111111');

const roundTrip = ['#6b9eff', '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#808080'];
for (const hex of roundTrip) {
  const { h, s, v } = hexToHsv(hex);
  const back = hsvToHex(h, s, v);
  // Allow ±1 on channels from float rounding
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(back.slice(1), 16);
  const dr = Math.abs(((a >> 16) & 255) - ((b >> 16) & 255));
  const dg = Math.abs(((a >> 8) & 255) - ((b >> 8) & 255));
  const db = Math.abs((a & 255) - (b & 255));
  assert.ok(dr <= 1 && dg <= 1 && db <= 1, `${hex} → ${back}`);
}

console.log('color.test.mjs: ok');
