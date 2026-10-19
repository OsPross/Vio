import {
  ACCENT_SWATCHES,
  THEMES,
  useStore,
  type BgStyle,
  type HomeWidgetStyle,
  type ThemeId,
} from '../../../store';
import { ColorPicker, Slider } from '../../ui';
import { useT } from '../../../i18n';
import { ThemeCard } from '../minis/ThemeCard';
import { BgStyleCard } from '../minis/BgStyleCard';
import { WidgetStyleCard } from '../minis/WidgetStyleCard';

const BG_IDS = ['soft', 'vignette', 'mesh', 'solid'] as const;

export function LookTab() {
  const t = useT();
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

  const styleOptions: [HomeWidgetStyle, string][] = [
    ['transparent', t('home.personalize.styleTransparent')],
    ['glass', t('home.personalize.styleGlass')],
    ['solid', t('home.personalize.styleSolid')],
  ];

  return (
    <div className="pz-tab-pane">
      <section className="pz-section">
        <h3>{t('home.personalize.theme')}</h3>
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
        <h3>{t('home.personalize.background')}</h3>
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
              {t('home.personalize.changeImage')}
            </button>
            <label className="pz-slider-row">
              <span>{t('home.personalize.blur')}</span>
              <Slider
                value={settings.homeBgBlur}
                min={0}
                max={40}
                onChange={(homeBgBlur) => patchSettings({ homeBgBlur })}
                aria-label={t('home.personalize.blurAria')}
              />
            </label>
            <label className="pz-slider-row">
              <span>{t('home.personalize.dim')}</span>
              <Slider
                value={settings.homeBgDim}
                min={0}
                max={80}
                onChange={(homeBgDim) => patchSettings({ homeBgDim })}
                aria-label={t('home.personalize.dimAria')}
              />
            </label>
          </div>
        )}
      </section>

      <section className="pz-section">
        <h3>{t('home.personalize.accent')}</h3>
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
            {t('home.personalize.accentFromTheme')}
          </button>
          {ACCENT_SWATCHES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`ui-swatch ${s.className} ${!settings.useThemeAccent && settings.accent === s.value ? 'on' : ''}`}
              aria-label={t('home.personalize.accentSwatch', { id: s.id })}
              onClick={() => patchSettings({ useThemeAccent: false, accent: s.value })}
            />
          ))}
          <ColorPicker
            value={settings.accent}
            onChange={(accent) => patchSettings({ useThemeAccent: false, accent })}
            aria-label={t('home.personalize.customAccentAria')}
          />
        </div>
      </section>

      <section className="pz-section">
        <h3>{t('home.personalize.widgetCardStyle')}</h3>
        <div className="pz-wstyle-grid">
          {styleOptions.map(([id, label]) => (
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
