import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import {
  configureSounds,
  playSample,
  playSound,
  playTypingKey,
  type SoundProfile,
} from '../utils/soundEffects';

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest('input, textarea, select, [contenteditable="true"]'));
}

function isUiClickTarget(el: EventTarget | null): HTMLElement | null {
  if (!(el instanceof Element)) return null;
  return el.closest(
    [
      '.ui-switch',
      '.chrome-btn',
      '.nav-btn',
      '.tb-btn',
      '.omnibox-actions button',
      '.app-sidebar button',
      '.side-rail button',
      '.rail-btn',
      '.settings-nav button',
      '.slib-seg button',
      '.lib-switch button',
      '.hw-ios-edit-capsule button',
      '.ui-seg button',
      '.stheme',
      '.sg button.ui-button',
    ].join(','),
  ) as HTMLElement | null;
}

/** Wire UI / typing / tab / download sounds from settings. */
export function useUiSounds() {
  const settings = useStore((s) => s.settings);
  const tabsLen = useStore((s) => s.tabs.length);
  const activeId = useStore((s) => s.activeId);
  const settingsTab = useStore((s) => s.settingsTab);
  const view = useStore((s) => s.view);

  const prevTabs = useRef(tabsLen);
  const prevActive = useRef(activeId);
  const prevSettingsTab = useRef(settingsTab);
  const prevView = useRef(view);
  const seenDownloads = useRef<Set<string>>(new Set());
  const bootReady = useRef(false);

  useEffect(() => {
    configureSounds({
      enabled: !!settings.uiSoundsEnabled,
      profile: (settings.soundProfile || 'ios') as SoundProfile,
      volume: typeof settings.soundVolume === 'number' ? settings.soundVolume : 55,
      typing: settings.soundTyping !== false,
      tabs: settings.soundTabs !== false,
      ui: settings.soundUi !== false,
      downloads: settings.soundDownloads !== false,
    });
  }, [
    settings.uiSoundsEnabled,
    settings.soundProfile,
    settings.soundVolume,
    settings.soundTyping,
    settings.soundTabs,
    settings.soundUi,
    settings.soundDownloads,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.repeat) return;
      if (!isEditableTarget(e.target)) return;
      playTypingKey(e.key, e.code);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const hit = isUiClickTarget(e.target);
      if (!hit) return;
      if (hit.classList.contains('ui-switch') || hit.closest('.ui-switch')) {
        playSound('toggle');
        return;
      }
      playSound('click');
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    const off = window.shell?.onGuestKey?.((payload) => {
      if (!payload || typeof payload !== 'object') return;
      const key = typeof payload.key === 'string' ? payload.key : '';
      const code = typeof payload.code === 'string' ? payload.code : undefined;
      if (!key) return;
      playTypingKey(key, code);
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    if (!bootReady.current) {
      bootReady.current = true;
      prevTabs.current = tabsLen;
      prevActive.current = activeId;
      return;
    }
    if (tabsLen > prevTabs.current) playSound('tabOpen');
    else if (tabsLen < prevTabs.current) playSound('tabClose');
    else if (activeId !== prevActive.current) playSound('tabSwitch');
    prevTabs.current = tabsLen;
    prevActive.current = activeId;
  }, [tabsLen, activeId]);

  useEffect(() => {
    if (settingsTab !== prevSettingsTab.current) {
      if (bootReady.current) playSound('popover');
      prevSettingsTab.current = settingsTab;
    }
  }, [settingsTab]);

  useEffect(() => {
    if (view !== prevView.current) {
      if (bootReady.current && (view === 'settings' || prevView.current === 'settings')) {
        playSound('popover');
      }
      prevView.current = view;
    }
  }, [view]);

  useEffect(() => {
    const off = window.shell?.onDownloadsChanged?.((list) => {
      if (!Array.isArray(list)) return;
      for (const raw of list) {
        const item = raw as { id?: string; state?: string };
        if (!item?.id || item.state !== 'completed') continue;
        if (seenDownloads.current.has(item.id)) continue;
        seenDownloads.current.add(item.id);
        if (bootReady.current) playSound('downloadDone');
      }
    });
    return () => off?.();
  }, []);
}

export { playSample };
