'use strict';

/**
 * Download manager — persist:main + Tor sessions.
 * Tor entries stay in-memory only (never written to downloads.json).
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app, dialog, shell, BrowserWindow } = require('electron');

const RISKY_EXT = new Set([
  '.exe',
  '.msi',
  '.bat',
  '.cmd',
  '.ps1',
  '.scr',
  '.js',
  '.jse',
  '.vbs',
  '.vbe',
  '.wsf',
  '.wsh',
  '.lnk',
  '.iso',
  '.dmg',
  '.pkg',
  '.app',
]);

/** @typedef {'progressing'|'completed'|'cancelled'|'interrupted'|'paused'} DlState */

/** @typedef {{
 *   id: string,
 *   url: string,
 *   filename: string,
 *   savePath: string,
 *   receivedBytes: number,
 *   totalBytes: number,
 *   state: DlState,
 *   startedAt: number,
 *   endedAt?: number,
 *   speedBps: number,
 *   canResume: boolean,
 *   tor: boolean,
 *   mime?: string,
 *   risky?: boolean,
 * }} DownloadRecord */

/** @type {Map<string, DownloadRecord>} */
const records = new Map();
/** @type {Map<string, import('electron').DownloadItem>} */
const liveItems = new Map();
/** @type {((list: DownloadRecord[]) => void) | null} */
let pushHandler = null;

/** @type {{ folder: string, askWhere: boolean }} */
let config = {
  folder: '',
  askWhere: false,
};

function uid() {
  return crypto.randomBytes(8).toString('hex');
}

function storePath() {
  return path.join(app.getPath('userData'), 'downloads.json');
}

function configPath() {
  return path.join(app.getPath('userData'), 'downloads-config.json');
}

function ensureConfig() {
  if (!config.folder) {
    try {
      config.folder = app.getPath('downloads');
    } catch {
      config.folder = app.getPath('userData');
    }
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (raw && typeof raw === 'object') {
      if (typeof raw.folder === 'string' && raw.folder) config.folder = raw.folder;
      if (typeof raw.askWhere === 'boolean') config.askWhere = raw.askWhere;
    }
  } catch {
    /* */
  }
}

function saveConfig() {
  ensureConfig();
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
}

function loadPersisted() {
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    if (!Array.isArray(raw)) return;
    for (const row of raw) {
      if (!row || row.tor) continue;
      const id = String(row.id || uid());
      records.set(id, {
        id,
        url: String(row.url || ''),
        filename: String(row.filename || 'download'),
        savePath: String(row.savePath || ''),
        receivedBytes: Number(row.receivedBytes) || 0,
        totalBytes: Number(row.totalBytes) || 0,
        state: row.state === 'completed' || row.state === 'cancelled' || row.state === 'interrupted' ? row.state : 'interrupted',
        startedAt: Number(row.startedAt) || Date.now(),
        endedAt: row.endedAt ? Number(row.endedAt) : undefined,
        speedBps: 0,
        canResume: Boolean(row.canResume),
        tor: false,
        mime: row.mime,
        risky: Boolean(row.risky),
      });
    }
  } catch {
    /* */
  }
}

function persistList() {
  const list = [...records.values()]
    .filter((r) => !r.tor)
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .slice(0, 200);
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(list, null, 2), 'utf8');
}

function emit() {
  if (!pushHandler) return;
  pushHandler(list());
}

function enrichRecord(rec) {
  const row = { ...rec };
  if (!rec.tor && rec.state === 'completed' && rec.savePath) {
    row.fileMissing = !fs.existsSync(rec.savePath);
  }
  return row;
}

function list() {
  return [...records.values()]
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .map(enrichRecord);
}

function getConfig() {
  ensureConfig();
  return { ...config };
}

function setConfig(next) {
  ensureConfig();
  if (next && typeof next === 'object') {
    if (typeof next.folder === 'string' && next.folder.trim()) config.folder = next.folder.trim();
    if (typeof next.askWhere === 'boolean') config.askWhere = next.askWhere;
  }
  saveConfig();
  return getConfig();
}

function uniquePath(dir, filename) {
  const base = path.basename(filename || 'download');
  const ext = path.extname(base);
  const stem = path.basename(base, ext) || 'download';
  let candidate = path.join(dir, base);
  let n = 1;
  while (fs.existsSync(candidate) || fs.existsSync(`${candidate}.part`)) {
    candidate = path.join(dir, `${stem} (${n})${ext}`);
    n += 1;
    if (n > 9999) break;
  }
  return candidate;
}

function isRiskyName(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  return RISKY_EXT.has(ext);
}

/** Mark file as from internet (Windows SmartScreen / MOTW) */
function writeZoneIdentifier(filePath) {
  if (process.platform !== 'win32') return;
  try {
    const zone = `${filePath}:Zone.Identifier`;
    fs.writeFileSync(zone, '[ZoneTransfer]\r\nZoneId=3\r\n', 'utf8');
  } catch (err) {
    console.warn('[downloads] Zone.Identifier', err.message || err);
  }
}

