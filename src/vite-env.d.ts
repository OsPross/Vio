export {};

type PwStatus = {
  setup: boolean;
  unlocked: boolean;
  remember: boolean;
  rememberAvailable: boolean;
  entryCount: number;
  idleMinutes: number;
  ok?: boolean;
  error?: string;
};

type PwPublicEntry = {
  id: string;
  origin: string;
  username: string;
  note: string;
  hasTotp: boolean;
  createdAt: number;
  lastUsedAt: number;
  updatedAt: number;
};

declare global {
  interface Window {
    shell?: {
      platform: () => Promise<string>;
      debugMouse?: boolean;
      appInfo: () => Promise<{
        appVersion: string;
        electron: string;
        chrome: string;
        node: string;
        v8?: string;
        platform: string;
        userData?: string;
      }>;
      openUserData: () => Promise<{ ok: boolean }>;
      openLogsFolder: () => Promise<{ ok: boolean }>;
      newWindow: (opts?: {
        boot?: 'private' | 'tor';
        restoreTabs?: {
          url: string;
          title?: string;
          favicon?: string;
          pinned?: boolean;
          navHistory?: unknown;
        }[];
      }) => Promise<{ ok: boolean }>;
      getWindowBoot: () => Promise<{
        mode: string;
        partition?: string | null;
        restoreTabs?: {
          url: string;
          title?: string;
          favicon?: string;
          pinned?: boolean;
          navHistory?: unknown;
        }[] | null;
      }>;
      windowClosingAck: () => Promise<{ ok: boolean }>;
      onWindowClosing: (cb: () => void) => () => void;
      onWindowBoot: (cb: (payload: { mode?: string; partition?: string | null }) => void) => () => void;
      quitApp: () => Promise<{ ok: boolean }>;
      windowToggleFullscreen: () => Promise<{ ok: boolean; fullScreen?: boolean }>;
      openExternal: (url: string) => Promise<void>;
      setProxy: (proxyRules: string | null) => Promise<{ ok: boolean; mode: string; rules?: string; note?: string }>;
      torStart: (opts?: { proxyUrl?: string }) => Promise<{
        ok: boolean;
        active?: boolean;
        isTor?: boolean;
        partition?: string | null;
        proxyUrl?: string;
        exitIp?: string | null;
        exitCountry?: string | null;
        lastCheck?: number | null;
        error?: string | null;
        code?: string;
        dnsMode?: string;
        dnsNote?: string;
        embeddedTor?: boolean;
        embeddedTorNote?: string;
        ua?: string;
      }>;
      torStop: () => Promise<Record<string, unknown>>;
      torStatus: () => Promise<Record<string, unknown>>;
      torRefresh: () => Promise<Record<string, unknown>>;
      torNewIdentity: () => Promise<
        Record<string, unknown> & {
          ok?: boolean;
          partition?: string | null;
          exitIp?: string | null;
          error?: string | null;
          note?: string;
        }
      >;
      torCircuit: () => Promise<{
        ok: boolean;
        exitIp?: string | null;
        exitCountry?: string | null;
        circuits?: { id: string; status: string; path: { fingerprint: string; nickname: string | null }[] }[];
        error?: string;
        limitation?: string;
      }>;
      torBridges: (next?: {
        mode?: 'none' | 'obfs4' | 'snowflake' | 'meek' | 'custom';
        customLines?: string[];
      }) => Promise<Record<string, unknown> & { ok?: boolean; error?: string }>;
      torSelftest: (proxyUrl?: string) => Promise<{
        ok: boolean;
        host?: string;
        port?: number;
        rules?: string;
        dnsMode?: string;
        note?: string;
      }>;
      torDaemonAutostart: (enabled: boolean) => Promise<{ ok: boolean; enabled?: boolean; path?: string; error?: string }>;
      torDaemonStatus: () => Promise<Record<string, unknown>>;
      onTorProgress: (cb: (ev: { phase?: string; message?: string; percent?: number }) => void) => () => void;
      adblockConfig: (next?: {
        enabled?: boolean;
        network?: boolean;
        cosmetic?: boolean;
        trackers?: boolean;
        customRules?: string[];
      }) => Promise<{
        enabled: boolean;
        network: boolean;
        cosmetic: boolean;
        trackers: boolean;
        customRules: string[];
        blockedCount: number;
        blockedToday: number;
        ruleHosts: number;
      }>;
      adblockStatus: () => Promise<{
        enabled: boolean;
        blockedCount: number;
        blockedToday: number;
        ruleHosts: number;
      }>;
      adblockCosmetic: () => Promise<string>;
      adblockPageScript: (pageUrl: string) => Promise<string>;
      perfBoot: (next?: Record<string, unknown>) => Promise<Record<string, unknown> & { needsRestart?: boolean }>;
      perfApplySession: (opts?: {
        cacheMb?: number;
        backgroundThrottling?: boolean;
        spellcheck?: boolean;
      }) => Promise<{ ok: boolean; spellcheck?: boolean }>;
      perfClearCache: () => Promise<{ ok: boolean }>;
      perfMemory: () => Promise<{
        processes: number;
        workingSetMb: number;
        privateMb: number;
        metrics: { type: string; cpu: number; memMb: number }[];
      }>;
      setTitleBar: (opts: {
        color?: string;
        symbolColor?: string;
        height?: number;
      }) => Promise<{ ok: boolean; color?: string; symbolColor?: string; height?: number; error?: string }>;
      setNativeTheme: (source: 'dark' | 'light' | 'system') => Promise<{ ok: boolean }>;
      passwordsStatus: () => Promise<PwStatus>;
      passwordsSetup: (master: string, remember?: boolean) => Promise<PwStatus & { rememberError?: string }>;
      passwordsUnlock: (master: string, remember?: boolean | null) => Promise<PwStatus & { rememberError?: string }>;
      passwordsLock: () => Promise<{ ok: boolean; reason?: string }>;
      passwordsList: (q?: string) => Promise<PwPublicEntry[] | { ok: false; error?: string }>;
      passwordsGet: (id: string) => Promise<
        (PwPublicEntry & { password: string; totpSecret: string; ok?: boolean; error?: string }) | { ok: false; error?: string }
      >;
      passwordsFind: (pageUrl: string) => Promise<PwPublicEntry[] | { ok: false; error?: string }>;
      passwordsAutofill: (
        id: string,
        pageUrl: string,
      ) => Promise<{ username: string; password: string } | { ok: false; error?: string }>;
      passwordsAdd: (entry: {
        origin?: string;
        url?: string;
        username?: string;
        password?: string;
        note?: string;
        totpSecret?: string;
      }) => Promise<PwPublicEntry | { ok: false; error?: string }>;
      passwordsUpdate: (
        id: string,
        patch: Record<string, unknown>,
      ) => Promise<PwPublicEntry | { ok: false; error?: string }>;
      passwordsRemove: (id: string) => Promise<{ ok: boolean; error?: string }>;
      passwordsNeverAdd: (origin: string) => Promise<{ ok: boolean; neverSave?: string[]; error?: string }>;
      passwordsNeverList: () => Promise<string[] | { ok: false; error?: string }>;
      passwordsNeverRemove: (origin: string) => Promise<{ ok: boolean; error?: string }>;
      passwordsShouldSave: (
        pageUrl: string,
        username: string,
        password: string,
      ) => Promise<
        | { offer: boolean; reason?: string; mode?: string; id?: string; origin?: string; username?: string }
        | { ok: false; error?: string }
      >;
      passwordsConfirmSave: () => Promise<{ id?: string; origin?: string; ok?: boolean; error?: string }>;
      passwordsDismissSave: () => Promise<{ ok: boolean; error?: string }>;
      passwordsGenerate: (opts?: Record<string, unknown>) => Promise<{
        password: string;
        score: number;
        label: string;
        length: number;
        kind: string;
        error?: string;
      }>;
      passwordsStrength: (pw: string) => Promise<{ score: number; label: string; length: number }>;
      passwordsTotp: (id: string) => Promise<{ code: string; remaining: number } | { ok: false; error?: string }>;
      passwordsCopy: (id: string) => Promise<{ ok: boolean; clearMs?: number; error?: string }>;
      passwordsAudit: () => Promise<{
        total: number;
        weak: PwPublicEntry[];
        reused: PwPublicEntry[];
        old: PwPublicEntry[];
        error?: string;
      }>;
      passwordsExport: (master: string) => Promise<{ ok: boolean; csv?: string; error?: string }>;
      passwordsImport: (
        csv: string,
        format?: string,
      ) => Promise<{ ok: boolean; imported?: number; error?: string }>;
      passwordsChangeMaster: (
        oldPw: string,
        newPw: string,
      ) => Promise<{ ok: boolean; error?: string }>;
      passwordsIdle: (n: number) => Promise<{ idleMinutes: number }>;
      passwordsPageScript: () => Promise<string | { ok: false; error?: string }>;
      passwordsActivity: () => Promise<{ ok: boolean }>;
      webviewPreload: () => Promise<string>;
      metricsSubscribe: () => Promise<{ ok: boolean; subscribers: number; intervalMs: number }>;
      metricsUnsubscribe: () => Promise<{ ok: boolean; subscribers: number }>;
      metricsSetGuests: (list: {
        id: string;
        kind: 'tab' | 'side';
        title?: string;
        url?: string;
        favicon?: string;
        webContentsId?: number | null;
      }[]) => Promise<{ ok: boolean }>;
      metricsSetInterval: (ms: number) => Promise<{ ok: boolean; intervalMs: number }>;
      metricsLowPower: (on: boolean) => Promise<{ ok: boolean; intervalMs: number }>;
      metricsSnapshot: () => Promise<Record<string, unknown>>;
      permissionsList: () => Promise<Record<string, Record<string, string>>>;
      permissionsRevoke: (origin: string, permission?: string) => Promise<{ ok: boolean }>;
      permissionsRespond: (
        askId: string,
        allow: boolean,
        remember: boolean,
        origin: string,
        permission: string,
      ) => Promise<{ ok: boolean }>;
      onAdblockBlocked: (cb: (n: number) => void) => () => void;
      onOpenUrl: (
        cb: (
          payload:
            | { url: string; tor?: boolean; private?: boolean; background?: boolean }
            | string,
        ) => void,
      ) => () => void;
      onPopupBlocked: (
        cb: (payload: { url?: string; origin?: string; webContentsId?: number }) => void,
      ) => () => void;
      popupAllow: (origin: string) => Promise<{ ok: boolean; origin?: string }>;
      popupOpenAllowed: (
        url: string,
        webContentsId?: number,
      ) => Promise<{ ok: boolean; via?: string; reason?: string }>;
      onContextAction: (
        cb: (payload: { action?: string; url?: string; text?: string; tor?: boolean; private?: boolean }) => void,
      ) => () => void;
      setDevtoolsEnabled: (enabled: boolean) => Promise<{ ok: boolean; enabled: boolean }>;
      setShortcutTrap: (enabled: boolean) => Promise<{ ok: boolean; enabled?: boolean }>;
      onShortcut: (
        cb: (payload: {
          key: string;
          code?: string;
          ctrl?: boolean;
          shift?: boolean;
          alt?: boolean;
          meta?: boolean;
        }) => void,
      ) => () => void;
      onBrowserNav: (cb: (payload: { dir?: string; source?: string }) => void) => () => void;
      onPasswordsLocked: (cb: () => void) => () => void;
      onMetrics: (cb: (payload: Record<string, unknown>) => void) => () => void;
      onPermissionAsk: (cb: (req: Record<string, unknown>) => void) => () => void;
      privacyConfig: (next?: Record<string, unknown>) => Promise<Record<string, unknown>>;
      privacyStatus: () => Promise<Record<string, unknown>>;
      privacyExceptionAdd: (host: string) => Promise<Record<string, unknown>>;
      privacyExceptionRemove: (host: string) => Promise<Record<string, unknown>>;
      privacyForgetSite: (origin: string) => Promise<{ ok: boolean; origin?: string }>;
      privacyBlocked: (tabKey?: string) => Promise<{ host: string; url: string; at?: number }[]>;
      faviconCacheGet: (pageUrl: string) => Promise<string | null>;
      faviconCachePut: (pageUrl: string, faviconUrl: string) => Promise<string | null>;
      historyConfig: (next?: { retention?: '7' | '30' | '90' | 'always' | 'off' }) => Promise<{
        retention: string;
        count: number;
        queries: number;
      }>;
      historyStatus: () => Promise<{ retention: string; count: number; queries: number }>;
      historyRecordVisit: (opts: {
        url: string;
        title?: string;
        typed?: boolean;
        soft?: boolean;
        tor?: boolean;
      }) => Promise<{ ok: boolean; reason?: string; soft?: boolean }>;
      historyRecordQuery: (q: string, opts?: { tor?: boolean }) => Promise<{ ok: boolean; reason?: string }>;
      historyImportQueries: (
        items: { q: string; at?: number }[],
      ) => Promise<{ ok: boolean; imported?: number }>;
      historySuggest: (
        q: string,
        opts?: {
          openTabs?: { id: string; title: string; url: string }[];
          shortcuts?: { id: string; label: string; url: string }[];
          bangs?: { key: string; label: string }[];
          bookmarks?: { title?: string; url: string }[];
          suggestHistory?: boolean;
          suggestBangs?: boolean;
          limit?: number;
          tor?: boolean;
        },
      ) => Promise<{
        completion: { host: string; fill: string } | null;
        groups: {
          label: string;
          items: {
            kind: string;
            title: string;
            subtitle?: string;
            url?: string;
            fill?: string;
            id?: string;
            tabId?: string;
            faviconKey?: string;
            score?: number;
          }[];
        }[];
        tookMs?: number;
      }>;
      historyList: (opts?: {
        q?: string;
        limit?: number;
        offset?: number;
      }) => Promise<{
        total: number;
        items: {
          id: string;
          url: string;
          title: string;
          faviconKey: string;
          lastVisit: number;
          visitCount: number;
          typedCount: number;
        }[];
        queries: { q: string; at: number }[];
        retention: string;
      }>;
      historyDelete: (id: string) => Promise<{ ok: boolean }>;
      historyDeleteUrl: (url: string) => Promise<{ ok: boolean }>;
      historyDeleteDomain: (host: string) => Promise<{ ok: boolean; removed?: number }>;
      historyClear: (opts?: { range?: 'hour' | 'day' | 'week' | 'all' | number }) => Promise<{ ok: boolean }>;
      historyRemoveQuery: (q: string) => Promise<{ ok: boolean }>;
      spellcheckConfig: (next?: { enabled?: boolean }) => Promise<{
        ok: boolean;
        enabled?: boolean;
        langs?: string[];
      }>;
      sessionLoad: () => Promise<{
        version: number;
        dirtyExit: boolean;
        savedAt: number;
        activeId: string | null;
        tabs: {
          id: string;
          url: string;
          title: string;
          favicon?: string;
          pinned?: boolean;
          index?: number;
          navHistory?: {
            url?: string;
            title?: string;
            urlChain?: string[];
            index?: number;
          } | null;
        }[];
        closedTabs: {
          id: string;
          url: string;
          title: string;
          favicon?: string;
          pinned?: boolean;
          index: number;
          navHistory?: {
            url?: string;
            title?: string;
            urlChain?: string[];
            index?: number;
          } | null;
          closedAt: number;
        }[];
        window: { x?: number; y?: number; width: number; height: number; isMaximized?: boolean };
      }>;
      sessionStatus: () => Promise<{
        dirtyExit: boolean;
        tabCount: number;
        closedCount: number;
        savedAt: number;
        hasSession: boolean;
      }>;
      sessionSave: (snapshot: Record<string, unknown>) => Promise<{ ok: boolean; count?: number; closed?: number }>;
      sessionClear: () => Promise<{ ok: boolean }>;
      sessionDismissCrash: () => Promise<{ ok: boolean }>;
      sessionMarkClean: () => Promise<{ ok: boolean }>;
      sessionPushClosedWindow: (
        tabs: {
          id?: string;
          url: string;
          title?: string;
          favicon?: string;
          pinned?: boolean;
          index?: number;
          navHistory?: unknown;
          closedAt?: number;
        }[],
      ) => Promise<{ ok: boolean; count?: number; error?: string }>;
      sessionPopClosedWindow: () => Promise<{
        tabs: {
          id: string;
          url: string;
          title: string;
          favicon?: string;
          pinned?: boolean;
          index: number;
          navHistory?: unknown;
          closedAt: number;
        }[];
        closedAt: number;
      } | null>;
      sessionNavHistory: (webContentsId: number) => Promise<{
        url: string;
        title: string;
        urlChain?: string[];
        index?: number;
      } | null>;
      downloadsList: () => Promise<
        {
          id: string;
          url: string;
          filename: string;
          savePath: string;
          receivedBytes: number;
          totalBytes: number;
          state: string;
          startedAt: number;
          endedAt?: number;
          speedBps: number;
          canResume: boolean;
          tor: boolean;
          risky?: boolean;
          fileMissing?: boolean;
        }[]
      >;
      downloadsConfig: (next?: { folder?: string; askWhere?: boolean }) => Promise<{ folder: string; askWhere: boolean }>;
      downloadsPause: (id: string) => Promise<{ ok: boolean; error?: string }>;
      downloadsResume: (id: string) => Promise<{ ok: boolean; error?: string }>;
      downloadsCancel: (id: string) => Promise<{ ok: boolean }>;
      downloadsRemove: (id: string) => Promise<{ ok: boolean }>;
      downloadsClear: () => Promise<{ ok: boolean }>;
      downloadsOpen: (id: string) => Promise<{ ok: boolean; error?: string }>;
      downloadsShow: (id: string) => Promise<{ ok: boolean; error?: string }>;
      downloadsDrag: (id: string) => Promise<{ ok: boolean; error?: string }>;
      onDownloadsChanged: (cb: (list: unknown[]) => void) => () => void;
      bookmarksDiscoverProfiles: () => Promise<{ browser: string; path: string; exists: boolean }[]>;
      bookmarksReadProfile: (profilePath: string) => Promise<string>;
      searchSuggest: (q: string) => Promise<string[]>;
      weatherFetch: (opts: {
        location?: string;
        lat?: number;
        lon?: number;
      }) => Promise<{
        ok: boolean;
        error?: string;
        place?: { name: string; country: string; admin1: string; lat: number; lon: number };
        current?: {
          temperature_2m?: number;
          weather_code?: number;
          wind_speed_10m?: number;
          relative_humidity_2m?: number;
          time?: string;
        } | null;
        hourly?: {
          time?: string[];
          temperature_2m?: number[];
          weather_code?: number[];
        } | null;
        daily?: {
          time?: string[];
          weather_code?: number[];
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
        } | null;
      }>;
      weatherSuggest: (opts: { q: string }) => Promise<{
        ok: boolean;
        error?: string;
        places: { name: string; country: string; admin1: string; lat: number; lon: number; label: string }[];
      }>;
      homeBgPick: () => Promise<{
        ok: boolean;
        canceled?: boolean;
        path?: string;
        url?: string;
      }>;
      homeBgClear: () => Promise<{ ok: boolean }>;
      notesList: (opts?: { q?: string }) => Promise<{
        ok: boolean;
        notes?: {
          id: string;
          title: string;
          body: string;
          createdAt: number;
          updatedAt: number;
        }[];
        error?: string;
      }>;
      notesGet: (id: string) => Promise<{
        ok: boolean;
        note?: {
          id: string;
          title: string;
          body: string;
          createdAt: number;
          updatedAt: number;
        };
        error?: string;
      }>;
      notesCreate: (opts?: { body?: string; title?: string }) => Promise<{
        ok: boolean;
        note?: {
          id: string;
          title: string;
          body: string;
          createdAt: number;
          updatedAt: number;
        };
        error?: string;
      }>;
      notesUpdate: (
        id: string,
        patch?: { body?: string; title?: string },
      ) => Promise<{
        ok: boolean;
        note?: {
          id: string;
          title: string;
          body: string;
          createdAt: number;
          updatedAt: number;
        };
        error?: string;
      }>;
      notesDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
      notesMigrateLegacy: (text: string) => Promise<{
        ok: boolean;
        migrated?: boolean;
        note?: {
          id: string;
          title: string;
          body: string;
          createdAt: number;
          updatedAt: number;
        };
        notes?: {
          id: string;
          title: string;
          body: string;
          createdAt: number;
          updatedAt: number;
        }[];
        error?: string;
      }>;
      extensionsList: () => Promise<{
        ok: boolean;
        extensions?: {
          id: string;
          name: string;
          version: string;
          enabled: boolean;
          allowPrivate: boolean;
          pinned?: boolean;
          permissions?: string[];
          loaded?: boolean;
          manifestVersion?: number;
          path?: string;
          source?: string;
          electronId?: string | null;
        }[];
      }>;
      extensionsInstallFolder: () => Promise<{
        ok: boolean;
        canceled?: boolean;
        error?: string;
        extension?: unknown;
      }>;
      extensionsInstallStore: (input: string) => Promise<{
        ok: boolean;
        error?: string;
        extension?: unknown;
      }>;
      extensionsSetEnabled: (id: string, enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
      extensionsSetPrivate: (id: string, allow: boolean) => Promise<{ ok: boolean; error?: string }>;
      extensionsSetPinned: (id: string, pinned: boolean) => Promise<{ ok: boolean; error?: string }>;
      extensionsRemove: (id: string) => Promise<{ ok: boolean; error?: string }>;
      extensionsSelectTab: (webContentsId: number) => Promise<{ ok: boolean }>;
      onExtensionsActivateTab: (
        cb: (payload: { webContentsId: number }) => void,
      ) => () => void;
      onExtensionsCloseTab: (
        cb: (payload: { webContentsId: number }) => void,
      ) => () => void;
      onHttpsWarn: (cb: (payload: { httpUrl: string; httpsUrl?: string; errorCode?: number }) => void) => () => void;
      pictureInPicture: (
        webContentsId: number,
        opts?: { enterOnly?: boolean },
      ) => Promise<{ ok: boolean; result?: string; error?: string }>;
      savePage: (
        webContentsId: number,
        opts?: { forcePath?: string },
      ) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string; error?: string }>;
      printToPdf: (
        webContentsId: number,
        opts?: { forcePath?: string },
      ) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string; error?: string; bytes?: number }>;
      printPage: (
        webContentsId: number,
        opts?: { silent?: boolean },
      ) => Promise<{ ok: boolean; error?: string; mode?: string; silent?: boolean }>;
      certificateRespond: (
        webContentsId: number,
        proceed: boolean,
        rememberHost?: boolean,
      ) => Promise<{ ok: boolean; error?: string }>;
      onCertificateError: (
        cb: (payload: {
          webContentsId: number;
          url: string;
          host: string;
          error: string;
          issuer?: string;
          tor?: boolean;
        }) => void,
      ) => () => void;
    };
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          partition?: string;
          allowpopups?: boolean | string;
          useragent?: string;
          preload?: string;
          webpreferences?: string;
        },
        HTMLElement
      >;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'browser-action-list': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          partition?: string;
          tab?: string;
          alignment?: string;
        },
        HTMLElement
      >;
    }
  }
}
