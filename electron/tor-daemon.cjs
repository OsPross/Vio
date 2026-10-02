'use strict';

/**
 * Embedded Tor Expert Bundle (Windows x86_64) or system `tor` on Linux.
 * Downloads once into userData on Windows, spawns on SocksPort 19050.
 * Prefer external Tor (9050/9150) when available — this is the fallback.
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { app } = require('electron');

const { TorControl } = require('./tor-control.cjs');
const builtinBridges = require('./tor-bridges-builtin.cjs');

const BUNDLE = {
  version: '15.0.24',
  filename: 'tor-expert-bundle-windows-x86_64-15.0.24.tar.gz',
  /** Prefer www.torproject.org/dist per Tor Project packaging docs */
  url: 'https://www.torproject.org/dist/torbrowser/15.0.24/tor-expert-bundle-windows-x86_64-15.0.24.tar.gz',
  sumsUrl: 'https://www.torproject.org/dist/torbrowser/15.0.24/sha256sums-signed-build.txt',
  /** Fallback pinned hash (must still match signed-build list when fetched) */
  sha256: 'e9dc6ccc93cd6afa507193f4de284d6424233ff5102155cd2c94b259e8a22b65',
  socksPort: 19050,
  /** Filled at writeTorrc with a free localhost port */
  controlPort: 0,
  signingFingerprint: 'EF6E286DDA85EA2A4BA7DE684E2C6E8793298290',
};

/**
 * Bridge mode: none | obfs4 | snowflake | meek | custom
 * @type {{ mode: string, customLines: string[] }}
 */
let bridgeConfig = { mode: 'none', customLines: [] };

/** @type {import('./tor-control.cjs').TorControl | null} */
let control = null;

const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'www.torproject.org',
  'dist.torproject.org',
  'archive.torproject.org',
  'cdn.torproject.org',
]);


/** @type {import('node:child_process').ChildProcess | null} */
let child = null;
let startedByUs = false;
let bootProgress = 0;
/** @type {((ev: { phase: string, message: string, percent?: number }) => void) | null} */
let onProgress = null;

function setProgressHandler(fn) {
  onProgress = fn;
}

function emit(phase, message, percent) {
  try {
    onProgress?.({ phase, message, percent });
  } catch {
    /* */
  }
}

function probePort(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const t = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(t);
      socket.end();
      resolve(true);
    });
    socket.once('error', () => {
      clearTimeout(t);
      resolve(false);
    });
  });
}

function rootDir() {
  return path.join(app.getPath('userData'), 'tor-runtime', BUNDLE.version);
}

function archivePath() {
  return path.join(rootDir(), BUNDLE.filename);
}

function extractDir() {
  return path.join(rootDir(), 'bundle');
}

function dataDir() {
  return path.join(rootDir(), 'data');
}

function torrcPath() {
  return path.join(rootDir(), 'torrc');
}

function markerPath() {
  return path.join(rootDir(), '.ready');
}

function socksUrl() {
  return `socks5://127.0.0.1:${BUNDLE.socksPort}`;
}

function isRunning() {
  return Boolean(child && child.pid && !child.killed);
}

function findFile(dir, names) {
  const want = new Set(names.map((n) => n.toLowerCase()));
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (want.has(ent.name.toLowerCase())) return full;
    }
  }
  return null;
}

function findTorExe() {
  const base = extractDir();
  if (!fs.existsSync(base)) return null;
  return (
    findFile(base, ['tor.exe', 'tor']) ||
    (fs.existsSync(path.join(base, 'tor', 'tor.exe')) ? path.join(base, 'tor', 'tor.exe') : null)
  );
}

/** System `tor` from PATH (Linux / non-Windows). */
function findSystemTor() {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const out = require('node:child_process')
      .execFileSync(which, ['tor'], { encoding: 'utf8', windowsHide: true })
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)[0];
    if (out && fs.existsSync(out)) return out;
  } catch {
    /* not on PATH */
  }
  return null;
}

function findTransport(names) {
  const base = extractDir();
  if (!fs.existsSync(base)) return null;
  return findFile(base, names);
}

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      srv.close((err) => {
        if (err || !port) reject(err || new Error('Brak wolnego portu'));
        else resolve(port);
      });
    });
    srv.on('error', reject);
  });
}

function cookiePath() {
  return path.join(dataDir(), 'control_auth_cookie');
}

