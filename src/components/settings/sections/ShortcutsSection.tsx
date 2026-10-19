import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '../../ui/Input';
import { useT } from '../../../i18n';
import { useStore } from '../../../store';
import { SettingsGroup } from '../SettingsControls';

export function ShortcutsSection() {
  const shortcuts = useStore((s) => s.shortcuts);
  const addShortcut = useStore((s) => s.addShortcut);
  const removeShortcut = useStore((s) => s.removeShortcut);
  const t = useT();

  const [scLabel, setScLabel] = useState('');
  const [scUrl, setScUrl] = useState('');

  return (
    <div className="settings-stack">
      <SettingsGroup title={t('settings.shortcuts.title')}>
        <div className="slist">
          {shortcuts.map((s) => (
            <div key={s.id} className="slist-row">
              <div className="slist-meta">
                <span className="slist-name">{s.label}</span>
                <span className="slist-url mono truncate">{s.url}</span>
              </div>
              <button
                type="button"
                className="icon-btn sm"
                onClick={() => removeShortcut(s.id)}
                aria-label={t('settings.shortcuts.removeAria', { name: s.label })}
              >
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
        <div className="sform">
          <Input
            placeholder={t('settings.shortcuts.namePlaceholder')}
            value={scLabel}
            onChange={(e) => setScLabel(e.target.value)}
          />
          <Input
            className="grow"
            placeholder="https://"
            value={scUrl}
            onChange={(e) => setScUrl(e.target.value)}
          />
          <button
            type="button"
            className="sbtn primary"
            onClick={() => {
              if (!scLabel.trim() || !scUrl.trim()) return;
              addShortcut({ label: scLabel.trim(), url: scUrl.trim() });
              setScLabel('');
              setScUrl('');
            }}
          >
            <Plus size={14} strokeWidth={1.75} /> {t('common.add')}
          </button>
        </div>
      </SettingsGroup>
    </div>
  );
}
