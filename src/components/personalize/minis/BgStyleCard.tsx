import type { CSSProperties } from 'react';
import type { BgStyle } from '../../../store';
import { homeBgCssUrl } from '../../../lib/homeBg';
import { useT } from '../../../i18n';

const LABEL_KEYS: Record<string, string> = {
  soft: 'home.personalize.bgSoft',
  vignette: 'home.personalize.bgVignette',
  mesh: 'home.personalize.bgMesh',
  solid: 'home.personalize.bgSolid',
  custom: 'home.personalize.bgCustom',
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
  const t = useT();
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
      <span className="pz-bg-label">{t(LABEL_KEYS[id])}</span>
    </button>
  );
}
