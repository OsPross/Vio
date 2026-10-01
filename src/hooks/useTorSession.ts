import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { TorStatusInfo } from '../components/TorLanding';
import { TOR_HOME_URL, useStore } from '../store';

export type UseTorSessionResult = {
  torInfo: TorStatusInfo | null;
  setTorInfo: Dispatch<SetStateAction<TorStatusInfo | null>>;
  torBusy: boolean;
  torError: string | null;
  setTorError: Dispatch<SetStateAction<string | null>>;
  torProgress: string | null;
  setTorProgress: Dispatch<SetStateAction<string | null>>;
  openTorTab: (url?: string) => Promise<void>;
  requestNewIdentity: () => Promise<void>;
};

export function useTorSession(): UseTorSessionResult {
  const tabs = useStore((s) => s.tabs);
  const settings = useStore((s) => s.settings);
  const newTorTab = useStore((s) => s.newTorTab);
  const setView = useStore((s) => s.setView);

  const [torInfo, setTorInfo] = useState<TorStatusInfo | null>(null);
  const [torBusy, setTorBusy] = useState(false);
  const [torError, setTorError] = useState<string | null>(null);
  const [torProgress, setTorProgress] = useState<string | null>(null);

  const openTorTab = useCallback(
    async (url?: string) => {
      setTorBusy(true);
      setTorError(null);
      setTorProgress('Uruchamianie trybu Tor…');
      try {
        // Sync bridge prefs to daemon before start (embedded only)
        void (await window.shell?.torBridges?.({
          mode: settings.torBridgeMode,
          customLines:
            settings.torBridgeMode === 'custom'
              ? settings.torBridgeLines
                  .split(/\r?\n/)
                  .map((l) => l.trim())
                  .filter(Boolean)
              : undefined,
        }));
        const st = await window.shell?.torStart?.({ proxyUrl: settings.torProxyUrl });
        if (!st?.ok || !st.partition) {
          setTorError(st?.error || 'Nie udało się uruchomić trybu Tor (fail-closed).');
          setTorInfo(st || null);
          setTorBusy(false);
          setTorProgress(null);
          return;
        }
        setTorInfo(st);
        setTorProgress(null);
        newTorTab({ url: url || TOR_HOME_URL, partition: st.partition });
        setView('browser');
      } catch (err) {
        setTorError(String((err as Error)?.message || err));
        setTorProgress(null);
      } finally {
        setTorBusy(false);
      }
    },
    [settings.torProxyUrl, settings.torBridgeMode, settings.torBridgeLines, newTorTab, setView],
  );

  const requestNewIdentity = useCallback(async () => {
    const torTabs = useStore.getState().tabs.filter((t) => t.mode === 'tor');
    if (!torTabs.length && !torInfo?.active) return;
    const ok = window.confirm(
      'Nowa tożsamość zamknie wszystkie karty Tor, wyczyści sesję (ciasteczka, cache) i zbuduje nowy obwód.\n\nKontynuować?',
    );
    if (!ok) return;
    setTorBusy(true);
    setTorError(null);
    setTorProgress('Nowa tożsamość…');
    try {
      for (const t of [...torTabs]) {
        useStore.getState().closeTab(t.id);
      }
      const st = await window.shell?.torNewIdentity?.();
      if (!st?.ok || !st.partition) {
        setTorError((st?.error as string) || 'Nowa tożsamość nieudana');
        setTorInfo(st || null);
        setTorProgress(null);
        return;
      }
      setTorInfo(st);
      setTorProgress(null);
      newTorTab({ url: TOR_HOME_URL, partition: String(st.partition) });
      setView('browser');
    } catch (err) {
      setTorError(String((err as Error)?.message || err));
      setTorProgress(null);
    } finally {
      setTorBusy(false);
    }
  }, [torInfo?.active, newTorTab, setView]);

  useEffect(() => {
    const onOpen = () => void openTorTab();
    window.addEventListener('djxxr-open-tor', onOpen);
    return () => window.removeEventListener('djxxr-open-tor', onOpen);
  }, [openTorTab]);

  useEffect(() => {
    const onNewId = () => void requestNewIdentity();
    window.addEventListener('djxxr-tor-new-identity', onNewId);
    return () => window.removeEventListener('djxxr-tor-new-identity', onNewId);
  }, [requestNewIdentity]);

  useEffect(() => {
    const hasTor = tabs.some((t) => t.mode === 'tor');
    if (!hasTor && torInfo?.active) {
      void window.shell?.torStop?.().then((st) => setTorInfo(st || null));
    }
  }, [tabs, torInfo?.active]);

  return {
    torInfo,
    setTorInfo,
    torBusy,
    torError,
    setTorError,
    torProgress,
    setTorProgress,
    openTorTab,
    requestNewIdentity,
  };
}
