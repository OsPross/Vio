import type { StateCreator } from 'zustand';
import { DEFAULT_SIDE_APPS } from './constants';
import type { StoreState } from './storeState';
import type { SettingsTab, SideApp } from './types';
import { uid } from './uid';

export type UiSlice = {
  view: 'browser' | 'settings';
  settingsTab: SettingsTab;
  sideApps: SideApp[];

  setView: (v: StoreState['view']) => void;
  setSettingsTab: (t: SettingsTab) => void;
  addSideApp: (s: Omit<SideApp, 'id'> & { id?: string }) => void;
  removeSideApp: (id: string) => void;
  reorderSideApps: (orderedIds: string[]) => void;
  setSideAppMuted: (id: string, muted: boolean) => void;
  openSideApp: (id: string) => void;
  closeSidePanel: () => void;
};

export const createUiSlice: StateCreator<StoreState, [], [], UiSlice> = (set, get) => ({
  view: 'browser',
  settingsTab: 'general',
  sideApps: [...DEFAULT_SIDE_APPS],

  setView: (v) => set({ view: v }),
  setSettingsTab: (t) => set({ settingsTab: t, view: 'settings' }),
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
  reorderSideApps: (orderedIds) =>
    set((s) => {
      const byId = new Map(s.sideApps.map((a) => [a.id, a]));
      const next: SideApp[] = [];
      for (const id of orderedIds) {
        const app = byId.get(id);
        if (app) {
          next.push(app);
          byId.delete(id);
        }
      }
      for (const rest of byId.values()) next.push(rest);
      return { sideApps: next };
    }),
  setSideAppMuted: (id, muted) =>
    set((s) => ({
      sideApps: s.sideApps.map((a) => (a.id === id ? { ...a, muted: Boolean(muted) } : a)),
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
});
