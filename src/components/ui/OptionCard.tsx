import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

export function OptionCard({
  selected,
  onSelect,
  label,
  description,
  preview,
  className,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  description?: string;
  preview?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={['ui-option-card', selected ? 'on' : '', className || ''].filter(Boolean).join(' ')}
      onClick={onSelect}
      aria-pressed={selected}
    >
      {preview && <div className="ui-option-preview">{preview}</div>}
      <div className="ui-option-meta">
        <strong>{label}</strong>
        {description && <em>{description}</em>}
      </div>
      {selected && (
        <span className="ui-option-check" aria-hidden>
          <Check size={12} strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}