function bridgeConfigPath() {
  return path.join(rootDir(), 'bridge-config.json');
}

function loadBridgeConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(bridgeConfigPath(), 'utf8'));
    if (raw && typeof raw === 'object') {
      bridgeConfig = {
        mode: typeof raw.mode === 'string' ? raw.mode : 'none',
        customLines: Array.isArray(raw.customLines) ? raw.customLines.map(String) : [],
      };
    }
  } catch {
    /* */
  }
  return { ...bridgeConfig, customLines: [...bridgeConfig.customLines] };
}

function saveBridgeConfig(next) {
  if (next && typeof next === 'object') {
    if (typeof next.mode === 'string') bridgeConfig.mode = next.mode;
    if (Array.isArray(next.customLines)) {
      bridgeConfig.customLines = next.customLines.map((l) => String(l).trim()).filter(Boolean);
    }
  }
  fs.mkdirSync(path.dirname(bridgeConfigPath()), { recursive: true });
  fs.writeFileSync(bridgeConfigPath(), JSON.stringify(bridgeConfig, null, 2), 'utf8');
  return loadBridgeConfig();
}

/** Validate a single bridge line (transport host:port fingerprint …) */
function validateBridgeLine(line) {
  const s = String(line || '').trim();
  if (!s || s.startsWith('#')) return { ok: false, error: 'Pusta linia' };
  const m = s.match(/^(obfs4|snowflake|meek_lite|webtunnel|scramblesuit|fte)\s+(\S+)\s+([A-F0-9]{40})\b/i);
  if (!m) {
    // plain Bridge IP:port fingerprint
    const plain = s.match(/^(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}\s+[A-F0-9]{40}\b/i);
    if (!plain) return { ok: false, error: `Nieprawidłowy format mostu: ${s.slice(0, 60)}` };
  }
  return { ok: true, line: s };
}

function resolveBridgeLines(mode, customLines) {
  const m = mode || 'none';
  if (m === 'none') return [];
  if (m === 'custom') {
    return (customLines || [])
      .map((l) => validateBridgeLine(l))
      .filter((r) => r.ok)
      .map((r) => r.line);
  }
  if (m === 'obfs4') return [...builtinBridges.obfs4];
  if (m === 'snowflake') return [...builtinBridges.snowflake];
  if (m === 'meek') return [...builtinBridges.meek];
  return [];
}

function download(url, dest, onPct) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('Nieprawidłowy URL pobierania Tor'));
      return;
    }
    if (parsed.protocol !== 'https:') {
      reject(new Error('Paczka Tor tylko przez HTTPS'));
      return;
    }
    if (!ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname)) {
      reject(new Error(`Odrzucono host pobierania Tora: ${parsed.hostname}`));
      return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;
    const file = fs.createWriteStream(tmp);
    const req = https.get(url, { headers: { 'User-Agent': 'djxxr-przegladarka/0.1' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* */
        }
        let next = res.headers.location;
        try {
          next = new URL(res.headers.location, url).href;
        } catch {
          /* */
        }
        download(next, dest, onPct).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode} przy pobieraniu Tora`));
        return;
      }
      const total = Number(res.headers['content-length']) || 0;
      let got = 0;
      res.on('data', (chunk) => {
        got += chunk.length;
        if (total > 0 && onPct) onPct(Math.min(99, Math.round((got / total) * 100)));
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          try {
            fs.renameSync(tmp, dest);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
    });
    req.on('error', (err) => {
      try {
        file.close();
        fs.unlinkSync(tmp);
      } catch {
        /* */
      }
      reject(err);
    });
  });
}

function downloadText(url) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('Zły URL listy sum'));
      return;
    }
    if (parsed.protocol !== 'https:' || !ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname)) {
      reject(new Error(`Odrzucono host listy sum: ${parsed.hostname}`));
      return;
    }
    https
      .get(url, { headers: { 'User-Agent': 'djxxr-przegladarka/0.1' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let next = res.headers.location;
          try {
            next = new URL(res.headers.location, url).href;
          } catch {
            /* */
          }
          downloadText(next).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} lista sum Tor`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      })
      .on('error', reject);
  });
}

function hashFromSignedSums(sumsText, filename) {
  const lines = String(sumsText || '').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (!m) continue;
    const name = m[2].trim().replace(/^\.\//, '');
    if (name === filename || name.endsWith('/' + filename)) return m[1].toLowerCase();
  }
  return null;
}

