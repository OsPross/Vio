import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { THEMES, type ThemeId } from '../../../store';

export function ThemeCard({
  id,
  selected,
  onSelect,
}: {
  id: ThemeId;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = THEMES[id];
  return (
    <button
      type="button"
      className={`pz-theme-card ${selected ? 'on' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
      title={t.label}
    >
      <span
        className="pz-theme-face"
        style={
          {
            ['--pz-t-bg' as string]: t.bg,
            ['--pz-t-elev' as string]: t.elev,
            ['--pz-t-fg' as string]: t.fg,
            ['--pz-t-fg3' as string]: t.fg3,
            ['--pz-t-accent' as string]: t.accent,
            ['--pz-t-line' as string]: t.line,
          } as CSSProperties
        }
      >
        <span className="pz-theme-bar" />
        <span className="pz-theme-body">
          <i className="pz-theme-dot" />
          <em />
          <em className="short" />
        </span>
        {selected && (
          <span className="pz-theme-check">
            <Check size={11} strokeWidth={2.5} />
          </span>
        )}
      </span>
      <span className="pz-theme-label">{t.label}</span>
    </button>
  );
}
