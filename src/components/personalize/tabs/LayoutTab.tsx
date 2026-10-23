import { AlignCenter } from 'lucide-react';
import {
  SEARCH_ENGINES,
  applyHomeLayoutPreset,
  defaultHomeWidgets,
  layoutHomeChromeCentered,
  layoutWidgetsInCenteredRow,
  normalizeHomeWidgets,
  searchHome,
  useStore,
  type HomeClockStyle,
  type HomeDensity,
  type HomeLayoutPreset,
  type SearchEngine,
} from '../../../store';
import { letterFavicon } from '../../../lib/favicon';
import { Dropdown, Segmented } from '../../ui';
import { useT } from '../../../i18n';
import { PzGroup, PzRow, PzSection, PzSwitchRow } from './PzRows';

export function LayoutTab({ reduced }: { reduced: boolean }) {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const widgets = normalizeHomeWidgets(settings.homeWidgets);
  const preset = (settings.homeLayoutPreset || 'centered') as HomeLayoutPreset;

  const centerAll = () =>
    patchSettings({
      homeChrome: layoutHomeChromeCentered(),
      homeWidgets: normalizeHomeWidgets(layoutWidgetsInCenteredRow(widgets)),
      homeLayoutPreset: 'centered',
      homeAlign: 'center',
      homeLayout: 'dashboard',
    });

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
    <>
      <PzSection title={t('home.personalize.visibility')}>
        <PzGroup>
          <PzSwitchRow
            label={t('home.personalize.showClock')}
            on={settings.homeShowClock}
            onChange={(homeShowClock) => patchSettings({ homeShowClock })}
          />
          <PzSwitchRow
            label={t('home.personalize.showSearch')}
            on={settings.homeShowSearch !== false}
            onChange={(homeShowSearch) => patchSettings({ homeShowSearch })}
          />
          <PzSwitchRow
            label={t('home.personalize.showShortcuts')}
            on={settings.homeShowApps}
            onChange={(homeShowApps) => patchSettings({ homeShowApps })}
          />
          <PzSwitchRow
            label={t('home.personalize.date')}
            on={settings.homeShowDate}
            onChange={(homeShowDate) => patchSettings({ homeShowDate })}
          />
        </PzGroup>
      </PzSection>

      <PzSection title={t('home.personalize.clock')}>
        <PzGroup>
          <PzRow label={t('home.personalize.clockFormat')}>
            <Segmented
              size="sm"
              value={settings.clock24h ? '24' : '12'}
              aria-label={t('home.personalize.clockFormat')}
              options={[
                { id: '24', label: '24h' },
                { id: '12', label: '12h' },
              ]}
              onChange={(id) => patchSettings({ clock24h: id === '24' })}
            />
          </PzRow>
          <PzRow label={t('home.personalize.clockStyle')}>
            <Segmented
              size="sm"
              value={settings.homeClockStyle}
              aria-label={t('home.personalize.clockStyle')}
              options={[
                { id: 'thin', label: t('home.personalize.clockThin') },
                { id: 'classic', label: t('home.personalize.clockClassic') },
                { id: 'mono', label: t('home.personalize.clockMono') },
              ]}
              onChange={(id) => patchSettings({ homeClockStyle: id as HomeClockStyle })}
            />
          </PzRow>
          <PzSwitchRow
            label={t('home.personalize.seconds')}
            on={settings.homeShowSeconds}
            onChange={(homeShowSeconds) => patchSettings({ homeShowSeconds })}
          />
          <PzSwitchRow
            label={t('home.personalize.greeting')}
            on={settings.homeShowGreeting}
            onChange={(homeShowGreeting) => patchSettings({ homeShowGreeting })}
          />
        </PzGroup>
      </PzSection>

      <PzSection title={t('home.personalize.search')}>
        <Dropdown
          value={settings.searchEngine}
          options={engineOptions}
          onChange={(id) => patchSettings({ searchEngine: id as SearchEngine })}
          reduced={reduced}
          aria-label={t('home.personalize.searchEngineAria')}
        />
        <PzGroup>
          <PzSwitchRow
            label={t('home.personalize.engineIcon')}
            on={settings.homeShowEngine}
            onChange={(homeShowEngine) => patchSettings({ homeShowEngine })}
          />
        </PzGroup>
      </PzSection>

      <PzSection title={t('home.personalize.layout')}>
        <Segmented
          value={preset === 'custom' ? '' : preset}
          aria-label={t('home.personalize.layout')}
          options={[
            { id: 'centered', label: t('home.personalize.layoutCentered') },
            { id: 'top', label: t('home.personalize.layoutTop') },
            { id: 'left', label: t('home.personalize.layoutLeft') },
          ]}
          onChange={(id) =>
            patchSettings(applyHomeLayoutPreset(id as 'centered' | 'top' | 'left', widgets))
          }
        />
        <Segmented
          value={settings.homeDensity}
          aria-label={t('home.personalize.density')}
          options={[
            { id: 'compact', label: t('home.personalize.densityCompact') },
            { id: 'comfortable', label: t('home.personalize.densityComfortable') },
            { id: 'spacious', label: t('home.personalize.densitySpacious') },
          ]}
          onChange={(id) => patchSettings({ homeDensity: id as HomeDensity })}
        />
        <button type="button" className="pz-wide-btn" onClick={centerAll}>
          <AlignCenter size={15} strokeWidth={1.75} />
          {t('home.personalize.centerAll')}
        </button>
        <button
          type="button"
          className="pz-link-btn"
          onClick={() => {
            if (!window.confirm(t('home.personalize.resetConfirm'))) return;
            patchSettings({
              ...applyHomeLayoutPreset('centered', []),
              homeWidgets: defaultHomeWidgets(settings),
              homeDensity: 'comfortable',
              bgStyle: 'soft',
            });
          }}
        >
          {t('home.personalize.reset')}
        </button>
      </PzSection>
    </>
  );
}
