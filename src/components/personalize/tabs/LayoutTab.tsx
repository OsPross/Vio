import {
  applyHomeLayoutPreset,
  defaultHomeWidgets,
  normalizeHomeWidgets,
  useStore,
  type HomeDensity,
  type HomeLayoutPreset,
} from '../../../store';
import { Segmented } from '../../ui';
import { useT } from '../../../i18n';
import { LayoutCard } from '../minis/LayoutCard';
import { RadiusTile } from '../minis/RadiusTile';

const RADIUS_VALUES = [0, 8, 14, 24] as const;

function nearestRadius(n: number) {
  return RADIUS_VALUES.reduce((best, r) => (Math.abs(r - n) < Math.abs(best - n) ? r : best));
}

export function LayoutTab() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const widgets = normalizeHomeWidgets(settings.homeWidgets);
  const preset = (settings.homeLayoutPreset || 'centered') as HomeLayoutPreset;
  const radius = nearestRadius(settings.homeWidgetRadius);

  const radiusOptions = [
    { value: 0, label: t('home.personalize.radiusSharp') },
    { value: 8, label: t('home.personalize.radiusSoft') },
    { value: 14, label: t('home.personalize.radiusRounded') },
    { value: 24, label: t('home.personalize.radiusFull') },
  ] as const;

  return (
    <div className="pz-tab-pane">
      <section className="pz-section">
        <h3>{t('home.personalize.layout')}</h3>
        <div className="pz-layout-grid">
          <LayoutCard
            id="centered"
            label={t('home.personalize.layoutCentered')}
            selected={preset === 'centered'}
            onSelect={() => patchSettings(applyHomeLayoutPreset('centered', widgets))}
          />
          <LayoutCard
            id="search"
            label={t('home.personalize.layoutTop')}
            selected={preset === 'top'}
            onSelect={() => patchSettings(applyHomeLayoutPreset('top', widgets))}
          />
          <LayoutCard
            id="left"
            label={t('home.personalize.layoutLeft')}
            selected={preset === 'left'}
            onSelect={() => patchSettings(applyHomeLayoutPreset('left', widgets))}
          />
          <LayoutCard
            id="custom"
            label={t('home.personalize.layoutCustom')}
            selected={preset === 'custom'}
            onSelect={() => patchSettings({ homeLayoutPreset: 'custom' })}
          />
        </div>
      </section>

      <section className="pz-section">
        <h3>{t('home.personalize.density')}</h3>
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
      </section>

      <section className="pz-section">
        <h3>{t('home.personalize.radius')}</h3>
        <div className="pz-radius-grid">
          {radiusOptions.map((r) => (
            <RadiusTile
              key={r.value}
              value={r.value}
              label={r.label}
              selected={radius === r.value}
              onSelect={() => patchSettings({ homeWidgetRadius: r.value })}
            />
          ))}
        </div>
      </section>

      <button
        type="button"
        className="pz-text-btn pz-reset"
        onClick={() => {
          if (!window.confirm(t('home.personalize.resetConfirm'))) return;
          patchSettings({
            ...applyHomeLayoutPreset('centered', []),
            homeWidgets: defaultHomeWidgets(settings),
            homeDensity: 'comfortable',
            homeWidgetRadius: 14,
            homeWidgetStyle: 'transparent',
            bgStyle: 'soft',
          });
        }}
      >
        {t('home.personalize.reset')}
      </button>
    </div>
  );
}
