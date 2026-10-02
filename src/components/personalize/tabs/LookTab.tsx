import {
  ACCENT_SWATCHES,
  THEMES,
  useStore,
  type BgStyle,
  type HomeWidgetStyle,
  type ThemeId,
} from '../../../store';
import { Slider } from '../../ui';
import { ThemeCard } from '../minis/ThemeCard';
import { BgStyleCard } from '../minis/BgStyleCard';
import { WidgetStyleCard } from '../minis/WidgetStyleCard';

const BG_IDS = ['soft', 'vignette', 'mesh', 'solid'] as const;

export function LookTab() {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);

  const pickCustomBg = async () => {
    const res = await window.shell?.homeBgPick?.();
    if (!res?.ok || !res.path) return;
    patchSettings({
      bgStyle: 'custom',
      homeBgImage: res.path,
      homeBgBlur: 0,
      homeBgDim: 20,
    });
  };

  return (
    <div className="pz-tab-pane">
      <section className="pz-section">
        <h3>Motyw</h3>
        <div className="pz-theme-grid">
          {(Object.keys(THEMES) as ThemeId[]).map((id) => (
            <ThemeCard
              key={id}
              id={id}
              selected={settings.theme === id}
              onSelect={() =>
                patchSettings({
                  theme: id,
                  ...(settings.useThemeAccent ? { accent: THEMES[id].accent } : {}),
                })
              }
            />
          ))}
        </div>
      </section>

      <section className="pz-section">
        <h3>Tło</h3>
        <div className="pz-bg-grid">
          {BG_IDS.map((id) => (
            <BgStyleCard
              key={id}
              id={id}
              selected={settings.bgStyle === id}
              onSelect={() => patchSettings({ bgStyle: id as BgStyle })}
            />
          ))}
          <BgStyleCard
            id="custom"
            selected={settings.bgStyle === 'custom'}
            imageUrl={settings.homeBgImage}
            onSelect={() => {
              if (settings.homeBgImage) {
                patchSettings({ bgStyle: 'custom' });
              } else {
                void pickCustomBg();
              }
            }}
          />
        </div>
        {settings.bgStyle === 'custom' && (
          <div className="pz-bg-custom-controls">
            <button type="button" className="pz-text-btn" onClick={() => void pickCustomBg()}>
              Zmień obraz…
            </button>
            <label className="pz-slider-row">
              <span>Rozmycie</span>
              <Slider
                value={settings.homeBgBlur}
                min={0}
                max={40}
                onChange={(homeBgBlur) => patchSettings({ homeBgBlur })}
                aria-label="Rozmycie tła"
              />
            </label>
            <label className="pz-slider-row">
              <span>Przyciemnienie</span>
              <Slider
                value={settings.homeBgDim}
                min={0}
                max={80}
                onChange={(homeBgDim) => patchSettings({ homeBgDim })}
                aria-label="Przyciemnienie tła"
              />
            </label>
          </div>
        )}
      </section>

      <section className="pz-section">
        <h3>Akcent</h3>
        <div className="pz-accent-row">
          <button
            type="button"
            className={`pz-accent-theme ${settings.useThemeAccent ? 'on' : ''}`}
            onClick={() =>
              patchSettings({
                useThemeAccent: true,
                accent: THEMES[settings.theme].accent,
              })
            }
          >
            Z motywu
          </button>
          {ACCENT_SWATCHES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`ui-swatch ${s.className} ${!settings.useThemeAccent && settings.accent === s.value ? 'on' : ''}`}
              aria-label={`Akcent ${s.id}`}
              onClick={() => patchSettings({ useThemeAccent: false, accent: s.value })}
            />
          ))}
        </div>
      </section>

      <section className="pz-section">
        <h3>Styl kart widżetów</h3>
        <div className="pz-wstyle-grid">
          {(
            [
              ['transparent', 'Przezroczyste'],
              ['glass', 'Szkło'],
              ['solid', 'Pełne'],
            ] as [HomeWidgetStyle, string][]
          ).map(([id, label]) => (
            <WidgetStyleCard
              key={id}
              id={id}
              label={label}
              selected={settings.homeWidgetStyle === id}
              onSelect={() => patchSettings({ homeWidgetStyle: id })}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
