import { useMemo, useState } from 'react';
import { useT } from '../i18n';
import { Dropdown } from './ui/Dropdown';

export type ClearDataRange = 'hour' | 'day' | 'week' | 'all';

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
  title,
  description,
}: Props) {
  const t = useT();
  const [range, setRange] = useState<ClearDataRange>('hour');
  const [busy, setBusy] = useState(false);

  const rangeOptions = useMemo(
    () =>
      [
        { id: 'hour' as const, label: t('dialogs.clearDataRangeHour') },
        { id: 'day' as const, label: t('dialogs.clearDataRangeDay') },
        { id: 'week' as const, label: t('dialogs.clearDataRangeWeek') },
        { id: 'all' as const, label: t('dialogs.clearDataRangeAll') },
      ] as const,
    [t],
  );

  const rangeLabels = useMemo(
    (): Record<ClearDataRange, string> => ({
      hour: t('dialogs.clearDataRangeLabelHour'),
      day: t('dialogs.clearDataRangeLabelDay'),
      week: t('dialogs.clearDataRangeLabelWeek'),
      all: t('dialogs.clearDataRangeLabelAll'),
    }),
    [t],
  );

  if (!open) return null;

  const dialogTitle = title ?? t('dialogs.clearData');
  const dialogDesc = description ?? t('dialogs.clearDataDesc');

  const runClear = async () => {
    if (!window.confirm(t('dialogs.clearDataConfirmPrompt', { range: rangeLabels[range] }))) return;
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
        <h2 id="clear-data-title">{dialogTitle}</h2>
        <p className="muted">{dialogDesc}</p>
        <label className="clear-data-range">
          <span>{t('dialogs.clearDataRange')}</span>
          <Dropdown
            value={range}
            options={[...rangeOptions]}
            onChange={(id) => setRange(id as ClearDataRange)}
            aria-label={t('dialogs.clearDataRangeAria')}
          />
        </label>
        <div className="clear-data-actions">
          <button
            type="button"
            className="history-sbtn secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="history-sbtn danger-text"
            disabled={busy}
            onClick={() => void runClear()}
          >
            {t('dialogs.clearDataConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
