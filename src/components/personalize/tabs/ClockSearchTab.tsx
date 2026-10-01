import {
  SEARCH_ENGINES,
  searchHome,
  useStore,
  type HomeClockStyle,
  type SearchEngine,
} from '../../../store';
import { letterFavicon } from '../../../lib/favicon';
import { Dropdown, Switch } from '../../ui';
import { ClockStyleCard } from '../minis/ClockStyleCard';

function SettingsRow({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="ui-settings-row">
      <div className="ui-settings-row-copy">
        <span className="ui-settings-row-title">{label}</span>
      </div>
      <Switch on={on} onChange={onChange} aria-label={label} />
    </div>
  );
}

export function ClockSearchTab({ reduced }: { reduced: boolean }) {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);

  const engineOptions = SEARCH_ENGINES.map((e) => ({
    id: e.id,
    label: e.label,
    icon: (
      <img
        src={letterFavicon(searchHome({ ...settings, searchEngine: e.id }))}
        alt=""
        width={14}
        height={14}
      />
    ),
  }));

  return (
    <div className="pz-tab-pane">
      <section className="pz-section">
        <h3>Elementy</h3>
        <div className="ui-settings-group">
          <SettingsRow
            label="Zegar"
            on={settings.homeShowClock}
            onChange={(homeShowClock) => patchSettings({ homeShowClock })}
          />
          <SettingsRow
            label="Data"
            on={settings.homeShowDate}
            onChange={(homeShowDate) => patchSettings({ homeShowDate })}
          />
          <SettingsRow
            label="Powitanie"
            on={settings.homeShowGreeting}
            onChange={(homeShowGreeting) => patchSettings({ homeShowGreeting })}
          />
          <SettingsRow
            label="Format 24h"
            on={settings.clock24h}
            onChange={(clock24h) => patchSettings({ clock24h })}
          />
          <SettingsRow
            label="Sekundy"
            on={settings.homeShowSeconds}
            onChange={(homeShowSeconds) => patchSettings({ homeShowSeconds })}
          />
        </div>
      </section>

      <section className="pz-section">
        <h3>Styl zegara</h3>
        <div className="pz-cstyle-grid">
          {(
            [
              ['thin', 'Cienki'],
              ['classic', 'Klasyczny'],
              ['mono', 'Mono'],
            ] as [HomeClockStyle, string][]
          ).map(([id, label]) => (
            <ClockStyleCard
              key={id}
              id={id}
              label={label}
              selected={settings.homeClockStyle === id}
              onSelect={() => patchSettings({ homeClockStyle: id })}
            />
          ))}
        </div>
      </section>

      <section className="pz-section">
        <h3>Wyszukiwarka</h3>
        <Dropdown
          value={settings.searchEngine}
          options={engineOptions}
          onChange={(id) => patchSettings({ searchEngine: id as SearchEngine })}
          reduced={reduced}
          aria-label="Silnik wyszukiwania"
        />
        <div className="ui-settings-group" style={{ marginTop: 12 }}>
          <SettingsRow
            label="Ikona silnika w polu"
            on={settings.homeShowEngine}
            onChange={(homeShowEngine) => patchSettings({ homeShowEngine })}
          />
          <SettingsRow
            label="Skróty"
            on={settings.homeShowApps}
            onChange={(homeShowApps) => patchSettings({ homeShowApps })}
          />
        </div>
      </section>
    </div>
  );
}
