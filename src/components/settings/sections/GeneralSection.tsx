import { Input } from '../../ui/Input';
import { useStore } from '../../../store';
import { FieldRow, SettingsGroup, Toggle } from '../SettingsControls';

export function GeneralSection() {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);

  return (
    <div className="settings-stack">
      <SettingsGroup title="Aplikacja">
        <FieldRow label="Nazwa aplikacji">
          <Input
            value={settings.appName}
            onChange={(e) => patchSettings({ appName: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="Strona startowa" desc="about:home = wbudowana strona startowa">
          <Input
            value={settings.homepage}
            onChange={(e) => patchSettings({ homepage: e.target.value })}
            placeholder="about:home"
          />
        </FieldRow>
        <FieldRow label="Placeholder omniboxa">
          <Input
            value={settings.omniboxPlaceholder}
            onChange={(e) => patchSettings({ omniboxPlaceholder: e.target.value })}
          />
        </FieldRow>
      </SettingsGroup>

      <SettingsGroup title="Pobieranie">
        <Toggle
          label="Zawsze pytaj, gdzie zapisać"
          hint="Karty Tor zawsze pytają"
          on={settings.downloadsAskWhere}
          onChange={(v) => patchSettings({ downloadsAskWhere: v })}
        />
        <FieldRow label="Folder pobierania" desc="Puste = folder Pobrane systemu">
          <Input
            value={settings.downloadsFolder || ''}
            onChange={(e) => patchSettings({ downloadsFolder: e.target.value })}
            placeholder="np. C:\\Users\\…\\Downloads"
          />
        </FieldRow>
      </SettingsGroup>

      <SettingsGroup title="Zachowanie">
        <FieldRow label="Przy starcie">
          <select
            value={settings.startupMode || 'session'}
            onChange={(e) =>
              patchSettings({
                startupMode: e.target.value as 'session' | 'newtab' | 'pages',
              })
            }
          >
            <option value="session">Otwórz poprzednie karty</option>
            <option value="newtab">Otwórz nową kartę</option>
            <option value="pages">Otwórz konkretne strony</option>
          </select>
        </FieldRow>
        {(settings.startupMode || 'session') === 'pages' && (
          <FieldRow label="Strony startowe" desc="Jedna URL na linię">
            <textarea
              rows={4}
              value={settings.startupPages || ''}
              onChange={(e) => patchSettings({ startupPages: e.target.value })}
              placeholder={'https://example.com\nhttps://wikipedia.org'}
            />
          </FieldRow>
        )}
        <Toggle
          label="Nowa karta otwiera wyszukiwarkę"
          on={settings.newTabIsSearch}
          onChange={(v) => patchSettings({ newTabIsSearch: v })}
        />
        <Toggle
          label="Szukanie z omniboxa w nowej karcie"
          on={settings.openSearchInNewTab}
          onChange={(v) => patchSettings({ openSearchInNewTab: v })}
        />
        <Toggle
          label="Linki zewnętrzne w aplikacji"
          hint="Zamiast systemowej przeglądarki"
          on={settings.openExternalInApp}
          onChange={(v) => patchSettings({ openExternalInApp: v })}
        />
        <Toggle
          label="Obraz w obrazie przy zmianie karty"
          hint="Gdy wychodzisz z karty z odtwarzanym wideo, włącz PiP (Alt+P lub ikona omniboxa). PiP pozostaje na poziomie systemu po ukryciu karty."
          on={settings.autoPipOnTabSwitch}
          onChange={(v) => patchSettings({ autoPipOnTabSwitch: v })}
        />
      </SettingsGroup>
    </div>
  );
}
