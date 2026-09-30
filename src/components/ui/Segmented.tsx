export function Segmented({
  value,
  options,
  onChange,
  size = 'md',
  'aria-label': ariaLabel,
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}) {
  return (
    <div className={`ui-seg ui-seg-${size}`} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={value === o.id ? 'on' : ''}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
