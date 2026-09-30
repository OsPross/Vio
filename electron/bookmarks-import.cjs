const fs = require('fs');
const path = require('path');

function localAppData() {
  if (process.env.LOCALAPPDATA) return process.env.LOCALAPPDATA;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return path.join(home, 'AppData', 'Local');
}

const PROFILE_SPECS = [
  { browser: 'Chrome', rel: ['Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'] },
  { browser: 'Brave', rel: ['BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Bookmarks'] },
  { browser: 'Edge', rel: ['Microsoft', 'Edge', 'User Data', 'Default', 'Bookmarks'] },
];

function profilePath(spec) {
  return path.resolve(localAppData(), ...spec.rel);
}

function discoverProfiles() {
  return PROFILE_SPECS.map((spec) => {
    const full = profilePath(spec);
    return {
      browser: spec.browser,
      path: full,
      exists: fs.existsSync(full),
    };
  });
}

function isAllowedPath(requested) {
  const resolved = path.resolve(String(requested || ''));
  return discoverProfiles().some((p) => p.exists && path.resolve(p.path) === resolved);
}

function readProfileBookmarks(requestedPath) {
  const resolved = path.resolve(String(requestedPath || ''));
  if (!isAllowedPath(resolved)) {
    throw new Error('Niedozwolona ścieżka profilu zakładek');
  }
  return fs.readFileSync(resolved, 'utf8');
}

module.exports = {
  discoverProfiles,
  readProfileBookmarks,
};
