'use strict';

/**
 * Runs inside Electron to exercise real passwords.cjs + safeStorage.
 * electron scripts/test-passwords-electron.cjs
 */

const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'djxxr-pw-e-'));

app.whenReady().then(() => {
  // Redirect userData for isolated vault
  const passwordsPath = path.join(__dirname, '..', 'electron', 'passwords.cjs');
  // Monkeypatch getPath after ready
  const orig = app.getPath.bind(app);
  app.getPath = (name) => (name === 'userData' ? tmp : orig(name));

  const passwords = require(passwordsPath);
  const out = [];
  const ok = (name, cond, detail) => {
    out.push({ name, ok: !!cond, detail });
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  };

  try {
    passwords.init({ idleMinutes: 1 });
    ok('safeStorage available', safeStorage.isEncryptionAvailable());

    let r = passwords.setup('ElectronTestMaster1', true);
    ok('setup with remember', r.ok === true, r.error);

    const e = passwords.add({
      origin: 'https://github.com',
      username: 'djxxr',
      password: 'gh-secret-xyz',
    });
    ok('add entry', !!e.id);

    ok('list no password field', !('password' in passwords.list()[0]));

    let threw = false;
    try {
      passwords.getPasswordForAutofill(e.id, 'http://github.com');
    } catch {
      threw = true;
    }
    ok('reject http autofill', threw);

    const af = passwords.getPasswordForAutofill(e.id, 'https://github.com/login');
    ok('https autofill', af.password === 'gh-secret-xyz');

    passwords.lock('t');
    const st = passwords.tryAutoUnlock();
    ok('remember auto-unlock', st.unlocked === true);

    const vaultFile = fs.readFileSync(path.join(tmp, 'djxxr-passwords.vault'), 'utf8');
    ok('vault not plaintext', !vaultFile.includes('gh-secret-xyz'));

    const script = passwords.getPageScript();
    ok('page script non-empty', script.length > 500);
  } catch (err) {
    ok('uncaught', false, String(err));
  }

  const failed = out.filter((x) => !x.ok).length;
  console.log(`\n${out.length - failed}/${out.length} electron vault checks`);
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* */
  }
  app.exit(failed ? 1 : 0);
});
