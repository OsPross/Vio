import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getWindowPartition } from './lib/windowBoot';

export type Tab = {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  lastActiveAt?: number;
  discarded?: boolean;
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

export type { Bang } from './lib/bangs';
export { DEFAULT_BANGS, migrateBangsToDdg, resolveBang } from './lib/bangs';
import { DEFAULT_BANGS, migrateBangsToDdg, resolveBang, type Bang } from './lib/bangs';
export type Shortcut = { id: string; label: string; url: string };
export type Bookmark = { id: string; title: string; url: string; folderId?: string; createdAt: number };
export type BookmarkFolder = { id: string; title: string; parentId?: string };
export type HistoryItem = { q: string; at: number };
export type SideApp = { id: string; label: string; url: string };

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

export type HomeLayout = 'dashboard' | 'split' | 'stack' | 'minimal';
export type HomeAlign = 'left' | 'center';
export type HomeDensity = 'comfortable' | 'compact' | 'spacious';
export type BgStyle = 'solid' | 'soft' | 'panel' | 'mesh' | 'vignette' | 'custom';
export type HomeClockStyle = 'thin' | 'classic' | 'mono';

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

export type ThemeId = 'midnight' | 'graphite' | 'ocean' | 'forest' | 'ember' | 'violet' | 'slate' | 'paper';
export type UiDensity = 'comfortable' | 'compact';
export type HomeAppsStyle = 'icons' | 'list';
export type PerfMode = 'balanced' | 'performance' | 'saver';

export type HomeWidgetType =
  | 'weather'
  | 'notes'
  | 'todo'
  | 'calendar'
  | 'recent'
  | 'downloads'
  | 'resources';

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

export const HOME_GRID_PX = 8;

export type HomeTodoItem = { id: string; text: string; done: boolean };

const EXTRA_WIDGET_TYPES = new Set<HomeWidgetType>([
  'weather',
  'notes',
  'todo',
  'calendar',
  'recent',
  'downloads',
  'resources',
]);

function isExtraWidgetType(t: string): t is HomeWidgetType {
  return EXTRA_WIDGET_TYPES.has(t as HomeWidgetType);
}

/** Map legacy grid cells (or invalid size) → S/M/L */
export function legacyWidgetSize(raw: unknown, w?: number): HomeWidgetSize {
  if (raw === 'S' || raw === 'M' || raw === 'L') return raw;
  if (typeof w === 'number') {
    if (w <= 3) return 'S';
    if (w <= 4) return 'M';
    return 'L';
  }
  return 'M';
}

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
  { label: string; bg: string; elev: string; side: string; fg: string; fg2: string; fg3: string; line: string; accent: string }
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

export type Settings = {
  searchEngine: SearchEngine;
  searxUrl: string;
  customSearchUrl: string;
  /** @deprecated Global SOCKS on persist:main removed — kept for migrate; UI uses Tryb Tor */
  torProxyEnabled: boolean;
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
  perfDiscardMinutes: number;
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
  /** Per-host zoom factor (host → factor, e.g. 1.25) */
  zoomFactors: Record<string, number>;
  /** Pasek zakładek pod paskiem narzędzi (Ctrl+Shift+B) */
  showBookmarksBar: boolean;
  /** Ciemne paski przewijania w treści stron (webview) */
  darkPageScrollbars: boolean;
  /** Enter PiP when switching away from a tab with playing video */
  autoPipOnTabSwitch: boolean;
};

type State = {
  tabs: Tab[];
  activeId: string;
  view: 'browser' | 'settings';
  settingsTab:
    | 'general'
    | 'search'
    | 'home'
    | 'look'
    | 'sidebar'
    | 'shortcuts'
    | 'privacy'
    | 'passwords'
    | 'performance'
    | 'resources'
    | 'advanced';
  settings: Settings;
  bangs: Bang[];
  shortcuts: Shortcut[];
  sideApps: SideApp[];
  history: HistoryItem[];
  bookmarks: Bookmark[];
  bookmarkFolders: BookmarkFolder[];
  /** Recently closed normal tabs (Tor never here) — mirrored to session.json */
  closedTabs: ClosedTab[];
  /** Closed windows (secondary) for Ctrl+Shift+T */
  closedWindows: ClosedWindow[];
  /** Session bootstrap done */
  sessionReady: boolean;

  newTab: (url?: string, opts?: { background?: boolean; besideId?: string; private?: boolean }) => void;
  /** Create a Tor-mode tab bound to ephemeral partition from main */
  newTorTab: (opts: { url?: string; partition: string; background?: boolean }) => void;
  newPrivateTab: (url?: string) => void;
  newTabBeside: (besideId: string, url?: string) => void;
  muteTab: (id: string, muted?: boolean) => void;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  updateTab: (id: string, patch: Partial<Tab>) => void;
  pinTab: (id: string, pinned?: boolean) => void;
  reopenClosedTab: () => string | null;
  pushClosedWindow: () => void;
  setClosedWindows: (wins: ClosedWindow[]) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  duplicateTab: (id: string) => void;
  restoreSessionTabs: (tabs: Tab[], activeId: string | null, closedTabs?: ClosedTab[]) => void;
  setClosedTabs: (closed: ClosedTab[]) => void;
  setSessionReady: (v: boolean) => void;
  setView: (v: State['view']) => void;
  setSettingsTab: (t: State['settingsTab']) => void;
  patchSettings: (p: Partial<Settings>) => void;
  pushHistory: (q: string) => void;
  clearHistory: () => void;
  removeHistory: (q: string) => void;
  addBang: (b: Bang) => void;
  removeBang: (key: string) => void;
  addShortcut: (s: Omit<Shortcut, 'id'>) => void;
  removeShortcut: (id: string) => void;
  patchShortcut: (id: string, patch: Partial<Omit<Shortcut, 'id'>>) => void;
  addBookmark: (b: Omit<Bookmark, 'id' | 'createdAt'> & { createdAt?: number }) => string;
  updateBookmark: (id: string, patch: Partial<Omit<Bookmark, 'id'>>) => void;
  removeBookmark: (id: string) => void;
  findBookmarkByUrl: (url: string) => Bookmark | undefined;
  addBookmarkFolder: (f: Omit<BookmarkFolder, 'id'> & { id?: string }) => string;
  updateBookmarkFolder: (id: string, patch: Partial<Omit<BookmarkFolder, 'id'>>) => void;
  removeBookmarkFolder: (id: string) => void;
  mergeImportedBookmarks: (payload: {
    folders: BookmarkFolder[];
    bookmarks: Omit<Bookmark, 'id'>[];
  }) => void;
  reorderBookmarks: (activeId: string, overId: string) => void;
  moveBookmark: (id: string, folderId: string | undefined) => void;
  addSideApp: (s: Omit<SideApp, 'id'> & { id?: string }) => void;
  removeSideApp: (id: string) => void;
  openSideApp: (id: string) => void;
  closeSidePanel: () => void;
  resetSettings: () => void;
};

const uid = () => Math.random().toString(36).slice(2, 10);

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

export function isBookmarkableUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  if (url === HOME_URL || url === TOR_HOME_URL) return false;
  if (url === HISTORY_URL || url === DOWNLOADS_URL || url === BOOKMARKS_URL || url === EXTENSIONS_URL || url === ABOUT_URL || url === ABOUT_URL_ALT) return false;
  if (url.startsWith('about:') || url.startsWith('view-source:')) return false;
  return /^https?:\/\//i.test(url) || /\.onion\b/i.test(url);
}

