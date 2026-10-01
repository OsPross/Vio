import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { WebviewEl } from '../features/tabs';
import {
  chromeShortcutAllowedInEditable,
  isEditableDomTarget,
  matchChromeShortcut,
  shortcutInputFromKeyboardEvent,
  shortcutInputFromPayload,
  type ShortcutHandlerKey,
  type ShortcutInput,
} from '../lib/shortcutsRegistry';
import {
  BOOKMARKS_URL,
  DOWNLOADS_URL,
  HISTORY_URL,
  HOME_URL,
  TOR_HOME_URL,
  isTorTab,
  useStore,
} from '../store';

export type UseShortcutsArgs = {
  isHome: boolean;
  isTorHome: boolean;
  isInternalAbout: boolean;
  htmlFullscreen: boolean;
  findOpen: boolean;
  taskMgrOpen: boolean;
  tabMenu: unknown;
  newTabMenu: unknown;
  omniMenu: unknown;
  sidebarMenu: unknown;
  paletteOpen: boolean;
  shieldOpen: boolean;
  setFindOpen: Dispatch<SetStateAction<boolean>>;
  setTaskMgrOpen: Dispatch<SetStateAction<boolean>>;
  setTabMenu: Dispatch<SetStateAction<{ x: number; y: number; tabId: string } | null>>;
  setNewTabMenu: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setOmniMenu: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setSidebarMenu: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setPaletteOpen: Dispatch<SetStateAction<boolean>>;
  setShieldOpen: Dispatch<SetStateAction<boolean>>;
  setClearDataOpen: Dispatch<SetStateAction<boolean>>;
  setSidebarAutoOpen: Dispatch<SetStateAction<boolean>>;
  currentView: () => WebviewEl | null;
  doBrowserNav: (dir: 'back' | 'forward', source?: string) => void;
  openBookmarkDialog: (url?: string, title?: string) => void;
  printActivePage: () => void;
  togglePictureInPicture: () => void;
  bumpZoom: (delta: number, pageUrl?: string) => void;
  applyZoom: (factor: number, pageUrl?: string) => void;
  closeFind: () => void;
};

