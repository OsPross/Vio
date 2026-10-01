import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { SaveOffer } from '../features/tabs';
import { applyThemeToDom, type Settings } from '../store';

export type UseShellEffectsArgs = {
  settings: Settings;
  activeId: string;
  activeUrl: string | undefined;
  activeTabId: string | undefined;
  isHome: boolean;
  activeIsTor: boolean;
  htmlFullscreen: boolean;
  setPwForPage: Dispatch<SetStateAction<number>>;
  setSaveOffer: Dispatch<SetStateAction<SaveOffer | null>>;
  setFsToast: Dispatch<SetStateAction<boolean>>;
  patchSettings: (patch: Partial<Settings>) => void;
};

/** Theme, perf IPC, passwords badge, Tor side-panel close, allowInspect, FS toast. */
export function useShellEffects({
  settings,
  activeId,
  activeUrl,
  activeTabId,
  isHome,
  activeIsTor,
  htmlFullscreen,
  setPwForPage,
  setSaveOffer,
  setFsToast,
  patchSettings,
}: UseShellEffectsArgs): void {
  useEffect(() => {
    applyThemeToDom(settings);
    const prefersReduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.dataset.reduceMotion =
      settings.perfReduceMotion || !settings.uiMotion || prefersReduce ? 'on' : 'off';
  }, [settings]);

  useEffect(() => {
    void window.shell?.perfBoot?.({
      hardwareAcceleration: settings.perfHardwareAcceleration,
      smoothScrolling: settings.perfSmoothScrolling,
      backgroundThrottling: settings.perfBackgroundThrottling,
      cacheMb: settings.perfCacheMb,
      reduceRenderers: settings.perfMode === 'saver',
      memoryCapMb:
        settings.perfMode === 'saver' ? 512 : settings.perfMode === 'performance' ? 1024 : 768,
    });
    void window.shell?.perfApplySession?.({
      cacheMb: settings.perfCacheMb,
      backgroundThrottling: settings.perfBackgroundThrottling,
      spellcheck: settings.perfSpellcheck !== false,
    });
    void window.shell?.spellcheckConfig?.({ enabled: settings.perfSpellcheck !== false });
  }, [
    settings.perfHardwareAcceleration,
    settings.perfSmoothScrolling,
    settings.perfBackgroundThrottling,
    settings.perfCacheMb,
    settings.perfMode,
    settings.perfSpellcheck,
  ]);

  useEffect(() => {
    setSaveOffer(null);
    if (!settings.passwordsEnabled || isHome || !activeUrl) {
      setPwForPage(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      const st = await window.shell?.passwordsStatus?.();
      if (!st?.unlocked || cancelled) {
        if (!cancelled) setPwForPage(0);
        return;
      }
      const list = await window.shell?.passwordsFind?.(activeUrl);
      if (!cancelled) setPwForPage(Array.isArray(list) ? list.length : 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeUrl, activeId, isHome, settings.passwordsEnabled, setPwForPage, setSaveOffer]);

  useEffect(() => {
    if (activeIsTor && settings.sidePanelOpen) {
      patchSettings({ sidePanelOpen: false, activeSideAppId: null });
    }
  }, [activeIsTor, activeTabId, settings.sidePanelOpen, patchSettings]);

  useEffect(() => {
    void window.shell?.setDevtoolsEnabled?.(Boolean(settings.allowInspect));
  }, [settings.allowInspect]);

  useEffect(() => {
    if (!htmlFullscreen) {
      setFsToast(false);
      return;
    }
    setFsToast(true);
    const t = window.setTimeout(() => setFsToast(false), 4000);
    return () => window.clearTimeout(t);
  }, [htmlFullscreen, setFsToast]);
}
