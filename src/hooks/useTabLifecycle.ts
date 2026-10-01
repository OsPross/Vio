import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useMetrics, useMetricsGuests } from '../lib/useMetrics';
import type { MetricsGuest } from '../lib/metricsTypes';
import { HOME_URL, useStore } from '../store';

export type UseTabLifecycleArgs = {
  taskMgrOpen: boolean;
  isHome: boolean;
};

export type UseTabLifecycleResult = {
  guestWc: Record<string, number>;
  onGuestMeta: (tabId: string, webContentsId: number | null) => void;
  tabMediaRef: MutableRefObject<Record<string, { hasVideo: boolean; playing: boolean }>>;
  hotTabs: Record<string, number>;
  mediaFlags: { mic: boolean; cam: boolean };
  setMediaFlags: Dispatch<SetStateAction<{ mic: boolean; cam: boolean }>>;
  pageHasVideo: boolean;
  setPageHasVideo: Dispatch<SetStateAction<boolean>>;
};

export function useTabLifecycle({
  taskMgrOpen,
  isHome,
}: UseTabLifecycleArgs): UseTabLifecycleResult {
  const tabs = useStore((s) => s.tabs);
  const settings = useStore((s) => s.settings);
  const view = useStore((s) => s.view);
  const settingsTab = useStore((s) => s.settingsTab);

  const [guestWc, setGuestWc] = useState<Record<string, number>>({});
  const tabMediaRef = useRef<Record<string, { hasVideo: boolean; playing: boolean }>>({});
  const [hotTabs, setHotTabs] = useState<Record<string, number>>({});
  const [mediaFlags, setMediaFlags] = useState<{ mic: boolean; cam: boolean }>({
    mic: false,
    cam: false,
  });
  const [pageHasVideo, setPageHasVideo] = useState(false);

  const metricsActive =
    taskMgrOpen ||
    (view === 'settings' && settingsTab === 'resources') ||
    (isHome && settings.homeShowStats);
  // CPU hot-tab hints: sample slowly when discard is on and nobody watches the UI
  const metricsDiscardActive = Boolean(settings.perfDiscardTabs) && !metricsActive;
  const metricsData = useMetrics(
    metricsActive || metricsDiscardActive,
    settings.perfLowPowerClock,
    metricsActive ? 'live' : 'discard',
  );

  const metricsGuests: MetricsGuest[] = tabs
    .filter((t) => t.url !== HOME_URL && !t.url.startsWith('about:') && !t.discarded)
    .map((t) => ({
      id: t.id,
      kind: 'tab' as const,
      title: t.title,
      url: t.url,
      favicon: t.favicon,
      webContentsId: guestWc[t.id] ?? null,
    }));
  useMetricsGuests(metricsActive || metricsDiscardActive, metricsGuests);

  useEffect(() => {
    if (!metricsData?.rows) return;
    setHotTabs((prev) => {
      let changed = false;
      const next: Record<string, number> = { ...prev };
      for (const r of metricsData.rows) {
        if (r.kind !== 'tab') continue;
        const val = r.cpu >= 25 ? (prev[r.id] || 0) + 1 : 0;
        if ((prev[r.id] || 0) !== val) {
          next[r.id] = val;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [metricsData?.ts]); // eslint-disable-line react-hooks/exhaustive-deps

  const onGuestMeta = useCallback((tabId: string, webContentsId: number | null) => {
    setGuestWc((m) => {
      if (webContentsId == null) {
        if (!(tabId in m)) return m;
        const { [tabId]: _, ...rest } = m;
        return rest;
      }
      if (m[tabId] === webContentsId) return m;
      return { ...m, [tabId]: webContentsId };
    });
  }, []);

  // Wyrzucanie nieaktywnych kart z pamięci (odmontowanie webview)
  useEffect(() => {
    if (!settings.perfDiscardTabs) return;
    const ms = Math.max(1, settings.perfDiscardMinutes) * 60_000;
    const t = setInterval(() => {
      const st = useStore.getState();
      const now = Date.now();
      for (const tab of st.tabs) {
        if (tab.id === st.activeId) continue;
        if (tab.pinned) continue;
        if (tab.url === HOME_URL || tab.url.startsWith('about:')) continue;
        if (tab.discarded) continue;
        // Never discard while media is playing (YouTube/Discord audio) or video present (PiP risk)
        const media = tabMediaRef.current[tab.id];
        if (media?.playing || media?.hasVideo) continue;
        const last = tab.lastActiveAt ?? 0;
        if (last && now - last >= ms) {
          st.updateTab(tab.id, { discarded: true });
        }
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [settings.perfDiscardTabs, settings.perfDiscardMinutes]);

  return {
    guestWc,
    onGuestMeta,
    tabMediaRef,
    hotTabs,
    mediaFlags,
    setMediaFlags,
    pageHasVideo,
    setPageHasVideo,
  };
}

/** Sync mic/cam badges from permission store — runs after useIpcEvents (needs permAsk). */
export function useTabMediaFlags(
  activeUrl: string | undefined,
  permAsk: unknown,
  setMediaFlags: Dispatch<SetStateAction<{ mic: boolean; cam: boolean }>>,
) {
  useEffect(() => {
    let cancelled = false;
    const url = activeUrl || '';
    void (async () => {
      try {
        const origin = new URL(url).origin;
        if (!/^https:/i.test(origin)) {
          if (!cancelled) setMediaFlags({ mic: false, cam: false });
          return;
        }
        const list = (await window.shell?.permissionsList?.()) as
          | Record<string, Record<string, string>>
          | undefined;
        const entry = list?.[origin] || {};
        if (!cancelled) {
          setMediaFlags({
            mic: entry.microphone === 'allow' || entry.media === 'allow',
            cam: entry.camera === 'allow' || entry.media === 'allow',
          });
        }
      } catch {
        if (!cancelled) setMediaFlags({ mic: false, cam: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeUrl, permAsk, setMediaFlags]);
}
