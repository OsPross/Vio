export type Tab = {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  lastActiveAt?: number;
  discarded?: boolean;
  /** Scroll Y captured before discard — restored once on wake (RAM only). */
  scrollY?: number;
  /** Isolated Tor browsing — never mix with normal tabs */
  mode?: 'normal' | 'tor' | 'private';
  /** Last main-frame load failure (shown as in-app error page) */
  loadError?: {
    errorCode: number;
    description: string;
    url: string;
    kind?: 'crash' | 'network';
  } | null;
  /** Ephemeral partition name from main (tor-<uuid>) */
  partition?: string;
  /** Pinned tabs stay left, restore always, narrow chrome */
  pinned?: boolean;
  /** Site audio muted via webview.setAudioMuted */
  muted?: boolean;
  /** Optional back/forward URL chain for session restore */
  navHistory?: {
    url?: string;
    title?: string;
    urlChain?: string[];
    index?: number;
  } | null;
};

export type ClosedTab = {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  pinned?: boolean;
  index: number;
  navHistory?: Tab['navHistory'];
  closedAt: number;
};

/** Whole window closed (Ctrl+Shift+T when tab stack empty) */
export type ClosedWindow = {
  tabs: ClosedTab[];
  closedAt: number;
};

export type StartupMode = 'session' | 'newtab' | 'pages';

export type { Bang } from '../lib/bangs';

export type Shortcut = { id: string; label: string; url: string };
export type Bookmark = {
  id: string;
  title: string;
  url: string;
  folderId?: string;
  createdAt: number;
  /** Bar: show favicon only (no title label). */
  iconOnly?: boolean;
};

/** When the bookmarks bar under the omnibox is visible. */
export type BookmarksBarMode = 'always' | 'newtab' | 'never';
export type BookmarkFolder = { id: string; title: string; parentId?: string };
export type HistoryItem = { q: string; at: number };
export type SideApp = {
  id: string;
  label: string;
  url: string;
  /** Side-panel webview audio muted */
  muted?: boolean;
};

export type SearchEngine =
  | 'brave'
  | 'google'
  | 'bing'
  | 'ddg'
  | 'searx'
  | 'startpage'
  | 'qwant'
  | 'ecosia'
  | 'swisscows'
  | 'yandex'
  | 'ahmia'
  | 'onionland'
  | 'custom';

/** Language preference for search results / engine UI (URL params). */
export type SearchLanguage = 'auto' | 'en' | 'pl';

/** UI chrome language (menus, settings, dialogs). */
export type UiLocale = 'pl' | 'en';

export type HomeLayout = 'dashboard' | 'split' | 'stack' | 'minimal';
export type HomeAlign = 'left' | 'center';
export type HomeDensity = 'comfortable' | 'compact' | 'spacious';
export type BgStyle = 'solid' | 'soft' | 'panel' | 'mesh' | 'vignette' | 'custom';
export type HomeClockStyle = 'thin' | 'classic' | 'mono';

export type ThemeId =
  | 'midnight'
  | 'graphite'
  | 'ocean'
  | 'forest'
  | 'ember'
  | 'violet'
  | 'slate'
  | 'paper';
export type UiDensity = 'comfortable' | 'compact';
/** Wygląd stron WWW (prefers-color-scheme) — osobno od motywu chrome UI */
export type PageColorScheme = 'system' | 'light' | 'dark';
export type HomeAppsStyle = 'icons' | 'list';
export type PerfMode = 'balanced' | 'performance' | 'saver';

export type HomeWidgetType =
  | 'weather'
  | 'notes'
  | 'todo'
  | 'calendar'
  | 'recent'
  | 'downloads'
  | 'resources'
  | 'spotify';

export type HomeWidgetSize = 'S' | 'M' | 'L';
export type HomeWidgetAnchor = 'center' | 'left' | 'right';

export type HomeWidgetStyle = 'transparent' | 'glass' | 'solid';

export type HomeWidget = {
  id: string;
  type: HomeWidgetType;
  size: HomeWidgetSize;
  /** Horizontal anchor for responsive placement */
  anchor: HomeWidgetAnchor;
  /** Grid cells (8px) from anchor axis (center/left/right of canvas) */
  x: number;
  /** Grid cells (8px) from top of widget zone */
  y: number;
  settings: Record<string, unknown>;
  /** Per-widget card style; omit / undefined = inherit global homeWidgetStyle */
  style?: HomeWidgetStyle;
};

