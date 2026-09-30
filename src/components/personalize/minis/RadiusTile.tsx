export function RadiusTile({
  value,
  label,
  selected,
  onSelect,
}: {
  value: number;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`pz-radius-tile ${selected ? 'on' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
      title={label}
    >
      <span className="pz-radius-shape" style={{ borderRadius: value }} />
      <em>{label}</em>
    </button>
  );
}