export function isOnionUrl(url: string): boolean {
  try {
    return /\.onion$/i.test(new URL(url).hostname);
  } catch {
    return /\.onion\b/i.test(url);
  }
}

export function isTorTab(t: Tab | undefined | null): boolean {
  return !!t && t.mode === 'tor';
}

export function isPrivateTab(t: Tab | undefined | null): boolean {
  return !!t && t.mode === 'private';
}

export function sortTabsPinnedFirst(tabs: Tab[]): Tab[] {
  return [...tabs].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return 0;
  });
}

const MAX_CLOSED_TABS = 25;
const MAX_CLOSED_WINDOWS = 5;

function toClosedTab(tab: Tab, index: number): ClosedTab | null {
  if (isTorTab(tab)) return null;
  return {
    id: tab.id,
    url: tab.url,
    title: tab.title || 'Karta',
    favicon: tab.favicon,
    pinned: Boolean(tab.pinned),
    index,
    navHistory: tab.navHistory || null,
    closedAt: Date.now(),
  };
}

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
  torProxyEnabled: false,
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
  appName: 'Przeglądarka',
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
  homeBgBlur: 12,
  homeBgDim: 35,
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
  zoomFactors: {},
  showBookmarksBar: false,
  darkPageScrollbars: true,
  autoPipOnTabSwitch: false,
};

export function engineLabel(id: SearchEngine): string {
  return SEARCH_ENGINES.find((e) => e.id === id)?.label ?? id;
}

const widgetUid = () => `w-${Math.random().toString(36).slice(2, 10)}`;

const SIZE_W_CELLS: Record<HomeWidgetSize, number> = { S: 28, M: 38, L: 58 }; // ~220/300/460 at 8px
const SIZE_H_CELLS: Record<HomeWidgetSize, number> = { S: 18, M: 20, L: 22 };

export function widgetSizeCells(size: HomeWidgetSize) {
  return { w: SIZE_W_CELLS[size], h: SIZE_H_CELLS[size] };
}

/** Pack widgets into a centered row under the header (migration / defaults). */
export function layoutWidgetsInCenteredRow(widgets: HomeWidget[]): HomeWidget[] {
  if (!widgets.length) return [];
  const gap = 3; // cells ≈ 24px
  const widths = widgets.map((w) => widgetSizeCells(w.size).w);
  const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, widgets.length - 1);
  let cursor = -Math.floor(total / 2);
  // Default row sits under centered chrome (clock/search/shortcuts ~ y44+13) + 24px
  const y = 60;
  return widgets.map((w) => {
    const { w: ww } = widgetSizeCells(w.size);
    const x = cursor + Math.floor(ww / 2);
    cursor += ww + gap;
    return { ...w, anchor: 'center' as const, x, y };
  });
}

/** Left-edge aligned row at ~10% inset (matches CSS hw-place-left). */
export function layoutWidgetsInLeftRow(widgets: HomeWidget[]): HomeWidget[] {
  if (!widgets.length) return [];
  const gap = 3;
  let cursor = 0;
  const y = 60;
  return widgets.map((w) => {
    const { w: ww } = widgetSizeCells(w.size);
    // x = half-width in cells so left edge sits on the 10% anchor axis
    const x = Math.round(ww / 2) + cursor;
    cursor += ww + gap;
    return { ...w, anchor: 'left' as const, x, y };
  });
}

function parseAnchor(raw: unknown): HomeWidgetAnchor {
  if (raw === 'left' || raw === 'right' || raw === 'center') return raw;
  return 'center';
}

function parseWidgetStyle(raw: unknown): HomeWidgetStyle | undefined {
  if (raw === 'transparent' || raw === 'glass' || raw === 'solid') return raw;
  return undefined;
}

/** Default centered stack: clock → search → shortcuts (no overlap). */
export function defaultHomeChrome(): HomeChromeItem[] {
  // cells @ 8px — sizes from chromeSizeToPx
  // clock 168→21 cells, search 72→9, shortcuts 104→13; +2 gap
  return [
    { id: 'clock', anchor: 'center', x: 0, y: 8 },
    { id: 'search', anchor: 'center', x: 0, y: 31 },
    { id: 'shortcuts', anchor: 'center', x: 0, y: 44 },
  ];
}

/** Left stack — shared left edges at 10% (x = half-width in cells). */
export function layoutHomeChromeLeft(): HomeChromeItem[] {
  return [
    { id: 'clock', anchor: 'left', x: Math.round(560 / 2 / HOME_GRID_PX), y: 8 },
    { id: 'search', anchor: 'left', x: Math.round(640 / 2 / HOME_GRID_PX), y: 31 },
    { id: 'shortcuts', anchor: 'left', x: Math.round(640 / 2 / HOME_GRID_PX), y: 44 },
  ];
}

/** Top / minimal — search near top; clock & shortcuts hidden via flags. */
export function layoutHomeChromeTop(): HomeChromeItem[] {
  return [
    { id: 'clock', anchor: 'center', x: 0, y: 8 },
    { id: 'search', anchor: 'center', x: 0, y: 6 },
    { id: 'shortcuts', anchor: 'center', x: 0, y: 20 },
  ];
}

/** Keep centered stack from stacking on top of each other (legacy / bad saves). */
export function packHomeChromeVertical(items: HomeChromeItem[]): HomeChromeItem[] {
  const order: HomeChromeId[] = ['clock', 'search', 'shortcuts'];
  const map = new Map(items.map((i) => [i.id, { ...i }]));
  const stacked = order.every((id) => {
    const it = map.get(id);
    return !!it && it.anchor === 'center' && it.x === 0;
  });
  if (!stacked) return order.map((id) => map.get(id)!).filter(Boolean);

  let cursor = 0;
  for (const id of order) {
    const it = map.get(id)!;
    const hCells = Math.ceil(chromeSizeToPx(id).h / HOME_GRID_PX);
    if (it.y < cursor) it.y = cursor;
    cursor = it.y + hCells + 2;
  }
  return order.map((id) => map.get(id)!);
}

export function normalizeHomeChrome(raw: unknown): HomeChromeItem[] {
  const defs = defaultHomeChrome();
  if (!Array.isArray(raw)) return packHomeChromeVertical(defs);
  const merged = defs.map((d) => {
    const found = (raw as unknown[]).find(
      (x) => x && typeof x === 'object' && (x as HomeChromeItem).id === d.id,
    ) as HomeChromeItem | undefined;
    if (!found) return { ...d };
    return {
      id: d.id,
      anchor: parseAnchor(found.anchor),
      x: typeof found.x === 'number' ? found.x : d.x,
      y: typeof found.y === 'number' ? found.y : d.y,
    };
  });
  return packHomeChromeVertical(merged);
}

