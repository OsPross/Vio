import type { StateCreator } from 'zustand';
import { DEFAULT_BANGS, type Bang } from '../lib/bangs';
import { getDefaultBookmarkFolders } from '../lib/getDefaultBookmarkFolders';
import {
  BOOKMARKS_BAR_FOLDER_ID,
  BOOKMARKS_OTHER_FOLDER_ID,
  DEFAULT_SETTINGS,
  DEFAULT_SHORTCUTS,
  DEFAULT_SIDE_APPS,
  HOME_URL,
} from './constants';
import type { StoreState } from './storeState';
import type {
  Bookmark,
  BookmarkFolder,
  HistoryItem,
  Settings,
  Shortcut,
} from './types';
import { uid } from './uid';

export type SettingsSlice = {
  settings: Settings;
  bangs: Bang[];
  shortcuts: Shortcut[];
  history: HistoryItem[];
  bookmarks: Bookmark[];
  bookmarkFolders: BookmarkFolder[];

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
  resetSettings: () => void;
};

export const createSettingsSlice: StateCreator<StoreState, [], [], SettingsSlice> = (set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  bangs: [...DEFAULT_BANGS],
  shortcuts: [...DEFAULT_SHORTCUTS],
  history: [],
  bookmarks: [],
  bookmarkFolders: getDefaultBookmarkFolders(),

  patchSettings: (p) =>
    set((s) => {
      const privacyKeys = [
        'adblockEnabled',
        'adblockNetwork',
        'adblockCosmetic',
        'adblockTrackers',
        'adblockCustomRules',
        'adblockUpdateLists',
        'adblockLevel',
        'adblockExceptions',
        'adblockBuiltinDisabled',
        'adblockListsEnabled',
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
        next.sidebarMode = p.showSidebar
          ? next.sidebarMode === 'auto'
            ? 'auto'
            : 'on'
          : 'off';
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
      bangs: [
        ...s.bangs.filter((x) => x.key !== b.key),
        { ...b, key: b.key.replace(/^!/, '') },
      ],
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
      bookmarkFolders: [
        ...s.bookmarkFolders.filter((x) => x.id !== id),
        { id, title: f.title, parentId: f.parentId },
      ],
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
        s.bookmarks
          .filter((b) => (b.folderId ?? BOOKMARKS_OTHER_FOLDER_ID) === fid)
          .map((b) => b.id),
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
  resetSettings: () =>
    set({
      settings: { ...DEFAULT_SETTINGS },
      bangs: [...DEFAULT_BANGS],
      shortcuts: [...DEFAULT_SHORTCUTS],
      sideApps: [...DEFAULT_SIDE_APPS],
    }),
});
