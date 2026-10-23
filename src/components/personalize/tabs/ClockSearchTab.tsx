import {
  SEARCH_ENGINES,
  searchHome,
  useStore,
  type HomeClockStyle,
  type SearchEngine,
} from '../../../store';
import { letterFavicon } from '../../../lib/favicon';
import { Dropdown, Switch } from '../../ui';
import { useT } from '../../../i18n';
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
  const t = useT();
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

  const clockStyles: [HomeClockStyle, string][] = [
    ['thin', t('home.personalize.clockThin')],
    ['classic', t('home.personalize.clockClassic')],
    ['mono', t('home.personalize.clockMono')],
  ];

  return (
    <div className="pz-tab-pane">
      <section className="pz-section">
        <h3>{t('home.personalize.elements')}</h3>
        <div className="ui-settings-group">
          <SettingsRow
            label={t('home.personalize.clock')}
            on={settings.homeShowClock}
            onChange={(homeShowClock) => patchSettings({ homeShowClock })}
          />
          <SettingsRow
            label={t('home.personalize.date')}
            on={settings.homeShowDate}
            onChange={(homeShowDate) => patchSettings({ homeShowDate })}
          />
          <SettingsRow
            label={t('home.personalize.greeting')}
            on={settings.homeShowGreeting}
            onChange={(homeShowGreeting) => patchSettings({ homeShowGreeting })}
          />
          <SettingsRow
            label={t('home.personalize.clock24h')}
            on={settings.clock24h}
            onChange={(clock24h) => patchSettings({ clock24h })}
          />
          <SettingsRow
            label={t('home.personalize.seconds')}
            on={settings.homeShowSeconds}
            onChange={(homeShowSeconds) => patchSettings({ homeShowSeconds })}
          />
        </div>
      </section>

      <section className="pz-section">
        <h3>{t('home.personalize.clockStyle')}</h3>
        <div className="pz-cstyle-grid">
          {clockStyles.map(([id, label]) => (
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
        <h3>{t('home.personalize.search')}</h3>
        <Dropdown
          value={settings.searchEngine}
          options={engineOptions}
          onChange={(id) => patchSettings({ searchEngine: id as SearchEngine })}
          reduced={reduced}
          aria-label={t('home.personalize.searchEngineAria')}
        />
        <div className="ui-settings-group" style={{ marginTop: 12 }}>
          <SettingsRow
            label={t('home.personalize.searchBar')}
            on={settings.homeShowSearch !== false}
            onChange={(homeShowSearch) => patchSettings({ homeShowSearch })}
          />
          <SettingsRow
            label={t('home.personalize.engineIcon')}
            on={settings.homeShowEngine}
            onChange={(homeShowEngine) => patchSettings({ homeShowEngine })}
          />
          <SettingsRow
            label={t('home.personalize.shortcuts')}
            on={settings.homeShowApps}
            onChange={(homeShowApps) => patchSettings({ homeShowApps })}
          />
        </div>
      </section>
    </div>
  );
}
