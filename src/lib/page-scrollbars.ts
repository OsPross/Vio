import type { ThemeId } from '../store';
import type { PageColorScheme } from '../store/types';

/** Injected into guest pages when darkPageScrollbars is on (not Tor). */
export function pageScrollbarCss(theme: ThemeId): string {
  const light = theme === 'paper';
  const thumb = light
    ? 'color-mix(in srgb, #1a1a1a 18%, transparent)'
    : 'color-mix(in srgb, #f2f3f5 18%, transparent)';
  const thumbHover = light
    ? 'color-mix(in srgb, #1a1a1a 30%, transparent)'
    : 'color-mix(in srgb, #f2f3f5 30%, transparent)';
  const track = light
    ? 'color-mix(in srgb, #1a1a1a 22%, transparent)'
    : 'color-mix(in srgb, #f2f3f5 22%, transparent)';

  return `
html, body {
  scrollbar-width: thin;
  scrollbar-color: ${track} transparent;
}
html::-webkit-scrollbar, body::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
html::-webkit-scrollbar-button, body::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}
html::-webkit-scrollbar-track, body::-webkit-scrollbar-track {
  background: transparent;
}
html::-webkit-scrollbar-thumb, body::-webkit-scrollbar-thumb {
  background: ${thumb};
  border-radius: 999px;
}
html::-webkit-scrollbar-thumb:hover, body::-webkit-scrollbar-thumb:hover {
  background: ${thumbHover};
}
html::-webkit-scrollbar-corner, body::-webkit-scrollbar-corner {
  background: transparent;
}
`.trim();
}

/** Jasne motywy chrome Vio (Paper / Daylight). */
export function isLightChromeTheme(theme: ThemeId): boolean {
  return theme === 'paper';
}

/**
 * Mapuje ustawienie stron → Electron nativeTheme (prefers-color-scheme w webview).
 * `system` = dopasuj do motywu Vio (nie do OS) — Paper → light, reszta → dark.
 * `followOs` (motyw Vio „Systemowy”) → `system`, żeby prefers-color-scheme czytało prawdziwy OS.
 */
export function nativeThemeSource(
  scheme: PageColorScheme,
  chromeTheme?: ThemeId,
  followOs = false,
): 'dark' | 'light' | 'system' {
  if (scheme === 'light' || scheme === 'dark') return scheme;
  if (followOs) return 'system';
  if (chromeTheme) return isLightChromeTheme(chromeTheme) ? 'light' : 'dark';
  return 'system';
}

export function nativeThemeSourceFromChromeTheme(theme: ThemeId): 'dark' | 'light' {
  return isLightChromeTheme(theme) ? 'light' : 'dark';
}
