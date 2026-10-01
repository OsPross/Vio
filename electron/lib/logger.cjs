'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let app;
try {
  ({ app } = require('electron'));
} catch {
  app = null;
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function isPackaged() {
  try {
    return Boolean(app && app.isPackaged);
  } catch {
    return false;
  }
}

function logFilePath() {
  try {
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'logs', 'main.log');
    }
  } catch {
    /* */
  }
  return path.join(os.tmpdir(), 'djxxr-main.log');
}

let logDirReady = false;

function appendLine(line) {
  try {
    const file = logFilePath();
    const dir = path.dirname(file);
    if (!logDirReady) {
      fs.mkdirSync(dir, { recursive: true });
      logDirReady = true;
    }
    fs.appendFileSync(file, line, 'utf8');
  } catch {
    /* optional file log */
  }
}

function formatLine(level, ns, args) {
  const ts = new Date().toISOString();
  const msg = args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
  return `${ts} [${level}]${ns ? ` [${ns}]` : ''} ${msg}\n`;
}

function getLogger(ns) {
  const prefix = ns ? `[${ns}]` : '';

  function log(level, consoleFn, minLevel, ...args) {
    if (level === 'debug' && isPackaged()) return;
    if (LEVELS[level] < minLevel) return;
    if (consoleFn) consoleFn(prefix, ...args);
    if (level !== 'debug') {
      appendLine(formatLine(level, ns, args));
    }
  }

  return {
    debug: (...args) => log('debug', console.debug, LEVELS.debug, ...args),
    info: (...args) => log('info', console.info, LEVELS.info, ...args),
    warn: (...args) => log('warn', console.warn, LEVELS.warn, ...args),
    error: (...args) => log('error', console.error, LEVELS.error, ...args),
  };
}

module.exports = {
  getLogger,
};