export function chromeSizeToPx(id: HomeChromeId): { w: number; h: number } {
  switch (id) {
    case 'clock':
      return { w: 560, h: 168 };
    case 'search':
      return { w: 640, h: 72 };
    case 'shortcuts':
      return { w: 640, h: 104 };
    default:
      return { w: 400, h: 120 };
  }
}

export function layoutHomeChromeCentered(): HomeChromeItem[] {
  return defaultHomeChrome();
}

/**
 * Place a newly added widget under shortcuts, centered, with ≥24px gap.
 * Never lands at 0,0.
 */
export function placeNewHomeWidget(
  existing: HomeWidget[],
  chrome: HomeChromeItem[],
  widget: Omit<HomeWidget, 'anchor' | 'x' | 'y'> & Partial<Pick<HomeWidget, 'anchor' | 'x' | 'y'>>,
): HomeWidget {
  const ch = normalizeHomeChrome(chrome);
  const shortcuts = ch.find((c) => c.id === 'shortcuts');
  const scBottom =
    (shortcuts?.y ?? 44) + Math.ceil(chromeSizeToPx('shortcuts').h / HOME_GRID_PX);
  let y = scBottom + 3; // 24px
  for (const w of existing) {
    const bottom = w.y + widgetSizeCells(w.size).h;
    if (bottom + 3 > y) y = bottom + 3;
  }
  if (y < 3) y = 3;
  return {
    ...widget,
    anchor: 'center',
    x: 0,
    y,
  };
}

/** Optional panels under the fixed header — no clock/search/shortcuts. */
export function defaultHomeWidgets(extra?: Partial<Settings>): HomeWidget[] {
  const widgets: HomeWidget[] = [];
  if (extra?.homeShowNotes) {
    widgets.push({
      id: 'w-notes',
      type: 'notes',
      size: 'M',
      anchor: 'center',
      x: 0,
      y: 60,
      settings: {},
    });
  }
  if (extra?.homeShowRecent) {
    widgets.push({
      id: 'w-recent',
      type: 'recent',
      size: 'M',
      anchor: 'center',
      x: 0,
      y: 60,
      settings: {},
    });
  }
  if (extra?.homeShowStats) {
    widgets.push({
      id: 'w-resources',
      type: 'resources',
      size: 'M',
      anchor: 'center',
      x: 0,
      y: 60,
      settings: {},
    });
  }
  return layoutWidgetsInCenteredRow(widgets);
}

/** Header presets write concrete homeChrome positions (+ pack widgets). */
export function applyHomeLayoutPreset(
  preset: 'centered' | 'search' | 'top' | 'left',
  currentWidgets?: HomeWidget[],
): Partial<Settings> {
  const extras = normalizeHomeWidgets(currentWidgets ?? []);
  const id = preset === 'search' ? 'top' : preset;

  if (id === 'top') {
    return {
      homeLayoutPreset: 'top',
      homeLayout: 'minimal',
      homeAlign: 'center',
      homeShowClock: false,
      homeShowDate: false,
      homeShowGreeting: false,
      homeShowApps: false,
      homeChrome: layoutHomeChromeTop(),
      homeWidgets: extras,
    };
  }
  if (id === 'left') {
    return {
      homeLayoutPreset: 'left',
      homeLayout: 'stack',
      homeAlign: 'left',
      homeShowClock: true,
      homeShowDate: true,
      homeShowGreeting: true,
      homeShowApps: true,
      homeChrome: layoutHomeChromeLeft(),
      homeWidgets: layoutWidgetsInLeftRow(
        extras.length ? extras : defaultHomeWidgets({ homeShowApps: true }),
      ),
    };
  }
  return {
    homeLayoutPreset: 'centered',
    homeLayout: 'dashboard',
    homeAlign: 'center',
    homeShowClock: true,
    homeShowDate: true,
    homeShowGreeting: true,
    homeShowApps: true,
    homeChrome: layoutHomeChromeCentered(),
    homeWidgets: layoutWidgetsInCenteredRow(
      extras.length ? extras : defaultHomeWidgets({ homeShowApps: true }),
    ),
  };
}

/** @deprecated use applyHomeLayoutPreset — kept for call sites that only need widget list */
export function presetHomeWidgets(_preset: 'centered' | 'search' | 'left'): HomeWidget[] {
  return [];
}

/** True when widget looks unplaced / legacy default (should re-pack). */
function looksUnplaced(w: HomeWidget): boolean {
  if (w.x === 0 && w.y === 0) return true;
  // Old defaults before free-place: y:2 under a flex header
  if (w.x === 0 && w.y === 2) return true;
  return false;
}

/** Strip hero types; migrate size + free-place coords; keep notes settings. */
export function normalizeHomeWidgets(raw: unknown): HomeWidget[] {
  if (!Array.isArray(raw)) return [];
  const parsed: HomeWidget[] = [];
  const seen = new Set<HomeWidgetType>();
  let needsRowLayout = false;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const w = item as Record<string, unknown>;
    const type = String(w.type || '');
    if (!isExtraWidgetType(type)) continue;
    if (seen.has(type)) continue;
    seen.add(type);
    const id = typeof w.id === 'string' && w.id ? w.id : widgetUid();
    const size = legacyWidgetSize(w.size, typeof w.w === 'number' ? w.w : undefined);
    const settings =
      w.settings && typeof w.settings === 'object' && !Array.isArray(w.settings)
        ? (w.settings as Record<string, unknown>)
        : {};
    // Legacy strip format: size only, no meaningful xy → pack row
    const legacyStrip = !('anchor' in w) && !('x' in w);
    if (legacyStrip) needsRowLayout = true;
    const style = parseWidgetStyle(w.style);
    parsed.push({
      id,
      type,
      size,
      anchor: parseAnchor(w.anchor),
      x: typeof w.x === 'number' && Number.isFinite(w.x) ? Math.round(w.x) : 0,
      y: typeof w.y === 'number' && Number.isFinite(w.y) ? Math.round(w.y) : 0,
      settings,
      ...(style ? { style } : {}),
    });
  }
  if (!parsed.length) return [];
  if (needsRowLayout || parsed.every(looksUnplaced)) {
    return layoutWidgetsInCenteredRow(parsed);
  }
  const placed = parsed.filter((w) => !looksUnplaced(w));
  const orphans = parsed.filter(looksUnplaced);
  if (!orphans.length) return parsed;
  let acc = [...placed];
  const chrome = defaultHomeChrome();
  for (const w of orphans) {
    acc.push(placeNewHomeWidget(acc, chrome, w));
  }
  return acc;
}

export function migrateHomeWidgets(settings: Settings): HomeWidget[] {
  if (Array.isArray(settings.homeWidgets) && settings.homeWidgets.length > 0) {
    const normalized = normalizeHomeWidgets(settings.homeWidgets);
    if (normalized.length > 0) return normalized;
  }
  return defaultHomeWidgets(settings);
}

