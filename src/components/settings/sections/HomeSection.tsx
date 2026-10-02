import { Segmented } from '../../ui';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import {
  migrateHomeWidgets,
  normalizeHomeWidgets,
  useStore,
  type BgStyle,
  type HomeAlign,
  type HomeDensity,
  type HomeLayout,
  type HomeAppsStyle,
} from '../../../store';
import { FieldRow, Row, SettingsGroup, Toggle } from '../SettingsControls';

export function HomeSection() {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);

  return (
    <div className="settings-stack">
      <SettingsGroup title="Teksty">
        <FieldRow label="Nagłówek" desc="Puste = powitanie według godziny">
          <Input
            value={settings.homeHeadline}
            onChange={(e) => patchSettings({ homeHeadline: e.target.value })}
            placeholder="np. Do roboty"
          />
        </FieldRow>
        <FieldRow label="Podtytuł" desc="Puste = info o silniku">
          <Input
            value={settings.homeSubline}
            onChange={(e) => patchSettings({ homeSubline: e.target.value })}
            placeholder="Opcjonalnie"
          />
        </FieldRow>
        <FieldRow label="Placeholder w polu szukania">
          <Input
            value={settings.homePlaceholder}
            onChange={(e) => patchSettings({ homePlaceholder: e.target.value })}
          />
        </FieldRow>
      </SettingsGroup>

      <SettingsGroup title="Układ">
        <Row label="Układ">
          <Select
            aria-label="Układ strony startowej"
            value={settings.homeLayout}
            onChange={(v) => patchSettings({ homeLayout: v as HomeLayout })}
            options={[
              { value: 'dashboard', label: 'Wyśrodkowany' },
              { value: 'minimal', label: 'Tylko szukaj' },
              { value: 'stack', label: 'Do lewej' },
              { value: 'split', label: 'Dwie kolumny' },
            ]}
          />
        </Row>
        <Row label="Wyrównanie">
          <Segmented
            value={settings.homeAlign}
            options={[
              { id: 'left', label: 'Lewa' },
              { id: 'center', label: 'Środek' },
            ]}
            onChange={(v) => patchSettings({ homeAlign: v as HomeAlign })}
          />
        </Row>
        <Row label="Gęstość">
          <Segmented
            value={settings.homeDensity}
            options={[
              { id: 'compact', label: 'Kompaktowa' },
              { id: 'comfortable', label: 'Normalna' },
              { id: 'spacious', label: 'Przestronna' },
            ]}
            onChange={(v) => patchSettings({ homeDensity: v as HomeDensity })}
          />
        </Row>
        <Row label="Styl skrótów">
          <Segmented
            value={settings.homeAppsStyle}
            options={[
              { id: 'icons', label: 'Ikony' },
              { id: 'list', label: 'Lista' },
            ]}
            onChange={(v) => patchSettings({ homeAppsStyle: v as HomeAppsStyle })}
          />
        </Row>
        <Row label="Tło home">
          <Select
            aria-label="Tło strony startowej"
            value={settings.bgStyle}
            onChange={(v) => patchSettings({ bgStyle: v as BgStyle })}
            options={[
              { value: 'solid', label: 'Jednolite' },
              { value: 'soft', label: 'Delikatny gradient' },
              { value: 'panel', label: 'Panel' },
              { value: 'mesh', label: 'Mesh (głębia)' },
              { value: 'vignette', label: 'Winieta' },
            ]}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Elementy">
        <Toggle
          label="Powitanie (gdy brak własnego nagłówka)"
          on={settings.homeShowGreeting}
          onChange={(v) => patchSettings({ homeShowGreeting: v })}
        />
        <Toggle
          label="Zegar"
          on={settings.homeShowClock}
          onChange={(v) => patchSettings({ homeShowClock: v })}
        />
        <Toggle
          label="Data"
          on={settings.homeShowDate}
          onChange={(v) => patchSettings({ homeShowDate: v })}
        />
        <Toggle
          label="Zegar 24h"
          on={settings.clock24h}
          onChange={(v) => patchSettings({ clock24h: v })}
        />
        <Toggle
          label="Nazwa aplikacji"
          on={settings.homeShowBrand}
          onChange={(v) => patchSettings({ homeShowBrand: v })}
        />
        <Toggle
          label="Nazwa silnika"
          on={settings.homeShowEngine}
          onChange={(v) => patchSettings({ homeShowEngine: v })}
        />
        <Toggle
          label="Skróty / aplikacje"
          on={settings.homeShowApps}
          onChange={(v) => patchSettings({ homeShowApps: v })}
        />
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
          Ostatnie / notatki / zasoby — dodaj widżet z FAB na stronie startowej (lub
          poniżej).
        </p>
        <Toggle
          label="Widżet: ostatnio odwiedzone"
          on={settings.homeWidgets.some((w) => w.type === 'recent')}
          onChange={(v) => {
            const cur = settings.homeWidgets.length
              ? normalizeHomeWidgets(settings.homeWidgets)
              : migrateHomeWidgets(settings);
            patchSettings({
              homeShowRecent: v,
              homeWidgets: v
                ? cur.some((w) => w.type === 'recent')
                  ? cur
                  : [
                      ...cur,
                      {
                        id: `w-${Date.now().toString(36)}`,
                        type: 'recent',
                        size: 'M',
                        anchor: 'center',
                        x: 0,
                        y: 2,
                        settings: {},
                      },
                    ]
                : cur.filter((w) => w.type !== 'recent'),
            });
          }}
        />
        <Toggle
          label="Widżet: notatki"
          on={settings.homeWidgets.some((w) => w.type === 'notes')}
          onChange={(v) => {
            const cur = settings.homeWidgets.length
              ? normalizeHomeWidgets(settings.homeWidgets)
              : migrateHomeWidgets(settings);
            patchSettings({
              homeShowNotes: v,
              homeWidgets: v
                ? cur.some((w) => w.type === 'notes')
                  ? cur
                  : [
                      ...cur,
                      {
                        id: `w-${Date.now().toString(36)}`,
                        type: 'notes',
                        size: 'M',
                        anchor: 'center',
                        x: 0,
                        y: 2,
                        settings: {},
                      },
                    ]
                : cur.filter((w) => w.type !== 'notes'),
            });
          }}
        />
        <Toggle
          label="Widżet: zasoby systemu"
          hint="CPU / RAM — próbkowanie tylko gdy widoczny"
          on={settings.homeWidgets.some((w) => w.type === 'resources')}
          onChange={(v) => {
            const cur = settings.homeWidgets.length
              ? normalizeHomeWidgets(settings.homeWidgets)
              : migrateHomeWidgets(settings);
            patchSettings({
              homeShowStats: v,
              homeWidgets: v
                ? cur.some((w) => w.type === 'resources')
                  ? cur
                  : [
                      ...cur,
                      {
                        id: `w-${Date.now().toString(36)}`,
                        type: 'resources',
                        size: 'M',
                        anchor: 'center',
                        x: 0,
                        y: 2,
                        settings: {},
                      },
                    ]
                : cur.filter((w) => w.type !== 'resources'),
            });
          }}
        />
        <Toggle
          label="Bangs w podpowiedziach (!yt…)"
          on={settings.homeShowBangs}
          onChange={(v) => patchSettings({ homeShowBangs: v, suggestBangs: v })}
        />
      </SettingsGroup>
    </div>
  );
}
