import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { setWindowBoot } from '../lib/windowBoot';
import { HOME_URL, searchUrl, useStore } from '../store';

export type PermAsk = {
  askId: string;
  origin: string;
  permission: string;
};

export type HttpsWarn = { httpUrl: string; httpsUrl: string };

export type PopupBlocked = {
  url: string;
  origin: string;
  webContentsId: number;
};

export type CertWarn = {
  webContentsId: number;
  url: string;
  host: string;
  error: string;
  issuer?: string;
  tor?: boolean;
};

export type UseIpcEventsArgs = {
  guestWc: Record<string, number>;
  openTorTab: (url?: string) => void | Promise<void>;
  doBrowserNav: (dir: 'back' | 'forward', source?: string) => void;
  setTorProgress: Dispatch<SetStateAction<string | null>>;
  setWindowMode: Dispatch<SetStateAction<'normal' | 'private' | 'tor'>>;
  setWindowPartition: Dispatch<SetStateAction<string | null>>;
  setCertRemember: Dispatch<SetStateAction<boolean>>;
};

export function useIpcEvents({
  guestWc,
  openTorTab,
  doBrowserNav,
  setTorProgress,
  setWindowMode,
  setWindowPartition,
  setCertRemember,
}: UseIpcEventsArgs) {
  const [blockedToday, setBlockedToday] = useState(0);
  const [permAsk, setPermAsk] = useState<PermAsk | null>(null);
  const [httpsWarn, setHttpsWarn] = useState<HttpsWarn | null>(null);
  const [popupBlocked, setPopupBlocked] = useState<PopupBlocked | null>(null);
  const [certWarn, setCertWarn] = useState<CertWarn | null>(null);

  const activeId = useStore((s) => s.activeId);
  const tabs = useStore((s) => s.tabs);

  const { setActive, closeTab, newTab, newTorTab, setSessionReady } = useStore(
    useShallow((s) => ({
      setActive: s.setActive,
      closeTab: s.closeTab,
      newTab: s.newTab,
      newTorTab: s.newTorTab,
      setSessionReady: s.setSessionReady,
    })),
  );

  const shellSettings = useStore(
    useShallow((s) => ({
      passwordsIdleMinutes: s.settings.passwordsIdleMinutes,
      torDaemonAutostart: s.settings.torDaemonAutostart,
      adblockEnabled: s.settings.adblockEnabled,
      adblockNetwork: s.settings.adblockNetwork,
      adblockCosmetic: s.settings.adblockCosmetic,
      adblockTrackers: s.settings.adblockTrackers,
      adblockCustomRules: s.settings.adblockCustomRules,
      adblockUpdateLists: s.settings.adblockUpdateLists,
      privacyStripTracking: s.settings.privacyStripTracking,
      privacySecGpc: s.settings.privacySecGpc,
      privacyDnt: s.settings.privacyDnt,
      privacyReferrerPolicy: s.settings.privacyReferrerPolicy,
      privacyThirdPartyCookies: s.settings.privacyThirdPartyCookies,
      privacyHttpsOnly: s.settings.privacyHttpsOnly,
      privacyChromeUa: s.settings.privacyChromeUa,
      privacyWebRtc: s.settings.privacyWebRtc,
      privacyFingerprint: s.settings.privacyFingerprint,
      privacySiteExceptions: s.settings.privacySiteExceptions,
      privacyDoh: s.settings.privacyDoh,
      privacyDohCustom: s.settings.privacyDohCustom,
      privacyAllowAppNetwork: s.settings.privacyAllowAppNetwork,
      privacyClearOnQuit: s.settings.privacyClearOnQuit,
      privacyClearOnQuitKeep: s.settings.privacyClearOnQuitKeep,
      historyRetention: s.settings.historyRetention,
      downloadsFolder: s.settings.downloadsFolder,
      downloadsAskWhere: s.settings.downloadsAskWhere,
    })),
  );

  useEffect(() => {
    const wcId = guestWc[activeId];
    if (typeof wcId === 'number') void window.shell?.extensionsSelectTab?.(wcId);
  }, [activeId, guestWc]);

  useEffect(() => {
    const offAct = window.shell?.onExtensionsActivateTab?.((payload) => {
      const id = Number(payload?.webContentsId);
      if (!Number.isFinite(id)) return;
      const entry = Object.entries(guestWc).find(([, wc]) => wc === id);
      if (entry) setActive(entry[0]);
    });
    const offClose = window.shell?.onExtensionsCloseTab?.((payload) => {
      const id = Number(payload?.webContentsId);
      if (!Number.isFinite(id)) return;
      const entry = Object.entries(guestWc).find(([, wc]) => wc === id);
      if (entry) closeTab(entry[0]);
    });
    return () => {
      offAct?.();
      offClose?.();
    };
  }, [guestWc, setActive, closeTab]);

  // Secondary window close → push closed-window stack for Ctrl+Shift+T
  useEffect(() => {
    const off = window.shell?.onWindowClosing?.(() => {
      try {
        useStore.getState().pushClosedWindow();
      } catch {
        /* */
      }
      void window.shell?.windowClosingAck?.();
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    const unsub = window.shell?.onPermissionAsk?.((req) => {
      setPermAsk({
        askId: String(req.askId || ''),
        origin: String(req.origin || ''),
        permission: String(req.permission || ''),
      });
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    void window.shell?.passwordsIdle?.(shellSettings.passwordsIdleMinutes);
  }, [shellSettings.passwordsIdleMinutes]);

  useEffect(() => {
    const ping = () => void window.shell?.passwordsActivity?.();
    window.addEventListener('pointerdown', ping);
    window.addEventListener('keydown', ping);
    return () => {
      window.removeEventListener('pointerdown', ping);
      window.removeEventListener('keydown', ping);
    };
  }, []);

  useEffect(() => {
    const rules = shellSettings.adblockCustomRules
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    void window.shell
      ?.adblockConfig?.({
        enabled: shellSettings.adblockEnabled,
        network: shellSettings.adblockNetwork,
        cosmetic: shellSettings.adblockCosmetic,
        trackers: shellSettings.adblockTrackers,
        customRules: rules,
      })
      .then((st) => {
        if (st?.blockedToday != null) setBlockedToday(st.blockedToday);
      });
    void window.shell?.privacyConfig?.({
      enabled: shellSettings.adblockEnabled,
      stripTracking: shellSettings.privacyStripTracking,
      secGpc: shellSettings.privacySecGpc,
      dnt: shellSettings.privacyDnt,
      referrerPolicy: shellSettings.privacyReferrerPolicy,
      thirdPartyCookies: shellSettings.privacyThirdPartyCookies,
      httpsOnly: shellSettings.privacyHttpsOnly,
      chromeUa: shellSettings.privacyChromeUa,
      webRtc: shellSettings.privacyWebRtc,
      fingerprint: shellSettings.privacyFingerprint,
      siteExceptions: shellSettings.privacySiteExceptions,
      doh: shellSettings.privacyAllowAppNetwork ? shellSettings.privacyDoh : 'off',
      dohCustom: shellSettings.privacyDohCustom,
      adblockUpdateLists: shellSettings.privacyAllowAppNetwork && shellSettings.adblockUpdateLists,
      clearOnQuit: shellSettings.privacyClearOnQuit,
      clearOnQuitKeep: shellSettings.privacyClearOnQuitKeep,
    });
    void window.shell?.historyConfig?.({ retention: shellSettings.historyRetention || '90' });
    void window.shell?.downloadsConfig?.({
      folder: shellSettings.downloadsFolder || undefined,
      askWhere: shellSettings.downloadsAskWhere,
    });
  }, [
    shellSettings.adblockEnabled,
    shellSettings.adblockNetwork,
    shellSettings.adblockCosmetic,
    shellSettings.adblockTrackers,
    shellSettings.adblockCustomRules,
    shellSettings.adblockUpdateLists,
    shellSettings.privacyStripTracking,
    shellSettings.privacySecGpc,
    shellSettings.privacyDnt,
    shellSettings.privacyReferrerPolicy,
    shellSettings.privacyThirdPartyCookies,
    shellSettings.privacyHttpsOnly,
    shellSettings.privacyChromeUa,
    shellSettings.privacyWebRtc,
    shellSettings.privacyFingerprint,
    shellSettings.privacySiteExceptions,
    shellSettings.privacyDoh,
    shellSettings.privacyDohCustom,
    shellSettings.privacyAllowAppNetwork,
    shellSettings.privacyClearOnQuit,
    shellSettings.privacyClearOnQuitKeep,
    shellSettings.historyRetention,
    shellSettings.downloadsFolder,
    shellSettings.downloadsAskWhere,
  ]);

  useEffect(() => {
    const off = window.shell?.onAdblockBlocked?.((n) => setBlockedToday(n));
    return () => off?.();
  }, []);

  useEffect(() => {
    const off = window.shell?.onHttpsWarn?.((payload) => {
      if (payload?.httpUrl)
        setHttpsWarn({ httpUrl: payload.httpUrl, httpsUrl: payload.httpsUrl || '' });
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    const off = window.shell?.onPopupBlocked?.((payload) => {
      if (!payload?.url) return;
      setPopupBlocked({
        url: String(payload.url),
        origin: String(payload.origin || ''),
        webContentsId: Number(payload.webContentsId) || 0,
      });
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    // Re-apply optional Tor daemon autostart after migration removed Startup shortcuts
    if (shellSettings.torDaemonAutostart) {
      void window.shell?.torDaemonAutostart?.(true);
    }
  }, [shellSettings.torDaemonAutostart]);

  useEffect(() => {
    let applied = false;
    const apply = (payload: { mode?: string; partition?: string | null }) => {
      const m = payload.mode === 'private' || payload.mode === 'tor' ? payload.mode : 'normal';
      setWindowMode(m);
      setWindowPartition(typeof payload.partition === 'string' ? payload.partition : null);
      setWindowBoot({ mode: m, partition: payload.partition });
      if (applied || m === 'normal') return;
      applied = true;
      // Ephemeral windows: discard restored/normal tabs
      useStore.setState({ tabs: [], activeId: '', closedTabs: [] });
      setSessionReady(true);
      if (m === 'private') {
        document.title = 'Prywatne — Vio';
        useStore.getState().newPrivateTab(HOME_URL);
      } else if (m === 'tor') {
        document.title = 'Tor — Vio';
        void openTorTab();
      }
    };
    void window.shell?.getWindowBoot?.().then((r) => {
      if (r && r.mode && r.mode !== 'normal') apply(r);
    });
    const off = window.shell?.onWindowBoot?.(apply);
    return () => off?.();
  }, [openTorTab, setWindowMode, setWindowPartition, setSessionReady]);

  useEffect(() => {
    const off = window.shell?.onTorProgress?.((ev) => {
      const msg = typeof ev?.message === 'string' ? ev.message : null;
      if (msg) setTorProgress(msg);
    });
    return () => off?.();
  }, [setTorProgress]);

  useEffect(() => {
    const off = window.shell?.onOpenUrl?.((payload) => {
      const url = typeof payload === 'string' ? payload : payload?.url;
      const viaTor = typeof payload === 'object' && Boolean(payload?.tor);
      const viaPrivate = typeof payload === 'object' && Boolean(payload?.private);
      const background = typeof payload === 'object' && Boolean(payload?.background);
      if (!url) return;
      if (viaTor) {
        const part = tabs.find((t) => t.mode === 'tor')?.partition;
        if (part) newTorTab({ url, partition: part, background });
        else void openTorTab(url);
        return;
      }
      if (viaPrivate) {
        newTab(url, { private: true, background });
        return;
      }
      newTab(url, { background });
    });
    return () => off?.();
  }, [newTab, newTorTab, tabs, openTorTab]);

  useEffect(() => {
    const off = window.shell?.onContextAction?.((payload) => {
      const action = String(payload?.action || '');
      const url = typeof payload?.url === 'string' ? payload.url : '';
      const text = typeof payload?.text === 'string' ? payload.text : '';
      const tor = Boolean(payload?.tor);
      const priv = Boolean(payload?.private);
      if (action === 'open-window' && url) {
        if (tor) {
          const part = useStore.getState().tabs.find((t) => t.mode === 'tor')?.partition;
          if (part) newTorTab({ url, partition: part });
          else void openTorTab(url);
        } else {
          newTab(url, { private: priv });
        }
        return;
      }
      if (action === 'search-selection' && text.trim()) {
        const st = useStore.getState().settings;
        const qUrl = searchUrl(st, text.trim());
        if (tor) {
          const part = useStore.getState().tabs.find((t) => t.mode === 'tor')?.partition;
          if (part) newTorTab({ url: qUrl, partition: part });
          else void openTorTab(qUrl);
        } else {
          newTab(qUrl, { private: priv });
        }
      }
    });
    return () => off?.();
  }, [newTab, newTorTab, openTorTab]);

  useEffect(() => {
    const off = window.shell?.onBrowserNav?.((payload) => {
      if (payload?.dir === 'back' || payload?.dir === 'forward') {
        // Main already navigated guest WC — skip duplicate goBack in renderer
        if (payload.handled) return;
        doBrowserNav(payload.dir, payload.source || 'app-command');
      }
    });
    return () => off?.();
  }, [doBrowserNav]);

  useEffect(() => {
    const off = window.shell?.onCertificateError?.((payload) => {
      if (!payload || typeof payload.webContentsId !== 'number') return;
      setCertRemember(false);
      setCertWarn(payload);
    });
    return () => off?.();
  }, [setCertRemember]);

  return {
    blockedToday,
    setBlockedToday,
    permAsk,
    setPermAsk,
    httpsWarn,
    setHttpsWarn,
    popupBlocked,
    setPopupBlocked,
    certWarn,
    setCertWarn,
  };
}
