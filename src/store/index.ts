import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  applyOneShotLocalFlags,
  deriveHomeLayoutPreset,
  historyMustStayEphemeral,
  mergeBangs,
  normalizeSettingsFields,
} from '../lib/persistMerge';
import { DEFAULT_BANGS, migrateBangsToDdg, resolveBang } from '../lib/bangs';
import {
  ACCENT_SWATCHES,
  ABOUT_URL,
  ABOUT_URL_ALT,
  BOOKMARKS_BAR_FOLDER_ID,
  BOOKMARKS_OTHER_FOLDER_ID,
  BOOKMARKS_URL,
  DEFAULT_BOOKMARK_FOLDERS,
  DEFAULT_SETTINGS,
  DEFAULT_SHORTCUTS,
  DEFAULT_SIDE_APPS,
  DOWNLOADS_URL,
  EXTENSIONS_URL,
  HISTORY_URL,
  HOME_GRID_PX,
  HOME_URL,
  PERSIST_KEY,
  SEARCH_ENGINES,
  THEMES,
  TOR_HOME_URL,
} from './constants';
import {
  applyHomeLayoutPreset,
  chromeSizeToPx,
  createHomeSlice,
  defaultHomeChrome,
  defaultHomeWidgets,
  layoutHomeChromeCentered,
  layoutHomeChromeLeft,
  layoutHomeChromeTop,
  layoutWidgetsInCenteredRow,
  layoutWidgetsInLeftRow,
  legacyWidgetSize,
  migrateHomeWidgets,
  normalizeHomeChrome,
  normalizeHomeWidgets,
  packHomeChromeVertical,
  placeNewHomeWidget,
  widgetSizeCells,
} from './homeSlice';
import { createSessionSlice } from './sessionSlice';
import {
  applyPerfPreset,
  applyThemeToDom,
  engineLabel,
  normalizeInput,
  resolveBangWithSettings,
  searchHome,
  searchUrl,
  searchLanguageParams,
} from './settingsHelpers';
import { createSettingsSlice } from './settingsSlice';
import type { StoreState } from './storeState';
import { isBookmarkableUrl, isOnionUrl, isPrivateTab, isTorTab, sortTabsPinnedFirst } from './tabHelpers';
import { createTabsSlice } from './tabsSlice';
import { createUiSlice } from './uiSlice';
import type { Settings } from './types';

// Fill home defaults after helpers are available (same as former store.ts module init).
DEFAULT_SETTINGS.homeWidgets = defaultHomeWidgets(DEFAULT_SETTINGS);
DEFAULT_SETTINGS.homeChrome = defaultHomeChrome();

type PersistSnapshot = {
  state: Partial<StoreState>;
  version?: number;
};

/** Avoid white screen when localStorage JSON is corrupt — backup + reset. */
const safePersistStorage = {
  getItem: (name: string): PersistSnapshot | null => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(name);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PersistSnapshot;
    } catch (err) {
      try {
        localStorage.setItem(`${name}.corrupt-${Date.now()}`, raw);
        localStorage.removeItem(name);
      } catch {
        /* */
      }
      console.warn(
        '[persist] uszkodzony localStorage — przywrócono domyślne ustawienia (kopia .corrupt-*)',
        err,
      );
      try {
        window.dispatchEvent(
          new CustomEvent('djxxr-persist-reset', {
            detail: { reason: 'corrupt-json', key: name },
          }),
        );
      } catch {
        /* */
      }
      return null;
    }
  },
  setItem: (name: string, value: PersistSnapshot) => {
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch (err) {
      console.warn('[persist] setItem failed', err);
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* */
    }
  },
};

