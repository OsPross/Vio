'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/** @type {'pl'|'en'} */
let current = 'pl';

/** @type {Record<string, unknown>|null} */
let catalog = null;

function catalogsDir() {
  const candidates = [
    path.join(__dirname, '..', '..', 'src', 'i18n', 'locales'),
    path.join(app.getAppPath(), 'src', 'i18n', 'locales'),
    path.join(app.getAppPath(), 'dist', 'locales'),
    path.join(process.resourcesPath || '', 'locales'),
  ];
  for (const dir of candidates) {
    try {
      if (dir && fs.existsSync(path.join(dir, 'pl.json'))) return dir;
    } catch {
      /* */
    }
  }
  return candidates[0];
}

/**
 * @param {Record<string, unknown>} dict
 * @param {string} key
 */
function lookup(dict, key) {
  if (!key || !dict) return undefined;
  if (typeof dict[key] === 'string') return dict[key];
  const parts = key.split('.');
  let cur = dict;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * @param {string} template
 * @param {Record<string, string|number>|undefined} params
 */
function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    params[k] == null ? '' : String(params[k]),
  );
}

function loadCatalog(locale) {
  const lang = locale === 'en' ? 'en' : 'pl';
  const file = path.join(catalogsDir(), `${lang}.json`);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[locale] load failed', file, e && e.message);
    if (lang !== 'pl') {
      try {
        return JSON.parse(fs.readFileSync(path.join(catalogsDir(), 'pl.json'), 'utf8'));
      } catch {
        /* */
      }
    }
    return {};
  }
}

/**
 * @param {'pl'|'en'} locale
 */
function setAppLocale(locale) {
  current = locale === 'en' ? 'en' : 'pl';
  catalog = loadCatalog(current);
  return current;
}

function getAppLocale() {
  return current;
}

/**
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 */
function t(key, params) {
  if (!catalog) catalog = loadCatalog(current);
  let s = lookup(catalog, key);
  if (s == null && current !== 'pl') {
    const pl = loadCatalog('pl');
    s = lookup(pl, key);
  }
  if (s == null) return key;
  return interpolate(s, params);
}

module.exports = {
  setAppLocale,
  getAppLocale,
  t,
  loadCatalog,
};
