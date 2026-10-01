'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const ipcDir = path.join(root, 'electron', 'ipc');
const ipcBundle = [main]
  .concat(
    fs.existsSync(ipcDir)
      ? fs.readdirSync(ipcDir).filter((f) => f.endsWith('.cjs')).map((f) => fs.readFileSync(path.join(ipcDir, f), 'utf8'))
      : [],
  )
  .join('\n');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const wv = fs.readFileSync(path.join(root, 'electron', 'webview-preload.cjs'), 'utf8');
const security = fs.readFileSync(path.join(root, 'electron', 'security.cjs'), 'utf8');
function readTree(dir, exts = ['.ts', '.tsx']) {
  if (!fs.existsSync(dir)) return '';
  let out = '';
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out += readTree(p, exts);
    else if (exts.some((e) => ent.name.endsWith(e))) out += fs.readFileSync(p, 'utf8') + '\n';
  }
  return out;
}
const app = readTree(path.join(root, 'src'));
const panel = fs.readFileSync(path.join(root, 'src', 'components', 'PasswordsPanel.tsx'), 'utf8');
const storeDir = path.join(root, 'src', 'store');
const store = fs
  .readdirSync(storeDir)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => fs.readFileSync(path.join(storeDir, f), 'utf8'))
  .join('\n');

const checks = [];
function check(name, cond) {
  checks.push({ name, ok: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
}

const channels = [
  'shell:passwords-status',
  'shell:passwords-setup',
  'shell:passwords-unlock',
  'shell:passwords-lock',
  'shell:passwords-list',
  'shell:passwords-get',
  'shell:passwords-find',
  'shell:passwords-autofill',
  'shell:passwords-add',
  'shell:passwords-update',
  'shell:passwords-remove',
  'shell:passwords-should-save',
  'shell:passwords-confirm-save',
  'shell:passwords-dismiss-save',
  'shell:passwords-generate',
  'shell:passwords-audit',
  'shell:passwords-export',
  'shell:passwords-import',
  'shell:passwords-activity',
  'shell:passwords-page-script',
  'shell:passwords-copy',
  'shell:passwords-totp',
];

for (const ch of channels) {
  check(`main registers ${ch}`, ipcBundle.includes(`'${ch}'`));
  const camel = ch
    .replace('shell:', '')
    .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^passwords/, 'passwords');
  // preload uses camelCase like passwordsStatus
}

check('main assertFromApp', main.includes('assertFromApp'));
check('main wrapPw', main.includes('wrapPw'));
check('main wrapApp', main.includes('wrapApp'));
check('main sandbox true', /sandbox:\s*true/.test(main));
check('main security module', main.includes('./security.cjs'));
check('main will-attach / permissions', main.includes('attachWebviewGuard') || main.includes('attachPermissionHandlers'));
check('main webview preload via will-attach only', main.includes('will-attach-webview') || security.includes('will-attach-webview'));
check('main no registerPreloadScript frame', !main.includes('registerPreloadScript'));
check('main powerMonitor via passwords.init', main.includes('passwords.init'));
check('preload permissionsRespond', preload.includes('permissionsRespond'));
check('preload onPermissionAsk', preload.includes('onPermissionAsk'));
check('preload passwordsStatus', preload.includes('passwordsStatus'));
check('preload passwordsAutofill', preload.includes('passwordsAutofill'));
check('preload passwordsConfirmSave', preload.includes('passwordsConfirmSave'));
check('preload onPasswordsLocked', preload.includes('onPasswordsLocked'));
check('webview preload sendToHost', wv.includes('sendToHost'));
check('webview preload djxxr-pw-cmd', wv.includes('djxxr-pw-cmd'));
check('webview no vault require', !wv.includes('passwords.cjs') && !wv.includes('safeStorage'));
check('webview no fs', !wv.includes("require('fs')") && !wv.includes('require("fs")'));
check('preload no fs', !preload.includes("require('fs')") && !preload.includes('require("fs")'));

check('App ipc-message handler', app.includes("djxxr-pw"));
check('App origin via getURL', app.includes('getURL()') && app.includes('pageOrigin'));
check('App save bar', app.includes('pw-save-bar') && app.includes('passwordsConfirmSave'));
check('App KeyRound omnibox', app.includes('KeyRound'));
check('App rejects http autofill path', app.includes("protocol !== 'https:'"));

check('PasswordsPanel unlock UI', panel.includes('Odblokuj'));
check('PasswordsPanel generator', panel.includes('Generator'));
check('PasswordsPanel audit', panel.includes('Audyt'));
check('PasswordsPanel import', panel.includes('Import'));

check('store passwords settings', store.includes('passwordsEnabled') && store.includes('passwordsIdleMinutes'));
check('store passwords tab', store.includes("'passwords'"));

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} wiring checks passed`);
if (failed.length) process.exitCode = 1;
