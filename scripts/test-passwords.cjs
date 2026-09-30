'use strict';

/**
 * Isolated smoke tests for electron/passwords.cjs (mocked Electron APIs).
 * Run: node scripts/test-passwords.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const crypto = require('node:crypto');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'djxxr-pw-'));
const rememberStore = { buf: null };
let clipboardText = '';
const results = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: String(err.message || err) });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message || err}`);
  }
}

// Mock electron before requiring passwords.cjs
const electronMock = {
  app: { getPath: () => tmpDir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(`WRAP:${s}`, 'utf8'),
    decryptString: (buf) => {
      const s = Buffer.from(buf).toString('utf8');
      if (!s.startsWith('WRAP:')) throw new Error('bad wrap');
      return s.slice(5);
    },
  },
  powerMonitor: { on: () => {} },
  clipboard: {
    writeText: (t) => {
      clipboardText = t;
    },
    readText: () => clipboardText,
    clear: () => {
      clipboardText = '';
    },
  },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronMock;
  return origLoad(request, parent, isMain);
};

const passwords = require('../electron/passwords.cjs');

console.log(`\nTemp vault dir: ${tmpDir}\n`);

passwords.init({ idleMinutes: 15 });

test('status: no vault yet', () => {
  const st = passwords.status();
  assert(st.setup === false, 'setup should be false');
  assert(st.unlocked === false, 'unlocked should be false');
});

test('setup rejects short master password', () => {
  const r = passwords.setup('short', false);
  assert(r.ok === false, 'expected fail');
});

test('setup + unlock roundtrip', () => {
  const r = passwords.setup('CorrectHorseBattery!', false);
  assert(r.ok === true, `setup failed: ${r.error}`);
  assert(r.unlocked === true, 'should be unlocked');
  passwords.lock('test');
  assert(passwords.status().unlocked === false, 'locked');
  const u = passwords.unlock('wrong-password', false);
  assert(u.ok === false, 'wrong password should fail');
  const u2 = passwords.unlock('CorrectHorseBattery!', false);
  assert(u2.ok === true && u2.unlocked, 'unlock failed');
});

test('CRUD + list hides password', () => {
  const e = passwords.add({
    origin: 'https://example.com/login',
    username: 'alice',
    password: 'Secret123!',
    note: 'test',
  });
  assert(e.id && e.origin === 'https://example.com', 'origin normalized');
  assert(!('password' in e), 'public entry must not include password');
  const list = passwords.list();
  assert(list.length >= 1, 'list empty');
  assert(!('password' in list[0]), 'list must not leak password');
  const full = passwords.get(e.id);
  assert(full.password === 'Secret123!', 'get password');
});

test('autofill: https same origin only', () => {
  const e = passwords.add({
    url: 'https://shop.test/account',
    username: 'bob',
    password: 'ShopPw!',
  });
  let threw = false;
  try {
    passwords.getPasswordForAutofill(e.id, 'http://shop.test/account');
  } catch {
    threw = true;
  }
  assert(threw, 'http must be rejected');

  threw = false;
  try {
    passwords.getPasswordForAutofill(e.id, 'https://evil.test/');
  } catch {
    threw = true;
  }
  assert(threw, 'cross-origin must be rejected');

  const ok = passwords.getPasswordForAutofill(e.id, 'https://shop.test/checkout');
  assert(ok.password === 'ShopPw!' && ok.username === 'bob', 'same origin autofill');
});

test('findForOrigin ignores http and mismatch', () => {
  assert(passwords.findForOrigin('http://example.com').length === 0, 'http find');
  assert(passwords.findForOrigin('https://example.com/x').some((x) => x.username === 'alice'), 'https find');
  assert(passwords.findForOrigin('https://other.com').length === 0, 'other');
});

test('never-save suppresses offer', () => {
  passwords.neverSaveAdd('https://nosave.test');
  const o = passwords.shouldOfferSave('https://nosave.test/login', 'u', 'p');
  assert(o.offer === false && o.reason === 'never', 'never save');
});

test('pending save confirm keeps password in main only', () => {
  const offer = passwords.shouldOfferSave('https://newsite.test/a', 'neo', 'Matrix99!');
  assert(offer.offer === true && offer.mode === 'create', 'offer create');
  assert(!('password' in offer), 'offer must not echo password');
  const saved = passwords.confirmPendingSave();
  assert(saved.username === 'neo', 'confirmed');
  const again = passwords.shouldOfferSave('https://newsite.test/a', 'neo', 'Matrix99!');
  assert(again.offer === false && again.reason === 'unchanged', 'unchanged');
  const upd = passwords.shouldOfferSave('https://newsite.test/a', 'neo', 'Matrix00!');
  assert(upd.offer === true && upd.mode === 'update', 'update offer');
  passwords.confirmPendingSave();
  const full = passwords.get(upd.id);
  assert(full.password === 'Matrix00!', 'updated password');
});

test('generator + strength', () => {
  const g = passwords.generate({ length: 24, symbols: true });
  assert(g.password.length === 24, 'length');
  const p = passwords.generate({ passphrase: true, words: 4 });
  assert(p.password.split('-').length === 4, 'passphrase words');
  const weak = passwords.strength('abc');
  const strong = passwords.strength('Correct-Horse-Battery-99!');
  assert(weak.score < strong.score, 'strength ordering');
});

test('TOTP RFC-ish (known secret)', () => {
  // secret "JBSWY3DPEHPK3PXP" = "Hello!"
  const e = passwords.add({
    origin: 'https://totp.test',
    username: 't',
    password: 'x',
    totpSecret: 'JBSWY3DPEHPK3PXP',
  });
  const t = passwords.getTotp(e.id);
  assert(/^\d{6}$/.test(t.code), `totp code ${t.code}`);
  assert(t.remaining > 0 && t.remaining <= 30, 'remaining');
});

test('audit detects weak + reused', () => {
  passwords.add({ origin: 'https://a.test', username: '1', password: '123' });
  passwords.add({ origin: 'https://b.test', username: '2', password: '123' });
  const a = passwords.audit();
  assert(a.weak.length >= 1, 'weak');
  assert(a.reused.length >= 2, 'reused');
});

test('CSV export requires master; import chrome format', () => {
  let threw = false;
  try {
    passwords.exportCsv('wrong');
  } catch {
    threw = true;
  }
  assert(threw, 'bad master export');
  const exp = passwords.exportCsv('CorrectHorseBattery!');
  assert(exp.ok && exp.csv.includes('url,username,password'), 'csv header');
  const csv = [
    'url,username,password,note',
    'https://import.test,imp,ImpPass1,hello',
  ].join('\n');
  const imp = passwords.importCsv(csv, 'chrome');
  assert(imp.ok && imp.imported === 1, 'import');
  assert(passwords.findForOrigin('https://import.test').length === 1, 'imported find');
});

test('remember key via safeStorage mock', () => {
  passwords.lock('t');
  const u = passwords.unlock('CorrectHorseBattery!', true);
  assert(u.ok, 'unlock remember');
  assert(fs.existsSync(path.join(tmpDir, 'djxxr-passwords.remember')), 'remember file');
  passwords.lock('t');
  const st = passwords.tryAutoUnlock();
  assert(st.unlocked === true, 'auto unlock from remember');
});

test('change master password', () => {
  const r = passwords.changeMaster('CorrectHorseBattery!', 'NewMasterPass99');
  assert(r.ok, `change failed ${r.error}`);
  passwords.lock('t');
  assert(passwords.unlock('CorrectHorseBattery!', false).ok === false, 'old master dead');
  assert(passwords.unlock('NewMasterPass99', false).unlocked === true, 'new master');
});

test('vault file is not plaintext JSON of passwords', () => {
  const raw = fs.readFileSync(path.join(tmpDir, 'djxxr-passwords.vault'), 'utf8');
  assert(raw.includes('"magic":"DXPW"'), 'magic');
  assert(!raw.includes('ShopPw!'), 'password must not appear in vault file');
  assert(!raw.includes('Matrix00!'), 'password must not appear in vault file');
  const env = JSON.parse(raw);
  assert(env.ciphertext && env.iv && env.tag && env.kdf.salt, 'envelope fields');
});

test('page script contains origin / https / iframe guards', () => {
  const js = passwords.getPageScript();
  assert(js.includes("location.protocol !== 'https:'"), 'https guard');
  assert(js.includes('window.top !== window'), 'iframe guard');
  assert(js.includes('login-submit'), 'submit hook');
  assert(js.includes('fill-request'), 'fill request');
});

test('list while locked fails', () => {
  passwords.lock('t');
  let threw = false;
  try {
    passwords.list();
  } catch (e) {
    threw = e.code === 'LOCKED' || /zablokowany/i.test(e.message);
  }
  assert(threw, 'list when locked');
});

test('vault format is v2 with N=131072', () => {
  const u = passwords.unlock('NewMasterPass99', false);
  assert(u.ok || u.unlocked, 'unlock for format check');
  const env = JSON.parse(fs.readFileSync(path.join(tmpDir, 'djxxr-passwords.vault'), 'utf8'));
  assert(env.version === 2, `version ${env.version}`);
  assert(env.kdf.N === 131072, `N=${env.kdf.N}`);
});

// Cleanup
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* */
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exitCode = 1;
}