DEFAULT_SETTINGS.homeWidgets = defaultHomeWidgets(DEFAULT_SETTINGS);
DEFAULT_SETTINGS.homeChrome = defaultHomeChrome();

export function applyPerfPreset(mode: PerfMode): Partial<Settings> {
  if (mode === 'performance') {
    return {
      perfMode: mode,
      perfHardwareAcceleration: true,
      perfBackgroundThrottling: false,
      perfLazyTabs: false,
      perfDiscardTabs: false,
      perfDiscardMinutes: 60,
      perfReduceMotion: false,
      perfSmoothScrolling: true,
      perfSpellcheck: true,
      perfBlockHeavyMedia: false,
      perfCacheMb: 512,
      perfLowPowerClock: false,
      uiMotion: true,
      uiGlass: true,
    };
  }
  if (mode === 'saver') {
    return {
      perfMode: mode,
      perfHardwareAcceleration: true,
      perfBackgroundThrottling: true,
      perfLazyTabs: true,
      perfDiscardTabs: true,
      perfDiscardMinutes: 5,
      perfReduceMotion: true,
      perfSmoothScrolling: false,
      perfSpellcheck: false,
      perfBlockHeavyMedia: true,
      perfCacheMb: 96,
      perfLowPowerClock: true,
      uiMotion: false,
      uiGlass: false,
      homeShowClock: true,
    };
  }
  return {
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
    uiMotion: true,
  };
}

export function searchUrl(settings: Settings, q: string) {
  const enc = encodeURIComponent(q);
  const searx = settings.searxUrl.replace(/\/$/, '');
  switch (settings.searchEngine) {
    case 'searx':
      return `${searx}/search?q=${enc}`;
    case 'brave':
      return `https://search.brave.com/search?q=${enc}`;
    case 'ddg':
      return `https://duckduckgo.com/?q=${enc}`;
    case 'bing':
      return `https://www.bing.com/search?q=${enc}`;
    case 'startpage':
      return `https://www.startpage.com/sp/search?query=${enc}`;
    case 'qwant':
      return `https://www.qwant.com/?q=${enc}`;
    case 'ecosia':
      return `https://www.ecosia.org/search?q=${enc}`;
    case 'swisscows':
      return `https://swisscows.com/web?query=${enc}`;
    case 'yandex':
      return `https://yandex.com/search/?text=${enc}`;
    case 'ahmia':
      return `https://ahmia.fi/search/?q=${enc}`;
    case 'onionland':
      return `https://onionlandsearchengine.com/search?q=${enc}`;
    case 'custom': {
      const tpl = settings.customSearchUrl.trim() || 'https://duckduckgo.com/?q=%s';
      return tpl.includes('%s') ? tpl.replace('%s', enc) : `${tpl}${enc}`;
    }
    default:
      return `https://www.google.com/search?q=${enc}`;
  }
}

export function searchHome(settings: Settings) {
  switch (settings.searchEngine) {
    case 'searx':
      return `${settings.searxUrl.replace(/\/$/, '')}/`;
    case 'brave':
      return 'https://search.brave.com/';
    case 'ddg':
      return 'https://duckduckgo.com/';
    case 'bing':
      return 'https://www.bing.com/';
    case 'startpage':
      return 'https://www.startpage.com/';
    case 'qwant':
      return 'https://www.qwant.com/';
    case 'ecosia':
      return 'https://www.ecosia.org/';
    case 'swisscows':
      return 'https://swisscows.com/';
    case 'yandex':
      return 'https://yandex.com/';
    case 'ahmia':
      return 'https://ahmia.fi/';
    case 'onionland':
      return 'https://onionlandsearchengine.com/';
    case 'custom': {
      try {
        return new URL(settings.customSearchUrl.replace('%s', '')).origin + '/';
      } catch {
        return 'https://duckduckgo.com/';
      }
    }
    default:
      return 'https://www.google.com/';
  }
}

/** Resolve bang — see `lib/bangs.ts`. Kept as thin wrapper for call sites with settings. */
export function resolveBangWithSettings(raw: string, bangs: Bang[], _settings: Settings): string | null {
  return resolveBang(raw, bangs);
}

export function normalizeInput(raw: string, settings: Settings, bangs: Bang[] = DEFAULT_BANGS) {
  const t = raw.trim();
  if (!t) return settings.homepage === HOME_URL ? HOME_URL : settings.homepage;
  const bang = resolveBang(t, bangs);
  if (bang) return bang;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^about:/i.test(t)) return t;
  // .onion host — leave as http(s) onion URL; needs Tor proxy to resolve
  if (/\.onion($|\/|:)/i.test(t)) {
    if (/^https?:\/\//i.test(t)) return t;
    return `http://${t}`;
  }
  if (/^[\w-]+(\.[\w-]+)+/.test(t) || t.startsWith('localhost')) return `https://${t}`;
  return searchUrl(settings, t);
}

