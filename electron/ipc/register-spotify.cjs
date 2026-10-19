'use strict';

const C = require('./channels.cjs');
const spotify = require('../spotify.cjs');

function register(deps) {
  const { ipcMain, wrapApp } = deps;

  ipcMain.handle(C.SPOTIFY_STATUS, wrapApp(async () => spotify.publicStatus()));
  ipcMain.handle(
    C.SPOTIFY_SET_CLIENT_ID,
    wrapApp(async (_e, clientId) => spotify.setClientId(clientId)),
  );
  ipcMain.handle(C.SPOTIFY_LOGIN, wrapApp(async () => spotify.login()));
  ipcMain.handle(
    C.SPOTIFY_LOGOUT,
    wrapApp(async (_e, opts) => spotify.logout(opts && typeof opts === 'object' ? opts : {})),
  );
  ipcMain.handle(C.SPOTIFY_PLAYBACK, wrapApp(async () => spotify.getPlayback()));
  ipcMain.handle(C.SPOTIFY_PLAY, wrapApp(async () => spotify.play()));
  ipcMain.handle(C.SPOTIFY_PAUSE, wrapApp(async () => spotify.pause()));
  ipcMain.handle(C.SPOTIFY_NEXT, wrapApp(async () => spotify.next()));
  ipcMain.handle(C.SPOTIFY_PREV, wrapApp(async () => spotify.previous()));
  ipcMain.handle(
    C.SPOTIFY_SEEK,
    wrapApp(async (_e, positionMs) => spotify.seek(positionMs)),
  );
  ipcMain.handle(
    C.SPOTIFY_VOLUME,
    wrapApp(async (_e, percent) => spotify.setVolume(percent)),
  );
  ipcMain.handle(
    C.SPOTIFY_SHUFFLE,
    wrapApp(async (_e, state) => spotify.setShuffle(state)),
  );
  ipcMain.handle(
    C.SPOTIFY_REPEAT,
    wrapApp(async (_e, state) => spotify.setRepeat(state)),
  );
}

module.exports = { register };
