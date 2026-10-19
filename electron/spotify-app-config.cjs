'use strict';

/**
 * Wspólny Spotify Client ID dla całej aplikacji Vio (PKCE — nie jest sekretem).
 * Użytkownicy końcowi tylko klikają „Połącz” — NIE zakładają własnej appki w Dashboard.
 *
 * Setup (raz, przez autora Vio):
 * 1. https://developer.spotify.com/dashboard → Create app
 * 2. Redirect URI: http://127.0.0.1:47831/callback
 * 3. Wklej Client ID poniżej (albo ustaw SPOTIFY_CLIENT_ID w env)
 */
module.exports = {
  /** 32-znakowy hex Client ID — publiczny przy PKCE (nie Client Secret). */
  BUILTIN_CLIENT_ID: String(
    process.env.SPOTIFY_CLIENT_ID || 'da80d921c31a4f659b9790c4dfd7a4ba',
  ).trim(),
  REDIRECT_PORT: 47831,
};
