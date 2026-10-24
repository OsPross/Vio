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
const {
  BUILTIN_CLIENT_ID,
  REDIRECT_PORT,
  REDIRECT_PORTS,
  redirectUriForPort,
} = require('./spotify-app-config.cjs');

const log = getLogger('spotify');

/** Default (preferred port) — actual login may use a free port from REDIRECT_PORTS. */
const REDIRECT_URI = redirectUriForPort(REDIRECT_PORT);
const SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-private',
].join(' ');

const AUTH_FILE = () => path.join(app.getPath('userData'), 'spotify-auth.json');

/** App-wide Client ID (shipped in asar) or optional per-user override in auth file. */
function resolveClientId() {
  const auth = loadAuth();
  const override = String(auth?.clientIdOverride || auth?.clientId || '').trim();
  if (/^[a-f0-9]{32}$/i.test(override)) return override.toLowerCase();
  const builtin = String(BUILTIN_CLIENT_ID || '').trim();
  if (/^[a-f0-9]{32}$/i.test(builtin)) return builtin.toLowerCase();
  return null;
}

/**
 * Map Spotify / network errors to stable codes for the UI (i18n).
 * @param {unknown} err
 * @param {{ status?: number }} [extra]
 */
function classifyAuthError(err, extra = {}) {
  const status = Number(extra.status || err?.status || 0) || 0;
  const raw = String(err?.message || err || '');
  const lower = raw.toLowerCase();
  if (
    status === 403 ||
    /user not registered|not registered in the developer dashboard|developer dashboard/i.test(raw)
  ) {
    return {
      code: 'dashboard_user',
      error:
        'Konto Spotify nie jest na liście aplikacji w Developer Dashboard (tryb Development). Autor Vio musi dodać to konto w panelu Spotify.',
    };
  }
  if (/eaddrinuse|address already in use|port .* zajęty|wszystkie porty/i.test(lower)) {
    return {
      code: 'port_busy',
      error: `Porty lokalne ${REDIRECT_PORTS.join(', ')} są zajęte — zamknij inne aplikacje używające tych portów i spróbuj ponownie.`,
    };
  }
  if (/timeout|timed out/i.test(lower)) {
    return {
      code: 'timeout',
      error: 'Logowanie przekroczyło limit czasu — dokończ zgodę w przeglądarce lub spróbuj ponownie.',
    };
  }
  if (
    /enotfound|econnrefused|econnreset|etimedout|network|fetch failed|getaddrinfo|offline|internet/i.test(
      lower,
    )
  ) {
    return {
      code: 'network',
      error: 'Brak połączenia z internetem lub Spotify jest niedostępne.',
    };
  }
  if (/redirect_uri|invalid redirect|redirect uri/i.test(lower)) {
    return {
      code: 'redirect',
      error: `Redirect URI nie jest zarejestrowany w Spotify Dashboard. Dodaj: ${REDIRECT_PORTS.map(redirectUriForPort).join(', ')}`,
    };
  }
  if (/access_denied|user_cancelled|anulowano/i.test(lower)) {
    return { code: 'denied', error: 'Anulowano logowanie w Spotify.' };
  }
  return { code: 'unknown', error: raw || 'Nie udało się zalogować do Spotify' };
}

/** @type {import('http').Server | null} */
let authServer = null;
/** @type {{ verifier: string, state: string, clientId: string, redirectUri: string } | null} */
let pendingAuth = null;
/** Last known Spotify Connect device id (for shuffle/repeat when optional device_id helps). */
let lastDeviceId = null;

const MODIFY_SCOPE = 'user-modify-playback-state';

