/** Minimal HSV ↔ hex helpers for the in-app color picker. */

export type Hsv = { h: number; s: number; v: number };

export function normalizeHex(raw: string, fallback = '#6b9eff'): string {
  let s = String(raw || '').trim();
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    s = `#${r}${r}${g}${g}${b}${b}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return fallback;
  return s.toLowerCase();
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex);
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** h in [0,360), s/v in [0,1] */
export function hexToHsv(hex: string): Hsv {
  const { r, g, b } = hexToRgb(hex);
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hh = ((h % 360) + 360) % 360;
  const C = v * s;
  const X = C * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - C;
  let r: number;
  let g: number;
  let b: number;
  if (hh < 60) [r, g, b] = [C, X, 0];
  else if (hh < 120) [r, g, b] = [X, C, 0];
  else if (hh < 180) [r, g, b] = [0, C, X];
  else if (hh < 240) [r, g, b] = [0, X, C];
  else if (hh < 300) [r, g, b] = [X, 0, C];
  else [r, g, b] = [C, 0, X];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function hsvToCss(h: number, s = 1, v = 1): string {
  return hsvToHex(h, s, v);
}
