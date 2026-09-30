import { useEffect, useState } from 'react';
import { Shield, ShieldOff, Trash2, X } from 'lucide-react';
import { Switch } from './ui/Switch';

type Props = {
  open: boolean;
  onClose: () => void;
  pageUrl: string;
  blockedToday: number;
  protectionOn: boolean;
  onToggleProtection: (on: boolean) => void;
  onForget: () => void;
};

export function ShieldPanel({
  open,
  onClose,
  pageUrl,
  blockedToday,
  protectionOn,
  onToggleProtection,
  onForget,
}: Props) {
  const [blocked, setBlocked] = useState<{ host: string; url: string }[]>([]);
  let host = '';
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    host = pageUrl;
  }

  useEffect(() => {
    if (!open) return;
    void window.shell?.privacyBlocked?.('global').then((list) => {
      if (Array.isArray(list)) setBlocked(list.slice(0, 40));
    });
  }, [open, blockedToday]);

  if (!open) return null;

  return (
    <div className="shield-panel" role="dialog" aria-label="Ochrona prywatności">
      <header className="shield-panel-head">
        <div className="shield-panel-title">
          {protectionOn ? <Shield size={16} strokeWidth={1.75} /> : <ShieldOff size={16} strokeWidth={1.75} />}
          <strong>{host || 'Strona'}</strong>
        </div>
        <button type="button" className="icon-btn sm" onClick={onClose} title="Zamknij">
          <X size={14} />
        </button>
      </header>

      <div className="shield-panel-stats">
        <div>
          <em>Zablokowane dziś</em>
          <strong>{blockedToday}</strong>
        </div>
        <div>
          <em>Na tej sesji (próbka)</em>
          <strong>{blocked.length}</strong>
        </div>
      </div>

      <label className="shield-toggle">
        <Switch
          on={protectionOn}
          onChange={onToggleProtection}
          aria-label="Ochrona dla tej strony"
        />
        <span>Ochrona dla tej strony</span>
      </label>
      <p className="shield-hint muted">
        {protectionOn
          ? 'Coś nie działa? Wyłącz ochronę dla tej strony — zapamiętamy wyjątek per domena.'
          : 'Ochrona wyłączona dla tej domeny (wyjątek zapisany).'}
      </p>

      <button type="button" className="sbtn ghost shield-forget" onClick={onForget}>
        <Trash2 size={14} strokeWidth={1.75} /> Zapomnij tę stronę
      </button>

      {blocked.length > 0 && (
        <div className="shield-blocked-list">
          <span className="shield-blocked-label">Ostatnio zablokowane domeny</span>
          <ul>
            {blocked.slice(0, 12).map((b, i) => (
              <li key={`${b.host}-${i}`} title={b.url}>
                {b.host}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