function torBrowserKeyPath() {
  return path.join(__dirname, 'tor-keys', 'torbrowser.asc');
}

/**
 * Load bundled Tor Browser Developers key and assert fingerprint.
 * @returns {Promise<import('openpgp').Key>}
 */
async function loadBundledTorKey() {
  const openpgp = require('openpgp');
  const keyPath = torBrowserKeyPath();
  if (!fs.existsSync(keyPath)) {
    throw Object.assign(new Error('Brak electron/tor-keys/torbrowser.asc w instalacji'), {
      code: 'TOR_KEY_MISSING',
    });
  }
  const armored = fs.readFileSync(keyPath, 'utf8');
  if (!/BEGIN PGP PUBLIC KEY BLOCK/.test(armored)) {
    throw Object.assign(new Error('torbrowser.asc nie wygląda na klucz OpenPGP'), {
      code: 'TOR_KEY_BAD',
    });
  }
  const keys = await openpgp.readKeys({ armoredKeys: armored });
  if (!keys.length) {
    throw Object.assign(new Error('Nie odczytano klucza Tor Browser Developers'), {
      code: 'TOR_KEY_BAD',
    });
  }
  const key = keys[0];
  const fp = String(key.getFingerprint() || '')
    .replace(/\s+/g, '')
    .toUpperCase();
  const want = BUNDLE.signingFingerprint.replace(/\s+/g, '').toUpperCase();
  if (fp !== want) {
    throw Object.assign(
      new Error(`Fingerprint klucza Tor (${fp}) ≠ oczekiwany ${want}`),
      { code: 'TOR_KEY_FP', fingerprint: fp, expected: want },
    );
  }
  return key;
}

/**
 * Detached signature verify: sha256sums-signed-build.txt + .asc against bundled key.
 * Fail-closed — no soft skip.
 * @param {string} sumsText
 * @param {string} ascArmored
 * @param {import('openpgp').Key} [publicKey]
 */
async function verifySha256SumsSignature(sumsText, ascArmored, publicKey) {
  const openpgp = require('openpgp');
  if (!sumsText || !String(sumsText).trim()) {
    throw Object.assign(new Error('Pusta lista sha256sums-signed-build.txt'), { code: 'TOR_SUMS_EMPTY' });
  }
  if (!ascArmored || !/BEGIN PGP SIGNATURE/.test(ascArmored)) {
    throw Object.assign(new Error('Brak lub uszkodzony plik .asc podpisu listy sum'), {
      code: 'TOR_ASC_MISSING',
    });
  }
  const key = publicKey || (await loadBundledTorKey());
  let signature;
  try {
    signature = await openpgp.readSignature({ armoredSignature: ascArmored });
  } catch (err) {
    throw Object.assign(new Error(`Nieparsowalny podpis .asc: ${err.message || err}`), {
      code: 'TOR_ASC_BAD',
    });
  }
  const message = await openpgp.createMessage({ text: String(sumsText) });
  let result;
  try {
    result = await openpgp.verify({
      message,
      signature,
      verificationKeys: key,
    });
  } catch (err) {
    throw Object.assign(new Error(`Weryfikacja OpenPGP nieudana: ${err.message || err}`), {
      code: 'TOR_SIG_FAIL',
    });
  }
  if (!result.signatures || !result.signatures.length) {
    throw Object.assign(new Error('Brak wyników podpisu OpenPGP'), { code: 'TOR_SIG_FAIL' });
  }
  try {
    await result.signatures[0].verified;
  } catch (err) {
    throw Object.assign(
      new Error(`Podpis listy sum Tor jest nieprawidłowy: ${err.message || err}`),
      { code: 'TOR_SIG_FAIL' },
    );
  }
  return {
    ok: true,
    fingerprint: BUNDLE.signingFingerprint,
    keyId: result.signatures[0].keyID?.toHex?.() || null,
  };
}

/**
 * Full chain: download sums+.asc → OpenPGP verify → SHA256 of archive must match list.
 * No hash-only fallback.
 */
