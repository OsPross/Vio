'use strict';

/**
 * Dev-only git sync helpers (unpackaged Electron).
 * Never used in NSIS builds.
 */

const { execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

const ROOT = path.join(__dirname, '..');

function runGit(args, opts = {}) {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd: ROOT,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        ...opts,
      },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          code: err && typeof err.code === 'number' ? err.code : err ? 1 : 0,
          stdout: String(stdout || '').trim(),
          stderr: String(stderr || '').trim(),
        });
      },
    );
  });
}

function runNpm(args) {
  return new Promise((resolve) => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFile(
      npmCmd,
      args,
      { cwd: ROOT, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          code: err && typeof err.code === 'number' ? err.code : err ? 1 : 0,
          stdout: String(stdout || '').trim(),
          stderr: String(stderr || '').trim(),
        });
      },
    );
  });
}

function assertDev() {
  if (app.isPackaged) {
    return { ok: false, error: 'Niedostępne w zbudowanej aplikacji (.exe).' };
  }
  return null;
}

async function dirtyFiles() {
  const st = await runGit(['status', '--porcelain']);
  if (!st.ok) return { ok: false, error: st.stderr || 'git status nieudany' };
  const lines = st.stdout ? st.stdout.split(/\r?\n/).filter(Boolean) : [];
  return { ok: true, dirty: lines.length > 0, files: lines.slice(0, 20) };
}

/**
 * Fetch + summarize commits ahead of HEAD on upstream.
 */
async function checkUpdates() {
  const blocked = assertDev();
  if (blocked) return blocked;

  const dirty = await dirtyFiles();
  if (!dirty.ok) return dirty;

  const fetch = await runGit(['fetch', '--prune']);
  if (!fetch.ok) {
    return {
      ok: false,
      error: fetch.stderr || 'git fetch nieudany (sprawdź remote / sieć).',
      dirty: dirty.dirty,
    };
  }

  const upstream = await runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!upstream.ok || !upstream.stdout) {
    return {
      ok: false,
      error: 'Brak upstream branch (ustaw: git push -u origin master).',
      dirty: dirty.dirty,
    };
  }

  const counts = await runGit(['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
  if (!counts.ok) {
    return { ok: false, error: counts.stderr || 'Nie można policzyć commitów.', dirty: dirty.dirty };
  }
  const parts = counts.stdout.split(/\s+/);
  const behind = Number(parts[1]) || 0;
  const ahead = Number(parts[0]) || 0;

  let commits = [];
  if (behind > 0) {
    const log = await runGit([
      'log',
      'HEAD..@{u}',
      '--pretty=format:%h\t%an\t%s',
      '-n',
      '15',
    ]);
    if (log.ok && log.stdout) {
      commits = log.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
        const [hash, author, ...rest] = line.split('\t');
        return { hash, author, subject: rest.join('\t') };
      });
    }
  }

  return {
    ok: true,
    dirty: dirty.dirty,
    dirtyFiles: dirty.files,
    upstream: upstream.stdout,
    behind,
    ahead,
    commits,
    canFastForward: behind > 0 && ahead === 0 && !dirty.dirty,
    message:
      dirty.dirty
        ? 'Masz lokalne niezacommitowane zmiany — najpierw commit lub stash.'
        : ahead > 0 && behind > 0
          ? 'Historia się rozjechała (nie fast-forward). Zrób merge/rebase ręcznie.'
          : ahead > 0 && behind === 0
            ? 'Lokalnie jesteś do przodu — nie ma czego pobierać.'
            : behind === 0
              ? 'Jesteś na bieżąco.'
              : `Dostępne ${behind} nowych commit(ów).`,
  };
}

/**
 * ff-only pull; npm ci if package-lock changed; relaunch app.
 */
async function applyUpdates() {
  const blocked = assertDev();
  if (blocked) return blocked;

  const preview = await checkUpdates();
  if (!preview.ok) return preview;
  if (preview.dirty) {
    return {
      ok: false,
      error: 'Lokalne zmiany — anulowano. Commit lub stash, potem spróbuj ponownie.',
      ...preview,
    };
  }
  if (preview.behind === 0) {
    return { ok: true, pulled: false, message: 'Brak nowych commitów.', ...preview };
  }
  if (preview.ahead > 0) {
    return {
      ok: false,
      error: 'Pull nie jest fast-forward (masz lokalne commity). Anulowano.',
      ...preview,
    };
  }

  const lockPath = path.join(ROOT, 'package-lock.json');
  let lockBefore = null;
  try {
    if (fs.existsSync(lockPath)) lockBefore = fs.readFileSync(lockPath);
  } catch {
    /* */
  }

  const pull = await runGit(['pull', '--ff-only']);
  if (!pull.ok) {
    return {
      ok: false,
      error: pull.stderr || pull.stdout || 'git pull --ff-only nieudany.',
      ...preview,
    };
  }

  let npmCi = null;
  try {
    const lockAfter = fs.existsSync(lockPath) ? fs.readFileSync(lockPath) : null;
    const lockChanged =
      lockBefore && lockAfter && Buffer.compare(lockBefore, lockAfter) !== 0;
    if (lockChanged) {
      npmCi = await runNpm(['ci']);
      if (!npmCi.ok) {
        return {
          ok: false,
          error: `npm ci nieudane: ${npmCi.stderr || npmCi.stdout || 'błąd'}`,
          pulled: true,
        };
      }
    }
  } catch {
    /* no lock — skip */
  }

  setTimeout(() => {
    try {
      app.relaunch();
      app.exit(0);
    } catch (err) {
      console.warn('[dev-sync] relaunch', err);
    }
  }, 400);

  return {
    ok: true,
    pulled: true,
    npmCi: Boolean(npmCi?.ok),
    message: 'Pobrano zmiany. Restart aplikacji…',
    commits: preview.commits,
  };
}

module.exports = {
  ROOT,
  checkUpdates,
  applyUpdates,
  assertDev,
};
