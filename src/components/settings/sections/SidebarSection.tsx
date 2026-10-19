import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useT } from '../../../i18n';
import { Input } from '../../ui/Input';
import { useStore } from '../../../store';
import { SettingsGroup, SliderRow, Toggle } from '../SettingsControls';

export function SidebarSection() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const sideApps = useStore((s) => s.sideApps);
  const patchSettings = useStore((s) => s.patchSettings);
  const addSideApp = useStore((s) => s.addSideApp);
  const removeSideApp = useStore((s) => s.removeSideApp);

  const [saLabel, setSaLabel] = useState('');
  const [saUrl, setSaUrl] = useState('');

  return (
    <div className="settings-stack">
      <SettingsGroup title={t('settings.sidebar.rail')}>
        <Toggle
          label={t('settings.sidebar.showSidebar')}
          hint="Ctrl+B, Ctrl+Shift+M, Ctrl+Shift+G"
          on={settings.showSidebar}
          onChange={(v) =>
            patchSettings({ showSidebar: v, ...(v ? {} : { sidePanelOpen: false }) })
          }
        />
        <SliderRow
          label={t('settings.sidebar.panelWidth')}
          desc={t('settings.sidebar.panelWidthDesc')}
          value={`${settings.sidePanelWidth} px`}
          min={280}
          max={720}
          valueNum={settings.sidePanelWidth}
          disabled={!settings.showSidebar}
          onChange={(n) => patchSettings({ sidePanelWidth: n })}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.sidebar.sideApps')}>
        <div className="slist">
          {sideApps.map((s) => (
            <div key={s.id} className="slist-row">
              <div className="slist-meta">
                <span className="slist-name">{s.label}</span>
                <span className="slist-url mono truncate">{s.url}</span>
              </div>
              <button
                type="button"
                className="icon-btn sm"
                onClick={() => removeSideApp(s.id)}
                aria-label={`${t('common.remove')} ${s.label}`}
              >
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
        <div className="sform">
          <Input
            placeholder={t('settings.sidebar.name')}
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
            <Plus size={14} strokeWidth={1.75} /> {t('common.add')}
          </button>
        </div>
      </SettingsGroup>
    </div>
  );
}
