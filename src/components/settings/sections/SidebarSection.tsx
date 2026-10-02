import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '../../ui/Input';
import { useStore } from '../../../store';
import { SettingsGroup, SliderRow, Toggle } from '../SettingsControls';

export function SidebarSection() {
  const settings = useStore((s) => s.settings);
  const sideApps = useStore((s) => s.sideApps);
  const patchSettings = useStore((s) => s.patchSettings);
  const addSideApp = useStore((s) => s.addSideApp);
  const removeSideApp = useStore((s) => s.removeSideApp);

  const [saLabel, setSaLabel] = useState('');
  const [saUrl, setSaUrl] = useState('');

  return (
    <div className="settings-stack">
      <SettingsGroup title="Rail">
        <Toggle
          label="Pokaż sidebar"
          hint="Ctrl+B, Ctrl+Shift+M, Ctrl+Shift+G"
          on={settings.showSidebar}
          onChange={(v) =>
            patchSettings({ showSidebar: v, ...(v ? {} : { sidePanelOpen: false }) })
          }
        />
        <SliderRow
          label="Szerokość panelu aplikacji"
          value={`${settings.sidePanelWidth} px`}
          min={320}
          max={560}
          valueNum={settings.sidePanelWidth}
          disabled={!settings.showSidebar}
          onChange={(n) => patchSettings({ sidePanelWidth: n })}
        />
      </SettingsGroup>

      <SettingsGroup title="Aplikacje boczne">
        <div className="slist">
          {sideApps.map((s) => (
            <div key={s.id} className="slist-row">
              <strong>{s.label}</strong>
              <span className="grow muted mono truncate">{s.url}</span>
              <button
                type="button"
                className="icon-btn sm"
                onClick={() => removeSideApp(s.id)}
              >
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
        <div className="sform">
          <Input
            placeholder="Nazwa"
            value={saLabel}
            onChange={(e) => setSaLabel(e.target.value)}
          />
          <Input
            className="grow"
            placeholder="https://"
            value={saUrl}
            onChange={(e) => setSaUrl(e.target.value)}
          />
          <button
            type="button"
            className="sbtn primary"
            onClick={() => {
              if (!saLabel.trim() || !saUrl.trim()) return;
              addSideApp({ label: saLabel.trim(), url: saUrl.trim() });
              setSaLabel('');
              setSaUrl('');
            }}
          >
            <Plus size={14} strokeWidth={1.75} /> Dodaj
          </button>
        </div>
      </SettingsGroup>
    </div>
  );
}
