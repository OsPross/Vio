/**
 * Diagnose CRX download + unpack for popular CWS extensions (no Electron UI).
 * Run: node scripts/diag-ext-crx.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const EXTS = [
  { name: 'uBlock Origin Lite', id: 'ddkjiahejlhfcafbddmgiahcphecmpfh' },
  { name: 'Bitwarden', id: 'nngceckbapebfimnlniiiahkandclblb' },
  { name: 'Dark Reader', id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh' },
  { name: 'Return YouTube Dislike', id: 'gebbhagfogifgggkldgodflihgfeippi' },
  { name: 'SponsorBlock', id: 'mnjggcdmjocbbbhaepdhchncahnbgone' },
];

function chromeProdVersion() {
  return '134.0.6998.178';
}

function chromeUa(prod) {
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${prod} Safari/537.36`;
}

async function downloadCrx(extensionId, outDir) {
  const prod = chromeProdVersion();
  const urls = [
    `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&prodversion=${encodeURIComponent(prod)}&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`,
    `https://clients2.google.com/service/update2/crx?response=redirect&os=win&arch=x64&os_arch=x86_64&nacl_arch=x86-64&prod=chromiumcrx&prodchannel=&prodversion=${encodeURIComponent(prod)}&lang=en-US&acceptformat=crx2,crx3&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`,
  ];
  let lastErr = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': chromeUa(prod),
          Accept: 'application/x-chrome-extension,*/*',
        },
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 16) {
        lastErr = new Error('empty');
        continue;
      }
      const magic = buf.toString('utf8', 0, 4);
      if (magic !== 'Cr24' && magic !== 'PK\u0003\u0004') {
        lastErr = new Error(`bad magic ${JSON.stringify(magic)}`);
        continue;
      }
      const out = path.join(outDir, `${extensionId}.crx`);
      fs.writeFileSync(out, buf);
      return { out, bytes: buf.length, magic, version: magic === 'Cr24' ? buf.readUInt32LE(4) : null };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('download failed');
}

function crxToZip(crxPath, zipOut) {
  const buf = fs.readFileSync(crxPath);
  if (buf.length < 16 || buf.toString('utf8', 0, 4) !== 'Cr24') {
    fs.copyFileSync(crxPath, zipOut);
    return { zipStart: 0, note: 'not-crx-copied' };
  }
  const version = buf.readUInt32LE(4);
  let zipStart = 0;
  if (version === 2) {
    const pubkeyLen = buf.readUInt32LE(8);
    const sigLen = buf.readUInt32LE(12);
    zipStart = 16 + pubkeyLen + sigLen;
  } else if (version === 3) {
    const headerLen = buf.readUInt32LE(8);
    zipStart = 12 + headerLen;
  } else {
    throw new Error(`unsupported CRX ${version}`);
  }
  fs.writeFileSync(zipOut, buf.subarray(zipStart));
  return { zipStart, version };
}

function expandArchive(archivePath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${String(archivePath).replace(/'/g, "''")}' -DestinationPath '${String(destDir).replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'pipe', windowsHide: true },
    );
    return;
  }
  execFileSync('unzip', ['-o', archivePath, '-d', destDir], { stdio: 'pipe' });
}

function findManifest(root) {
  if (fs.existsSync(path.join(root, 'manifest.json'))) return root;
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const sub = path.join(root, ent.name);
    if (fs.existsSync(path.join(sub, 'manifest.json'))) return sub;
  }
  return null;
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vio-ext-diag-'));
  console.log('tmp', tmp);
  const rows = [];
  for (const ext of EXTS) {
    const row = { name: ext.name, id: ext.id, download: '?', unpack: '?', mv: '?', perms: '' };
    try {
      const dl = await downloadCrx(ext.id, tmp);
      row.download = `ok ${dl.bytes}B magic=${dl.magic} v=${dl.version}`;
      const zip = path.join(tmp, `${ext.id}.zip`);
      const info = crxToZip(dl.out, zip);
      const out = path.join(tmp, ext.id);
      expandArchive(zip, out);
      const mfDir = findManifest(out);
      if (!mfDir) {
        row.unpack = 'no manifest';
      } else {
        const mf = JSON.parse(fs.readFileSync(path.join(mfDir, 'manifest.json'), 'utf8'));
        row.unpack = 'ok';
        row.mv = String(mf.manifest_version || '?');
        row.perms = [...(mf.permissions || []), ...(mf.host_permissions || [])].slice(0, 8).join(',');
        row.hasKey = Boolean(mf.key);
        row.extName = mf.name || mf.default_locale || '';
        row.action = Boolean(mf.action || mf.browser_action);
        row.bg =
          mf.background?.service_worker
            ? `sw:${mf.background.service_worker}`
            : mf.background?.scripts
              ? `scripts:${(mf.background.scripts || []).length}`
              : mf.background?.page
                ? `page:${mf.background.page}`
                : 'none';
      }
      row.zipNote = info.version != null ? `crx${info.version}` : info.note;
    } catch (err) {
      row.download = `FAIL ${err.message || err}`;
    }
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  fs.writeFileSync(path.join(tmp, 'report.json'), JSON.stringify(rows, null, 2));
  console.log('wrote', path.join(tmp, 'report.json'));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
