'use strict';

/** Shared guest-page PiP scripts — always run via webContents.executeJavaScript(code, true). */

const PICK_VIDEO = `
  const videos = Array.from(document.querySelectorAll('video'));
  const preferred =
    videos.find((v) => !v.paused && !v.ended) ||
    videos.find((v) => (v.readyState || 0) > 1) ||
    videos[0];
  if (!preferred) return 'no-video';
  await preferred.requestPictureInPicture();
  return 'enter';
`;

const PIP_TOGGLE_JS = `(async () => {
  try {
    if (!document.pictureInPictureEnabled) return 'disabled';
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return 'exit';
    }
    ${PICK_VIDEO}
  } catch {
    return 'error';
  }
})()`;

const PIP_ENTER_JS = `(async () => {
  try {
    if (!document.pictureInPictureEnabled) return 'disabled';
    if (document.pictureInPictureElement) return 'already';
    ${PICK_VIDEO}
  } catch {
    return 'error';
  }
})()`;

/**
 * @param {import('electron').WebContents} wc
 * @param {{ enterOnly?: boolean }} opts
 */
async function runPictureInPicture(wc, opts = {}) {
  if (!wc || wc.isDestroyed()) return { ok: false, error: 'no-guest' };
  const code = opts.enterOnly ? PIP_ENTER_JS : PIP_TOGGLE_JS;
  try {
    const result = await wc.executeJavaScript(code, true);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

module.exports = { runPictureInPicture, PIP_TOGGLE_JS, PIP_ENTER_JS };
