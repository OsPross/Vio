import {
  applyHomeLayoutPreset,
  defaultHomeWidgets,
  normalizeHomeWidgets,
  useStore,
  type HomeDensity,
  type HomeLayoutPreset,
} from '../../../store';
import { Segmented } from '../../ui';
import { LayoutCard } from '../minis/LayoutCard';
import { RadiusTile } from '../minis/RadiusTile';

const RADIUS = [
  { value: 0, label: 'Ostre' },
  { value: 8, label: 'Delikatne' },
  { value: 14, label: 'Zaokrąglone' },
  { value: 24, label: 'Pełne' },
] as const;

function nearestRadius(n: number) {
  return RADIUS.reduce((best, r) =>
    Math.abs(r.value - n) < Math.abs(best.value - n) ? r : best,
  ).value;
}

export function LayoutTab() {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const widgets = normalizeHomeWidgets(settings.homeWidgets);
  const preset = (settings.homeLayoutPreset || 'centered') as HomeLayoutPreset;
  const radius = nearestRadius(settings.homeWidgetRadius);

  return (
    <div className="pz-tab-pane">
      <section className="pz-section">
        <h3>Układ</h3>
        <div className="pz-layout-grid">
          <LayoutCard
            id="centered"
            label="Wyśrodkowany"
            selected={preset === 'centered'}
            onSelect={() => patchSettings(applyHomeLayoutPreset('centered', widgets))}
          />
          <LayoutCard
            id="search"
            label="Na górze"
            selected={preset === 'top'}
            onSelect={() => patchSettings(applyHomeLayoutPreset('top', widgets))}
          />
          <LayoutCard
            id="left"
            label="Do lewej"
            selected={preset === 'left'}
            onSelect={() => patchSettings(applyHomeLayoutPreset('left', widgets))}
          />
          <LayoutCard
            id="custom"
            label="Własny"
            selected={preset === 'custom'}
            onSelect={() => patchSettings({ homeLayoutPreset: 'custom' })}
          />
        </div>
      </section>

      <section className="pz-section">
        <h3>Gęstość</h3>
        <Segmented
          value={settings.homeDensity}
          aria-label="Gęstość"
          options={[
            { id: 'compact', label: 'Kompaktowa' },
            { id: 'comfortable', label: 'Normalna' },
            { id: 'spacious', label: 'Przestronna' },
          ]}
          onChange={(id) => patchSettings({ homeDensity: id as HomeDensity })}
        />
      </section>

      <section className="pz-section">
        <h3>Zaokrąglenie</h3>
        <div className="pz-radius-grid">
          {RADIUS.map((r) => (
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
          if (!window.confirm('Przywrócić domyślny układ i widżety strony startowej?')) return;
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
        Przywróć domyślne
      </button>
    </div>
  );
}