async function verifyBundleIntegrity(archive) {
  const key = await loadBundledTorKey();
  const sumsPath = path.join(rootDir(), 'sha256sums-signed-build.txt');
  const ascPath = `${sumsPath}.asc`;

  emit('verify', 'Pobieranie podpisanej listy SHA-256…', 0);
  let sums;
  let asc;
  try {
    sums = await downloadText(BUNDLE.sumsUrl);
    asc = await downloadText(`${BUNDLE.sumsUrl}.asc`);
  } catch (err) {
    throw Object.assign(
      new Error(`Nie pobrano listy sum / podpisu Tor: ${err.message || err}`),
      { code: 'TOR_SUMS_FETCH' },
    );
  }
  fs.mkdirSync(rootDir(), { recursive: true });
  fs.writeFileSync(sumsPath, sums, 'utf8');
  fs.writeFileSync(ascPath, asc, 'utf8');

  emit('verify', 'Weryfikacja podpisu OpenPGP listy sum…', 0);
  const sig = await verifySha256SumsSignature(sums, asc, key);

  const expected = hashFromSignedSums(sums, BUNDLE.filename);
  if (!expected) {
    throw Object.assign(new Error(`Brak ${BUNDLE.filename} na podpisanej liście sum`), {
      code: 'TOR_SUMS_MISSING',
    });
  }

  emit('verify', 'Porównanie SHA-256 paczki…', 0);
  const hash = await sha256File(archive);
  if (hash !== expected) {
    try {
      fs.unlinkSync(archive);
    } catch {
      /* */
    }
    throw Object.assign(new Error('Suma SHA-256 paczki Tor się nie zgadza — instalacja przerwana.'), {
      code: 'TOR_HASH',
      got: hash,
      expected,
    });
  }

  const meta = {
    version: BUNDLE.version,
    filename: BUNDLE.filename,
    sha256: hash,
    path: archive,
    root: rootDir(),
    openpgpVerified: true,
    fingerprint: sig.fingerprint,
    at: Date.now(),
  };
  fs.writeFileSync(path.join(rootDir(), 'bundle-meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

function extractArchive(archive, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(dest, { recursive: true });
    execFile(
      'tar',
      ['-xzf', archive, '-C', dest],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, _stdout, stderr) => {
        if (err) reject(new Error(`Rozpakowanie Tora nieudane: ${stderr || err.message}`));
        else resolve();
      },
    );
  });
}

async function ensureBundle() {
  if (process.platform === 'linux') {
    const exe = findSystemTor();
    if (!exe) {
      throw Object.assign(
        new Error(
          'Brak systemowego tor w PATH. Zainstaluj pakiet tor (np. apt install tor) albo użyj zewnętrznego Tora — Tryb Tor jest wyłączony.',
        ),
        { code: 'TOR_SYSTEM_MISSING' },
      );
    }
    return { exe, reused: true, system: true };
  }

  if (process.platform !== 'win32') {
    throw Object.assign(
      new Error('Wbudowany Tor jest dostępny na Windows; na tej platformie zainstaluj systemowy tor lub użyj zewnętrznego proxy.'),
      { code: 'TOR_PLATFORM' },
    );
  }

  const exe = findTorExe();
  if (exe && fs.existsSync(markerPath())) {
    return { exe, reused: true };
  }

  fs.mkdirSync(rootDir(), { recursive: true });
  const archive = archivePath();

  if (!fs.existsSync(archive)) {
    emit('download', 'Pobieranie Tor Expert Bundle (~21 MB)…', 0);
    await download(BUNDLE.url, archive, (pct) => {
      emit('download', `Pobieranie Tora… ${pct}%`, pct);
    });
  }

  emit('verify', 'Weryfikacja SHA-256 / listy sum…', 0);
  await verifyBundleIntegrity(archive);

  const dest = extractDir();
  try {
    fs.rmSync(dest, { recursive: true, force: true });
  } catch {
    /* */
  }
  emit('extract', 'Rozpakowywanie Tora…', 0);
  await extractArchive(archive, dest);

  const found = findTorExe();
  if (!found) {
    throw Object.assign(new Error('Nie znaleziono tor.exe w paczce Expert Bundle.'), {
      code: 'TOR_MISSING_EXE',
    });
  }

  fs.writeFileSync(markerPath(), JSON.stringify({ version: BUNDLE.version, at: Date.now() }), 'utf8');
  return { exe: found, reused: false };
}

