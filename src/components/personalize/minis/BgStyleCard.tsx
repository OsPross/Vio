import type { CSSProperties } from 'react';
import type { BgStyle } from '../../../store';
import { homeBgCssUrl } from '../../../lib/homeBg';

const LABELS: Record<string, string> = {
  soft: 'Miękkie',
  vignette: 'Głębia',
  mesh: 'Warstwy',
  solid: 'Jednolite',
  custom: 'Własny obraz',
};

export function BgStyleCard({
  id,
  selected,
  onSelect,
  imageUrl,
}: {
  id: Extract<BgStyle, 'soft' | 'vignette' | 'mesh' | 'solid' | 'custom'>;
  selected: boolean;
  onSelect: () => void;
  imageUrl?: string | null;
}) {
  const cssUrl = id === 'custom' ? homeBgCssUrl(imageUrl) : null;
  return (
    <button
      type="button"
      className={`pz-bg-card ${selected ? 'on' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span
        className={`pz-bg-face pz-bg-face-${id}`}
        style={
          cssUrl
            ? ({ ['--pz-bg-img' as string]: `url("${cssUrl}")` } as CSSProperties)
            : undefined
        }
      />
      <span className="pz-bg-label">{LABELS[id]}</span>
    </button>
  );
}
