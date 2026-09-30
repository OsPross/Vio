import type { HomeWidgetStyle } from '../../../store';

export function WidgetStyleCard({
  id,
  label,
  selected,
  onSelect,
}: {
  id: HomeWidgetStyle;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`pz-wstyle-card ${selected ? 'on' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className={`pz-wstyle-face pz-wstyle-${id}`} aria-hidden>
        <span className="pz-wstyle-chip" />
        <span className="pz-wstyle-chip tall" />
      </span>
      <strong>{label}</strong>
    </button>
  );
}
