import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { type AppMenuActions, type SidebarMode } from '../components/AppMenu';
import type { WebviewEl } from '../features/tabs';
import { bindCommandHost } from '../lib/commands';
import {
  ABOUT_URL,
  BOOKMARKS_URL,
  DOWNLOADS_URL,
  EXTENSIONS_URL,
  HISTORY_URL,
  useStore,
  type Tab,
} from '../store';

export type UseBindCommandHostArgs = {
  openTorTab: (url?: string) => void | Promise<void>;
  navigateActive: (url: string, query?: string, opts?: { typed?: boolean }) => void;
  printActivePage: () => void;
  bumpZoom: (delta: number, pageUrl?: string) => void;
  setTaskMgrOpen: Dispatch<SetStateAction<boolean>>;
};

/** Registers command-palette host handlers (same as former App useEffect — every render). */
export function useBindCommandHost({
  openTorTab,
  navigateActive,
  printActivePage,
  bumpZoom,
  setTaskMgrOpen,
}: UseBindCommandHostArgs) {
  const newTab = useStore((s) => s.newTab);
  const closeTab = useStore((s) => s.closeTab);
  const reopenClosedTab = useStore((s) => s.reopenClosedTab);
  const pinTab = useStore((s) => s.pinTab);
  const duplicateTab = useStore((s) => s.duplicateTab);
  const muteTab = useStore((s) => s.muteTab);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const patchSettings = useStore((s) => s.patchSettings);

  useEffect(() => {
    bindCommandHost({
      newTab: (url) => newTab(url),
      openTorTab: () => void openTorTab(),
      closeActive: () => closeTab(useStore.getState().activeId),
      reopenClosed: () => reopenClosedTab(),
      pinActive: () => {
        const id = useStore.getState().activeId;
        pinTab(id);
      },
      duplicateActive: () => duplicateTab(useStore.getState().activeId),
      muteActive: () => {
        const id = useStore.getState().activeId;
        muteTab(id);
      },
      newIdentity: () => window.dispatchEvent(new CustomEvent('djxxr-tor-new-identity')),
      navigate: (url) => navigateActive(url),
      setSettingsTab: (t) => setSettingsTab(t as 'general'),
      patchSettings: (p) => patchSettings(p),
      toggleSidebar: () =>
        patchSettings({ showSidebar: !useStore.getState().settings.showSidebar }),
      openTaskMgr: () => setTaskMgrOpen(true),
      forgetSite: () => {
        const url = useStore
          .getState()
          .tabs.find((t) => t.id === useStore.getState().activeId)?.url;
        if (url) void window.shell?.privacyForgetSite?.(url);
      },
      clearData: () => {
        void window.shell?.perfClearCache?.();
      },
      print: () => printActivePage(),
      zoom: (delta) => {
        bumpZoom(delta > 0 ? 0.1 : -0.1);
      },
    });
  });
}

export type UseAppMenuActionsArgs = {
  activeIsTor: boolean;
  active: Tab | undefined;
  pageUrlForShare: string;
  zoomPercent: number;
  navigateActive: (url: string, query?: string, opts?: { typed?: boolean }) => void;
  bumpZoom: (delta: number, pageUrl?: string) => void;
  applyZoom: (factor: number, pageUrl?: string) => void;
  printActivePage: () => void;
  saveActivePdf: () => void;
  currentView: () => WebviewEl | null;
  setClearDataOpen: Dispatch<SetStateAction<boolean>>;
  setFindOpen: Dispatch<SetStateAction<boolean>>;
  setQrOpen: Dispatch<SetStateAction<boolean>>;
  setTaskMgrOpen: Dispatch<SetStateAction<boolean>>;
};

/** App hamburger-menu actions (extracted from BrowserChrome). */
export function useAppMenuActions({
  activeIsTor,
  active,
  pageUrlForShare,
  zoomPercent,
  navigateActive,
  bumpZoom,
  applyZoom,
  printActivePage,
  saveActivePdf,
  currentView,
  setClearDataOpen,
  setFindOpen,
  setQrOpen,
  setTaskMgrOpen,
}: UseAppMenuActionsArgs): AppMenuActions {
  const settings = useStore((s) => s.settings);
  const newTab = useStore((s) => s.newTab);
  const newTorTab = useStore((s) => s.newTorTab);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const patchSettings = useStore((s) => s.patchSettings);

  return {
    newTab: () => newTab(),
    newWindow: () => void window.shell?.newWindow?.(),
    newPrivateWindow: () => void window.shell?.newWindow?.({ boot: 'private' }),
    newTorWindow: () => void window.shell?.newWindow?.({ boot: 'tor' }),
    sidebarMode: (settings.sidebarMode || (settings.showSidebar ? 'on' : 'off')) as SidebarMode,
    setSidebarMode: (mode) => patchSettings({ sidebarMode: mode }),
    openPasswords: () => setSettingsTab('passwords'),
    openHistory: () => {
      if (activeIsTor) return;
      navigateActive(HISTORY_URL);
    },
    openBookmarks: () => {
      if (activeIsTor) return;
      navigateActive(BOOKMARKS_URL);
    },
    openDownloads: () => {
      if (activeIsTor) return;
      navigateActive(DOWNLOADS_URL);
    },
    openExtensions: () => {
      if (activeIsTor) return;
      navigateActive(EXTENSIONS_URL);
    },
    clearBrowsingData: () => setClearDataOpen(true),
    zoomOut: () => bumpZoom(-0.1),
    zoomIn: () => bumpZoom(0.1),
    zoomReset: () => applyZoom(1),
    zoomPercent,
    toggleFullscreen: () => {
      void window.shell?.windowToggleFullscreen?.();
    },
    print: () => printActivePage(),
    findInPage: () => setFindOpen(true),
    savePage: () => {
      window.dispatchEvent(new CustomEvent('djxxr-save-page'));
    },
    savePdf: () => saveActivePdf(),
    copyLink: () => {
      if (pageUrlForShare) void navigator.clipboard.writeText(pageUrlForShare);
    },
    showQr: () => {
      if (pageUrlForShare) setQrOpen(true);
    },
    openTaskManager: () => setTaskMgrOpen(true),
    openDevtools: () => {
      try {
        currentView()?.openDevTools?.();
      } catch {
        /* */
      }
    },
    openDevtoolsSettings: () => setSettingsTab('advanced'),
    viewSource: () => {
      const u = pageUrlForShare;
      if (!u) return;
      const src = u.startsWith('view-source:') ? u : `view-source:${u}`;
      if (activeIsTor && active?.partition) {
        newTorTab({ url: src, partition: active.partition });
      } else {
        newTab(src);
      }
    },
    openAbout: () => {
      if (activeIsTor) return;
      navigateActive(ABOUT_URL);
    },
    openSettings: () => setSettingsTab('general'),
    quit: () => void window.shell?.quitApp?.(),
    allowInspect: Boolean(settings.allowInspect),
    hasPage: Boolean(pageUrlForShare),
  };
}