export function useShortcuts({
  isHome,
  isTorHome,
  isInternalAbout,
  htmlFullscreen,
  findOpen,
  taskMgrOpen,
  tabMenu,
  newTabMenu,
  omniMenu,
  sidebarMenu,
  paletteOpen,
  shieldOpen,
  setFindOpen,
  setTaskMgrOpen,
  setTabMenu,
  setNewTabMenu,
  setOmniMenu,
  setSidebarMenu,
  setPaletteOpen,
  setShieldOpen,
  setClearDataOpen,
  setSidebarAutoOpen,
  currentView,
  doBrowserNav,
  openBookmarkDialog,
  printActivePage,
  togglePictureInPicture,
  bumpZoom,
  applyZoom,
  closeFind,
}: UseShortcutsArgs) {
  const {
    activeId,
    view,
    newTab,
    newTorTab,
    closeTab,
    setActive,
    reopenClosedTab,
    openSideApp,
    patchSettings,
    setSettingsTab,
    setView,
  } = useStore(
    useShallow((s) => ({
      activeId: s.activeId,
      view: s.view,
      newTab: s.newTab,
      newTorTab: s.newTorTab,
      closeTab: s.closeTab,
      setActive: s.setActive,
      reopenClosedTab: s.reopenClosedTab,
      openSideApp: s.openSideApp,
      patchSettings: s.patchSettings,
      setSettingsTab: s.setSettingsTab,
      setView: s.setView,
    })),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        if (useStore.getState().settings.sidebarMode !== 'auto') return;
        e.preventDefault();
        setSidebarAutoOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSidebarAutoOpen]);

  const handleChromeShortcut = useCallback(
    (input: ShortcutInput): boolean => {
      const isMod = input.ctrl || input.meta;

      if (isMod && input.shift && (input.key === 'M' || input.key === 'm')) {
        openSideApp('messenger');
        return true;
      }
      if (isMod && input.shift && (input.key === 'G' || input.key === 'g')) {
        openSideApp('gemini');
        return true;
      }

      const handler = matchChromeShortcut(input);
      if (!handler) return false;

      const runHandler = (key: ShortcutHandlerKey): boolean => {
        switch (key) {
          case 'newTab':
            newTab();
            return true;
          case 'newWindow':
            void window.shell?.newWindow?.();
            return true;
          case 'newPrivateWindow':
            void window.shell?.newWindow?.({ boot: 'private' });
            return true;
          case 'newTorWindow':
            void window.shell?.newWindow?.({ boot: 'tor' });
            return true;
          case 'closeTab':
            closeTab(activeId);
            return true;
          case 'reopenClosedTab':
            reopenClosedTab();
            return true;
          case 'nextTab': {
            const st = useStore.getState();
            const idx = st.tabs.findIndex((t) => t.id === st.activeId);
            if (idx < 0 || st.tabs.length < 2) return true;
            setActive(st.tabs[(idx + 1) % st.tabs.length].id);
            return true;
          }
          case 'prevTab': {
            const st = useStore.getState();
            const idx = st.tabs.findIndex((t) => t.id === st.activeId);
            if (idx < 0 || st.tabs.length < 2) return true;
            setActive(st.tabs[(idx - 1 + st.tabs.length) % st.tabs.length].id);
            return true;
          }
          case 'activateTab1':
          case 'activateTab2':
          case 'activateTab3':
          case 'activateTab4':
          case 'activateTab5':
          case 'activateTab6':
          case 'activateTab7':
          case 'activateTab8':
          case 'activateTab9': {
            const st = useStore.getState();
            const n = Number(key.replace('activateTab', ''));
            if (n === 9 && st.tabs.length) {
              setActive(st.tabs[st.tabs.length - 1].id);
            } else if (n >= 1 && n <= 8 && st.tabs[n - 1]) {
              setActive(st.tabs[n - 1].id);
            }
            return true;
          }
          case 'focusOmnibox': {
            const el = document.getElementById('omnibox-input') as HTMLInputElement | null;
            if (el) {
              el.focus();
              el.select();
            }
            return true;
          }
          case 'reload':
          case 'hardReload': {
            if (isHome || isTorHome || isInternalAbout) return true;
            const el = currentView();
            if (key === 'hardReload') {
              try {
                el?.reloadIgnoringCache?.();
              } catch {
                el?.reload?.();
              }
            } else {
              el?.reload?.();
            }
            return true;
          }
          case 'back':
            doBrowserNav('back');
            return true;
          case 'forward':
            doBrowserNav('forward');
            return true;
          case 'bookmarkPage':
            openBookmarkDialog();
            return true;
          case 'bookmarksManager': {
            const st = useStore.getState();
            const tab = st.tabs.find((t) => t.id === st.activeId);
            if (isTorTab(tab)) return true;
            st.updateTab(st.activeId, { url: BOOKMARKS_URL, title: 'Zakładki' });
            st.setView('browser');
            return true;
          }
          case 'toggleBookmarksBar': {
            const cur = useStore.getState().settings.showBookmarksBar;
            patchSettings({ showBookmarksBar: !cur });
            return true;
          }
          case 'history': {
            const st = useStore.getState();
            const tab = st.tabs.find((t) => t.id === st.activeId);
            if (isTorTab(tab)) return true;
            st.updateTab(st.activeId, { url: HISTORY_URL, title: 'Historia' });
            st.setView('browser');
            return true;
          }
          case 'downloads': {
            const st = useStore.getState();
            const tab = st.tabs.find((t) => t.id === st.activeId);
            if (isTorTab(tab)) return true;
            st.updateTab(st.activeId, { url: DOWNLOADS_URL, title: 'Pobrania' });
            st.setView('browser');
            return true;
          }
          case 'findInPage':
            setFindOpen(true);
            window.setTimeout(() => document.getElementById('find-in-page-input')?.focus(), 0);
            return true;
          case 'print':
            printActivePage();
            return true;
          case 'savePage':
            window.dispatchEvent(new CustomEvent('djxxr-save-page'));
            return true;
          case 'viewSource': {
            const st = useStore.getState();
            const tab = st.tabs.find((t) => t.id === st.activeId);
            const u = tab?.url;
            if (!u || u === HOME_URL || u === TOR_HOME_URL) return true;
            const src = u.startsWith('view-source:') ? u : `view-source:${u}`;
            if (isTorTab(tab) && tab?.partition) {
              newTorTab({ url: src, partition: tab.partition });
            } else {
              newTab(src);
            }
            return true;
          }
          case 'toggleFullscreen':
            void window.shell?.windowToggleFullscreen?.();
            return true;
          case 'devtools':
            try {
              currentView()?.openDevTools?.();
            } catch {
              /* */
            }
            return true;
          case 'pictureInPicture':
            togglePictureInPicture();
            return true;
          case 'clearBrowsingData':
            setClearDataOpen(true);
            return true;
          case 'zoomIn':
            bumpZoom(0.1);
            return true;
          case 'zoomOut':
            bumpZoom(-0.1);
            return true;
          case 'zoomReset':
            applyZoom(1);
            return true;
          case 'openSettings':
            setSettingsTab('general');
            return true;
          case 'toggleSidebar':
            patchSettings({ showSidebar: !useStore.getState().settings.showSidebar });
            return true;
          case 'commandPalette':
            setPaletteOpen(true);
            return true;
          case 'torNewIdentity': {
            const st = useStore.getState();
            const tab = st.tabs.find((t) => t.id === st.activeId);
            if (!isTorTab(tab) && !st.tabs.some((t) => t.mode === 'tor')) return false;
            window.dispatchEvent(new CustomEvent('djxxr-tor-new-identity'));
            return true;
          }
          case 'taskManager':
            setTaskMgrOpen((v) => !v);
            return true;
          case 'escape': {
            // HTML video fullscreen: let Chromium handle Esc first
            if (htmlFullscreen) return false;
            const el = currentView();
            let loading = false;
            try {
              loading = Boolean(el?.isLoading?.());
            } catch {
              /* */
            }
            if (loading) {
              try {
                el?.stop?.();
              } catch {
                /* */
              }
              return true;
            }
            if (taskMgrOpen) {
              setTaskMgrOpen(false);
              return true;
            }
            if (findOpen) {
              closeFind();
              return true;
            }
            if (tabMenu) {
              setTabMenu(null);
              return true;
            }
            if (newTabMenu) {
              setNewTabMenu(null);
              return true;
            }
            if (omniMenu) {
              setOmniMenu(null);
              return true;
            }
            if (sidebarMenu) {
              setSidebarMenu(null);
              return true;
            }
            if (paletteOpen) {
              setPaletteOpen(false);
              return true;
            }
            if (shieldOpen) {
              setShieldOpen(false);
              return true;
            }
            if (view === 'settings') {
              setView('browser');
              return true;
            }
            return false;
          }
          default:
            return false;
        }
      };

      return runHandler(handler);
    },
    [
      activeId,
      applyZoom,
      bumpZoom,
      closeFind,
      closeTab,
      doBrowserNav,
      findOpen,
      htmlFullscreen,
      isHome,
      isInternalAbout,
      isTorHome,
      newTab,
      newTabMenu,
      newTorTab,
      omniMenu,
      openBookmarkDialog,
      openSideApp,
      paletteOpen,
      patchSettings,
      printActivePage,
      reopenClosedTab,
      setActive,
      setClearDataOpen,
      setFindOpen,
      setNewTabMenu,
      setOmniMenu,
      setPaletteOpen,
      setSettingsTab,
      setShieldOpen,
      setSidebarMenu,
      setTabMenu,
      setTaskMgrOpen,
      setView,
      shieldOpen,
      sidebarMenu,
      tabMenu,
      taskMgrOpen,
      togglePictureInPicture,
      view,
    ],
  );

  useEffect(() => {
    const trap =
      findOpen ||
      taskMgrOpen ||
      !!tabMenu ||
      !!omniMenu ||
      !!sidebarMenu ||
      paletteOpen ||
      shieldOpen ||
      view === 'settings';
    void window.shell?.setShortcutTrap?.(trap);
  }, [findOpen, taskMgrOpen, tabMenu, omniMenu, sidebarMenu, paletteOpen, shieldOpen, view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableDomTarget(e.target)) {
        // Chrome: browser chrome shortcuts still fire in fields; editing keys stay with the field.
        const input = shortcutInputFromKeyboardEvent(e);
        const handler = matchChromeShortcut(input);
        if (!chromeShortcutAllowedInEditable(handler)) return;
        if (handleChromeShortcut(input)) e.preventDefault();
        return;
      }
      if (handleChromeShortcut(shortcutInputFromKeyboardEvent(e))) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [handleChromeShortcut]);

  useEffect(() => {
    const off = window.shell?.onShortcut?.((payload) => {
      handleChromeShortcut(shortcutInputFromPayload(payload));
    });
    return () => off?.();
  }, [handleChromeShortcut]);
}
