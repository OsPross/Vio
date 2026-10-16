import type {
  BookmarkFolder,
  SearchEngine,
  Settings,
  Shortcut,
  SideApp,
  ThemeId,
} from './types';

/** Accent presets — values applied to settings.accent; classes for UI swatches */
export const ACCENT_SWATCHES: { id: string; className: string; value: string }[] = [
  { id: '1', className: 'ui-swatch-1', value: '#6b9eff' },
  { id: '2', className: 'ui-swatch-2', value: '#4db6e2' },
  { id: '3', className: 'ui-swatch-3', value: '#6fbf8a' },
  { id: '4', className: 'ui-swatch-4', value: '#e7a067' },
  { id: '5', className: 'ui-swatch-5', value: '#b388ff' },
  { id: '6', className: 'ui-swatch-6', value: '#f07178' },
  { id: '7', className: 'ui-swatch-7', value: '#c5c9d0' },
  { id: '8', className: 'ui-swatch-8', value: '#2f6fed' },
];

export const HOME_GRID_PX = 8;

export const HOME_URL = 'about:home';
export const TOR_HOME_URL = 'about:tor';
export const HISTORY_URL = 'about:history';
export const DOWNLOADS_URL = 'about:downloads';
export const BOOKMARKS_URL = 'about:bookmarks';
export const EXTENSIONS_URL = 'about:extensions';
export const ABOUT_URL = 'djxxr://about';
export const ABOUT_URL_ALT = 'about:about';

/** Domyślny folder na pasek zakładek */
export const BOOKMARKS_BAR_FOLDER_ID = 'folder-bar';
export const BOOKMARKS_OTHER_FOLDER_ID = 'folder-other';

export const DEFAULT_BOOKMARK_FOLDERS: BookmarkFolder[] = [
  { id: BOOKMARKS_BAR_FOLDER_ID, title: 'Pasek zakładek' },
  { id: BOOKMARKS_OTHER_FOLDER_ID, title: 'Inne zakładki' },
];

export const SEARCH_ENGINES: {
  id: SearchEngine;
  label: string;
  group: 'web' | 'privacy' | 'onion' | 'local' | 'custom';
  hint?: string;
}[] = [
  { id: 'brave', label: 'Brave Search', group: 'web' },
  { id: 'google', label: 'Google', group: 'web' },
  { id: 'bing', label: 'Bing', group: 'web' },
  { id: 'yandex', label: 'Yandex', group: 'web' },
  { id: 'ddg', label: 'DuckDuckGo', group: 'privacy' },
  { id: 'startpage', label: 'Startpage', group: 'privacy' },
  { id: 'qwant', label: 'Qwant', group: 'privacy' },
  { id: 'ecosia', label: 'Ecosia', group: 'privacy' },
  { id: 'swisscows', label: 'Swisscows', group: 'privacy' },
  {
    id: 'ahmia',
    label: 'Ahmia (onion index)',
    group: 'onion',
    hint: 'Indeks .onion przez clearnet — same .onion wymagają Tor',
  },
  {
    id: 'onionland',
    label: 'OnionLand Search',
    group: 'onion',
    hint: 'Wyszukiwarka darknetu (clearnet gateway)',
  },
  { id: 'searx', label: 'SearXNG (własny)', group: 'local' },
  { id: 'custom', label: 'Własny URL (%s)', group: 'custom' },
];

export const THEMES: Record<
  ThemeId,
  {
    label: string;
    bg: string;
    elev: string;
    side: string;
    fg: string;
    fg2: string;
    fg3: string;
    line: string;
    accent: string;
  }
> = {
  midnight: {
    label: 'Midnight',
    bg: '#08090c',
    elev: '#12151c',
    side: '#12151c',
    fg: '#f2f3f5',
    fg2: '#9aa1ad',
    fg3: '#5c6573',
    line: 'rgba(255,255,255,0.08)',
    accent: '#6b9eff',
  },
  graphite: {
    label: 'Graphite',
    bg: '#111214',
    elev: '#1a1c1f',
    side: '#1a1c1f',
    fg: '#eceef0',
    fg2: '#a0a4ab',
    fg3: '#6a6f78',
    line: 'rgba(255,255,255,0.09)',
    accent: '#c5c9d0',
  },
  ocean: {
    label: 'Ocean',
    bg: '#071018',
    elev: '#0e1a24',
    side: '#0e1a24',
    fg: '#e8f1f7',
    fg2: '#8eabb8',
    fg3: '#55707e',
    line: 'rgba(120,180,210,0.12)',
    accent: '#4db6e2',
  },
  forest: {
    label: 'Forest',
    bg: '#0a110d',
    elev: '#121a15',
    side: '#121a15',
    fg: '#eaf2ec',
    fg2: '#93a899',
    fg3: '#5d6e62',
    line: 'rgba(140,190,150,0.12)',
    accent: '#6fbf8a',
  },
  ember: {
    label: 'Ember',
    bg: '#120c0a',
    elev: '#1c1410',
    side: '#1c1410',
    fg: '#f5eee8',
    fg2: '#b5a196',
    fg3: '#74655b',
    line: 'rgba(220,150,100,0.12)',
    accent: '#e7a067',
  },
  violet: {
    label: 'Violet',
    bg: '#0e0b14',
    elev: '#171320',
    side: '#171320',
    fg: '#f0ecf7',
    fg2: '#a89bb8',
    fg3: '#6b6178',
    line: 'rgba(180,140,220,0.12)',
    accent: '#b388ff',
  },
  slate: {
    label: 'Slate',
    bg: '#0f1419',
    elev: '#171e26',
    side: '#171e26',
    fg: '#e9eef3',
    fg2: '#93a0ad',
    fg3: '#5c6a78',
    line: 'rgba(160,180,200,0.1)',
    accent: '#7ec8e3',
  },
  paper: {
    label: 'Paper',
    bg: '#e8e6e1',
    elev: '#f4f2ed',
    side: '#f4f2ed',
    fg: '#1a1b1e',
    fg2: '#5a5e66',
    fg3: '#8a8f98',
    line: 'rgba(0,0,0,0.1)',
    accent: '#2f6fed',
  },
};

