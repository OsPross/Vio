'use strict';

const C = require('./channels.cjs');

function register(deps) {
  const { ipcMain, wrapPw, passwords } = deps;

  ipcMain.handle(C.PASSWORDS_STATUS, wrapPw(() => passwords.status()));
  ipcMain.handle(
    C.PASSWORDS_SETUP,
    wrapPw((master, remember) => passwords.setup(String(master || ''), Boolean(remember))),
  );
  ipcMain.handle(
    C.PASSWORDS_UNLOCK,
    wrapPw((master, remember) => passwords.unlock(String(master || ''), remember)),
  );
  ipcMain.handle(C.PASSWORDS_LOCK, wrapPw(() => passwords.lock('manual')));
  ipcMain.handle(C.PASSWORDS_LIST, wrapPw((q) => passwords.list(typeof q === 'string' ? q : '')));
  ipcMain.handle(C.PASSWORDS_GET, wrapPw((id) => passwords.get(String(id || ''))));
  ipcMain.handle(
    C.PASSWORDS_FIND,
    wrapPw((pageUrl) => passwords.findForOrigin(String(pageUrl || ''))),
  );
  ipcMain.handle(
    C.PASSWORDS_AUTOFILL,
    wrapPw((id, pageUrl) => passwords.getPasswordForAutofill(String(id || ''), String(pageUrl || ''))),
  );
  ipcMain.handle(
    C.PASSWORDS_ADD,
    wrapPw((entry) => passwords.add(entry && typeof entry === 'object' ? entry : {})),
  );
  ipcMain.handle(
    C.PASSWORDS_UPDATE,
    wrapPw((id, patch) =>
      passwords.update(String(id || ''), patch && typeof patch === 'object' ? patch : {}),
    ),
  );
  ipcMain.handle(C.PASSWORDS_REMOVE, wrapPw((id) => passwords.remove(String(id || ''))));
  ipcMain.handle(
    C.PASSWORDS_NEVER_ADD,
    wrapPw((origin) => passwords.neverSaveAdd(String(origin || ''))),
  );
  ipcMain.handle(C.PASSWORDS_NEVER_LIST, wrapPw(() => passwords.neverSaveList()));
  ipcMain.handle(
    C.PASSWORDS_NEVER_REMOVE,
    wrapPw((origin) => passwords.neverSaveRemove(String(origin || ''))),
  );
  ipcMain.handle(
    C.PASSWORDS_SHOULD_SAVE,
    wrapPw((pageUrl, username, password) =>
      passwords.shouldOfferSave(String(pageUrl || ''), username, password),
    ),
  );
  ipcMain.handle(C.PASSWORDS_CONFIRM_SAVE, wrapPw(() => passwords.confirmPendingSave()));
  ipcMain.handle(C.PASSWORDS_DISMISS_SAVE, wrapPw(() => passwords.dismissPendingSave()));
  ipcMain.handle(
    C.PASSWORDS_GENERATE,
    wrapPw((opts) => passwords.generate(opts && typeof opts === 'object' ? opts : {})),
  );
  ipcMain.handle(C.PASSWORDS_STRENGTH, wrapPw((pw) => passwords.strength(String(pw || ''))));
  ipcMain.handle(C.PASSWORDS_TOTP, wrapPw((id) => passwords.getTotp(String(id || ''))));
  ipcMain.handle(C.PASSWORDS_COPY, wrapPw((id) => passwords.copyPassword(String(id || ''))));
  ipcMain.handle(C.PASSWORDS_AUDIT, wrapPw(() => passwords.audit()));
  ipcMain.handle(
    C.PASSWORDS_EXPORT,
    wrapPw((master) => passwords.exportCsv(String(master || ''))),
  );
  ipcMain.handle(
    C.PASSWORDS_IMPORT,
    wrapPw((csv, format) =>
      passwords.importCsv(String(csv || ''), typeof format === 'string' ? format : 'chrome'),
    ),
  );
  ipcMain.handle(
    C.PASSWORDS_CHANGE_MASTER,
    wrapPw((oldPw, newPw) => passwords.changeMaster(String(oldPw || ''), String(newPw || ''))),
  );
  ipcMain.handle(C.PASSWORDS_IDLE, wrapPw((n) => passwords.setIdleMinutes(n)));
  ipcMain.handle(C.PASSWORDS_PAGE_SCRIPT, wrapPw(() => passwords.getPageScript()));
  ipcMain.handle(
    C.PASSWORDS_ACTIVITY,
    wrapPw(() => {
      passwords.touchActivity();
      return { ok: true };
    }),
  );
}

module.exports = { register };
