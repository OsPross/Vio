const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shell', {
  platform: () => ipcRenderer.invoke('shell:platform'),
  appInfo: () => ipcRenderer.invoke('shell:app-info'),
  openUserData: () => ipcRenderer.invoke('shell:open-user-data'),
  openLogsFolder: () => ipcRenderer.invoke('shell:open-logs-folder'),
  newWindow: (opts) => ipcRenderer.invoke('shell:new-window', opts || {}),
  getWindowBoot: () => ipcRenderer.invoke('shell:window-boot-get'),
  onWindowBoot: (cb) => {
    const handler = (_e, payload) => cb(payload || {});
    ipcRenderer.on('shell:window-boot', handler);
    return () => ipcRenderer.removeListener('shell:window-boot', handler);
  },
  quitApp: () => ipcRenderer.invoke('shell:quit'),
  windowToggleFullscreen: () => ipcRenderer.invoke('shell:window-toggle-fullscreen'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  /** @deprecated no-op reset; Tor uses shell:tor-* */
  setProxy: (proxyRules) => ipcRenderer.invoke('shell:set-proxy', proxyRules),
  torStart: (opts) => ipcRenderer.invoke('shell:tor-start', opts || {}),
  torStop: () => ipcRenderer.invoke('shell:tor-stop'),
  torStatus: () => ipcRenderer.invoke('shell:tor-status'),
  torRefresh: () => ipcRenderer.invoke('shell:tor-refresh'),
  torNewIdentity: () => ipcRenderer.invoke('shell:tor-new-identity'),
  torCircuit: () => ipcRenderer.invoke('shell:tor-circuit'),
  torBridges: (next) => ipcRenderer.invoke('shell:tor-bridges', next),
  torSelftest: (proxyUrl) => ipcRenderer.invoke('shell:tor-selftest', proxyUrl),
  torDaemonAutostart: (enabled) => ipcRenderer.invoke('shell:tor-daemon-autostart', enabled),
  torDaemonStatus: () => ipcRenderer.invoke('shell:tor-daemon-status'),
  onTorProgress: (cb) => {
    const handler = (_e, ev) => cb(ev);
    ipcRenderer.on('shell:tor-progress', handler);
    return () => ipcRenderer.removeListener('shell:tor-progress', handler);
  },
  privacyConfig: (next) => ipcRenderer.invoke('shell:privacy-config', next || {}),
  privacyStatus: () => ipcRenderer.invoke('shell:privacy-status'),
  privacyExceptionAdd: (host) => ipcRenderer.invoke('shell:privacy-exception-add', host),
  privacyExceptionRemove: (host) => ipcRenderer.invoke('shell:privacy-exception-remove', host),
  privacyForgetSite: (origin) => ipcRenderer.invoke('shell:privacy-forget-site', origin),
  privacyBlocked: (tabKey) => ipcRenderer.invoke('shell:privacy-blocked', tabKey),
  faviconCacheGet: (pageUrl) => ipcRenderer.invoke('shell:favicon-cache-get', pageUrl),
  faviconCachePut: (pageUrl, faviconUrl) => ipcRenderer.invoke('shell:favicon-cache-put', pageUrl, faviconUrl),
  historyConfig: (next) => ipcRenderer.invoke('shell:history-config', next || {}),
  historyStatus: () => ipcRenderer.invoke('shell:history-status'),
  historyRecordVisit: (opts) => ipcRenderer.invoke('shell:history-record-visit', opts || {}),
  historyRecordQuery: (q, opts) => ipcRenderer.invoke('shell:history-record-query', q, opts || {}),
  historyImportQueries: (items) => ipcRenderer.invoke('shell:history-import-queries', items || []),
  historySuggest: (q, opts) => ipcRenderer.invoke('shell:history-suggest', q, opts || {}),
  historyList: (opts) => ipcRenderer.invoke('shell:history-list', opts || {}),
  historyDelete: (id) => ipcRenderer.invoke('shell:history-delete', id),
  historyDeleteUrl: (url) => ipcRenderer.invoke('shell:history-delete-url', url),
  historyDeleteDomain: (host) => ipcRenderer.invoke('shell:history-delete-domain', host),
  historyClear: (opts) => ipcRenderer.invoke('shell:history-clear', opts || { range: 'all' }),
  historyRemoveQuery: (q) => ipcRenderer.invoke('shell:history-remove-query', q),
  spellcheckConfig: (next) => ipcRenderer.invoke('shell:spellcheck-config', next || {}),
  sessionLoad: () => ipcRenderer.invoke('shell:session-load'),
  sessionStatus: () => ipcRenderer.invoke('shell:session-status'),
  sessionSave: (snapshot) => ipcRenderer.invoke('shell:session-save', snapshot || {}),
  sessionClear: () => ipcRenderer.invoke('shell:session-clear'),
  sessionDismissCrash: () => ipcRenderer.invoke('shell:session-dismiss-crash'),
  sessionMarkClean: () => ipcRenderer.invoke('shell:session-mark-clean'),
  sessionNavHistory: (webContentsId) => ipcRenderer.invoke('shell:session-nav-history', webContentsId),
  downloadsList: () => ipcRenderer.invoke('shell:downloads-list'),
  downloadsConfig: (next) => ipcRenderer.invoke('shell:downloads-config', next),
  downloadsPause: (id) => ipcRenderer.invoke('shell:downloads-pause', id),
  downloadsResume: (id) => ipcRenderer.invoke('shell:downloads-resume', id),
  downloadsCancel: (id) => ipcRenderer.invoke('shell:downloads-cancel', id),
  downloadsRemove: (id) => ipcRenderer.invoke('shell:downloads-remove', id),
  downloadsClear: () => ipcRenderer.invoke('shell:downloads-clear'),
  downloadsOpen: (id) => ipcRenderer.invoke('shell:downloads-open', id),
  downloadsShow: (id) => ipcRenderer.invoke('shell:downloads-show', id),
  downloadsDrag: (id) => ipcRenderer.invoke('shell:downloads-drag', id),
  onDownloadsChanged: (cb) => {
    const handler = (_e, list) => cb(list);
    ipcRenderer.on('shell:downloads-changed', handler);
    return () => ipcRenderer.removeListener('shell:downloads-changed', handler);
  },
  bookmarksDiscoverProfiles: () => ipcRenderer.invoke('shell:bookmarks-discover-profiles'),
  bookmarksReadProfile: (profilePath) => ipcRenderer.invoke('shell:bookmarks-read-profile', profilePath),
  searchSuggest: (q) => ipcRenderer.invoke('shell:search-suggest', q),
  weatherFetch: (opts) => ipcRenderer.invoke('shell:weather-fetch', opts || {}),
  weatherSuggest: (opts) => ipcRenderer.invoke('shell:weather-suggest', opts || {}),
  homeBgPick: () => ipcRenderer.invoke('shell:home-bg-pick'),
  homeBgClear: () => ipcRenderer.invoke('shell:home-bg-clear'),
  notesList: (opts) => ipcRenderer.invoke('shell:notes-list', opts || {}),
  notesGet: (id) => ipcRenderer.invoke('shell:notes-get', id),
  notesCreate: (opts) => ipcRenderer.invoke('shell:notes-create', opts || {}),
  notesUpdate: (id, patch) => ipcRenderer.invoke('shell:notes-update', id, patch || {}),
  notesDelete: (id) => ipcRenderer.invoke('shell:notes-delete', id),
  notesMigrateLegacy: (text) => ipcRenderer.invoke('shell:notes-migrate-legacy', text),
  extensionsList: () => ipcRenderer.invoke('shell:extensions-list'),
  extensionsInstallFolder: () => ipcRenderer.invoke('shell:extensions-install-folder'),
  extensionsInstallStore: (input) => ipcRenderer.invoke('shell:extensions-install-store', input),
  extensionsSetEnabled: (id, enabled) => ipcRenderer.invoke('shell:extensions-set-enabled', id, enabled),
  extensionsSetPrivate: (id, allow) => ipcRenderer.invoke('shell:extensions-set-private', id, allow),
  extensionsSetPinned: (id, pinned) => ipcRenderer.invoke('shell:extensions-set-pinned', id, pinned),
  extensionsRemove: (id) => ipcRenderer.invoke('shell:extensions-remove', id),
  onHttpsWarn: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('shell:https-warn', handler);
    return () => ipcRenderer.removeListener('shell:https-warn', handler);
  },
  adblockConfig: (next) => ipcRenderer.invoke('shell:adblock-config', next),
  adblockStatus: () => ipcRenderer.invoke('shell:adblock-status'),
  adblockCosmetic: () => ipcRenderer.invoke('shell:adblock-cosmetic'),
  adblockPageScript: (pageUrl) => ipcRenderer.invoke('shell:adblock-page-script', pageUrl),
  perfBoot: (next) => ipcRenderer.invoke('shell:perf-boot', next),
  perfApplySession: (opts) => ipcRenderer.invoke('shell:perf-apply-session', opts),
  perfClearCache: () => ipcRenderer.invoke('shell:perf-clear-cache'),
  perfMemory: () => ipcRenderer.invoke('shell:perf-memory'),
  setTitleBar: (opts) => ipcRenderer.invoke('shell:set-titlebar', opts),
  setNativeTheme: (source) => ipcRenderer.invoke('shell:set-native-theme', source),
  passwordsStatus: () => ipcRenderer.invoke('shell:passwords-status'),
  passwordsSetup: (master, remember) => ipcRenderer.invoke('shell:passwords-setup', master, remember),
  passwordsUnlock: (master, remember) => ipcRenderer.invoke('shell:passwords-unlock', master, remember),
  passwordsLock: () => ipcRenderer.invoke('shell:passwords-lock'),
  passwordsList: (q) => ipcRenderer.invoke('shell:passwords-list', q),
  passwordsGet: (id) => ipcRenderer.invoke('shell:passwords-get', id),
  passwordsFind: (pageUrl) => ipcRenderer.invoke('shell:passwords-find', pageUrl),
  passwordsAutofill: (id, pageUrl) => ipcRenderer.invoke('shell:passwords-autofill', id, pageUrl),
  passwordsAdd: (entry) => ipcRenderer.invoke('shell:passwords-add', entry),
  passwordsUpdate: (id, patch) => ipcRenderer.invoke('shell:passwords-update', id, patch),
  passwordsRemove: (id) => ipcRenderer.invoke('shell:passwords-remove', id),
  passwordsNeverAdd: (origin) => ipcRenderer.invoke('shell:passwords-never-add', origin),
  passwordsNeverList: () => ipcRenderer.invoke('shell:passwords-never-list'),
  passwordsNeverRemove: (origin) => ipcRenderer.invoke('shell:passwords-never-remove', origin),
  passwordsShouldSave: (pageUrl, username, password) =>
    ipcRenderer.invoke('shell:passwords-should-save', pageUrl, username, password),
  passwordsConfirmSave: () => ipcRenderer.invoke('shell:passwords-confirm-save'),
  passwordsDismissSave: () => ipcRenderer.invoke('shell:passwords-dismiss-save'),
  passwordsGenerate: (opts) => ipcRenderer.invoke('shell:passwords-generate', opts),
  passwordsStrength: (pw) => ipcRenderer.invoke('shell:passwords-strength', pw),
  passwordsTotp: (id) => ipcRenderer.invoke('shell:passwords-totp', id),
  passwordsCopy: (id) => ipcRenderer.invoke('shell:passwords-copy', id),
  passwordsAudit: () => ipcRenderer.invoke('shell:passwords-audit'),
  passwordsExport: (master) => ipcRenderer.invoke('shell:passwords-export', master),
  passwordsImport: (csv, format) => ipcRenderer.invoke('shell:passwords-import', csv, format),
  passwordsChangeMaster: (oldPw, newPw) => ipcRenderer.invoke('shell:passwords-change-master', oldPw, newPw),
  passwordsIdle: (n) => ipcRenderer.invoke('shell:passwords-idle', n),
  passwordsPageScript: () => ipcRenderer.invoke('shell:passwords-page-script'),
  passwordsActivity: () => ipcRenderer.invoke('shell:passwords-activity'),
  webviewPreload: () => ipcRenderer.invoke('shell:webview-preload'),
  metricsSubscribe: () => ipcRenderer.invoke('shell:metrics-subscribe'),
  metricsUnsubscribe: () => ipcRenderer.invoke('shell:metrics-unsubscribe'),
  metricsSetGuests: (list) => ipcRenderer.invoke('shell:metrics-set-guests', list),
  metricsSetInterval: (ms) => ipcRenderer.invoke('shell:metrics-set-interval', ms),
  metricsLowPower: (on) => ipcRenderer.invoke('shell:metrics-low-power', on),
  metricsSnapshot: () => ipcRenderer.invoke('shell:metrics-snapshot'),
  permissionsList: () => ipcRenderer.invoke('shell:permissions-list'),
  permissionsRevoke: (origin, permission) => ipcRenderer.invoke('shell:permissions-revoke', origin, permission),
  permissionsRespond: (askId, allow, remember, origin, permission) =>
    ipcRenderer.invoke('shell:permissions-respond', askId, allow, remember, origin, permission),
  onAdblockBlocked: (cb) => {
    const handler = (_e, n) => cb(n);
    ipcRenderer.on('shell:adblock-blocked', handler);
    return () => ipcRenderer.removeListener('shell:adblock-blocked', handler);
  },
  onOpenUrl: (cb) => {
    const handler = (_e, payload) => {
      if (typeof payload === 'string') cb({ url: payload, tor: false });
      else if (payload && typeof payload === 'object' && typeof payload.url === 'string') {
        cb({
          url: payload.url,
          tor: Boolean(payload.tor),
          private: Boolean(payload.private),
          background: Boolean(payload.background),
        });
      }
    };
    ipcRenderer.on('shell:open-url', handler);
    return () => ipcRenderer.removeListener('shell:open-url', handler);
  },
  onPopupBlocked: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('shell:popup-blocked', handler);
    return () => ipcRenderer.removeListener('shell:popup-blocked', handler);
  },
  popupAllow: (origin) => ipcRenderer.invoke('shell:popup-allow', origin),
  popupOpenAllowed: (url, webContentsId) =>
    ipcRenderer.invoke('shell:popup-open-allowed', url, webContentsId),
  onContextAction: (cb) => {
    const handler = (_e, payload) => cb(payload || {});
    ipcRenderer.on('shell:context-action', handler);
    return () => ipcRenderer.removeListener('shell:context-action', handler);
  },
  setDevtoolsEnabled: (enabled) => ipcRenderer.invoke('shell:set-devtools-enabled', enabled),
  setShortcutTrap: (enabled) => ipcRenderer.invoke('shell:set-shortcut-trap', enabled),
  onShortcut: (cb) => {
    const handler = (_e, payload) => cb(payload || {});
    ipcRenderer.on('shell:shortcut', handler);
    return () => ipcRenderer.removeListener('shell:shortcut', handler);
  },
  onBrowserNav: (cb) => {
    const handler = (_e, payload) => cb(payload || {});
    ipcRenderer.on('shell:browser-nav', handler);
    return () => ipcRenderer.removeListener('shell:browser-nav', handler);
  },
  onPasswordsLocked: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('shell:passwords-locked', handler);
    return () => ipcRenderer.removeListener('shell:passwords-locked', handler);
  },
  onMetrics: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('shell:metrics', handler);
    return () => ipcRenderer.removeListener('shell:metrics', handler);
  },
  onPermissionAsk: (cb) => {
    const handler = (_e, req) => cb(req);
    ipcRenderer.on('shell:permission-ask', handler);
    return () => ipcRenderer.removeListener('shell:permission-ask', handler);
  },
  pictureInPicture: (webContentsId, opts) =>
    ipcRenderer.invoke('shell:picture-in-picture', webContentsId, opts || {}),
  savePage: (webContentsId, opts) => ipcRenderer.invoke('shell:save-page', webContentsId, opts || {}),
  printToPdf: (webContentsId, opts) => ipcRenderer.invoke('shell:print-to-pdf', webContentsId, opts || {}),
  printPage: (webContentsId, opts) => ipcRenderer.invoke('shell:print', webContentsId, opts || {}),
  certificateRespond: (webContentsId, proceed, rememberHost) =>
    ipcRenderer.invoke('shell:certificate-respond', webContentsId, proceed, rememberHost),
  onCertificateError: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('shell:certificate-error', handler);
    return () => ipcRenderer.removeListener('shell:certificate-error', handler);
  },
});
