import type { CSSProperties } from 'react';
import type { BgStyle } from '../../../store';

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
          id === 'custom' && imageUrl
            ? ({ ['--pz-bg-img' as string]: `url("${imageUrl}")` } as CSSProperties)
            : undefined
        }
      />
      <span className="pz-bg-label">{LABELS[id]}</span>
    </button>
  );
}
