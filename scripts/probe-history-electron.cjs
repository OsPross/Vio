'use strict';

/**
 * Live Electron probe: boot real userData history path, record 3 visits, list, quit.
 * Usage: electron scripts/probe-history-electron.cjs
 */
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Use same userData as the app
app.setName('moja-przegladarka');

app.whenReady().then(() => {
  const history = require('../electron/history.cjs');
  history.init();
  history.setConfig({ retention: 'always' });

  const r1 = history.recordVisit({ url: 'https://example.com/probe', title: 'Probe Example' });
  const r2 = history.recordVisit({ url: 'https://wikipedia.org/wiki/Probe', title: 'Probe Wiki' });
  const r3 = history.recordVisit({ url: 'https://github.com/probe', title: 'Probe GitHub', typed: true });
  history.flushSync();

  const dir = path.join(app.getPath('userData'), 'history');
  const file = path.join(dir, 'visits.jsonl');
  const list = history.list({ limit: 20 });
  const exists = fs.existsSync(file);
  const disk = exists ? fs.readFileSync(file, 'utf8') : '';

  console.log(
    JSON.stringify(
      {
        userData: app.getPath('userData'),
        historyDir: dir,
        record: [r1, r2, r3],
        total: list.total,
        fileExists: exists,
        diskLines: disk.trim() ? disk.trim().split('\n').length : 0,
        sample: list.items.slice(0, 3).map((i) => ({ url: i.url, title: i.title })),
      },
      null,
      2,
    ),
  );

  const ok = r1.ok && r2.ok && r3.ok && exists && list.total >= 3;
  app.exit(ok ? 0 : 1);
});
