'use strict';

/** Local favicon cache — no third-party CDN. Returns data: URLs (CSP-safe). */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app, net } = require('electron');

function dir() {
  return path.join(app.getPath('userData'), 'favicon-cache');
}

function keyFor(pageUrl) {
  let host = 'unknown';
  try {
    host = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    /* */
  }
  return crypto.createHash('sha1').update(host).digest('hex');
}

function metaPath(key) {
  return path.join(dir(), `${key}.json`);
}

function filePath(key, ext) {
  return path.join(dir(), `${key}${ext}`);
}

function mimeForExt(ext) {
  if (ext === '.png') return 'image/png';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/x-icon';
}

function toDataUrl(file, ext) {
  const buf = fs.readFileSync(file);
  return `data:${mimeForExt(ext)};base64,${buf.toString('base64')}`;
}

function getCached(pageUrl) {
  try {
    const key = keyFor(pageUrl);
    const meta = JSON.parse(fs.readFileSync(metaPath(key), 'utf8'));
    if (!meta.file) return null;
    if (Date.now() - (meta.at || 0) > 30 * 24 * 60 * 60 * 1000) return null;
    if (String(meta.file).startsWith('data:')) return meta.file;
    if (!fs.existsSync(meta.file)) return null;
    const ext = path.extname(meta.file).toLowerCase() || '.ico';
    return toDataUrl(meta.file, ext);
  } catch {
    return null;
  }
}

async function storeFromUrl(pageUrl, faviconUrl) {
  // Never persist favicons for onion / Tor destinations
  if (/\.onion\b/i.test(String(pageUrl || '')) || /\.onion\b/i.test(String(faviconUrl || ''))) {
    return null;
  }
  fs.mkdirSync(dir(), { recursive: true });
  const key = keyFor(pageUrl);
  if (!faviconUrl) return null;
  if (faviconUrl.startsWith('data:')) {
    fs.writeFileSync(metaPath(key), JSON.stringify({ at: Date.now(), file: faviconUrl, src: 'data' }));
    return faviconUrl;
  }
  try {
    const res = await net.fetch(faviconUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 512 * 1024) return null;
    const ct = String(res.headers.get('content-type') || '');
    const ext = ct.includes('png')
      ? '.png'
      : ct.includes('svg')
        ? '.svg'
        : ct.includes('jpeg') || ct.includes('jpg')
          ? '.jpg'
          : ct.includes('webp')
            ? '.webp'
            : '.ico';
    const dest = filePath(key, ext);
    fs.writeFileSync(dest, buf);
    fs.writeFileSync(metaPath(key), JSON.stringify({ at: Date.now(), file: dest, src: faviconUrl }));
    return toDataUrl(dest, ext);
  } catch {
    return null;
  }
}

module.exports = { getCached, storeFromUrl, dir };