async function writeTorrc(exePath) {
  const data = dataDir();
  fs.mkdirSync(data, { recursive: true });
  const bundleRoot = extractDir();
  const geoip = findFile(bundleRoot, ['geoip']);
  const geoip6 = findFile(bundleRoot, ['geoip6']);

  loadBridgeConfig();
  const controlPort = await pickFreePort();
  BUNDLE.controlPort = controlPort;

  const lines = [
    `DataDirectory ${data.replace(/\\/g, '/')}`,
    `SocksPort 127.0.0.1:${BUNDLE.socksPort}`,
    `ControlPort 127.0.0.1:${controlPort}`,
    'CookieAuthentication 1',
    'ClientOnly 1',
    'AvoidDiskWrites 1',
    'SafeLogging 1',
    'Log notice stdout',
  ];
  if (geoip) lines.push(`GeoIPFile ${geoip.replace(/\\/g, '/')}`);
  if (geoip6) lines.push(`GeoIPv6File ${geoip6.replace(/\\/g, '/')}`);

  const bridgeLines = resolveBridgeLines(bridgeConfig.mode, bridgeConfig.customLines);
  if (bridgeLines.length) {
    lines.push('UseBridges 1');
    const lyrebird =
      findTransport(['lyrebird.exe', 'lyrebird']) ||
      findTransport(['obfs4proxy.exe', 'obfs4proxy']);
    const snowflake = findTransport(['snowflake-client.exe', 'snowflake-client']);
    const needObfs = bridgeLines.some((l) => /^obfs4\b/i.test(l) || /^meek_lite\b/i.test(l));
    const needSnow = bridgeLines.some((l) => /^snowflake\b/i.test(l));
    if (needObfs) {
      if (!lyrebird) {
        throw Object.assign(new Error('Brak lyrebird.exe w paczce Tor (obfs4/meek).'), {
          code: 'TOR_PT_MISSING',
        });
      }
      const p = lyrebird.replace(/\\/g, '/');
      lines.push(`ClientTransportPlugin obfs4 exec ${p}`);
      lines.push(`ClientTransportPlugin meek_lite exec ${p}`);
    }
    if (needSnow) {
      if (!snowflake) {
        throw Object.assign(new Error('Brak snowflake-client.exe w paczce Tor.'), {
          code: 'TOR_PT_MISSING',
        });
      }
      lines.push(`ClientTransportPlugin snowflake exec ${snowflake.replace(/\\/g, '/')}`);
    }
    for (const bl of bridgeLines) {
      lines.push(`Bridge ${bl}`);
    }
  }

  fs.writeFileSync(torrcPath(), `${lines.join('\n')}\n`, 'utf8');
  return { exePath, torrc: torrcPath(), controlPort };
}

async function connectControl() {
  disconnectControl();
  if (!BUNDLE.controlPort) return null;
  const cookie = cookiePath();
  // cookie appears shortly after tor starts
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(cookie)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!fs.existsSync(cookie)) {
    console.warn('[tor-daemon] control cookie missing');
    return null;
  }
  try {
    const c = new TorControl({
      host: '127.0.0.1',
      port: BUNDLE.controlPort,
      cookiePath: cookie,
    });
    await c.connect();
    await c.authenticate();
    control = c;
    return c;
  } catch (err) {
    console.warn('[tor-daemon] control connect', err.message || err);
    control = null;
    return null;
  }
}

function disconnectControl() {
  try {
    control?.close();
  } catch {
    /* */
  }
  control = null;
}

async function signalNewnym() {
  if (!control) await connectControl();
  if (!control) return { ok: false, error: 'Brak ControlPort' };
  try {
    await control.newnym();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

async function getCircuitStatus() {
  if (!control) await connectControl();
  if (!control) return { ok: false, circuits: [], error: 'Brak ControlPort' };
  try {
    const lines = await control.circuitStatus();
    const circuits = parseCircuitStatus(lines);
    return { ok: true, circuits };
  } catch (err) {
    return { ok: false, circuits: [], error: String(err.message || err) };
  }
}

/**
 * Parse GETINFO circuit-status lines into { id, status, path: [{fingerprint, nickname?}] }
 * @param {string[]} lines
 */
function parseCircuitStatus(lines) {
  const out = [];
  const blob = Array.isArray(lines) ? lines.join('\n') : String(lines || '');
  const re = /^(\d+)\s+BUILT\s+([^\s]+)(?:\s|$)/gm;
  // Also handle multiline 250+ format: 250+circuit-status=\n1 BUILT ...
  const body = blob.replace(/^250[+-]?circuit-status=/m, '\n').replace(/^250 OK.*/gm, '');
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^(\d+)\s+BUILT\s+(\S+)/);
    if (!m) continue;
    const hops = m[2].split(',').map((hop) => {
      const hm = hop.match(/^\$([A-F0-9]{40})(?:~([^=~]+))?/i);
      return {
        fingerprint: hm ? hm[1].toUpperCase() : hop,
        nickname: hm && hm[2] ? hm[2] : null,
      };
    });
    if (hops.length >= 2) {
      out.push({ id: m[1], status: 'BUILT', path: hops });
    }
  }
  return out;
}