export type HomeLayoutPreset = 'centered' | 'top' | 'left' | 'custom';

/** Built-in home chrome — clock / search / shortcuts (freely placed like widgets). */
export type HomeChromeId = 'clock' | 'search' | 'shortcuts';

export type HomeChromeItem = {
  id: HomeChromeId;
  anchor: HomeWidgetAnchor;
  x: number;
  y: number;
};

export type HomeTodoItem = { id: string; text: string; done: boolean };

export type Settings = {
  searchEngine: SearchEngine;
  /** Preferred language of search results (engines that support URL lang params). */
  searchLanguage: SearchLanguage;
  /** Interface language (PL / EN). */
  uiLocale: UiLocale;
  searxUrl: string;
  customSearchUrl: string;
  /** SOCKS address for Tryb Tor (9050 daemon / 9150 Tor Browser) */
  torProxyUrl: string;
  /** User acknowledged Tor mode limitations once */
  torSeenDisclaimer: boolean;
  /** Optional Windows Startup shortcut for embedded tor.exe — default OFF */
  torDaemonAutostart: boolean;
  /** Bridges for embedded Tor: none | obfs4 | snowflake | meek | custom */
  torBridgeMode: 'none' | 'obfs4' | 'snowflake' | 'meek' | 'custom';
  /** Custom bridge lines (one per line) when torBridgeMode === custom */
  torBridgeLines: string;
  /** Privacy */
  privacyPreset: 'standard' | 'strict' | 'custom';
  privacySiteExceptions: string[];
  privacyClearOnQuit: boolean;
  privacyClearOnQuitKeep: string[];
  privacyStripTracking: boolean;
  privacySecGpc: boolean;
  privacyDnt: boolean;
  privacyReferrerPolicy: boolean;
  privacyThirdPartyCookies: 'trackers' | 'all' | 'allow';
  privacyHttpsOnly: 'upgrade' | 'block' | 'off';
  privacyDoh: 'automatic' | 'quad9' | 'cloudflare' | 'mullvad' | 'nextdns' | 'custom' | 'off';
  privacyDohCustom: string;
  privacyChromeUa: boolean;
  privacyWebRtc: 'public_only' | 'disable_udp' | 'default';
  privacyFingerprint: boolean;
  privacySearchSuggest: boolean;
  privacyAllowAppNetwork: boolean;
  /** Browsing history retention: 7|30|90 days, always, or off */
  historyRetention: '7' | '30' | '90' | 'always' | 'off';
  adblockUpdateLists: boolean;
  adblockEnabled: boolean;
  adblockNetwork: boolean;
  adblockCosmetic: boolean;
  adblockTrackers: boolean;
  adblockCustomRules: string;
  /** Standard: skip same-eTLD+1 network blocks; Strict: allow explicit list filters on 1p */
  adblockLevel: 'standard' | 'strict';
  /** User-added adblock allowlist hosts (privacy still applies) */
  adblockExceptions: string[];
  /** Builtin allowlist ids the user disabled */
  adblockBuiltinDisabled: string[];
  /** Per filter-list enable flags */
  adblockListsEnabled: Record<string, boolean>;
  openSearchInNewTab: boolean;
  suggestHistory: boolean;
  suggestBangs: boolean;
  homepage: string;
  /** What to open when the app starts */
  startupMode: StartupMode;
  /** Newline-separated URLs when startupMode === 'pages' */
  startupPages: string;
  /** Default downloads folder (empty = system Downloads) */
  downloadsFolder: string;
  /** Always ask where to save (clearnet). Tor always asks. */
  downloadsAskWhere: boolean;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  showSidebar: boolean;
  /** Chrome-like: on | auto-hide | off — drives showSidebar */
  sidebarMode: 'on' | 'auto' | 'off';
  sidePanelOpen: boolean;
  sidePanelWidth: number;
  activeSideAppId: string | null;
  theme: ThemeId;
  accent: string;
  useThemeAccent: boolean;
  uiGlass: boolean;
  glassBlur: number;
  glassOpacity: number;
  uiMotion: boolean;
  uiDensity: UiDensity;
  openExternalInApp: boolean;
  newTabIsSearch: boolean;
  appName: string;
  omniboxPlaceholder: string;
  homeHeadline: string;
  homeSubline: string;
  homePlaceholder: string;
  homeShowGreeting: boolean;
  homeShowClock: boolean;
  homeShowDate: boolean;
  homeShowApps: boolean;
  homeShowRecent: boolean;
  homeShowBangs: boolean;
  homeShowBrand: boolean;
  homeShowEngine: boolean;
  homeShowNotes: boolean;
  homeShowStats: boolean;
  homeNotes: string;
  homeTodos: HomeTodoItem[];
  homeAppsStyle: HomeAppsStyle;
  homeLayout: HomeLayout;
  homeAlign: HomeAlign;
  /** Active layout preset card in Personalize → Układ (`custom` after manual drag) */
  homeLayoutPreset: HomeLayoutPreset;
  homeDensity: HomeDensity;
  /** Draggable home widgets; empty = migrate from layout flags */
  homeWidgets: HomeWidget[];
  /** Freely placed clock / search / shortcuts */
  homeChrome: HomeChromeItem[];
  homeWidgetStyle: HomeWidgetStyle;
  homeWidgetRadius: number;
  homeGridGap: number;
  homeLayoutLock: boolean;
  bgStyle: BgStyle;
  homeBgImage: string | null;
  homeBgBlur: number;
  homeBgDim: number;
  homeClockStyle: HomeClockStyle;
  homeShowSeconds: boolean;
  clock24h: boolean;
  /** Wydajność */
  perfMode: PerfMode;
  perfHardwareAcceleration: boolean;
  perfBackgroundThrottling: boolean;
  perfLazyTabs: boolean;
  perfDiscardTabs: boolean;
  /** Idle minutes before discard: 15 | 30 | 60 (ignored when perfDiscardTabs is false). */
  perfDiscardMinutes: number;
  /** Do not auto-discard pinned tabs (manual sleep still allowed). */
  perfDiscardKeepPinned: boolean;
  /**
   * Auto-archive idle tabs after N hours (0 = off). Presets: 0 | 6 | 12 | 24.
   * Archived tabs leave the strip and go to userData/tab-archive.json.
   */
  tabArchiveHours: number;
  perfReduceMotion: boolean;
  perfSmoothScrolling: boolean;
  perfSpellcheck: boolean;
  perfBlockHeavyMedia: boolean;
  perfCacheMb: number;
  perfLowPowerClock: boolean;
  /** Menedżer haseł (preferencje UI — sejf tylko w main) */
  passwordsEnabled: boolean;
  passwordsIdleMinutes: number;
  passwordsAutofill: boolean;
  passwordsOfferSave: boolean;
  /** Allow Inspect / DevTools on guest pages (Advanced) */
  allowInspect: boolean;
  /** Local automation API for the Soul assistant (Advanced, off by default) */
  automationEnabled: boolean;
  /** Per-host zoom factor (host → factor, e.g. 1.25) */
  zoomFactors: Record<string, number>;
  /** @deprecated Prefer bookmarksBarMode — kept for migrate */
  showBookmarksBar: boolean;
  /** Pasek zakładek pod omniboxem (Ctrl+Shift+B cykuje) */
  bookmarksBarMode: BookmarksBarMode;
  /** Ciemne paski przewijania w treści stron (webview) */
  darkPageScrollbars: boolean;
  /**
   * Kolorystyka stron (nie chrome).
   * `system` = jak OS; nie wiązać z motywem UI — inaczej ciemny chrome psuje jasne strony.
   */
  pageColorScheme: PageColorScheme;
  /** Enter PiP when switching away from a tab with playing video */
  autoPipOnTabSwitch: boolean;
  /** Shift+hover link preview popover (disabled in Tor/private). */
  linkPreviewEnabled: boolean;
};

export type SettingsTab =
  | 'general'
  | 'search'
  | 'home'
  | 'look'
  | 'sidebar'
  | 'shortcuts'
  | 'privacy'
  | 'adblock'
  | 'passwords'
  | 'performance'
  | 'resources'
  | 'advanced';
