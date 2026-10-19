'use strict';

/**
 * Spotify Web API (PKCE) — now playing + playback controls for the home widget.
 * Tokens stay in main; never log access/refresh tokens.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const { app, safeStorage, shell } = require('electron');
const { getLogger } = require('./lib/logger.cjs');
const { BUILTIN_CLIENT_ID, REDIRECT_PORT } = require('./spotify-app-config.cjs');

const log = getLogger('spotify');

const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-private',
].join(' ');

const AUTH_FILE = () => path.join(app.getPath('userData'), 'spotify-auth.json');

/** App-wide Client ID (shipped) or optional per-user override in auth file. */
function resolveClientId() {
  const auth = loadAuth();
  const override = String(auth?.clientIdOverride || auth?.clientId || '').trim();
  if (/^[a-f0-9]{32}$/i.test(override)) return override;
  const builtin = String(BUILTIN_CLIENT_ID || '').trim();
  if (/^[a-f0-9]{32}$/i.test(builtin)) return builtin;
  return null;
}

/** @type {import('http').Server | null} */
let authServer = null;
/** @type {{ verifier: string, state: string, clientId: string } | null} */
let pendingAuth = null;

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function encrypt(str) {
  if (safeStorage.isEncryptionAvailable()) {
    return { enc: true, v: safeStorage.encryptString(str).toString('base64') };
  }
  return { enc: false, v: str };
}

function decrypt(obj) {
  if (!obj || typeof obj.v !== 'string') return null;
  if (obj.enc) {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(Buffer.from(obj.v, 'base64'));
    } catch {
      return null;
    }
  }
  return obj.v;
}

function loadAuth() {
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE(), 'utf8'));
  } catch {
    return null;
  }
}

function saveAuth(data) {
  const dir = path.dirname(AUTH_FILE());
  fs.mkdirSync(dir, { recursive: true });
  const tmp = AUTH_FILE() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, AUTH_FILE());
}

function clearAuthFile() {
  try {
    fs.unlinkSync(AUTH_FILE());
  } catch {
    /* */
  }
}

function publicStatus() {
  const auth = loadAuth();
  const clientId = resolveClientId();
  const hasRefresh = Boolean(decrypt(auth?.refreshToken));
  const hasBuiltin = /^[a-f0-9]{32}$/i.test(String(BUILTIN_CLIENT_ID || '').trim());
  const hasOverride = /^[a-f0-9]{32}$/i.test(
    String(auth?.clientIdOverride || '').trim() || String(auth?.clientId || '').trim(),
  );
  return {
    ok: true,
    connected: hasRefresh,
    configured: Boolean(clientId),
    usesBuiltin: hasBuiltin && !hasOverride,
    needsAuthorSetup: !clientId,
    displayName: auth?.displayName || null,
    redirectUri: REDIRECT_URI,
  };
}

async function setClientId(clientId) {
  const id = String(clientId || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(id)) {
    return { ok: false, error: 'Client ID Spotify to 32 znaki hex' };
  }
  const prev = loadAuth() || {};
  saveAuth({ ...prev, clientIdOverride: id, clientId: id });
  return { ok: true, redirectUri: REDIRECT_URI };
}

function stopAuthServer() {
  if (authServer) {
    try {
      authServer.close();
    } catch {
      /* */
    }
    authServer = null;
  }
  pendingAuth = null;
}

async function exchangeToken(clientId, code, verifier) {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error_description || json.error || `token ${res.status}`);
  }
  return json;
}

async function refreshAccess() {
  const auth = loadAuth();
  const clientId = resolveClientId();
  if (!clientId) throw new Error('Brak Client ID aplikacji');
  const refresh = decrypt(auth?.refreshToken);
  if (!refresh) throw new Error('Nie połączono ze Spotify');
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refresh,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) clearAuthFile();
    throw new Error(json.error_description || json.error || `refresh ${res.status}`);
  }
  const next = {
    ...(auth || {}),
    accessToken: encrypt(json.access_token),
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000 - 30_000,
  };
  if (json.refresh_token) next.refreshToken = encrypt(json.refresh_token);
  saveAuth(next);
  return json.access_token;
}