async function getBootstrapPhase() {
  if (!control) await connectControl();
  if (!control) return { ok: false, percent: bootProgress, raw: '' };
  try {
    const raw = await control.bootstrapPhase();
    const m = String(raw).match(/PROGRESS=(\d+)/i);
    if (m) bootProgress = Number(m[1]);
    return { ok: true, percent: bootProgress, raw: String(raw) };
  } catch (err) {
    return { ok: false, percent: bootProgress, error: String(err.message || err) };
  }
}

function waitForSocks(timeoutMs = 180000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await probePort('127.0.0.1', BUNDLE.socksPort, 800)) {
        resolve(true);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('Timeout: Tor nie otworzył portu SOCKS (bootstrap).'));
        return;
      }
      setTimeout(() => void tick(), 500);
    };
    void tick();
  });
}

function waitForBootstrap(timeoutMs = 180000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    if (bootProgress >= 100) {
      resolve(true);
      return;
    }
    const tick = () => {
      if (bootProgress >= 100) {
        resolve(true);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        // SOCKS may still work near the end — allow if port is up and progress >= 80
        if (bootProgress >= 80) {
          resolve(true);
          return;
        }
        reject(new Error(`Timeout bootstrap Tor (ostatnio ${bootProgress}%).`));
        return;
      }
      setTimeout(tick, 400);
    };
    tick();
  });
}

/**
 * Ensure embedded tor is running. Returns socks URL.
 * @param {{ forceRestart?: boolean }} opts
 */