export const useStore = create<StoreState>()(
  persist(
    (...a) => ({
      ...createTabsSlice(...a),
      ...createSessionSlice(...a),
      ...createSettingsSlice(...a),
      ...createUiSlice(...a),
      ...createHomeSlice(),
    }),
    {
      name: PERSIST_KEY,
      storage: safePersistStorage,
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
        const p = (persisted ?? {}) as Partial<StoreState>;
        let mergedSettings: Settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) };
        mergedSettings.homeWidgets = migrateHomeWidgets(mergedSettings);
        mergedSettings.homeChrome = normalizeHomeChrome(mergedSettings.homeChrome);
        mergedSettings = normalizeSettingsFields(
          mergedSettings as unknown as Record<string, unknown>,
        ) as unknown as Settings;
        // Ensure derive path matches legacy when preset already set via normalizeSettingsFields
        if (!(p.settings as Settings | undefined)?.homeLayoutPreset) {
          mergedSettings.homeLayoutPreset = deriveHomeLayoutPreset(mergedSettings);
        }
        const storage =
          typeof localStorage !== 'undefined'
            ? {
                getItem: (k: string) => localStorage.getItem(k),
                setItem: (k: string, v: string) => localStorage.setItem(k, v),
              }
            : null;
        mergedSettings = applyOneShotLocalFlags(
          mergedSettings as unknown as Record<string, unknown>,
          storage,
        ) as unknown as Settings;
        const bookmarkFolders = Array.isArray(p.bookmarkFolders)
          ? p.bookmarkFolders
          : current.bookmarkFolders;
        const folders = [...bookmarkFolders];
        for (const def of DEFAULT_BOOKMARK_FOLDERS) {
          if (!folders.some((f) => f.id === def.id)) folders.unshift(def);
        }
        return {
          ...current,
          ...p,
          settings: mergedSettings,
          bangs: mergeBangs(p.bangs, current.bangs),
          shortcuts: p.shortcuts?.length ? p.shortcuts : current.shortcuts,
          sideApps: p.sideApps?.length ? p.sideApps : current.sideApps,
          history: historyMustStayEphemeral<StoreState['history'][number]>(p.history),
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

export type { StoreState };

// Re-export public API (same surface as former src/store.ts)
export type {
  Bang,
  BgStyle,
  Bookmark,
  BookmarkFolder,
  ClosedTab,
  ClosedWindow,
  HistoryItem,
  HomeAlign,
  HomeAppsStyle,
  HomeChromeId,
  HomeChromeItem,
  HomeClockStyle,
  HomeDensity,
  HomeLayout,
  HomeLayoutPreset,
  HomeTodoItem,
  HomeWidget,
  HomeWidgetAnchor,
  HomeWidgetSize,
  HomeWidgetStyle,
  HomeWidgetType,
  PerfMode,
  SearchEngine,
  SearchLanguage,
  Settings,
  SettingsTab,
  Shortcut,
  SideApp,
  StartupMode,
  Tab,
  ThemeId,
  PageColorScheme,
  UiDensity,
} from './types';

export {
  ACCENT_SWATCHES,
  ABOUT_URL,
  ABOUT_URL_ALT,
  BOOKMARKS_BAR_FOLDER_ID,
  BOOKMARKS_OTHER_FOLDER_ID,
  BOOKMARKS_URL,
  DEFAULT_BOOKMARK_FOLDERS,
  DEFAULT_SETTINGS,
  DEFAULT_SHORTCUTS,
  DEFAULT_SIDE_APPS,
  DOWNLOADS_URL,
  EXTENSIONS_URL,
  HISTORY_URL,
  HOME_GRID_PX,
  HOME_URL,
  PERSIST_KEY,
  SEARCH_ENGINES,
  THEMES,
  TOR_HOME_URL,
};

export {
  applyHomeLayoutPreset,
  chromeSizeToPx,
  defaultHomeChrome,
  defaultHomeWidgets,
  layoutHomeChromeCentered,
  layoutHomeChromeLeft,
  layoutHomeChromeTop,
  layoutWidgetsInCenteredRow,
  layoutWidgetsInLeftRow,
  legacyWidgetSize,
  migrateHomeWidgets,
  normalizeHomeChrome,
  normalizeHomeWidgets,
  packHomeChromeVertical,
  placeNewHomeWidget,
  widgetSizeCells,
};

export {
  applyPerfPreset,
  applyThemeToDom,
  engineLabel,
  normalizeInput,
  resolveBangWithSettings,
  searchHome,
  searchUrl,
  searchLanguageParams,
};

export { isBookmarkableUrl, isOnionUrl, isPrivateTab, isTorTab, sortTabsPinnedFirst };

export { DEFAULT_BANGS, migrateBangsToDdg, resolveBang };