async function getAccessToken() {
  const auth = loadAuth();
  if (!resolveClientId()) throw new Error('Brak Client ID aplikacji');
  const access = decrypt(auth?.accessToken);
  if (access && auth?.expiresAt && Date.now() < auth.expiresAt) return access;
  return refreshAccess();
}

async function api(method, apiPath, { query, jsonBody } = {}) {
  const token = await getAccessToken();
  const url = new URL(`https://api.spotify.com/v1${apiPath}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }
  const headers = { Authorization: `Bearer ${token}` };
  /** @type {RequestInit} */
  const init = { method, headers };
  if (jsonBody !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(jsonBody);
  }
  let res = await fetch(url, init);
  if (res.status === 401) {
    await refreshAccess();
    headers.Authorization = `Bearer ${await getAccessToken()}`;
    res = await fetch(url, init);
  }
  if (res.status === 204) return { ok: true, empty: true };
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error?.message || data?.error_description || `Spotify ${res.status}`);
    err.status = res.status;
    err.premium = res.status === 403;
    throw err;
  }
  return { ok: true, data };
}

function mapPlayback(data) {
  if (!data) return { ok: true, playing: false, item: null };
  const item = data.item;
  if (!item) {
    return {
      ok: true,
      playing: Boolean(data.is_playing),
      progressMs: data.progress_ms || 0,
      device: data.device
        ? { name: data.device.name, volume: data.device.volume_percent, type: data.device.type }
        : null,
      shuffle: Boolean(data.shuffle_state),
      repeat: data.repeat_state || 'off',
      item: null,
      fetchedAt: Date.now(),
    };
  }
  const isEpisode = item.type === 'episode';
  const artists = isEpisode
    ? [item.show?.name].filter(Boolean)
    : (item.artists || []).map((a) => a.name);
  const images = isEpisode ? item.images || item.show?.images : item.album?.images;
  const art = Array.isArray(images) && images.length ? images[images.length - 1]?.url || images[0]?.url : null;
  return {
    ok: true,
    playing: Boolean(data.is_playing),
    progressMs: data.progress_ms || 0,
    durationMs: item.duration_ms || 0,
    shuffle: Boolean(data.shuffle_state),
    repeat: data.repeat_state || 'off',
    device: data.device
      ? {
          name: data.device.name,
          volume: data.device.volume_percent,
          type: data.device.type,
          supportsVolume: data.device.supports_volume !== false,
        }
      : null,
    item: {
      id: item.id,
      uri: item.uri,
      name: item.name,
      artists,
      album: isEpisode ? item.show?.name : item.album?.name,
      art,
      url: item.external_urls?.spotify || null,
      type: item.type || 'track',
    },
    fetchedAt: Date.now(),
  };
}

async function getPlayback() {
  try {
    const { data, empty } = await api('GET', '/me/player');
    if (empty || !data) return { ok: true, playing: false, item: null, idle: true };
    return mapPlayback(data);
  } catch (err) {
    if (err.status === 204) return { ok: true, playing: false, item: null, idle: true };
    return { ok: false, error: String(err.message || err), premium: err.premium };
  }
}

async function play() {
  try {
    await api('PUT', '/me/player/play');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err), premium: err.premium, status: err.status };
  }
}

async function pause() {
  try {
    await api('PUT', '/me/player/pause');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err), premium: err.premium, status: err.status };
  }
}

async function next() {
  try {
    await api('POST', '/me/player/next');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err), premium: err.premium, status: err.status };
  }
}

async function previous() {
  try {
    await api('POST', '/me/player/previous');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err), premium: err.premium, status: err.status };
  }
}

async function seek(positionMs) {
  const ms = Math.max(0, Math.floor(Number(positionMs) || 0));
  try {
    await api('PUT', '/me/player/seek', { query: { position_ms: ms } });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err), premium: err.premium, status: err.status };
  }
}

async function setVolume(percent) {
  const v = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  try {
    await api('PUT', '/me/player/volume', { query: { volume_percent: v } });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err), premium: err.premium, status: err.status };
  }
}

async function setShuffle(state) {
  try {
    await api('PUT', '/me/player/shuffle', { query: { state: Boolean(state) } });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err), premium: err.premium, status: err.status };
  }
}

async function setRepeat(state) {
  const s = state === 'track' || state === 'context' || state === 'off' ? state : 'off';
  try {
    await api('PUT', '/me/player/repeat', { query: { state: s } });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err), premium: err.premium, status: err.status };
  }
}

function logout(opts = {}) {
  stopAuthServer();
  const wipeClient = Boolean(opts.wipeClientId);
  if (wipeClient) {
    clearAuthFile();
    return { ok: true };
  }
  // Keep optional override; drop tokens only
  const auth = loadAuth();
  if (auth?.clientIdOverride || auth?.clientId) {
    saveAuth({
      clientIdOverride: auth.clientIdOverride || auth.clientId,
      clientId: auth.clientIdOverride || auth.clientId,
    });
  } else {
    clearAuthFile();
  }
  return { ok: true };
}

/**
 * Start PKCE login — opens browser, waits for localhost callback.
 */
function login() {
  return new Promise((resolve) => {
    const clientId = resolveClientId();
    if (!clientId) {
      resolve({
        ok: false,
        error: 'Brak Client ID Vio — autor musi raz ustawić go w electron/spotify-app-config.cjs',
      });
      return;
    }
    stopAuthServer();

    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    pendingAuth = { verifier, state, clientId };

    const done = (result) => {
      stopAuthServer();
      resolve(result);
    };

    authServer = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url || '/', `http://127.0.0.1:${REDIRECT_PORT}`);
        if (u.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const err = u.searchParams.get('error');
        const code = u.searchParams.get('code');
        const st = u.searchParams.get('state');
        if (err) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html><body style="font-family:system-ui;padding:2rem"><h1>Anulowano</h1><p>${err}</p><p>Możesz zamknąć tę kartę.</p></body></html>`);
          done({ ok: false, error: err });
          return;
        }
        if (!code || !pendingAuth || st !== pendingAuth.state) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Bad request');
          done({ ok: false, error: 'Nieprawidłowy callback' });
          return;
        }
        const tokens = await exchangeToken(pendingAuth.clientId, code, pendingAuth.verifier);
        let displayName = null;
        try {
          const meRes = await fetch('https://api.spotify.com/v1/me', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          const me = await meRes.json();
          displayName = me.display_name || me.id || null;
        } catch {
          /* */
        }
        const prev = loadAuth() || {};
        saveAuth({
          ...prev,
          accessToken: encrypt(tokens.access_token),
          refreshToken: encrypt(tokens.refresh_token),
          expiresAt: Date.now() + (Number(tokens.expires_in) || 3600) * 1000 - 30_000,
          displayName,
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<html><body style="font-family:system-ui;padding:2rem;background:#121212;color:#fff"><h1 style="color:#1db954">Połączono ze Spotify</h1><p>Możesz zamknąć tę kartę i wrócić do Vio.</p></body></html>',
        );
        log.info('spotify connected', displayName || '');
        done({ ok: true, displayName });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error');
        done({ ok: false, error: String(e.message || e) });
      }
    });

    authServer.listen(REDIRECT_PORT, '127.0.0.1', () => {
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        state,
        code_challenge_method: 'S256',
        code_challenge: challenge,
      });
      const url = `https://accounts.spotify.com/authorize?${params}`;
      shell.openExternal(url).catch(() => {});
    });

    authServer.on('error', (e) => {
      done({ ok: false, error: `Port ${REDIRECT_PORT} zajęty: ${e.message}` });
    });

    // Safety timeout 5 min
    setTimeout(() => {
      if (pendingAuth) done({ ok: false, error: 'Timeout logowania' });
    }, 300_000);
  });
}

module.exports = {
  REDIRECT_URI,
  publicStatus,
  setClientId,
  login,
  logout,
  getPlayback,
  play,
  pause,
  next,
  previous,
  seek,
  setVolume,
  setShuffle,
  setRepeat,
};