async function ensureRunning(opts = {}) {
  loadBridgeConfig();
  if (
    !opts.forceRestart &&
    isRunning() &&
    (await probePort('127.0.0.1', BUNDLE.socksPort, 800))
  ) {
    if (!control) await connectControl();
    return { ok: true, proxyUrl: socksUrl(), embedded: true, version: BUNDLE.version };
  }

  try {
    const { exe } = await ensureBundle();
    disconnectControl();
    if (child) {
      try {
        child.kill();
      } catch {
        /* */
      }
      child = null;
    }
    // brief pause so SOCKS port frees
    await new Promise((r) => setTimeout(r, 400));

    const { torrc } = await writeTorrc(exe);

    emit('bootstrap', 'Uruchamianie Tora i łączenie z siecią…', 0);
    bootProgress = 0;

    child = spawn(exe, ['-f', torrc], {
      cwd: path.dirname(exe),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    startedByUs = true;

    const onLog = (buf) => {
      const text = String(buf);
      const m = text.match(/Bootstrapped (\d+)/);
      if (m) {
        bootProgress = Number(m[1]);
        const stage = text.match(/Bootstrapped \d+%[^:]*:\s*(.+)/)?.[1] || '';
        emit(
          'bootstrap',
          stage ? `Tor ${bootProgress}% — ${stage.trim()}` : `Łączenie z siecią Tor… ${bootProgress}%`,
          bootProgress,
        );
      }
    };
    child.stdout?.on('data', onLog);
    child.stderr?.on('data', onLog);
    child.on('exit', (code) => {
      console.warn('[tor-daemon] exited', code);
      disconnectControl();
      child = null;
      startedByUs = false;
      bootProgress = 0;
    });

    await waitForSocks(180000);
    await connectControl();
    await waitForBootstrap(180000);
    emit('bootstrap', 'Tor gotowy', 100);
    return {
      ok: true,
      proxyUrl: socksUrl(),
      embedded: true,
      version: BUNDLE.version,
      bridges: bridgeConfig.mode,
      controlPort: BUNDLE.controlPort,
    };
  } catch (err) {
    await stop();
    return {
      ok: false,
      error: String(err.message || err),
      code: err.code || 'TOR_EMBED_FAIL',
    };
  }
}

/**
 * Apply bridge settings and restart daemon only when config changed and daemon is up.
 */
async function applyBridges(next) {
  loadBridgeConfig();
  const prev = JSON.stringify(bridgeConfig);
  const validated = [];
  if (next?.mode === 'custom' && Array.isArray(next.customLines)) {
    for (const line of next.customLines) {
      const v = validateBridgeLine(line);
      if (!v.ok) return { ok: false, error: v.error };
      validated.push(v.line);
    }
    if (!validated.length) return { ok: false, error: 'Wklej przynajmniej jeden most' };
  }
  const mode = next?.mode || 'none';
  saveBridgeConfig({
    mode,
    customLines: mode === 'custom' ? validated : bridgeConfig.customLines,
  });
  const changed = JSON.stringify(bridgeConfig) !== prev;
  if (changed && (isRunning() || startedByUs)) {
    return ensureRunning({ forceRestart: true });
  }
  return { ok: true, bridges: bridgeConfig.mode, restarted: false, changed };
}

async function stop() {
  disconnectControl();
  if (child) {
    try {
      child.kill();
    } catch {
      /* */
    }
    child = null;
  }
  startedByUs = false;
  bootProgress = 0;
  return { ok: true };
}

function status() {
  loadBridgeConfig();
  const systemTor = process.platform === 'linux' ? findSystemTor() : null;
  return {
    embeddedAvailable: process.platform === 'win32' || Boolean(systemTor),
    embeddedRunning: isRunning(),
    startedByUs,
    version: BUNDLE.version,
    socksPort: BUNDLE.socksPort,
    controlPort: BUNDLE.controlPort,
    proxyUrl: socksUrl(),
    bundleDir: rootDir(),
    signingFingerprint: BUNDLE.signingFingerprint,
    autostartShortcut: process.platform === 'win32' ? startupShortcutPath() : '',
    autostartEnabled: process.platform === 'win32' && fs.existsSync(startupShortcutPath()),
    bridges: { ...bridgeConfig, builtinUpdated: builtinBridges.updated },
    bootProgress,
    systemTor: systemTor || null,
  };
}

function startupShortcutPath() {
  return path.join(
    app.getPath('appData'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
    'djxxr Tor Daemon.lnk',
  );
}

/** Remove known leftover Startup shortcuts (migration — never auto-add). */
function removeAutostartShortcuts() {
  const names = [
    'djxxr Tor Daemon.lnk',
    'djxxr Tor.lnk',
    'Moja Przeglądarka Tor.lnk',
    'djxxr Tor Expert.lnk',
  ];
  const dir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  const removed = [];
  for (const name of names) {
    const p = path.join(dir, name);
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        removed.push(p);
      }
    } catch (e) {
      console.warn('[tor-daemon] remove autostart', p, e.message || e);
    }
  }
  return { ok: true, removed };
}

/**
 * Optional Windows Startup shortcut — default OFF. Only when user enables in settings.
 * @param {boolean} enabled
 */
function setAutostart(enabled) {
  if (process.platform !== 'win32') return { ok: false, error: 'Tylko Windows' };
  const { shell } = require('electron');
  removeAutostartShortcuts();
  if (!enabled) return { ok: true, enabled: false };
  const exe = findTorExe();
  if (!exe) {
    return { ok: false, error: 'Brak tor.exe — najpierw uruchom Tryb Tor (pobranie paczki).' };
  }
  const shortcut = startupShortcutPath();
  const ok = shell.writeShortcutLink(shortcut, 'create', {
    target: exe,
    args: `-f "${torrcPath()}"`,
    cwd: path.dirname(exe),
    description: 'djxxr Tor Daemon (opcjonalny autostart)',
    appUserModelId: 'local.djxxr.przegladarka.tor',
  });
  if (!ok) return { ok: false, error: 'Nie udało się utworzyć skrótu Autostart' };
  return { ok: true, enabled: true, path: shortcut };
}

module.exports = {
  BUNDLE,
  ensureRunning,
  stop,
  status,
  setProgressHandler,
  socksUrl,
  isRunning,
  removeAutostartShortcuts,
  setAutostart,
  startupShortcutPath,
  verifyBundleIntegrity,
  loadBundledTorKey,
  verifySha256SumsSignature,
  hashFromSignedSums,
  torBrowserKeyPath,
  ALLOWED_DOWNLOAD_HOSTS,
  applyBridges,
  loadBridgeConfig,
  saveBridgeConfig,
  validateBridgeLine,
  signalNewnym,
  getCircuitStatus,
  getBootstrapPhase,
  connectControl,
  parseCircuitStatus,
  builtinBridges,
};
