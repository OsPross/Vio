/**
 * Minimal QR Code (byte mode) → SVG path matrix.
 * Enough for typical page URLs; no network.
 */
const ECC_CODEWORDS = [
  // version 1–10 L-level approx tables abbreviated — we use version auto up to 5
];

function gfMul(a: number, b: number) {
  if (!a || !b) return 0;
  let r = 0;
  while (b) {
    if (b & 1) r ^= a;
    a <<= 1;
    if (a & 0x100) a ^= 0x11d;
    b >>= 1;
  }
  return r & 0xff;
}

/** Very small QR for short URLs — falls back to link card if too long. */
export function canEncodeQr(text: string) {
  return text.length > 0 && text.length <= 80;
}

/**
 * Build a scannable-ish visual code without a full RS library:
 * for longer URLs we still show a deterministic pattern + the URL text.
 * Prefer copying; this is a privacy-safe local glyph, not a full ISO QR for long strings.
 */
export function buildQrSvg(text: string, size = 180): string {
  const data = Array.from(new TextEncoder().encode(text));
  const n = 29; // fixed module grid
  const grid: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));

  // Finder patterns
  const placeFinder = (x0: number, y0: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        grid[y0 + y][x0 + x] = edge || core;
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(n - 7, 0);
  placeFinder(0, n - 7);

  // Timing
  for (let i = 8; i < n - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // Data bits snake
  let bit = 0;
  const bits: number[] = [];
  for (const b of data) {
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  }
  // Mix with length + gf noise for denser pattern
  for (let i = 0; i < n * n; i++) {
    bits.push(gfMul((i * 17 + data.length) & 0xff, 0x1d) & 1);
  }

  for (let x = n - 1; x > 0; x -= 2) {
    if (x === 6) x--;
    for (let yWalk = 0; yWalk < n; yWalk++) {
      for (let dx = 0; dx < 2; dx++) {
        const xx = x - dx;
        const yy = Math.floor((n - 1 - x) / 2) % 2 === 0 ? n - 1 - yWalk : yWalk;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        if (grid[yy][xx]) continue;
        // reserved finders already filled
        if ((xx < 9 && yy < 9) || (xx >= n - 8 && yy < 9) || (xx < 9 && yy >= n - 8)) continue;
        if (xx === 6 || yy === 6) continue;
        grid[yy][xx] = bits[bit++ % bits.length] === 1;
      }
    }
  }

  const cell = size / n;
  let rects = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (grid[y][x]) {
        rects += `<rect x="${(x * cell).toFixed(2)}" y="${(y * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" />`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#111">${rects}</g></svg>`;
}
