/**
 * Headless-ish install of 5 popular CWS extensions via Electron main APIs.
 * Run: npx electron scripts/diag-ext-install.cjs
 */
'use strict';

const path = require('node:path');
const { app } = require('electron');

const EXTS = [
  { name: 'uBlock Origin Lite', id: 'ddkjiahejlhfcafbddmgiahcphecmpfh' },
  { name: 'Bitwarden', id: 'nngceckbapebfimnlniiiahkandclblb' },
  { name: 'Dark Reader', id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh' },
  { name: 'Return YouTube Dislike', id: 'gebbhagfogifgggkldgodflihgfeippi' },
  { name: 'SponsorBlock', id: 'mnjggcdmjocbbbhaepdhchncahnbgone' },
];

app.whenReady().then(async () => {
  const extensions = require(path.join(__dirname, '..', 'electron', 'extensions.cjs'));
  await extensions.init();
  const rows = [];
  for (const ext of EXTS) {
    const row = { name: ext.name, id: ext.id, install: '?', loaded: false, warn: '' };
    try {
      const res = await extensions.installFromStore(ext.id);
      if (!res?.ok) {
        row.install = `FAIL ${res?.error || 'unknown'}`;
      } else {
        row.install = `ok v${res.extension?.version || '?'} id=${res.extension?.id || '?'}`;
        row.loaded = Boolean(res.extension?.loaded);
        row.limited = Boolean(res.extension?.limitedSupport);
        row.warn = (res.extension?.warnings || []).join(' | ');
      }
    } catch (err) {
      row.install = `ERR ${err?.message || err}`;
    }
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  console.log('--- list after ---');
  for (const e of extensions.list()) {
    console.log(
      JSON.stringify({
        name: e.name,
        id: e.id,
        enabled: e.enabled,
        loaded: e.loaded,
        pinned: e.pinned,
        limited: e.limitedSupport,
      }),
    );
  }
  app.exit(0);
}).catch((err) => {
  console.error(err);
  app.exit(1);
});