export const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: 'gmail', label: 'Gmail', url: 'https://mail.google.com/' },
  { id: 'drive', label: 'Drive', url: 'https://drive.google.com/' },
  { id: 'yt', label: 'YouTube', url: 'https://www.youtube.com/' },
  { id: 'calendar', label: 'Kalendarz', url: 'https://calendar.google.com/' },
];

export const DEFAULT_SIDE_APPS: SideApp[] = [
  { id: 'messenger', label: 'Messenger', url: 'https://www.messenger.com/' },
  { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com/app' },
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'gmail-side', label: 'Gmail', url: 'https://mail.google.com/mail/u/0/#inbox' },
];

export const DEFAULT_SETTINGS: Settings = {
  searchEngine: 'brave',
  searxUrl: 'http://127.0.0.1:8080',
  customSearchUrl: 'https://duckduckgo.com/?q=%s',
  torProxyUrl: 'socks5://127.0.0.1:9050',
  torSeenDisclaimer: false,
  torDaemonAutostart: false,
  torBridgeMode: 'none',
  torBridgeLines: '',
  privacyPreset: 'standard',
  privacySiteExceptions: [],
  privacyClearOnQuit: false,
  privacyClearOnQuitKeep: [],
  privacyStripTracking: true,
  privacySecGpc: true,
  privacyDnt: false,
  privacyReferrerPolicy: true,
  privacyThirdPartyCookies: 'trackers',
  privacyHttpsOnly: 'upgrade',
  privacyDoh: 'automatic',
  privacyDohCustom: '',
  privacyChromeUa: true,
  privacyWebRtc: 'public_only',
  privacyFingerprint: false,
  privacySearchSuggest: true,
  privacyAllowAppNetwork: true,
  historyRetention: '90',
  adblockUpdateLists: true,
  adblockEnabled: true,
  adblockNetwork: true,
  adblockCosmetic: true,
  adblockTrackers: true,
  adblockCustomRules: '',
  adblockLevel: 'standard',
  adblockExceptions: [],
  adblockBuiltinDisabled: [],
  adblockListsEnabled: {
    easylist: true,
    easyprivacy: true,
    ublock: true,
    peterlowe: true,
  },
  openSearchInNewTab: false,
  suggestHistory: true,
  suggestBangs: true,
  homepage: HOME_URL,
  startupMode: 'session',
  startupPages: '',
  downloadsFolder: '',
  downloadsAskWhere: false,
  sidebarWidth: 220,
  sidebarCollapsed: false,
  showSidebar: true,
  sidebarMode: 'on',
  sidePanelOpen: false,
  sidePanelWidth: 420,
  activeSideAppId: null,
  theme: 'midnight',
  accent: '#6b9eff',
  useThemeAccent: true,
  uiGlass: true,
  glassBlur: 18,
  glassOpacity: 0.55,
  uiMotion: true,
  uiDensity: 'comfortable',
  openExternalInApp: true,
  newTabIsSearch: true,
  appName: 'Vio',
  omniboxPlaceholder: 'Szukaj, !yt, adres…  (Ctrl+L)',
  homeHeadline: '',
  homeSubline: '',
  homePlaceholder: 'Szukaj albo wklej adres…',
  homeShowGreeting: true,
  homeShowClock: true,
  homeShowDate: true,
  homeShowApps: true,
  homeShowRecent: false,
  homeShowBangs: false,
  homeShowBrand: false,
  homeShowEngine: true,
  homeShowNotes: false,
  homeShowStats: false,
  homeNotes: '',
  homeTodos: [],
  homeAppsStyle: 'icons',
  homeLayout: 'dashboard',
  homeAlign: 'center',
  homeLayoutPreset: 'centered',
  homeDensity: 'comfortable',
  homeWidgets: [],
  homeChrome: [],
  homeWidgetStyle: 'transparent',
  homeWidgetRadius: 14,
  homeGridGap: 12,
  homeLayoutLock: false,
  bgStyle: 'soft',
  homeBgImage: null,
  homeBgBlur: 0,
  homeBgDim: 20,
  homeClockStyle: 'thin',
  homeShowSeconds: false,
  clock24h: true,
  perfMode: 'balanced',
  perfHardwareAcceleration: true,
  perfBackgroundThrottling: true,
  perfLazyTabs: true,
  perfDiscardTabs: true,
  perfDiscardMinutes: 15,
  perfReduceMotion: false,
  perfSmoothScrolling: true,
  perfSpellcheck: true,
  perfBlockHeavyMedia: false,
  perfCacheMb: 256,
  perfLowPowerClock: false,
  passwordsEnabled: true,
  passwordsIdleMinutes: 15,
  passwordsAutofill: true,
  passwordsOfferSave: true,
  allowInspect: true,
  automationEnabled: false,
  zoomFactors: {},
  showBookmarksBar: false,
  darkPageScrollbars: true,
  autoPipOnTabSwitch: false,
};

export const MAX_CLOSED_TABS = 25;
export const MAX_CLOSED_WINDOWS = 5;

export const PERSIST_KEY = 'moja-przegladarka-v8';