function parseScopeList(raw) {
  return String(raw || '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function hasModifyScope(auth) {
  const scopes = parseScopeList(auth?.scope);
  // Legacy tokens without saved scope: assume OK until API says otherwise
  if (!scopes.length) return true;
  return scopes.includes(MODIFY_SCOPE);
}

function playerErrorPayload(err) {
  const status = err.status || 0;
  const classified =
    status === 403 || /user not registered|developer dashboard/i.test(String(err.message || ''))
      ? classifyAuthError(err, { status })
      : null;
  return {
    ok: false,
    error: classified ? classified.error : String(err.message || err),
    errorCode: classified ? classified.code : undefined,
    status,
    reason: err.reason || '',
    premium: Boolean(err.premium),
    noDevice: Boolean(err.noDevice),
    needReconnect: Boolean(err.needReconnect),
    restricted: Boolean(err.restricted),
  };
}

function withDeviceQuery(query = {}) {
  const q = { ...query };
  if (lastDeviceId && q.device_id == null) q.device_id = lastDeviceId;
  return q;
}

/** Refresh Connect device id from /me/player before mutate commands. */
async function refreshActiveDevice() {
  try {
    const { data, empty } = await api('GET', '/me/player');
    if (empty || !data) {
      lastDeviceId = null;
      return null;
    }
    if (data?.device?.id) lastDeviceId = String(data.device.id);
    else lastDeviceId = null;
    return lastDeviceId;
  } catch {
    return lastDeviceId;
  }
}

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
  const modifyOk = hasModifyScope(auth);
  return {
    ok: true,
    connected: hasRefresh,
    configured: Boolean(clientId),
    usesBuiltin: hasBuiltin && !hasOverride,
    needsAuthorSetup: !clientId,
    displayName: auth?.displayName || null,
    redirectUri: REDIRECT_URI,
    redirectUris: REDIRECT_PORTS.map(redirectUriForPort),
    hasModifyScope: modifyOk,
    needReconnect: hasRefresh && !modifyOk,
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

async function exchangeToken(clientId, code, verifier, redirectUri) {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri || REDIRECT_URI,
    code_verifier: verifier,
  });
  let res;
  try {
    res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (e) {
    const classified = classifyAuthError(e);
    const err = new Error(classified.error);
    err.code = classified.code;
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error_description || json.error || `token ${res.status}`;
    const classified = classifyAuthError(msg, { status: res.status });
    const err = new Error(classified.error);
    err.code = classified.code;
    err.status = res.status;
    throw err;
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
  if (typeof json.scope === 'string' && json.scope.trim()) next.scope = json.scope.trim();
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
    const spotifyErr = data && typeof data.error === 'object' ? data.error : null;
    const reason = String(spotifyErr?.reason || '').toUpperCase();
    const message =
      (spotifyErr && spotifyErr.message) ||
      data?.error_description ||
      (typeof data?.error === 'string' ? data.error : null) ||
      `Spotify ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.reason = reason;
    // Premium ONLY when Spotify says so — not every 403
    err.premium = reason === 'PREMIUM_REQUIRED';
    err.noDevice =
      reason === 'NO_ACTIVE_DEVICE' ||
      res.status === 404 ||
      /no active device/i.test(message);
    err.needReconnect =
      res.status === 401 ||
      /insufficient.*(scope|permission)|missing.*scope|not granted/i.test(message);
    // 403 "Restriction violated" / UNKNOWN — context/device disallows the command (not Premium)
    err.restricted =
      !err.premium &&
      (reason === 'UNKNOWN' ||
        reason === 'RESTRICTED' ||
        /restriction violated/i.test(message));
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
    if (data?.device?.id) lastDeviceId = String(data.device.id);
    return mapPlayback(data);
  } catch (err) {
    if (err.status === 204) return { ok: true, playing: false, item: null, idle: true };
    return playerErrorPayload(err);
  }
}

async function play() {
  try {
    await api('PUT', '/me/player/play', { query: withDeviceQuery() });
    return { ok: true };
  } catch (err) {
    return playerErrorPayload(err);
  }
}

async function pause() {
  try {
    await api('PUT', '/me/player/pause', { query: withDeviceQuery() });
    return { ok: true };
  } catch (err) {
    return playerErrorPayload(err);
  }
}

async function next() {
  try {
    await api('POST', '/me/player/next', { query: withDeviceQuery() });
    return { ok: true };
  } catch (err) {
    return playerErrorPayload(err);
  }
}

async function previous() {
  try {
    await api('POST', '/me/player/previous', { query: withDeviceQuery() });
    return { ok: true };
  } catch (err) {
    return playerErrorPayload(err);
  }
}

async function seek(positionMs) {
  const ms = Math.max(0, Math.floor(Number(positionMs) || 0));
  try {
    await api('PUT', '/me/player/seek', { query: withDeviceQuery({ position_ms: ms }) });
    return { ok: true };
  } catch (err) {
    return playerErrorPayload(err);
  }
}

async function setVolume(percent) {
  const v = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  try {
    await api('PUT', '/me/player/volume', { query: withDeviceQuery({ volume_percent: v }) });
    return { ok: true };
  } catch (err) {
    return playerErrorPayload(err);
  }
}

async function putPlayerFlag(apiPath, query) {
  if (!hasModifyScope(loadAuth())) {
    logout();
    return {
      ok: false,
      needReconnect: true,
      error: 'Brak uprawnienia user-modify-playback-state — połącz ponownie',
    };
  }
  const deviceId = await refreshActiveDevice();
  if (!deviceId) {
    return {
      ok: false,
      noDevice: true,
      error: 'Brak aktywnego urządzenia Spotify',
      reason: 'NO_ACTIVE_DEVICE',
      status: 404,
    };
  }
  try {
    await api('PUT', apiPath, { query: withDeviceQuery(query) });
    return { ok: true };
  } catch (err) {
    // Stale/wrong device_id sometimes yields Restriction violated — retry once without it
    if (err.restricted || /restriction violated/i.test(String(err.message || ''))) {
      try {
        await api('PUT', apiPath, { query: { ...query } });
        return { ok: true };
      } catch (err2) {
        const payload = playerErrorPayload(err2);
        if (payload.needReconnect) logout();
        return payload;
      }
    }
    const payload = playerErrorPayload(err);
    if (payload.needReconnect) logout();
    return payload;
  }
}

async function setShuffle(state) {
  return putPlayerFlag('/me/player/shuffle', { state: Boolean(state) });
}

async function setRepeat(state) {
  const s = state === 'track' || state === 'context' || state === 'off' ? state : 'off';
  return putPlayerFlag('/me/player/repeat', { state: s });
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
 * Bind loopback callback server — try preferred port, then REDIRECT_PORTS fallbacks.
 * @returns {Promise<{ server: import('http').Server, port: number, redirectUri: string }>}
 */
function listenAuthServer(server) {
  const ports = REDIRECT_PORTS.length ? [...REDIRECT_PORTS] : [REDIRECT_PORT];
  return new Promise((resolve, reject) => {
    let idx = 0;
    const tryNext = () => {
      if (idx >= ports.length) {
        reject(new Error(`Wszystkie porty zajęte: ${ports.join(', ')}`));
        return;
      }
      const port = ports[idx++];
      const onErr = (e) => {
        server.off('listening', onListen);
        if (e && (e.code === 'EADDRINUSE' || /eaddrinuse/i.test(String(e.message || '')))) {
          try {
            server.close();
          } catch {
            /* */
          }
          tryNext();
          return;
        }
        reject(e);
      };
      const onListen = () => {
        server.off('error', onErr);
        resolve({ server, port, redirectUri: redirectUriForPort(port) });
      };
      server.once('error', onErr);
      server.once('listening', onListen);
      try {
        server.listen(port, '127.0.0.1');
      } catch (e) {
        server.off('error', onErr);
        server.off('listening', onListen);
        if (e && (e.code === 'EADDRINUSE' || /eaddrinuse/i.test(String(e.message || '')))) {
          tryNext();
          return;
        }
        reject(e);
      }
    };
    tryNext();
  });
}

/**
 * Start PKCE login — opens system browser, waits for 127.0.0.1 callback (no client secret).
 */
function login() {
  return new Promise((resolve) => {
    const clientId = resolveClientId();
    if (!clientId) {
      resolve({
        ok: false,
        errorCode: 'no_client_id',
        error: 'Brak Client ID Vio — autor musi raz ustawić go w electron/spotify-app-config.cjs',
      });
      return;
    }
    stopAuthServer();

    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    /** @type {{ verifier: string, state: string, clientId: string, redirectUri: string } | null} */
    pendingAuth = { verifier, state, clientId, redirectUri: REDIRECT_URI };

    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      stopAuthServer();
      resolve(result);
    };

    const fail = (err, status) => {
      const c = err?.code
        ? { code: err.code, error: String(err.message || err) }
        : classifyAuthError(err, { status });
      done({ ok: false, errorCode: c.code, error: c.error });
    };

    authServer = http.createServer(async (req, res) => {
      try {
        const base = pendingAuth?.redirectUri || REDIRECT_URI;
        const u = new URL(req.url || '/', base);
        if (u.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const oauthErr = u.searchParams.get('error');
        const code = u.searchParams.get('code');
        const st = u.searchParams.get('state');
        if (oauthErr) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            `<html><body style="font-family:system-ui;padding:2rem"><h1>Anulowano</h1><p>${oauthErr}</p><p>Możesz zamknąć tę kartę.</p></body></html>`,
          );
          fail(oauthErr);
          return;
        }
        if (!code || !pendingAuth || st !== pendingAuth.state) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Bad request');
          fail('Nieprawidłowy callback Spotify (redirect)');
          return;
        }
        const tokens = await exchangeToken(
          pendingAuth.clientId,
          code,
          pendingAuth.verifier,
          pendingAuth.redirectUri,
        );
        let displayName = null;
        // Development-mode allowlist: token may succeed, /me returns 403 User not registered.
        const meRes = await fetch('https://api.spotify.com/v1/me', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }).catch((e) => {
          const err = new Error(String(e.message || e));
          err.code = 'network';
          throw err;
        });
        const me = await meRes.json().catch(() => ({}));
        if (!meRes.ok) {
          const msg =
            (me && me.error && me.error.message) ||
            me.error_description ||
            `Spotify /me ${meRes.status}`;
          const classified = classifyAuthError(msg, { status: meRes.status });
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            `<html><body style="font-family:system-ui;padding:2rem;background:#121212;color:#fff"><h1 style="color:#f44336">Spotify: brak dostępu</h1><p>${classified.error}</p><p>Możesz zamknąć tę kartę.</p></body></html>`,
          );
          const err = new Error(classified.error);
          err.code = classified.code;
          err.status = meRes.status;
          throw err;
        }
        displayName = me.display_name || me.id || null;
        const prev = loadAuth() || {};
        saveAuth({
          ...prev,
          accessToken: encrypt(tokens.access_token),
          refreshToken: encrypt(tokens.refresh_token),
          expiresAt: Date.now() + (Number(tokens.expires_in) || 3600) * 1000 - 30_000,
          displayName,
          scope: typeof tokens.scope === 'string' && tokens.scope.trim() ? tokens.scope.trim() : SCOPES,
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<html><body style="font-family:system-ui;padding:2rem;background:#121212;color:#fff"><h1 style="color:#1db954">Połączono ze Spotify</h1><p>Możesz zamknąć tę kartę i wrócić do Vio.</p></body></html>',
        );
        log.info('spotify connected', displayName || '');
        done({ ok: true, displayName });
      } catch (e) {
        try {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Error');
          }
        } catch {
          /* */
        }
        fail(e, e?.status);
      }
    });

    void listenAuthServer(authServer)
      .then(({ port, redirectUri }) => {
        if (!pendingAuth) return;
        pendingAuth.redirectUri = redirectUri;
        log.info('spotify auth listen', port);
        const params = new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: redirectUri,
          scope: SCOPES,
          state,
          code_challenge_method: 'S256',
          code_challenge: challenge,
        });
        const url = `https://accounts.spotify.com/authorize?${params}`;
        shell.openExternal(url).catch((e) => {
          fail(e || new Error('Nie udało się otworzyć przeglądarki'));
        });
      })
      .catch((e) => fail(e));

    // Safety timeout 5 min
    setTimeout(() => {
      if (pendingAuth && !settled) fail(new Error('Timeout logowania'));
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
