import { Input } from '../../ui/Input';
import { useStore } from '../../../store';
import { FieldRow, Row, SettingsGroup, Toggle } from '../SettingsControls';

export function AdvancedSection() {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const resetSettings = useStore((s) => s.resetSettings);

  return (
    <div className="settings-stack">
      <SettingsGroup title="Status">
        <FieldRow label="Aktualny silnik">
          <Input readOnly value={settings.searchEngine} />
        </FieldRow>
        <FieldRow label="Proxy (normalne karty)">
          <Input readOnly value="system — Tor tylko na kartach Tor" />
        </FieldRow>
        <p className="snote">
          Skróty: <code>Ctrl+,</code> ustawienia · <code>Ctrl+B</code> sidebar ·{' '}
          <code>Ctrl+T</code> karta · <code>Ctrl+L</code> omnibox · <code>Shift+Esc</code>{' '}
          menedżer zadań.
        </p>
      </SettingsGroup>
      <SettingsGroup title="Narzędzia deweloperskie">
        <Toggle
          label="„Zbadaj element” w menu kontekstowym"
          hint="F12 / Ctrl+Shift+I zawsze otwierają DevTools. Ten przełącznik steruje tylko pozycją „Zbadaj” w PPM."
          on={settings.allowInspect}
          onChange={(v) => patchSettings({ allowInspect: v })}
        />
      </SettingsGroup>
      <SettingsGroup title="Reset">
        <Row label="Przywraca fabryczne ustawienia, bangs i skróty">
          <button
            type="button"
            className="sbtn danger-text"
            onClick={() => {
              if (confirm('Przywrócić wszystko do fabryki?')) resetSettings();
            }}
          >
            Reset wszystkiego
          </button>
        </Row>
      </SettingsGroup>
    </div>
  );
}
