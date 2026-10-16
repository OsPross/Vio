/**
 * Chrome-compatible extension IDs (a–p, 32 chars) from SPKI public keys / CRX headers.
 * Matches Chromium's Extension::GenerateId for unpacked installs with manifest "key".
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {Buffer|Uint8Array} der SPKI DER public key
 * @returns {string}
 */
function publicKeyDerToExtensionId(der) {
  const hash = crypto.createHash('sha256').update(Buffer.from(der)).digest();
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(97 + (hash[i] >> 4));
    id += String.fromCharCode(97 + (hash[i] & 0xf));
  }
  return id;
}

/**
 * @param {string} keyField manifest "key" (base64 SPKI or PEM)
 * @returns {Buffer|null}
 */
function decodeManifestKey(keyField) {
  if (!keyField || typeof keyField !== 'string') return null;
  const cleaned = keyField.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  if (!cleaned) return null;
  try {
    const der = Buffer.from(cleaned, 'base64');
    return der.length > 0 ? der : null;
  } catch {
    return null;
  }
}

/**
 * @param {Buffer} buf
 * @param {number} start
 * @returns {{ value: number, next: number }}
 */
function readVarint(buf, start) {
  let i = start;
  let value = 0;
  let shift = 0;
  while (i < buf.length) {
    const b = buf[i++];
    value |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
    if (shift > 35) break;
  }
  return { value: value >>> 0, next: i };
}

/**
 * Protobuf field walker with multi-byte tags (needed for CRX3 field 10000).
 * @param {Buffer} buf
 * @returns {{ fieldNum: number, data: Buffer }[]}
 */
function parseProtobufBytesFields(buf) {
  const fields = [];
  let i = 0;
  while (i < buf.length) {
    const tagV = readVarint(buf, i);
    i = tagV.next;
    const fieldNum = tagV.value >>> 3;
    const wireType = tagV.value & 7;
    if (wireType === 2) {
      const lenV = readVarint(buf, i);
      i = lenV.next;
      const len = lenV.value;
      if (i + len > buf.length) return fields;
      fields.push({ fieldNum, data: buf.subarray(i, i + len) });
      i += len;
    } else if (wireType === 0) {
      i = readVarint(buf, i).next;
    } else if (wireType === 5) {
      i += 4;
    } else if (wireType === 1) {
      i += 8;
    } else {
      break;
    }
  }
  return fields;
}

/**
 * Looks like SubjectPublicKeyInfo (SEQUENCE …).
 * @param {Buffer} buf
 */
function looksLikeSpki(buf) {
  return Boolean(buf && buf.length >= 50 && buf[0] === 0x30);
}

/**
 * @param {Buffer} buf full .crx file
 * @returns {Buffer[]} candidate SPKI public keys from CRX2/CRX3 proofs
 */
function extractAllPublicKeysFromCrx(buf) {
  const out = [];
  if (!buf || buf.length < 16 || buf.toString('utf8', 0, 4) !== 'Cr24') return out;
  const version = buf.readUInt32LE(4);
  if (version === 2) {
    const pubkeyLen = buf.readUInt32LE(8);
    if (16 + pubkeyLen <= buf.length) {
      const der = Buffer.from(buf.subarray(16, 16 + pubkeyLen));
      if (looksLikeSpki(der)) out.push(der);
    }
    return out;
  }
  if (version === 3) {
    const headerLen = buf.readUInt32LE(8);
    if (12 + headerLen > buf.length) return out;
    const header = buf.subarray(12, 12 + headerLen);
    const top = parseProtobufBytesFields(header);
    for (const f of top) {
      // 2 = sha256_with_rsa, 3 = sha256_with_ecdsa
      if (f.fieldNum !== 2 && f.fieldNum !== 3) continue;
      const proof = parseProtobufBytesFields(f.data);
      for (const p of proof) {
        if (p.fieldNum === 1 && looksLikeSpki(p.data)) {
          out.push(Buffer.from(p.data));
        }
      }
    }
  }
  return out;
}

/**
 * @param {Buffer} buf full .crx
 * @param {string} [preferredId] Chrome Web Store id — pick matching key when present
 * @returns {Buffer|null}
 */
function extractPublicKeyFromCrx(buf, preferredId) {
  const keys = extractAllPublicKeysFromCrx(buf);
  if (!keys.length) return null;
  const want = preferredId && isChromeExtensionId(preferredId) ? preferredId.toLowerCase() : null;
  if (want) {
    const match = keys.find((k) => publicKeyDerToExtensionId(k) === want);
    if (match) return match;
  }
  // Prefer RSA SPKI (longer) over short ECDSA keys when no preferred id
  keys.sort((a, b) => b.length - a.length);
  return keys[0];
}

/**
 * Write manifest.key so Electron/Chromium assigns a stable Chrome ID.
 * @param {string} dir unpacked extension directory
 * @param {Buffer} publicKeyDer
 * @returns {{ id: string, changed: boolean }}
 */
function ensureManifestKey(dir, publicKeyDer) {
  const mfPath = path.join(dir, 'manifest.json');
  const raw = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
  const keyB64 = Buffer.from(publicKeyDer).toString('base64');
  const id = publicKeyDerToExtensionId(publicKeyDer);
  if (raw.key === keyB64) return { id, changed: false };
  raw.key = keyB64;
  fs.writeFileSync(mfPath, `${JSON.stringify(raw, null, 2)}\n`);
  return { id, changed: true };
}

/**
 * Stable RSA key for folder/zip installs without a CRX signature.
 * @returns {{ der: Buffer, id: string }}
 */
function generateDevPublicKey() {
  const { publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const der = Buffer.from(publicKey);
  return { der, id: publicKeyDerToExtensionId(der) };
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isChromeExtensionId(id) {
  return typeof id === 'string' && /^[a-p]{32}$/i.test(id);
}

/**
 * True for an https Chrome Web Store page (same hosts as the webview-preload companion).
 * @param {string} url
 * @returns {boolean}
 */
function isChromeWebStoreUrl(url) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'https:') return false;
    if (u.hostname === 'chromewebstore.google.com') return true;
    return u.hostname === 'chrome.google.com' && /^\/webstore\b/i.test(u.pathname);
  } catch {
    return false;
  }
}

module.exports = {
  isChromeWebStoreUrl,
  publicKeyDerToExtensionId,
  decodeManifestKey,
  extractPublicKeyFromCrx,
  extractAllPublicKeysFromCrx,
  ensureManifestKey,
  generateDevPublicKey,
  isChromeExtensionId,
};
