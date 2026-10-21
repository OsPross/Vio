import { DEFAULT_BANGS, resolveBang, type Bang } from '../lib/bangs';
import { nativeThemeSource } from '../lib/page-scrollbars';
import type { PerfMode, SearchEngine, SearchLanguage, Settings } from './types';
import { HOME_URL, SEARCH_ENGINES, THEMES } from './constants';

export function engineLabel(id: SearchEngine): string {
  return SEARCH_ENGINES.find((e) => e.id === id)?.label ?? id;
}

/** Query-string fragment (no leading `?`/`&`) for engine language / region. */
export function searchLanguageParams(
  engine: SearchEngine,
  lang: SearchLanguage | undefined,
): string {
  if (!lang || lang === 'auto') return '';
  const en = lang === 'en';
  switch (engine) {
    case 'google':
      return en ? 'hl=en&gl=us&lr=lang_en' : 'hl=pl&gl=pl&lr=lang_pl';
    case 'bing':
      return en ? 'setlang=en&cc=US&mkt=en-US' : 'setlang=pl&cc=PL&mkt=pl-PL';
    case 'ddg':
      return en ? 'kl=us-en' : 'kl=pl-pl';
    case 'brave':
      return en ? 'country=US' : 'country=PL';
    case 'startpage':
      return en ? 'language=english' : 'language=polski';
    case 'qwant':
      return en ? 'locale=en_US' : 'locale=pl_PL';
    case 'ecosia':
      return '';
    case 'swisscows':
      return en ? 'uiLanguage=en' : 'uiLanguage=pl';
    case 'yandex':
      return en ? 'lang=en' : 'lang=pl';
    case 'searx':
      return en ? 'language=en-US' : 'language=pl-PL';
    default:
      return '';
  }
}

function withSearchLang(url: string, engine: SearchEngine, settings: Settings): string {
  const qs = searchLanguageParams(engine, settings.searchLanguage);
  if (!qs) return url;
  return url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
}

export function applyPerfPreset(mode: PerfMode): Partial<Settings> {
  if (mode === 'performance') {
    return {
      perfMode: mode,
      perfHardwareAcceleration: true,
      perfBackgroundThrottling: false,
      perfLazyTabs: false,
      perfDiscardTabs: false,
      perfDiscardMinutes: 60,
      perfDiscardKeepPinned: true,
      perfReduceMotion: false,
      perfSmoothScrolling: true,
      perfSpellcheck: true,
      perfBlockHeavyMedia: false,
      perfCacheMb: 512,
      perfLowPowerClock: false,
      uiMotion: true,
      uiGlass: true,
    };
  }
  if (mode === 'saver') {
    return {
      perfMode: mode,
      perfHardwareAcceleration: true,
      perfBackgroundThrottling: true,
      perfLazyTabs: true,
      perfDiscardTabs: true,
      perfDiscardMinutes: 15,
      perfDiscardKeepPinned: true,
      perfReduceMotion: true,
      perfSmoothScrolling: false,
      perfSpellcheck: false,
      perfBlockHeavyMedia: true,
      perfCacheMb: 96,
      perfLowPowerClock: true,
      uiMotion: false,
      uiGlass: false,
      homeShowClock: true,
    };
  }
  return {
    perfMode: 'balanced',
    perfHardwareAcceleration: true,
    perfBackgroundThrottling: true,
    perfLazyTabs: true,
    perfDiscardTabs: true,
    perfDiscardMinutes: 30,
    perfDiscardKeepPinned: true,
    perfReduceMotion: false,
    perfSmoothScrolling: true,
    perfSpellcheck: true,
    perfBlockHeavyMedia: false,
    perfCacheMb: 256,
    perfLowPowerClock: false,
    uiMotion: true,
  };
}

