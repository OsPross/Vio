import { useState } from 'react';
import { Dropdown } from './ui/Dropdown';

export type ClearDataRange = 'hour' | 'day' | 'week' | 'all';

const RANGE_OPTIONS = [
  { id: 'hour', label: 'Ostatnia godzina' },
  { id: 'day', label: 'Dzisiaj' },
  { id: 'week', label: 'Ostatni tydzień' },
  { id: 'all', label: 'Cała historia' },
] as const;

const RANGE_LABELS: Record<ClearDataRange, string> = {
  hour: 'ostatnią godzinę',
  day: 'dziś',
  week: 'ostatni tydzień',
  all: 'całą historię',
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after user confirms; should perform clear and return when done. */
  onConfirm?: (range: ClearDataRange) => void | Promise<void>;
  title?: string;
  description?: string;
};

export function ClearDataDialog({
  open,
  onClose,
  onConfirm,
  title = 'Wyczyść dane przeglądania',
  description = 'Usuwa wpisy historii z wybranego okresu. Tej operacji nie można cofnąć.',
}: Props) {
  const [range, setRange] = useState<ClearDataRange>('hour');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const runClear = async () => {
    if (!window.confirm(`Wyczyścić ${RANGE_LABELS[range]}?`)) return;
    setBusy(true);
    try {
      if (onConfirm) {
        await onConfirm(range);
      } else {
        await window.shell?.historyClear?.({ range });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="clear-data-backdrop" role="presentation" onMouseDown={() => !busy && onClose()}>
      <div
        className="clear-data-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-data-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="clear-data-title">{title}</h2>
        <p className="muted">{description}</p>
        <label className="clear-data-range">
          <span>Zakres</span>
          <Dropdown
            value={range}
            options={[...RANGE_OPTIONS]}
            onChange={(id) => setRange(id as ClearDataRange)}
            aria-label="Zakres czyszczenia"
          />
        </label>
        <div className="clear-data-actions">
          <button
            type="button"
            className="history-sbtn secondary"
            disabled={busy}
            onClick={onClose}
          >
            Anuluj
          </button>
          <button
            type="button"
            className="history-sbtn danger-text"
            disabled={busy}
            onClick={() => void runClear()}
          >
            Wyczyść
          </button>
        </div>
      </div>
    </div>
  );
}
