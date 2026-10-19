import { Check } from 'lucide-react';
import { ColorPicker, Segmented } from '../../ui';
import {
  THEMES,
  useStore,
  type PageColorScheme,
  type ThemeId,
  type UiDensity,
} from '../../../store';
import { Row, SettingsGroup, SliderRow, Toggle } from '../SettingsControls';

export function AppearanceSection() {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);

  return (
    <div className="settings-stack">
      <SettingsGroup title="Motyw">
        <div className="stheme-grid">
          {(Object.keys(THEMES) as ThemeId[]).map((id) => {
            const t = THEMES[id];
            const on = settings.theme === id;
            return (
              <button
                key={id}
                type="button"
                className={`stheme ${on ? 'on' : ''}`}
                onClick={() =>
                  patchSettings({
                    theme: id,
                    ...(settings.useThemeAccent ? { accent: t.accent } : {}),
                  })
                }
              >
                <span className="stheme-win" style={{ background: t.bg, color: t.fg2 }}>
                  {on && (
                    <span className="stheme-check">
                      <Check size={10} strokeWidth={2.5} />
                    </span>
                  )}
                  <span className="stheme-chrome">
                    <span className="stheme-titlebar" style={{ background: t.elev }}>
                      <i className="stheme-dot" />
                      <i className="stheme-dot" />
                      <i className="stheme-dot" />
                    </span>
                    <span className="stheme-body">
                      <span className="stheme-rail" style={{ background: t.side }} />
                      <span className="stheme-main" style={{ background: t.bg }}>
                        <span className="stheme-omnibox" style={{ background: t.fg3 }} />
                        <span className="stheme-content" style={{ background: t.elev }}>
                          <i className="stheme-accent" style={{ background: t.accent }} />
                        </span>
                      </span>
                    </span>
                  </span>
                </span>
                <span className="stheme-name">{t.label}</span>
              </button>
            );
          })}
        </div>
        <Toggle
          label="Akcent z motywu"
          hint="Wyłącz, żeby ustawić własny kolor"
          on={settings.useThemeAccent}
          onChange={(v) => {
            const t = THEMES[settings.theme];
            patchSettings({ useThemeAccent: v, ...(v ? { accent: t.accent } : {}) });
          }}
        />
        {!settings.useThemeAccent && (
          <Row label="Kolor akcentu">
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
                aria-label="Własny kolor akcentu"
              />
            </div>
          </Row>
        )}
      </SettingsGroup>

      <SettingsGroup title="Strony WWW">
        <Row
          label="Wygląd stron"
          desc="Osobno od motywu przeglądarki — ciemny chrome nie psuje jasnych witryn"
        >
          <Segmented
            value={settings.pageColorScheme || 'system'}
            options={[
              { id: 'system', label: 'System' },
              { id: 'light', label: 'Jasny' },
              { id: 'dark', label: 'Ciemny' },
            ]}
            onChange={(v) => patchSettings({ pageColorScheme: v as PageColorScheme })}
          />
        </Row>
        <Toggle
          label="Ciemne paski przewijania na stronach"
          on={settings.darkPageScrollbars}
          onChange={(v) => patchSettings({ darkPageScrollbars: v })}
        />
      </SettingsGroup>

      <SettingsGroup title="Glass i UI">
        <Toggle
          label="Efekt glass (blur + przezroczystość)"
          on={settings.uiGlass}
          onChange={(v) => patchSettings({ uiGlass: v })}
        />
        <SliderRow
          label="Siła blur"
          value={`${settings.glassBlur} px`}
          min={8}
          max={32}
          valueNum={settings.glassBlur}
          disabled={!settings.uiGlass}
          onChange={(n) => patchSettings({ glassBlur: n })}
        />
        <SliderRow
          label="Krycie szkła"
          value={`${Math.round(settings.glassOpacity * 100)}%`}
          min={25}
          max={85}
          valueNum={Math.round(settings.glassOpacity * 100)}
          disabled={!settings.uiGlass}
          onChange={(n) => patchSettings({ glassOpacity: n / 100 })}
        />
        <Toggle
          label="Płynne przejścia"
          on={settings.uiMotion}
          onChange={(v) => patchSettings({ uiMotion: v })}
        />
        <Row label="Gęstość UI">
          <Segmented
            value={settings.uiDensity}
            options={[
              { id: 'comfortable', label: 'Komfort' },
              { id: 'compact', label: 'Zwarta' },
            ]}
            onChange={(v) => patchSettings({ uiDensity: v as UiDensity })}
          />
        </Row>
      </SettingsGroup>
    </div>
  );
}