function finalizePart(finalPath) {
  const part = `${finalPath}.part`;
  try {
    if (fs.existsSync(part)) {
      if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
      fs.renameSync(part, finalPath);
    }
  } catch (err) {
    console.warn('[downloads] finalize part', err);
  }
  writeZoneIdentifier(finalPath);
}

function getMainWindow() {
  const wins = BrowserWindow.getAllWindows();
  return wins.find((w) => !w.isDestroyed()) || null;
}

/**
 * @param {import('electron').Session} ses
 * @param {{ tor?: boolean }} opts
 */
function attachToSession(ses, opts = {}) {
  const tor = Boolean(opts.tor);
  const ephemeral = Boolean(opts.ephemeral);
  if (ses.__djxxrDownloadsAttached) return;
  ses.__djxxrDownloadsAttached = true;
  ses.__djxxrDownloadsEphemeral = ephemeral;

  ses.on('will-download', (event, item, webContents) => {
    item.pause();
    const run = async () => {
      ensureConfig();
      const filename = item.getFilename() || 'download';
      const url = item.getURL() || '';
      const win = getMainWindow();

      if (tor) {
        const ask = await dialog.showMessageBox(win || undefined, {
          type: 'warning',
          buttons: ['Anuluj', 'Zapisz przez Tor'],
          defaultId: 0,
          cancelId: 0,
          title: 'Pobieranie (Tor)',
          message: 'Zapisać plik przez Tor?',
          detail:
            'Plik zostanie pobrany przez sieć Tor.\n\n' +
            'Uwaga: otwarcie pobranego pliku (PDF, DOCX, media) poza Tor może ujawnić Twoje prawdziwe IP ' +
            'przez aplikacje systemowe / podgląd Windows.\n\n' +
            `Plik: ${filename}`,
        });
        if (ask.response !== 1) {
          item.cancel();
          return;
        }
      }

      if (isRiskyName(filename)) {
        const risk = await dialog.showMessageBox(win || undefined, {
          type: 'warning',
          buttons: ['Anuluj', 'Pobierz mimo to'],
          defaultId: 0,
          cancelId: 0,
          title: 'Ryzykowny typ pliku',
          message: `Plik „${filename}” może być niebezpieczny.`,
          detail: 'Typ wykonywalny / skrypt. Pobieraj tylko ze źródeł, którym ufasz.',
        });
        if (risk.response !== 1) {
          item.cancel();
          return;
        }
      }

      let savePath = '';
      const askWhere = tor || config.askWhere;
      if (askWhere) {
        const save = await dialog.showSaveDialog(win || undefined, {
          defaultPath: path.join(config.folder || app.getPath('downloads'), filename),
          title: tor ? 'Zapisz pobranie (Tor)' : 'Zapisz plik',
        });
        if (save.canceled || !save.filePath) {
          item.cancel();
          return;
        }
        savePath = save.filePath;
      } else {
        fs.mkdirSync(config.folder, { recursive: true });
        savePath = uniquePath(config.folder, filename);
      }

      const partPath = `${savePath}.part`;
      item.setSavePath(partPath);

      const id = uid();
      /** @type {DownloadRecord} */
      const rec = {
        id,
        url,
        filename: path.basename(savePath),
        savePath,
        receivedBytes: 0,
        totalBytes: item.getTotalBytes() || 0,
        state: 'progressing',
        startedAt: Date.now(),
        speedBps: 0,
        canResume: false,
        tor,
        mime: item.getMimeType?.() || undefined,
        risky: isRiskyName(filename),
      };
      records.set(id, rec);
      liveItems.set(id, item);
      if (!tor && !ephemeral) persistList();
      emit();

      let lastBytes = 0;
      let lastAt = Date.now();

      item.on('updated', (_e, state) => {
        const now = Date.now();
        const received = item.getReceivedBytes();
        const dt = Math.max(1, now - lastAt) / 1000;
        const speed = Math.max(0, (received - lastBytes) / dt);
        lastBytes = received;
        lastAt = now;
        rec.receivedBytes = received;
        rec.totalBytes = item.getTotalBytes() || rec.totalBytes;
        rec.speedBps = speed;
        rec.canResume = typeof item.canResume === 'function' ? item.canResume() : false;
        if (state === 'interrupted') rec.state = 'interrupted';
        else if (state === 'progressing') {
          rec.state = item.isPaused?.() ? 'paused' : 'progressing';
        }
        emit();
      });

      item.once('done', (_e, state) => {
        liveItems.delete(id);
        rec.endedAt = Date.now();
        rec.receivedBytes = item.getReceivedBytes();
        rec.totalBytes = item.getTotalBytes() || rec.totalBytes;
        rec.canResume = typeof item.canResume === 'function' ? item.canResume() : false;
        if (state === 'completed') {
          rec.state = 'completed';
          finalizePart(savePath);
        } else if (state === 'cancelled') {
          rec.state = 'cancelled';
          try {
            if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
          } catch {
            /* */
          }
        } else {
          rec.state = 'interrupted';
        }
        if (!tor && !ephemeral) persistList();
        else if (rec.state === 'completed' || rec.state === 'cancelled') {
          // keep tor completed briefly in memory; drop cancelled
          if (rec.state === 'cancelled') records.delete(id);
        }
        emit();
      });

      item.resume();
    };
    void run();
  });
}

