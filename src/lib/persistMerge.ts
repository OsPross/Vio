/**
 * Pure persist merge / settings migration helpers (no Zustand).
 */
import { DEFAULT_BANGS, migrateBangsToDdg, type Bang } from './bangs';

export type PersistStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** Matches store.HomeLayoutPreset (+ legacy 'search' input mapped to 'top'). */
export type HomeLayoutPreset = 'centered' | 'top' | 'left' | 'custom';

/**
 * Derive homeLayoutPreset from legacy homeAlign/homeLayout when missing.
 */
export function deriveHomeLayoutPreset(settings: {
  homeLayoutPreset?: string;
  homeAlign?: string;
  homeLayout?: string;
  homeShowClock?: boolean;
  homeShowApps?: boolean;
}): HomeLayoutPreset {
  const preset = settings.homeLayoutPreset;
  if (preset === 'search') return 'top';
  if (preset === 'centered' || preset === 'top' || preset === 'left' || preset === 'custom') {
    return preset;
  }
  const a = settings.homeAlign;
  const l = settings.homeLayout;
  if (l === 'minimal' || (!settings.homeShowClock && !settings.homeShowApps)) {
    return 'top';
  }
  if (a === 'left' || l === 'stack') {
    return 'left';
  }
  return 'centered';
}

/** Never allow history array to be treated as the source of truth in persist. */
export function historyMustStayEphemeral<T>(persistedHistory: unknown): T[] {
  return (Array.isArray(persistedHistory) ? persistedHistory : []) as T[];
}

export function applyOneShotLocalFlags(
  mergedSettings: Record<string, unknown>,
  storage: PersistStorageLike | null | undefined,
): Record<string, unknown> {
  if (!storage) return mergedSettings;
  const out: Record<string, unknown> = { ...mergedSettings };
  try {
    if (!storage.getItem('djxxr-allow-inspect-default-v1')) {
      out.allowInspect = true;
      storage.setItem('djxxr-allow-inspect-default-v1', '1');
    }
  } catch {
    /* */
  }
  try {
    if (!storage.getItem('djxxr-search-suggest-on-v1')) {
      out.privacySearchSuggest = true;
      out.privacyAllowAppNetwork = true;
      out.suggestHistory = true;
      out.newTabIsSearch = true;
      storage.setItem('djxxr-search-suggest-on-v1', '1');
    }
  } catch {
    /* */
  }
  try {
    if (!storage.getItem('djxxr-spellcheck-default-v1')) {
      out.perfSpellcheck = true;
      storage.setItem('djxxr-spellcheck-default-v1', '1');
    }
  } catch {
    /* */
  }
  return out;
}

/**
 * Core settings field normalization (shared with store persist merge).
 */
export function normalizeSettingsFields(merged: Record<string, unknown>): Record<string, unknown> {
  const s: Record<string, unknown> = { ...merged };
  if (!Array.isArray(s.homeTodos)) s.homeTodos = [];
  s.homeLayoutPreset = deriveHomeLayoutPreset(s);
  if (!s.homeWidgetStyle) s.homeWidgetStyle = 'transparent';
  if (typeof s.homeWidgetRadius !== 'number') s.homeWidgetRadius = 14;
  if (typeof s.homeGridGap !== 'number') s.homeGridGap = 12;
  if (typeof s.homeLayoutLock !== 'boolean') s.homeLayoutLock = false;
  if (s.homeBgImage === undefined) s.homeBgImage = null;
  if (typeof s.homeBgImage === 'string' && s.homeBgImage.startsWith('data:')) {
    s.homeBgImage = null;
    if (s.bgStyle === 'custom') s.bgStyle = 'soft';
  }
  if (typeof s.homeBgBlur !== 'number') s.homeBgBlur = 12;
  if (typeof s.homeBgDim !== 'number') s.homeBgDim = 35;
  if (
    s.homeClockStyle !== 'thin' &&
    s.homeClockStyle !== 'classic' &&
    s.homeClockStyle !== 'mono'
  ) {
    s.homeClockStyle = 'thin';
  }
  if (typeof s.homeShowSeconds !== 'boolean') s.homeShowSeconds = false;
  if (
    s.homeDensity !== 'compact' &&
    s.homeDensity !== 'comfortable' &&
    s.homeDensity !== 'spacious'
  ) {
    s.homeDensity = 'comfortable';
  }
  if (s.bgStyle === 'custom' && !s.homeBgImage) s.bgStyle = 'soft';
  if (s.sidebarMode !== 'on' && s.sidebarMode !== 'auto' && s.sidebarMode !== 'off') {
    s.sidebarMode = s.showSidebar ? 'on' : 'off';
  } else {
    s.showSidebar = s.sidebarMode !== 'off';
  }
  if (typeof s.allowInspect !== 'boolean') s.allowInspect = true;
  if (typeof s.privacySearchSuggest !== 'boolean') s.privacySearchSuggest = true;
  if (typeof s.privacyAllowAppNetwork !== 'boolean') s.privacyAllowAppNetwork = true;
  if (typeof s.newTabIsSearch !== 'boolean') s.newTabIsSearch = true;
  if (typeof s.perfSpellcheck !== 'boolean') s.perfSpellcheck = true;
  if (!s.zoomFactors || typeof s.zoomFactors !== 'object') s.zoomFactors = {};
  if (typeof s.showBookmarksBar !== 'boolean') s.showBookmarksBar = false;
  if (typeof s.darkPageScrollbars !== 'boolean') s.darkPageScrollbars = true;
  if (typeof s.autoPipOnTabSwitch !== 'boolean') s.autoPipOnTabSwitch = false;
  return s;
}

export function mergeBangs(persisted: Bang[] | undefined, current: Bang[]): Bang[] {
  return migrateBangsToDdg(
    persisted?.length ? persisted : current.length ? current : [...DEFAULT_BANGS],
  );
}
