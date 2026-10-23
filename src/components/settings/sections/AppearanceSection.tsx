import { Check } from 'lucide-react';
import { useT } from '../../../i18n';
import { playSample } from '../../../hooks/useUiSounds';
import { configureSounds } from '../../../utils/soundEffects';
import { ColorPicker, Segmented } from '../../ui';
import {
  THEMES,
  useStore,
  type BookmarksBarMode,
  type PageColorScheme,
  type Settings,
  type SoundProfile,
  type ThemeId,
  type UiDensity,
} from '../../../store';
import { Row, SettingsGroup, SliderRow, Toggle } from '../SettingsControls';

function configureSoundsForPreview(settings: Settings) {
  configureSounds({
    profile: (settings.soundProfile || 'ios') as SoundProfile,
    volume: typeof settings.soundVolume === 'number' ? settings.soundVolume : 55,
    typing: true,
    tabs: true,
    ui: true,
    downloads: true,
  });
}

export function AppearanceSection() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);

  return (
    <div className="settings-stack">
      <SettingsGroup title={t('settings.look.theme')}>
        <div className="stheme-grid">
          {(Object.keys(THEMES) as ThemeId[]).map((id) => {
            const theme = THEMES[id];
            const on = settings.theme === id;
            return (
              <button
                key={id}
                type="button"
                className={`stheme ${on ? 'on' : ''}`}
                onClick={() =>
                  patchSettings({
                    theme: id,
                    ...(settings.useThemeAccent ? { accent: theme.accent } : {}),
                  })
                }
              >
                <span className="stheme-win" style={{ background: theme.bg, color: theme.fg2 }}>
                  {on && (
                    <span className="stheme-check">
                      <Check size={10} strokeWidth={2.5} />
                    </span>
                  )}
                  <span className="stheme-chrome">
                    <span className="stheme-titlebar" style={{ background: theme.elev }}>
                      <i className="stheme-dot" />
                      <i className="stheme-dot" />
                      <i className="stheme-dot" />
                    </span>
                    <span className="stheme-body">
                      <span className="stheme-rail" style={{ background: theme.side }} />
                      <span className="stheme-main" style={{ background: theme.bg }}>
                        <span className="stheme-omnibox" style={{ background: theme.fg3 }} />
                        <span className="stheme-content" style={{ background: theme.elev }}>
                          <i className="stheme-accent" style={{ background: theme.accent }} />
                        </span>
                      </span>
                    </span>
                  </span>
                </span>
                <span className="stheme-name">{theme.label}</span>
              </button>
            );
          })}
        </div>
        <Toggle
          label={t('settings.look.themeAccent')}
          on={settings.useThemeAccent}
          onChange={(v) => {
            const theme = THEMES[settings.theme];
            patchSettings({ useThemeAccent: v, ...(v ? { accent: theme.accent } : {}) });
          }}
        />
        {!settings.useThemeAccent && (
          <Row label={t('settings.look.accentColor')}>
            <div className="sswatches">
              {[
                '#6b9eff',
                '#e8eaef',
                '#7dcea0',
                '#e7a067',
                '#c39bd3',
                '#5dade2',
                '#f1948a',
                '#85929e',
                '#4db6e2',
                '#b388ff',
              ].map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`sswatch ${settings.accent === c ? 'on' : ''}`}
                  style={{ background: c }}
                  onClick={() => patchSettings({ accent: c })}
                />
              ))}
              <ColorPicker
                value={settings.accent}
                onChange={(accent) => patchSettings({ accent })}
                aria-label={t('settings.look.customAccentAria')}
              />
            </div>
          </Row>
        )}
      </SettingsGroup>

      <SettingsGroup title={t('settings.look.bookmarksBar')}>
        <Row label={t('settings.look.bookmarksBarMode')}>
          <Segmented
            value={settings.bookmarksBarMode || 'never'}
            options={[
              { id: 'always', label: t('settings.look.bookmarksBarAlways') },
              { id: 'newtab', label: t('settings.look.bookmarksBarNewtab') },
              { id: 'never', label: t('settings.look.bookmarksBarNever') },
            ]}
            onChange={(v) =>
              patchSettings({
                bookmarksBarMode: v as BookmarksBarMode,
                showBookmarksBar: v !== 'never',
              })
            }
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('settings.look.pages')}>
        <Row label={t('settings.look.pageAppearance')} desc={t('settings.look.pageAppearanceDesc')}>
          <Segmented
            value={settings.pageColorScheme || 'system'}
            options={[
              { id: 'system', label: t('settings.look.system') },
              { id: 'light', label: t('settings.look.light') },
              { id: 'dark', label: t('settings.look.dark') },
            ]}
            onChange={(v) => patchSettings({ pageColorScheme: v as PageColorScheme })}
          />
        </Row>
        <Toggle
          label={t('settings.look.darkScrollbars')}
          on={settings.darkPageScrollbars}
          onChange={(v) => patchSettings({ darkPageScrollbars: v })}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.look.sounds')}>
        <Toggle
          label={t('settings.look.soundsEnable')}
          hint={t('settings.look.soundsEnableHint')}
          on={!!settings.uiSoundsEnabled}
          onChange={(v) => patchSettings({ uiSoundsEnabled: v })}
        />
        <Row label={t('settings.look.soundProfile')}>
          <Segmented
            value={settings.soundProfile || 'ios'}
            options={[
              { id: 'ios', label: t('settings.look.soundIos') },
              { id: 'tactile', label: t('settings.look.soundTactile') },
              { id: 'minimal', label: t('settings.look.soundMinimal') },
            ]}
            onChange={(v) => patchSettings({ soundProfile: v as SoundProfile })}
          />
        </Row>
        <Row label={t('settings.look.soundPreview')}>
          <button
            type="button"
            className="sbtn"
            onClick={() => {
              configureSoundsForPreview(settings);
              playSample();
            }}
          >
            {t('settings.look.soundPreviewBtn')}
          </button>
        </Row>
        <SliderRow
          label={t('settings.look.soundVolume')}
          value={`${Math.round(settings.soundVolume ?? 55)}%`}
          min={0}
          max={100}
          valueNum={Math.round(settings.soundVolume ?? 55)}
          disabled={!settings.uiSoundsEnabled}
          onChange={(n) => patchSettings({ soundVolume: n })}
        />
        <Toggle
          label={t('settings.look.soundTyping')}
          on={settings.soundTyping !== false}
          onChange={(v) => patchSettings({ soundTyping: v })}
        />
        <Toggle
          label={t('settings.look.soundTabs')}
          on={settings.soundTabs !== false}
          onChange={(v) => patchSettings({ soundTabs: v })}
        />
        <Toggle
          label={t('settings.look.soundUi')}
          on={settings.soundUi !== false}
          onChange={(v) => patchSettings({ soundUi: v })}
        />
        <Toggle
          label={t('settings.look.soundDownloads')}
          on={settings.soundDownloads !== false}
          onChange={(v) => patchSettings({ soundDownloads: v })}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.look.glassUi')}>
        <Toggle
          label={t('settings.look.glassEffect')}
          on={settings.uiGlass}
          onChange={(v) => patchSettings({ uiGlass: v })}
        />
        <SliderRow
          label={t('settings.look.glassBlur')}
          value={`${settings.glassBlur} px`}
          min={8}
          max={32}
          valueNum={settings.glassBlur}
          disabled={!settings.uiGlass}
          onChange={(n) => patchSettings({ glassBlur: n })}
        />
        <SliderRow
          label={t('settings.look.glassOpacity')}
          value={`${Math.round(settings.glassOpacity * 100)}%`}
          min={25}
          max={85}
          valueNum={Math.round(settings.glassOpacity * 100)}
          disabled={!settings.uiGlass}
          onChange={(n) => patchSettings({ glassOpacity: n / 100 })}
        />
        <Toggle
          label={t('settings.look.uiMotion')}
          on={settings.uiMotion}
          onChange={(v) => patchSettings({ uiMotion: v })}
        />
        <Row label={t('settings.look.uiDensity')}>
          <Segmented
            value={settings.uiDensity}
            options={[
              { id: 'comfortable', label: t('settings.look.uiDensityComfortable') },
              { id: 'compact', label: t('settings.look.uiDensityCompact') },
            ]}
            onChange={(v) => patchSettings({ uiDensity: v as UiDensity })}
          />
        </Row>
      </SettingsGroup>
    </div>
  );
}
