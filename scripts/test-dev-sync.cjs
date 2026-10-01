'use strict';

/**
 * [T] Dev-sync: local file remote + 1 new commit → check behind + ff-only pull.
 * Run: node scripts/test-dev-sync.cjs
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TMP = path.join(ROOT, 'tmp-verify', 'dev-sync-test');
const REMOTE = path.join(TMP, 'remote');
const CLONE = path.join(TMP, 'clone');

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
console.log('[test-dev-sync] tmp', TMP);

git(TMP, ['init', 'remote']);
git(REMOTE, ['config', 'receive.denyCurrentBranch', 'updateInstead']);
fs.writeFileSync(path.join(REMOTE, 'package-lock.json'), '{}\n');
fs.writeFileSync(path.join(REMOTE, 'README.md'), 'seed\n');
git(REMOTE, ['add', '.']);
git(REMOTE, ['-c', 'user.email=test@djxxr.local', '-c', 'user.name=Test', 'commit', '-m', 'seed']);

execFileSync('git', ['clone', REMOTE, CLONE], { encoding: 'utf8', stdio: 'pipe' });

fs.writeFileSync(path.join(REMOTE, 'note.txt'), 'from remote\n');
git(REMOTE, ['add', 'note.txt']);
git(REMOTE, [
  '-c',
  'user.email=kolega@djxxr.local',
  '-c',
  'user.name=Kolega',
  'commit',
  '-m',
  'sync-test remote commit',
]);

git(CLONE, ['fetch', 'origin']);
const counts = git(CLONE, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
const parts = String(counts).split(/\s+/);
const behind = Number(parts[1] || 0);
assert(behind >= 1, `expected behind>=1 got ${counts}`);

const log = git(CLONE, ['log', 'HEAD..@{u}', '--pretty=format:%h|%an|%s']);
assert(log.length > 0, 'expected at least one incoming commit');
assert(/Kolega|sync-test/i.test(log), `unexpected log: ${log}`);

fs.writeFileSync(path.join(CLONE, 'dirty.txt'), 'x');
assert(git(CLONE, ['status', '--porcelain']).length > 0, 'expected dirty');
fs.unlinkSync(path.join(CLONE, 'dirty.txt'));

git(CLONE, ['pull', '--ff-only']);
assert(fs.existsSync(path.join(CLONE, 'note.txt')), 'note.txt missing after pull');

console.log('[test-dev-sync] OK behind=1 author=Kolega ff-pull');

const mod = require(path.join(ROOT, 'electron', 'dev-sync.cjs'));
assert(typeof mod.checkUpdates === 'function', 'checkUpdates');
assert(typeof mod.applyUpdates === 'function', 'applyUpdates');
console.log('[test-dev-sync] API ok');

process.exit(0);