export function applyThemeToDom(settings: Settings) {
  const t = THEMES[settings.theme] ?? THEMES.midnight;
  const root = document.documentElement;
  const chrome = t.elev;
  const chromeInput =
    settings.theme === 'paper'
      ? 'color-mix(in srgb, var(--bg) 72%, #000 7%)'
      : 'color-mix(in srgb, var(--bg) 78%, #000 22%)';

  const apply = () => {
    root.style.setProperty('--bg', t.bg);
    root.style.setProperty('--bg-elev', t.elev);
    root.style.setProperty(
      '--bg-elev-2',
      settings.theme === 'paper'
        ? 'color-mix(in srgb, var(--bg-elev) 86%, #000 14%)'
        : 'color-mix(in srgb, var(--bg-elev) 82%, #fff 18%)',
    );
    root.style.setProperty('--bg-side', chrome);
    root.style.setProperty('--chrome', chrome);
    root.style.setProperty('--chrome-input', chromeInput);
    root.style.setProperty('--fg', t.fg);
    root.style.setProperty('--fg-2', t.fg2);
    root.style.setProperty('--fg-3', t.fg3);
    root.style.setProperty('--text-tertiary', t.fg3);
    root.style.setProperty('--line', t.line);
    const accent = settings.useThemeAccent ? t.accent : settings.accent;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-dim', `${accent}24`);
    if (settings.theme === 'paper') {
      root.style.setProperty('--notes-surface', 'color-mix(in srgb, var(--bg-elev) 96%, #fff 4%)');
      root.style.setProperty('--notes-list-hover', 'color-mix(in srgb, var(--fg) 6%, transparent)');
      root.style.setProperty('--notes-list-active', 'color-mix(in srgb, var(--accent) 14%, var(--bg-elev))');
      root.style.setProperty('--notes-toolbar', 'color-mix(in srgb, var(--fg) 5%, transparent)');
    } else if (settings.theme === 'midnight') {
      root.style.setProperty('--notes-surface', 'color-mix(in srgb, var(--bg-elev) 55%, transparent)');
      root.style.setProperty('--notes-list-hover', 'color-mix(in srgb, var(--fg) 7%, transparent)');
      root.style.setProperty('--notes-list-active', 'color-mix(in srgb, var(--accent) 18%, transparent)');
      root.style.setProperty('--notes-toolbar', 'color-mix(in srgb, var(--fg) 4%, transparent)');
    } else {
      root.style.setProperty('--notes-surface', 'color-mix(in srgb, var(--bg-elev) 70%, transparent)');
      root.style.setProperty('--notes-list-hover', 'color-mix(in srgb, var(--fg) 6%, transparent)');
      root.style.setProperty('--notes-list-active', 'color-mix(in srgb, var(--accent) 16%, transparent)');
      root.style.setProperty('--notes-toolbar', 'color-mix(in srgb, var(--fg) 5%, transparent)');
    }
    root.style.setProperty('--glass-blur', `${settings.glassBlur}px`);
    root.style.setProperty('--glass-alpha', String(settings.glassOpacity));
    root.dataset.theme = settings.theme;
    root.dataset.glass = settings.uiGlass ? 'on' : 'off';
    root.dataset.motion = settings.uiMotion ? 'on' : 'off';
    root.dataset.density = settings.uiDensity;

    void window.shell?.setTitleBar?.({
      color: chrome,
      symbolColor: t.fg2,
      height: 32,
    });
    void window.shell?.setNativeTheme?.(settings.theme === 'paper' ? 'light' : 'dark');
  };

  const reduce =
    settings.perfReduceMotion ||
    !settings.uiMotion ||
    (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const doc = typeof document !== 'undefined' ? document : null;
  const canVT =
    !reduce &&
    !!doc &&
    'startViewTransition' in doc &&
    typeof (doc as Document & { startViewTransition?: (cb: () => void) => void }).startViewTransition ===
      'function';

  if (canVT) {
    (doc as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(apply);
    return;
  }

  if (!reduce && root) {
    root.classList.add('theme-fading');
    apply();
    window.setTimeout(() => root.classList.remove('theme-fading'), 220);
    return;
  }

  apply();
}

const first = uid();

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      tabs: [{ id: first, title: 'Nowa karta', url: HOME_URL }],
      activeId: first,
      view: 'browser',
      settingsTab: 'general',
      settings: { ...DEFAULT_SETTINGS },
      bangs: [...DEFAULT_BANGS],
      shortcuts: [...DEFAULT_SHORTCUTS],
      sideApps: [...DEFAULT_SIDE_APPS],
      history: [],
      bookmarks: [],
      bookmarkFolders: [...DEFAULT_BOOKMARK_FOLDERS],
      closedTabs: [],
      closedWindows: [],
      sessionReady: false,

      newTab: (url, opts) => {
        const id = uid();
        const s = get().settings;
        const u = url ?? (s.newTabIsSearch ? HOME_URL : s.homepage);
        const background = Boolean(opts?.background);
        const asPrivate = Boolean(opts?.private);
        const besideId = opts?.besideId;
        set((st) => {
          const tab: Tab = {
            id,
            title: u === HOME_URL ? 'Nowa karta' : '…',
            url: u,
            lastActiveAt: Date.now(),
            discarded: false,
            mode: asPrivate ? 'private' : 'normal',
            pinned: false,
            muted: false,
          };
          let tabs = [...st.tabs];
          if (besideId) {
            const idx = tabs.findIndex((t) => t.id === besideId);
            if (idx >= 0) tabs.splice(idx + 1, 0, tab);
            else tabs.push(tab);
          } else {
            tabs.push(tab);
          }
          return {
            tabs: sortTabsPinnedFirst(tabs),
            activeId: background ? st.activeId : id,
            view: 'browser' as const,
          };
        });
      },
      newPrivateTab: (url) => {
        const part = getWindowPartition();
        if (!part || !/^private-/i.test(part)) {
          console.error(
            '[store] newPrivateTab refused — no window private partition; open a private window instead',
          );
          void window.shell?.newWindow?.({ boot: 'private' });
          return;
        }
        const id = uid();
        const s = get().settings;
        const u = url ?? (s.newTabIsSearch ? HOME_URL : s.homepage);
        set((st) => ({
          tabs: sortTabsPinnedFirst([
            ...st.tabs,
            {
              id,
              title: u === HOME_URL ? 'Nowa karta prywatna' : '…',
              url: u,
              lastActiveAt: Date.now(),
              discarded: false,
              mode: 'private' as const,
              partition: part,
              pinned: false,
              muted: false,
            },
          ]),
          activeId: id,
          view: 'browser' as const,
        }));
      },
      newTabBeside: (besideId, url) => {
        get().newTab(url, { besideId });
      },
      muteTab: (id, muted) =>
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, muted: muted ?? !t.muted } : t,
          ),
        })),
      newTorTab: ({ url, partition, background }) => {
        const id = uid();
        const u = url ?? TOR_HOME_URL;
        set((st) => ({
          tabs: [
            ...st.tabs,
            {
              id,
              title: 'Tor',
              url: u,
              lastActiveAt: Date.now(),
              discarded: false,
              mode: 'tor' as const,
              partition,
              pinned: false,
            },
          ],
          activeId: background ? st.activeId : id,
          view: 'browser' as const,
        }));
      },
      closeTab: (id) => {
        const { tabs, activeId, closedTabs } = get();
        const idx = tabs.findIndex((t) => t.id === id);
        const closing = idx >= 0 ? tabs[idx] : null;
        let nextClosed = closedTabs;
        if (closing && !isTorTab(closing)) {
          const entry = toClosedTab(closing, idx);
          if (entry) nextClosed = [entry, ...closedTabs].slice(0, MAX_CLOSED_TABS);
        }
        if (tabs.length <= 1) {
          // Closing last tab: if pinned-only policy — still replace; keep closed stack
          if (closing?.pinned && tabs.length === 1) {
            // allow closing last pinned → new home
          }
          const nid = uid();
          set({
            tabs: [{ id: nid, title: 'Nowa karta', url: HOME_URL, mode: 'normal', pinned: false }],
            activeId: nid,
            closedTabs: nextClosed,
          });
          return;
        }
        const next = tabs.filter((t) => t.id !== id);
        const active = activeId === id ? next[Math.max(0, idx - 1)].id : activeId;
        set({ tabs: sortTabsPinnedFirst(next), activeId: active, closedTabs: nextClosed });
      },
      setActive: (id) =>
        set((s) => ({
          activeId: id,
          view: 'browser',
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, lastActiveAt: Date.now(), discarded: false } : t,
          ),
        })),
      updateTab: (id, patch) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      pinTab: (id, pinned) =>
        set((s) => {
          const nextPinned = pinned ?? !s.tabs.find((t) => t.id === id)?.pinned;
          const tabs = sortTabsPinnedFirst(
            s.tabs.map((t) => (t.id === id && t.mode !== 'tor' ? { ...t, pinned: nextPinned } : t)),
          );
          return { tabs };
        }),
      reopenClosedTab: () => {
        const { closedTabs, tabs } = get();
        const entry = closedTabs[0];
        if (entry) {
          const id = uid();
          const insertAt = Math.min(Math.max(0, entry.index), tabs.length);
          const tab: Tab = {
            id,
            url: entry.url,
            title: entry.title || 'Karta',
            favicon: entry.favicon,
            pinned: Boolean(entry.pinned),
            navHistory: entry.navHistory || null,
            lastActiveAt: Date.now(),
            discarded: true,
            mode: 'normal',
          };
          const next = [...tabs];
          next.splice(insertAt, 0, tab);
          set({
            tabs: sortTabsPinnedFirst(next),
            activeId: id,
            closedTabs: closedTabs.slice(1),
            view: 'browser',
          });
          get().setActive(id);
          return id;
        }
        // Whole window — from shared session store
        void window.shell?.sessionPopClosedWindow?.().then((win) => {
          if (!win?.tabs?.length) return;
          void window.shell?.newWindow?.({
            restoreTabs: win.tabs.map((t) => ({
              url: t.url,
              title: t.title,
              favicon: t.favicon,
              pinned: t.pinned,
              navHistory: t.navHistory as Tab['navHistory'],
            })),
          });
        });
        return 'window';
      },
      pushClosedWindow: () => {
        const { tabs } = get();
        const entries = tabs
          .map((t, i) => (!isTorTab(t) && !isPrivateTab(t) ? toClosedTab(t, i) : null))
          .filter(Boolean) as ClosedTab[];
        if (!entries.length) return;
        void window.shell?.sessionPushClosedWindow?.(entries);
      },
      setClosedWindows: (wins) =>
        set({ closedWindows: (wins || []).slice(0, MAX_CLOSED_WINDOWS) }),
      closeOtherTabs: (id) => {
        const { tabs, closedTabs } = get();
        const keep = tabs.find((t) => t.id === id);
        if (!keep) return;
        const extras = tabs.filter((t) => t.id !== id && !t.pinned);
        const added: ClosedTab[] = [];
        extras.forEach((t) => {
          if (isTorTab(t)) return; // close Tor tabs without stacking
          const c = toClosedTab(t, tabs.indexOf(t));
          if (c) added.push(c);
        });
        // Also close non-pinned Tor others without adding to stack
        const nextTabs = tabs.filter((t) => t.id === id || t.pinned);
        set({
          tabs: sortTabsPinnedFirst(nextTabs.length ? nextTabs : [keep]),
          activeId: id,
          closedTabs: [...added, ...closedTabs].slice(0, MAX_CLOSED_TABS),
        });
      },
      closeTabsToRight: (id) => {
        const { tabs, closedTabs } = get();
        const idx = tabs.findIndex((t) => t.id === id);
        if (idx < 0) return;
        const right = tabs.slice(idx + 1).filter((t) => !t.pinned);
        const added: ClosedTab[] = [];
        right.forEach((t) => {
          if (isTorTab(t)) return;
          const c = toClosedTab(t, tabs.indexOf(t));
          if (c) added.push(c);
        });
        const rightIds = new Set(right.map((t) => t.id));
        set({
          tabs: sortTabsPinnedFirst(tabs.filter((t) => !rightIds.has(t.id))),
          closedTabs: [...added, ...closedTabs].slice(0, MAX_CLOSED_TABS),
        });
      },
      duplicateTab: (id) => {
        const { tabs } = get();
        const src = tabs.find((t) => t.id === id);
        if (!src || isTorTab(src)) return;
        const nid = uid();
        const idx = tabs.findIndex((t) => t.id === id);
        const copy: Tab = {
          ...src,
          id: nid,
          pinned: false,
          muted: false,
          lastActiveAt: Date.now(),
          discarded: true,
          mode: src.mode === 'private' ? 'private' : 'normal',
          partition: undefined,
        };
        const next = [...tabs];
        next.splice(idx + 1, 0, copy);
        set({ tabs: sortTabsPinnedFirst(next), activeId: nid, view: 'browser' });
        get().setActive(nid);
      },
      restoreSessionTabs: (incoming, activeId, closed) => {
        const tabs = sortTabsPinnedFirst(
          incoming
            .filter((t) => t && t.mode !== 'tor')
            .map((t) => ({
              ...t,
              mode: (t.mode === 'private' ? 'private' : 'normal') as Tab['mode'],
              partition: undefined,
              discarded: true,
              lastActiveAt: t.lastActiveAt || Date.now(),
            })),
        );
        if (!tabs.length) {
          const nid = uid();
          set({
            tabs: [{ id: nid, title: 'Nowa karta', url: HOME_URL, mode: 'normal', pinned: false }],
            activeId: nid,
            closedTabs: (closed || []).slice(0, MAX_CLOSED_TABS),
            sessionReady: true,
          });
          return;
        }
        const aid =
          (activeId && tabs.some((t) => t.id === activeId) ? activeId : null) ||
          tabs.find((t) => t.pinned)?.id ||
          tabs[0].id;
        set({
          tabs: tabs.map((t) => (t.id === aid ? { ...t, discarded: false } : t)),
          activeId: aid,
          closedTabs: (closed || []).filter((c) => c && !/\.onion\b/i.test(c.url)).slice(0, MAX_CLOSED_TABS),
          sessionReady: true,
          view: 'browser',
        });
      },
      setClosedTabs: (closed) => set({ closedTabs: closed.slice(0, MAX_CLOSED_TABS) }),
      setSessionReady: (v) => set({ sessionReady: v }),
      setView: (v) => set({ view: v }),
      setSettingsTab: (t) => set({ settingsTab: t, view: 'settings' }),
      patchSettings: (p) =>
        set((s) => {
          const privacyKeys = [
            'adblockEnabled',
            'adblockNetwork',
            'adblockCosmetic',
            'adblockTrackers',
            'adblockCustomRules',
            'adblockUpdateLists',
            'privacyStripTracking',
            'privacySecGpc',
            'privacyDnt',
            'privacyReferrerPolicy',
            'privacyThirdPartyCookies',
            'privacyHttpsOnly',
            'privacyDoh',
            'privacyDohCustom',
            'privacyChromeUa',
            'privacyWebRtc',
            'privacyFingerprint',
            'privacySearchSuggest',
            'privacyAllowAppNetwork',
            'privacyClearOnQuit',
          ];
          const touchesPrivacy = privacyKeys.some((k) => k in p);
          const next = { ...s.settings, ...p };
          if ('sidebarMode' in p && p.sidebarMode) {
            next.showSidebar = p.sidebarMode !== 'off';
          } else if ('showSidebar' in p && typeof p.showSidebar === 'boolean') {
            next.sidebarMode = p.showSidebar ? (next.sidebarMode === 'auto' ? 'auto' : 'on') : 'off';
          }
          if (touchesPrivacy && !('privacyPreset' in p) && next.privacyPreset !== 'custom') {
            next.privacyPreset = 'custom';
          }
          return { settings: next };
        }),
      pushHistory: (q) => {
        const t = q.trim();
        if (!t || t.startsWith('http') || t === HOME_URL) return;
        // Source of truth: electron/history.cjs via IPC (no Zustand mirror)
        void window.shell?.historyRecordQuery?.(t, { tor: false });
      },
      clearHistory: () => {
        void window.shell?.historyClear?.({ range: 'all' });
        set({ history: [] });
      },
      removeHistory: (q) => {
        void window.shell?.historyRemoveQuery?.(q);
        set((s) => ({ history: s.history.filter((h) => h.q !== q) }));
      },
      addBang: (b) =>
        set((s) => ({
          bangs: [...s.bangs.filter((x) => x.key !== b.key), { ...b, key: b.key.replace(/^!/, '') }],
        })),
      removeBang: (key) => set((s) => ({ bangs: s.bangs.filter((b) => b.key !== key) })),
      addShortcut: (s) =>
        set((st) => ({
          shortcuts: [...st.shortcuts, { ...s, id: uid() }],
        })),
      removeShortcut: (id) => set((s) => ({ shortcuts: s.shortcuts.filter((x) => x.id !== id) })),
      patchShortcut: (id, patch) =>
        set((s) => ({
          shortcuts: s.shortcuts.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      addBookmark: (b) => {
        const id = uid();
        set((s) => ({
          bookmarks: [
            ...s.bookmarks.filter((x) => x.url !== b.url),
            {
              id,
              title: b.title.trim() || b.url,
              url: b.url,
              folderId: b.folderId,
              createdAt: b.createdAt ?? Date.now(),
            },
          ],
        }));
        return id;
      },
      updateBookmark: (id, patch) =>
        set((s) => ({
          bookmarks: s.bookmarks.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      removeBookmark: (id) => set((s) => ({ bookmarks: s.bookmarks.filter((x) => x.id !== id) })),
      findBookmarkByUrl: (url) => get().bookmarks.find((b) => b.url === url),
      addBookmarkFolder: (f) => {
        const id = f.id ?? uid();
        set((s) => ({
          bookmarkFolders: [...s.bookmarkFolders.filter((x) => x.id !== id), { id, title: f.title, parentId: f.parentId }],
        }));
        return id;
      },
      updateBookmarkFolder: (id, patch) =>
        set((s) => ({
          bookmarkFolders: s.bookmarkFolders.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      removeBookmarkFolder: (id) => {
        if (id === BOOKMARKS_BAR_FOLDER_ID || id === BOOKMARKS_OTHER_FOLDER_ID) return;
        set((s) => ({
          bookmarkFolders: s.bookmarkFolders.filter((x) => x.id !== id),
          bookmarks: s.bookmarks.map((b) =>
            b.folderId === id ? { ...b, folderId: BOOKMARKS_OTHER_FOLDER_ID } : b,
          ),
        }));
      },
      mergeImportedBookmarks: (payload) => {
        set((s) => {
          const known = new Set(s.bookmarkFolders.map((f) => f.id));
          const idRemap = new Map<string, string>();
          for (const f of payload.folders) {
            if (known.has(f.id)) idRemap.set(f.id, f.id);
            else {
              const nid = uid();
              idRemap.set(f.id, nid);
              known.add(nid);
            }
          }
          const newFolders: BookmarkFolder[] = payload.folders
            .filter((f) => !s.bookmarkFolders.some((x) => x.id === f.id))
            .map((f) => ({
              id: idRemap.get(f.id)!,
              title: f.title,
              parentId: f.parentId ? idRemap.get(f.parentId) : undefined,
            }));
          const existingUrls = new Set(s.bookmarks.map((b) => b.url));
          const added: Bookmark[] = [];
          for (const b of payload.bookmarks) {
            if (existingUrls.has(b.url)) continue;
            existingUrls.add(b.url);
            added.push({
              ...b,
              id: uid(),
              folderId: b.folderId ? idRemap.get(b.folderId) : b.folderId,
            });
          }
          return {
            bookmarkFolders: [...s.bookmarkFolders, ...newFolders],
            bookmarks: [...s.bookmarks, ...added],
          };
        });
      },
      reorderBookmarks: (activeId, overId) =>
        set((s) => {
          if (activeId === overId) return s;
          const active = s.bookmarks.find((b) => b.id === activeId);
          const over = s.bookmarks.find((b) => b.id === overId);
          if (!active || !over) return s;
          const fid = active.folderId ?? BOOKMARKS_OTHER_FOLDER_ID;
          if (fid !== (over.folderId ?? BOOKMARKS_OTHER_FOLDER_ID)) return s;
          const siblingIds = new Set(
            s.bookmarks.filter((b) => (b.folderId ?? BOOKMARKS_OTHER_FOLDER_ID) === fid).map((b) => b.id),
          );
          const siblings = s.bookmarks.filter((b) => siblingIds.has(b.id));
          const from = siblings.findIndex((b) => b.id === activeId);
          const to = siblings.findIndex((b) => b.id === overId);
          if (from < 0 || to < 0) return s;
          const nextSiblings = [...siblings];
          const [moved] = nextSiblings.splice(from, 1);
          nextSiblings.splice(to, 0, moved);
          let inserted = false;
          const bookmarks: Bookmark[] = [];
          for (const b of s.bookmarks) {
            if (siblingIds.has(b.id)) {
              if (!inserted) {
                bookmarks.push(...nextSiblings);
                inserted = true;
              }
            } else {
              bookmarks.push(b);
            }
          }
          return { bookmarks };
        }),
      moveBookmark: (id, folderId) =>
        set((s) => ({
          bookmarks: s.bookmarks.map((b) => (b.id === id ? { ...b, folderId } : b)),
        })),
      addSideApp: (s) =>
        set((st) => ({
          sideApps: [
            ...st.sideApps.filter((x) => x.id !== (s.id ?? '')),
            { id: s.id ?? uid(), label: s.label, url: s.url },
          ],
        })),
      removeSideApp: (id) =>
        set((s) => ({
          sideApps: s.sideApps.filter((x) => x.id !== id),
          settings:
            s.settings.activeSideAppId === id
              ? { ...s.settings, activeSideAppId: null, sidePanelOpen: false }
              : s.settings,
        })),
      openSideApp: (id) => {
        const app = get().sideApps.find((a) => a.id === id);
        if (!app) return;
        const cur = get().settings;
        if (cur.sidePanelOpen && cur.activeSideAppId === id) {
          set({ settings: { ...cur, sidePanelOpen: false } });
          return;
        }
        set({
          settings: {
            ...cur,
            showSidebar: true,
            sidePanelOpen: true,
            activeSideAppId: id,
          },
        });
      },
      closeSidePanel: () =>
        set((s) => ({
          settings: { ...s.settings, sidePanelOpen: false },
        })),
      resetSettings: () =>
        set({
          settings: { ...DEFAULT_SETTINGS },
          bangs: [...DEFAULT_BANGS],
          shortcuts: [...DEFAULT_SHORTCUTS],
          sideApps: [...DEFAULT_SIDE_APPS],
        }),
    }),
    {
      name: 'moja-przegladarka-v8',
      partialize: (s) => ({
        settings: s.settings,
        bangs: s.bangs,
        shortcuts: s.shortcuts,
        sideApps: s.sideApps,
        // history: ONLY electron/history.cjs (migrated out of localStorage)
        bookmarks: s.bookmarks,
        bookmarkFolders: s.bookmarkFolders,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const mergedSettings: Settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) };
        mergedSettings.homeWidgets = migrateHomeWidgets(mergedSettings);
        mergedSettings.homeChrome = normalizeHomeChrome(mergedSettings.homeChrome);
        if (!Array.isArray(mergedSettings.homeTodos)) mergedSettings.homeTodos = [];
        if (!mergedSettings.homeLayoutPreset) {
          const a = mergedSettings.homeAlign;
          const l = mergedSettings.homeLayout;
          if (l === 'minimal' || (!mergedSettings.homeShowClock && !mergedSettings.homeShowApps)) {
            mergedSettings.homeLayoutPreset = 'top';
          } else if (a === 'left' || l === 'stack') {
            mergedSettings.homeLayoutPreset = 'left';
          } else {
            mergedSettings.homeLayoutPreset = 'centered';
          }
        }
        if (!mergedSettings.homeWidgetStyle) mergedSettings.homeWidgetStyle = 'transparent';
        if (typeof mergedSettings.homeWidgetRadius !== 'number') mergedSettings.homeWidgetRadius = 14;
        if (typeof mergedSettings.homeGridGap !== 'number') mergedSettings.homeGridGap = 12;
        if (typeof mergedSettings.homeLayoutLock !== 'boolean') mergedSettings.homeLayoutLock = false;
        if (mergedSettings.homeBgImage === undefined) mergedSettings.homeBgImage = null;
        if (
          typeof mergedSettings.homeBgImage === 'string' &&
          mergedSettings.homeBgImage.startsWith('data:')
        ) {
          mergedSettings.homeBgImage = null;
          if (mergedSettings.bgStyle === 'custom') mergedSettings.bgStyle = 'soft';
        }
        if (typeof mergedSettings.homeBgBlur !== 'number') mergedSettings.homeBgBlur = 12;
        if (typeof mergedSettings.homeBgDim !== 'number') mergedSettings.homeBgDim = 35;
        if (
          mergedSettings.homeClockStyle !== 'thin' &&
          mergedSettings.homeClockStyle !== 'classic' &&
          mergedSettings.homeClockStyle !== 'mono'
        ) {
          mergedSettings.homeClockStyle = 'thin';
        }
        if (typeof mergedSettings.homeShowSeconds !== 'boolean') mergedSettings.homeShowSeconds = false;
        if (
          mergedSettings.homeDensity !== 'compact' &&
          mergedSettings.homeDensity !== 'comfortable' &&
          mergedSettings.homeDensity !== 'spacious'
        ) {
          mergedSettings.homeDensity = 'comfortable';
        }
        if (mergedSettings.bgStyle === ('custom' as BgStyle) && !mergedSettings.homeBgImage) {
          mergedSettings.bgStyle = 'soft';
        }
        if (
          mergedSettings.sidebarMode !== 'on' &&
          mergedSettings.sidebarMode !== 'auto' &&
          mergedSettings.sidebarMode !== 'off'
        ) {
          mergedSettings.sidebarMode = mergedSettings.showSidebar ? 'on' : 'off';
        } else {
          mergedSettings.showSidebar = mergedSettings.sidebarMode !== 'off';
        }
        if (typeof mergedSettings.allowInspect !== 'boolean') {
          mergedSettings.allowInspect = true;
        }
        try {
          if (
            typeof localStorage !== 'undefined' &&
            !localStorage.getItem('djxxr-allow-inspect-default-v1')
          ) {
            mergedSettings.allowInspect = true;
            localStorage.setItem('djxxr-allow-inspect-default-v1', '1');
          }
        } catch {
          /* */
        }
        // Round 4+: wyszukiwarka / sugestie silnika — włączone (strict wcześniej je gasił)
        try {
          if (
            typeof localStorage !== 'undefined' &&
            !localStorage.getItem('djxxr-search-suggest-on-v1')
          ) {
            mergedSettings.privacySearchSuggest = true;
            mergedSettings.privacyAllowAppNetwork = true;
            mergedSettings.suggestHistory = true;
            mergedSettings.newTabIsSearch = true;
            localStorage.setItem('djxxr-search-suggest-on-v1', '1');
          }
        } catch {
          /* */
        }
        if (typeof mergedSettings.privacySearchSuggest !== 'boolean') {
          mergedSettings.privacySearchSuggest = true;
        }
        if (typeof mergedSettings.privacyAllowAppNetwork !== 'boolean') {
          mergedSettings.privacyAllowAppNetwork = true;
        }
        if (typeof mergedSettings.newTabIsSearch !== 'boolean') {
          mergedSettings.newTabIsSearch = true;
        }
        // One-shot: old DEFAULT was false; flip to true once unless user already on
        if (typeof mergedSettings.perfSpellcheck !== 'boolean') {
          mergedSettings.perfSpellcheck = true;
        }
        try {
          if (
            typeof localStorage !== 'undefined' &&
            !localStorage.getItem('djxxr-spellcheck-default-v1')
          ) {
            mergedSettings.perfSpellcheck = true;
            localStorage.setItem('djxxr-spellcheck-default-v1', '1');
          }
        } catch {
          /* */
        }
        if (!mergedSettings.zoomFactors || typeof mergedSettings.zoomFactors !== 'object') {
          mergedSettings.zoomFactors = {};
        }
        if (typeof mergedSettings.showBookmarksBar !== 'boolean') {
          mergedSettings.showBookmarksBar = false;
        }
        if (typeof mergedSettings.darkPageScrollbars !== 'boolean') {
          mergedSettings.darkPageScrollbars = true;
        }
        if (typeof mergedSettings.autoPipOnTabSwitch !== 'boolean') {
          mergedSettings.autoPipOnTabSwitch = false;
        }
        const bookmarkFolders = Array.isArray(p.bookmarkFolders) ? p.bookmarkFolders : current.bookmarkFolders;
        const folders = [...bookmarkFolders];
        for (const def of DEFAULT_BOOKMARK_FOLDERS) {
          if (!folders.some((f) => f.id === def.id)) folders.unshift(def);
        }
        return {
          ...current,
          ...p,
          settings: mergedSettings,
          bangs: migrateBangsToDdg(p.bangs?.length ? p.bangs : current.bangs),
          shortcuts: p.shortcuts?.length ? p.shortcuts : current.shortcuts,
          sideApps: p.sideApps?.length ? p.sideApps : current.sideApps,
          // history lives in electron/history.cjs — keep ephemeral for one-shot migrate
          history: Array.isArray(p.history) ? p.history : [],
          bookmarks: Array.isArray(p.bookmarks) ? p.bookmarks : current.bookmarks,
          bookmarkFolders: folders,
        };
      },
      onRehydrateStorage: () => (state) => {
        const items = state?.history;
        if (!Array.isArray(items) || !items.length) return;
        void window.shell?.historyImportQueries?.(items).then(() => {
          useStore.setState({ history: [] });
        });
      },
    },
  ),
);