export function searchUrl(settings: Settings, q: string) {
  const enc = encodeURIComponent(q);
  const searx = settings.searxUrl.replace(/\/$/, '');
  const engine = settings.searchEngine;
  let url: string;
  switch (engine) {
    case 'searx':
      url = `${searx}/search?q=${enc}`;
      break;
    case 'brave':
      url = `https://search.brave.com/search?q=${enc}`;
      break;
    case 'ddg':
      url = `https://duckduckgo.com/?q=${enc}`;
      break;
    case 'bing':
      url = `https://www.bing.com/search?q=${enc}`;
      break;
    case 'startpage':
      url = `https://www.startpage.com/sp/search?query=${enc}`;
      break;
    case 'qwant':
      url = `https://www.qwant.com/?q=${enc}`;
      break;
    case 'ecosia':
      url = `https://www.ecosia.org/search?q=${enc}`;
      break;
    case 'swisscows':
      url = `https://swisscows.com/web?query=${enc}`;
      break;
    case 'yandex':
      url = `https://yandex.com/search/?text=${enc}`;
      break;
    case 'ahmia':
      return `https://ahmia.fi/search/?q=${enc}`;
    case 'onionland':
      return `https://onionlandsearchengine.com/search?q=${enc}`;
    case 'custom': {
      const tpl = settings.customSearchUrl.trim() || 'https://duckduckgo.com/?q=%s';
      return tpl.includes('%s') ? tpl.replace('%s', enc) : `${tpl}${enc}`;
    }
    default:
      url = `https://www.google.com/search?q=${enc}`;
      return withSearchLang(url, 'google', settings);
  }
  return withSearchLang(url, engine, settings);
}

export function searchHome(settings: Settings) {
  switch (settings.searchEngine) {
    case 'searx':
      return `${settings.searxUrl.replace(/\/$/, '')}/`;
    case 'brave':
      return 'https://search.brave.com/';
    case 'ddg':
      return 'https://duckduckgo.com/';
    case 'bing':
      return 'https://www.bing.com/';
    case 'startpage':
      return 'https://www.startpage.com/';
    case 'qwant':
      return 'https://www.qwant.com/';
    case 'ecosia':
      return 'https://www.ecosia.org/';
    case 'swisscows':
      return 'https://swisscows.com/';
    case 'yandex':
      return 'https://yandex.com/';
    case 'ahmia':
      return 'https://ahmia.fi/';
    case 'onionland':
      return 'https://onionlandsearchengine.com/';
    case 'custom': {
      try {
        return new URL(settings.customSearchUrl.replace('%s', '')).origin + '/';
      } catch {
        return 'https://duckduckgo.com/';
      }
    }
    default:
      return 'https://www.google.com/';
  }
}

/** Resolve bang — see `lib/bangs.ts`. Kept as thin wrapper for call sites with settings. */
export function resolveBangWithSettings(
  raw: string,
  bangs: Bang[],
  _settings: Settings,
): string | null {
  return resolveBang(raw, bangs);
}

export function normalizeInput(raw: string, settings: Settings, bangs: Bang[] = DEFAULT_BANGS) {
  const t = raw.trim();
  if (!t) return settings.homepage === HOME_URL ? HOME_URL : settings.homepage;
  const bang = resolveBang(t, bangs);
  if (bang) return bang;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^about:/i.test(t)) return t;
  // .onion host — leave as http(s) onion URL; needs Tor proxy to resolve
  if (/\.onion($|\/|:)/i.test(t)) {
    if (/^https?:\/\//i.test(t)) return t;
    return `http://${t}`;
  }
  if (/^[\w-]+(\.[\w-]+)+/.test(t) || t.startsWith('localhost')) return `https://${t}`;
  return searchUrl(settings, t);
}

