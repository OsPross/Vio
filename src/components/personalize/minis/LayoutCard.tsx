export function LayoutCard({
  id,
  label,
  selected,
  onSelect,
}: {
  id: 'centered' | 'search' | 'left' | 'custom';
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`pz-layout-card ${selected ? 'on' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className={`pz-layout-face pz-layout-preset-${id}`} aria-hidden>
        <span className="pz-layout-clock" />
        <span className="pz-layout-search" />
        <span className="pz-layout-dock">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="pz-layout-widgets">
          <i />
          <i />
        </span>
      </span>
      <strong>{label}</strong>
    </button>
  );
}
