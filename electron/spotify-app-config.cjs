'use strict';

/**
 * Wspólny Spotify Client ID dla całej aplikacji Vio (PKCE — nie jest sekretem).
 * Użytkownicy końcowi tylko klikają „Połącz” — NIE zakładają własnej appki w Dashboard.
 *
 * WAŻNE (tryb Development w Spotify):
 * Aplikacja w Dashboard jest w Development mode → max 5 kont na allowliście.
 * Inni użytkownicy dostaną 403 „User not registered in the Developer Dashboard”.
 * To NIE jest błąd Vio — dodaj użytkownika w Spotify Dashboard albo złóż o Extended Quota.
 *
 * Setup (raz, przez autora Vio):
 * 1. https://developer.spotify.com/dashboard → Create app
 * 2. Redirect URIs (wszystkie porty z REDIRECT_PORTS):
 *    http://127.0.0.1:47831/callback … http://127.0.0.1:47835/callback
 * 3. Wklej Client ID poniżej (albo ustaw SPOTIFY_CLIENT_ID w env przy dev)
 *
 * W spakowanej aplikacji Client ID jest zawsze z BUILTIN_CLIENT_ID — bez .env.
 */

function resolveBuiltinClientId() {
  const fromEnv = String(process.env.SPOTIFY_CLIENT_ID || '').trim();
  if (/^[a-f0-9]{32}$/i.test(fromEnv)) return fromEnv.toLowerCase();
  // Publiczny Client ID (PKCE) — wbudowany w asar; nie wymaga zmiennych środowiskowych.
  return 'da80d921c31a4f659b9790c4dfd7a4ba';
}

/** Preferowany + zapasowe porty loopback (gdy 47831 zajęty). Muszą być w Spotify Dashboard. */
const REDIRECT_PORTS = Object.freeze([47831, 47832, 47833, 47834, 47835]);

function redirectUriForPort(port) {
  const p = Number(port) || REDIRECT_PORTS[0];
  return `http://127.0.0.1:${p}/callback`;
}

module.exports = {
  BUILTIN_CLIENT_ID: resolveBuiltinClientId(),
  REDIRECT_PORT: REDIRECT_PORTS[0],
  REDIRECT_PORTS,
  redirectUriForPort,
};