export function applyThemeToDom(settings: Settings) {
  const t = THEMES[settings.theme] ?? THEMES.midnight;
  const root = document.documentElement;
  const chrome = t.elev;
  const chromeInput =
    settings.theme === 'paper'
      ? 'color-mix(in srgb, var(--bg) 72%, #000 7%)'
      : 'color-mix(in srgb, var(--bg) 78%, #000 22%)';

  const apply = () => {
    root.style.setProperty('--bg', t.bg);
    root.style.setProperty('--bg-elev', t.elev);
    root.style.setProperty(
      '--bg-elev-2',
      settings.theme === 'paper'
        ? 'color-mix(in srgb, var(--bg-elev) 86%, #000 14%)'
        : 'color-mix(in srgb, var(--bg-elev) 82%, #fff 18%)',
    );
    root.style.setProperty('--bg-side', chrome);
    root.style.setProperty('--chrome', chrome);
    root.style.setProperty('--chrome-input', chromeInput);
    root.style.setProperty('--fg', t.fg);
    root.style.setProperty('--fg-2', t.fg2);
    root.style.setProperty('--fg-3', t.fg3);
    root.style.setProperty('--text-tertiary', t.fg3);
    root.style.setProperty('--line', t.line);
    const accent = settings.useThemeAccent ? t.accent : settings.accent;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-dim', `${accent}24`);
    if (settings.theme === 'paper') {
      root.style.setProperty('--notes-surface', 'color-mix(in srgb, var(--bg-elev) 96%, #fff 4%)');
      root.style.setProperty('--notes-list-hover', 'color-mix(in srgb, var(--fg) 6%, transparent)');
      root.style.setProperty(
        '--notes-list-active',
        'color-mix(in srgb, var(--accent) 14%, var(--bg-elev))',
      );
      root.style.setProperty('--notes-toolbar', 'color-mix(in srgb, var(--fg) 5%, transparent)');
    } else if (settings.theme === 'midnight') {
      root.style.setProperty(
        '--notes-surface',
        'color-mix(in srgb, var(--bg-elev) 55%, transparent)',
      );
      root.style.setProperty('--notes-list-hover', 'color-mix(in srgb, var(--fg) 7%, transparent)');
      root.style.setProperty(
        '--notes-list-active',
        'color-mix(in srgb, var(--accent) 18%, transparent)',
      );
      root.style.setProperty('--notes-toolbar', 'color-mix(in srgb, var(--fg) 4%, transparent)');
    } else {
      root.style.setProperty(
        '--notes-surface',
        'color-mix(in srgb, var(--bg-elev) 70%, transparent)',
      );
      root.style.setProperty('--notes-list-hover', 'color-mix(in srgb, var(--fg) 6%, transparent)');
      root.style.setProperty(
        '--notes-list-active',
        'color-mix(in srgb, var(--accent) 16%, transparent)',
      );
      root.style.setProperty('--notes-toolbar', 'color-mix(in srgb, var(--fg) 5%, transparent)');
    }
    root.style.setProperty('--glass-blur', `${settings.glassBlur}px`);
    root.style.setProperty('--glass-alpha', String(settings.glassOpacity));
    root.dataset.theme = settings.theme;
    root.dataset.glass = settings.uiGlass ? 'on' : 'off';
    root.dataset.motion = settings.uiMotion ? 'on' : 'off';
    root.dataset.density = settings.uiDensity;

    void window.shell?.setTitleBar?.({
      color: chrome,
      symbolColor: t.fg2,
      height: 32,
    });
    // nativeTheme = prefers-color-scheme w webview — NIE motyw chrome UI
    void window.shell?.setNativeTheme?.(nativeThemeSource(settings.pageColorScheme || 'system'));
  };

  const reduce =
    settings.perfReduceMotion ||
    !settings.uiMotion ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const doc = typeof document !== 'undefined' ? document : null;
  const canVT =
    !reduce &&
    !!doc &&
    'startViewTransition' in doc &&
    typeof (doc as Document & { startViewTransition?: (cb: () => void) => void })
      .startViewTransition === 'function';

  if (canVT) {
    (doc as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(
      apply,
    );
    return;
  }

  if (!reduce && root) {
    root.classList.add('theme-fading');
    apply();
    window.setTimeout(() => root.classList.remove('theme-fading'), 220);
    return;
  }

  apply();
}
