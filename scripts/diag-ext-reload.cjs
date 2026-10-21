'use strict';
const path = require('node:path');
const { app } = require('electron');
app.whenReady().then(async () => {
  const extensions = require(path.join(__dirname, '..', 'electron', 'extensions.cjs'));
  await extensions.init();
  for (const e of extensions.list()) {
    console.log(JSON.stringify({ name: e.name, id: e.id, loaded: e.loaded, enabled: e.enabled }));
  }
  app.exit(0);
}).catch((err) => {
  console.error(err);
  app.exit(1);
});