function pause(id) {
  const item = liveItems.get(String(id));
  const rec = records.get(String(id));
  if (!item || !rec) return { ok: false };
  try {
    item.pause();
    rec.state = 'paused';
    emit();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

function resume(id) {
  const item = liveItems.get(String(id));
  const rec = records.get(String(id));
  if (item && rec) {
    try {
      if (typeof item.canResume === 'function' && item.canResume()) {
        item.resume();
      } else {
        item.resume();
      }
      rec.state = 'progressing';
      emit();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }
  // Interrupted / no live DownloadItem — re-fetch via session downloadURL when possible
  if (rec && !rec.tor && rec.url && /^https?:/i.test(rec.url)) {
    try {
      const { session } = require('electron');
      const ses = session.fromPartition('persist:main');
      records.delete(String(id));
      persistList();
      emit();
      ses.downloadURL(rec.url);
      return { ok: true, restarted: true };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }
  return { ok: false, error: 'Brak aktywnego pobierania do wznowienia' };
}

function cancel(id) {
  const item = liveItems.get(String(id));
  const rec = records.get(String(id));
  if (item) {
    try {
      item.cancel();
    } catch {
      /* */
    }
  }
  if (rec) {
    rec.state = 'cancelled';
    rec.endedAt = Date.now();
    if (!rec.tor) persistList();
    else records.delete(String(id));
    emit();
  }
  return { ok: true };
}

function remove(id) {
  const rec = records.get(String(id));
  if (!rec) return { ok: false };
  if (liveItems.has(String(id))) cancel(id);
  records.delete(String(id));
  if (!rec.tor) persistList();
  emit();
  return { ok: true };
}

function clearCompleted() {
  for (const [id, rec] of [...records.entries()]) {
    if (rec.tor) continue;
    if (rec.state === 'completed' || rec.state === 'cancelled') records.delete(id);
  }
  persistList();
  emit();
  return { ok: true };
}

function assertManagedPath(filePath) {
  const want = path.resolve(String(filePath || ''));
  for (const rec of records.values()) {
    if (rec.tor) continue;
    if (path.resolve(rec.savePath) === want) return true;
  }
  return false;
}

async function openFile(id) {
  const rec = records.get(String(id));
  if (!rec || rec.tor) return { ok: false, error: 'Niedostępne' };
  if (rec.state !== 'completed') return { ok: false, error: 'Plik nieukończony' };
  if (!assertManagedPath(rec.savePath)) return { ok: false, error: 'Ścieżka spoza listy' };
  const err = await shell.openPath(rec.savePath);
  return err ? { ok: false, error: err } : { ok: true };
}

function showInFolder(id) {
  const rec = records.get(String(id));
  if (!rec || rec.tor) return { ok: false, error: 'Niedostępne' };
  if (!assertManagedPath(rec.savePath) && rec.state === 'completed') {
    return { ok: false, error: 'Ścieżka spoza listy' };
  }
  const target = rec.state === 'completed' ? rec.savePath : `${rec.savePath}.part`;
  if (!fs.existsSync(target) && !fs.existsSync(rec.savePath)) {
    return { ok: false, error: 'Brak pliku' };
  }
  shell.showItemInFolder(fs.existsSync(rec.savePath) ? rec.savePath : target);
  return { ok: true };
}

function startDrag(id) {
  const rec = records.get(String(id));
  if (!rec || rec.tor || rec.state !== 'completed') return { ok: false };
  if (!assertManagedPath(rec.savePath)) return { ok: false };
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return { ok: false };
  try {
    win.webContents.startDrag({
      file: rec.savePath,
      icon: path.join(__dirname, 'drag-file.png'),
    });
    return { ok: true };
  } catch (err) {
    // icon optional — retry without custom icon file by using empty
    try {
      const { nativeImage } = require('electron');
      win.webContents.startDrag({
        file: rec.savePath,
        icon: nativeImage.createEmpty(),
      });
      return { ok: true };
    } catch (e2) {
      return { ok: false, error: String(e2.message || e2) };
    }
  }
}

function setPushHandler(fn) {
  pushHandler = typeof fn === 'function' ? fn : null;
}

function init() {
  ensureConfig();
  loadPersisted();
}

function wipeTorEntries() {
  for (const [id, rec] of [...records.entries()]) {
    if (rec.tor) {
      if (liveItems.has(id)) {
        try {
          liveItems.get(id)?.cancel();
        } catch {
          /* */
        }
        liveItems.delete(id);
      }
      records.delete(id);
    }
  }
  emit();
}

module.exports = {
  init,
  attachToSession,
  setPushHandler,
  list,
  getConfig,
  setConfig,
  pause,
  resume,
  cancel,
  remove,
  clearCompleted,
  openFile,
  showInFolder,
  startDrag,
  wipeTorEntries,
  isRiskyName,
  RISKY_EXT,
};
