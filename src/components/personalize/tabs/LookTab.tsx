import type { CSSProperties } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ACCENT_SWATCHES, THEMES, useStore, type BgStyle, type ThemeId } from '../../../store';
import { homeBgCssUrl } from '../../../lib/homeBg';
import { ColorPicker, Segmented, Slider } from '../../ui';
import { useT } from '../../../i18n';
import { PzSection } from './PzRows';

const THEME_ORDER: ThemeId[] = [
  'paper',
  'midnight',
  'graphite',
  'slate',
  'ocean',
  'forest',
  'ember',
  'violet',
];

const BG_TILES: { id: Exclude<BgStyle, 'custom'>; key: string }[] = [
  { id: 'soft', key: 'home.personalize.bgSoft' },
  { id: 'vignette', key: 'home.personalize.bgVignette' },
  { id: 'mesh', key: 'home.personalize.bgMesh' },
  { id: 'solid', key: 'home.personalize.bgSolid' },
];

type Mode = 'light' | 'dark' | 'system';

export function LookTab() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);

  const mode: Mode = settings.themeFollowSystem
    ? 'system'
    : settings.theme === 'paper'
      ? 'light'
      : 'dark';
  const accentFor = (id: ThemeId) => (settings.useThemeAccent ? { accent: THEMES[id].accent } : {});

  const setMode = (m: Mode) => {
    if (m === 'system') {
      patchSettings({ themeFollowSystem: true });
      return;
    }
    const id: ThemeId = m === 'light' ? 'paper' : settings.themeDarkPick || 'midnight';
    patchSettings({ theme: id, ...accentFor(id) });
  };

  const pickCustomBg = async () => {
    const res = await window.shell?.homeBgPick?.();
    if (!res?.ok || !res.path) return;
    patchSettings({ bgStyle: 'custom', homeBgImage: res.path, homeBgBlur: 0, homeBgDim: 20 });
  };

  const removeCustomBg = async () => {
    await window.shell?.homeBgClear?.();
    patchSettings({ bgStyle: 'soft', homeBgImage: null });
  };

  const bgUrl = homeBgCssUrl(settings.homeBgImage);
  const customOn = settings.bgStyle === 'custom' && !!bgUrl;

  return (
    <>
      <PzSection title={t('home.personalize.mode')}>
        <Segmented
          value={mode}
          aria-label={t('home.personalize.mode')}
          options={[
            { id: 'light', label: t('home.personalize.modeLight') },
            { id: 'dark', label: t('home.personalize.modeDark') },
            { id: 'system', label: t('home.personalize.modeSystem') },
          ]}
          onChange={(id) => setMode(id as Mode)}
        />
      </PzSection>

      <PzSection title={t('home.personalize.theme')}>
        <div className="pz-themes">
          {THEME_ORDER.map((id) => {
            const th = THEMES[id];
            const on = settings.theme === id;
            return (
              <button
                key={id}
                type="button"
                className={`pz-theme${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => patchSettings({ theme: id, ...accentFor(id) })}
              >
                <span
                  className="pz-theme-tile"
                  style={
                    {
                      '--th-bg': th.bg,
                      '--th-elev': th.elev,
                      '--th-accent': th.accent,
                      '--th-line': th.line,
                    } as CSSProperties
                  }
                >
                  <i className="pz-theme-card" />
                </span>
                <span className="pz-theme-name">{th.label}</span>
              </button>
            );
          })}
        </div>
      </PzSection>

      <PzSection title={t('home.personalize.background')}>
        <div className="pz-bgs">
          {BG_TILES.map((b) => {
            const on = settings.bgStyle === b.id;
            return (
              <button
                key={b.id}
                type="button"
                className={`pz-bg${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => patchSettings({ bgStyle: b.id })}
              >
                <span className={`pz-bg-tile pz-bg-tile-${b.id}`} />
                <span className="pz-bg-name">{t(b.key)}</span>
              </button>
            );
          })}
          <button
            type="button"
            className={`pz-bg${customOn ? ' on' : ''}`}
            aria-pressed={customOn}
            onClick={() => (bgUrl ? patchSettings({ bgStyle: 'custom' }) : void pickCustomBg())}
          >
            <span
              className={`pz-bg-tile pz-bg-tile-custom${bgUrl ? ' has-img' : ''}`}
              style={bgUrl ? ({ '--pz-img': `url("${bgUrl}")` } as CSSProperties) : undefined}
            >
              {!bgUrl && <Plus size={16} strokeWidth={1.75} />}
            </span>
            <span className="pz-bg-name">{t('home.personalize.addImage')}</span>
          </button>
        </div>

        {customOn && (
          <div className="pz-wallpaper">
            <div className="pz-wallpaper-head">
              <span
                className="pz-wallpaper-thumb"
                style={{ '--pz-img': `url("${bgUrl}")` } as CSSProperties}
              />
              <button type="button" className="pz-chip" onClick={() => void pickCustomBg()}>
                {t('home.personalize.changeImage')}
              </button>
              <button
                type="button"
                className="pz-chip pz-chip-danger"
                onClick={() => void removeCustomBg()}
                aria-label={t('home.personalize.removeImage')}
                title={t('home.personalize.removeImage')}
              >
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </div>
            <label className="pz-slider">
              <span>{t('home.personalize.blur')}</span>
              <Slider
                value={settings.homeBgBlur}
                min={0}
                max={40}
                onChange={(homeBgBlur) => patchSettings({ homeBgBlur })}
                aria-label={t('home.personalize.blurAria')}
              />
            </label>
            <label className="pz-slider">
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
      </PzSection>

      <PzSection title={t('home.personalize.accent')}>
        <div className="pz-accents">
          <button
            type="button"
            className={`pz-accent-theme${settings.useThemeAccent ? ' on' : ''}`}
            onClick={() =>
              patchSettings({ useThemeAccent: true, accent: THEMES[settings.theme].accent })
            }
          >
            {t('home.personalize.accentFromTheme')}
          </button>
          {ACCENT_SWATCHES.map((s) => {
            const on = !settings.useThemeAccent && settings.accent === s.value;
            return (
              <button
                key={s.id}
                type="button"
                className={`pz-accent${on ? ' on' : ''}`}
                style={{ '--sw': s.value } as CSSProperties}
                aria-pressed={on}
                aria-label={t('home.personalize.accentSwatch', { id: s.id })}
                onClick={() => patchSettings({ useThemeAccent: false, accent: s.value })}
              />
            );
          })}
          <ColorPicker
            value={settings.accent}
            onChange={(accent) => patchSettings({ useThemeAccent: false, accent })}
            aria-label={t('home.personalize.customAccentAria')}
          />
        </div>
      </PzSection>
    </>
  );
}
