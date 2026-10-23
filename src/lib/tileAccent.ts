/** Soft pastel fill for iOS-style shortcut tiles when no favicon is available. */

const PALETTE = [
  ['#E8E4F8', '#6B5CE7'],
  ['#E4EEF8', '#4A7FD4'],
  ['#E4F4EE', '#3D9A6E'],
  ['#F8EDE4', '#C47A3A'],
  ['#F8E4EC', '#C45A7A'],
  ['#E4F1F8', '#3A8FB5'],
  ['#F1E8F8', '#8B5CB8'],
  ['#EEF0F4', '#5C6573'],
] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function tileAccent(seed: string): { bg: string; fg: string; letter: string } {
  const key = (seed || '?').trim() || '?';
  const letter = key.charAt(0).toUpperCase().replace(/[<>&"']/g, '') || '?';
  const [bg, fg] = PALETTE[hash(key.toLowerCase()) % PALETTE.length];
  return { bg, fg, letter };
}
