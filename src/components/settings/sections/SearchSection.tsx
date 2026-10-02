import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { SEARCH_ENGINES, useStore, type SearchEngine } from '../../../store';
import { FieldRow, Row, SettingsGroup, Toggle } from '../SettingsControls';

export function SearchSection() {
  const settings = useStore((s) => s.settings);
  const bangs = useStore((s) => s.bangs);
  const setView = useStore((s) => s.setView);
  const patchSettings = useStore((s) => s.patchSettings);
  const addBang = useStore((s) => s.addBang);
  const removeBang = useStore((s) => s.removeBang);

  const [bangKey, setBangKey] = useState('');
  const [bangLabel, setBangLabel] = useState('');
  const [bangUrl, setBangUrl] = useState('');

  const engineMeta = SEARCH_ENGINES.find((e) => e.id === settings.searchEngine);

  return (
    <div className="settings-stack">
      <SettingsGroup title="Silnik domyślny">
        <Row label="Silnik">
          <Select
            aria-label="Silnik wyszukiwania"
            value={settings.searchEngine}
            onChange={(v) => patchSettings({ searchEngine: v as SearchEngine })}
            groups={[
              {
                label: 'Web',
                options: SEARCH_ENGINES.filter((e) => e.group === 'web').map((e) => ({
                  value: e.id,
                  label: e.label,
                })),
              },
              {
                label: 'Prywatność',
                options: SEARCH_ENGINES.filter((e) => e.group === 'privacy').map((e) => ({
                  value: e.id,
                  label: e.label,
                })),
              },
              {
                label: 'Onion / darknet (clearnet)',
                options: SEARCH_ENGINES.filter((e) => e.group === 'onion').map((e) => ({
                  value: e.id,
                  label: e.label,
                })),
              },
              {
                label: 'Lokalne / własne',
                options: SEARCH_ENGINES.filter(
                  (e) => e.group === 'local' || e.group === 'custom',
                ).map((e) => ({
                  value: e.id,
                  label: e.label,
                })),
              },
            ]}
          />
        </Row>
        {engineMeta?.hint && <p className="snote">{engineMeta.hint}</p>}
        {settings.searchEngine === 'searx' && (
          <FieldRow label="URL SearXNG">
            <Input
              value={settings.searxUrl}
              onChange={(e) => patchSettings({ searxUrl: e.target.value })}
              placeholder="http://127.0.0.1:8080"
            />
          </FieldRow>
        )}
        {settings.searchEngine === 'custom' && (
          <FieldRow
            label="Własny URL wyszukiwania"
            desc="Użyj %s jako placeholder zapytania"
          >
            <Input
              value={settings.customSearchUrl}
              onChange={(e) => patchSettings({ customSearchUrl: e.target.value })}
              placeholder="https://example.com/search?q=%s"
            />
          </FieldRow>
        )}
      </SettingsGroup>

      <SettingsGroup title="Tryb Tor">
        <p className="tor-settings-note">
          <strong>Tryb Tor</strong> ukrywa IP i izoluje sesję (osobna partycja w pamięci,
          bez wspólnych ciasteczek z normalnymi kartami).{' '}
          <strong>To nie jest Tor Browser</strong> — nie daje takiej ochrony przed
          fingerprintingiem. Do spraw wrażliwych używaj oficjalnego Tor Browsera. Nie
          nazywamy tego trybu „anonimowym”.
        </p>
        <p className="tor-settings-note" style={{ marginTop: 8 }}>
          Na tym PC: <strong>Tor Browser</strong> (pulpit) do spraw wrażliwych oraz
          opcjonalny lokalny daemon SOCKS (<code>127.0.0.1:9050</code> / wbudowany Expert
          Bundle na <code>19050</code>). Autostart daemona w Windows jest{' '}
          <strong>wyłączony domyślnie</strong>.
        </p>
        <FieldRow
          label="Preferowany SOCKS"
          desc="Port 9050 to daemon systemowy, 9150 Tor Browser, 19050 wbudowany Expert Bundle"
        >
          <Input
            value={settings.torProxyUrl}
            onChange={(e) => patchSettings({ torProxyUrl: e.target.value })}
            placeholder="socks5://127.0.0.1:9050"
          />
        </FieldRow>
        <Toggle
          label="Autostart daemona Tor (Windows)"
          hint="Skrót w folderze Autostart — tylko jeśli świadomie włączysz. Domyślnie wyłączone."
          on={settings.torDaemonAutostart}
          onChange={(v) => {
            patchSettings({ torDaemonAutostart: v });
            void window.shell
              ?.torDaemonAutostart?.(v)
              .then((r: { ok?: boolean; error?: string }) => {
                if (r && r.ok === false && v) {
                  patchSettings({ torDaemonAutostart: false });
                  window.alert(r.error || 'Nie udało się włączyć autostartu Tora');
                }
              });
          }}
        />
        <Row
          label="Otwórz kartę Tor"
          desc="Ctrl+Shift+N — fail-closed jeśli Tor nie wstanie"
        >
          <button
            type="button"
            className="sbtn primary"
            onClick={() => {
              setView('browser');
              window.dispatchEvent(new CustomEvent('djxxr-open-tor'));
            }}
          >
            Nowa karta Tor
          </button>
        </Row>
        <FieldRow
          label="Mosty (wbudowany Tor)"
          desc="Bez Moat — wbudowana lista z Tor Browser albo własne linie. Zmiana restartuje daemona."
        >
          <Select
            aria-label="Mosty Tor"
            value={settings.torBridgeMode}
            onChange={(v) => {
              const mode = v as typeof settings.torBridgeMode;
              patchSettings({ torBridgeMode: mode });
              void window.shell?.torBridges?.({
                mode,
                customLines:
                  mode === 'custom'
                    ? settings.torBridgeLines
                        .split(/\r?\n/)
                        .map((l) => l.trim())
                        .filter(Boolean)
                    : undefined,
              });
            }}
            options={[
              { value: 'none', label: 'Bez mostów (domyślnie)' },
              { value: 'obfs4', label: 'obfs4 (wbudowane)' },
              { value: 'snowflake', label: 'Snowflake' },
              { value: 'meek', label: 'meek' },
              { value: 'custom', label: 'Własne mosty' },
            ]}
          />
        </FieldRow>
        {settings.torBridgeMode === 'custom' && (
          <FieldRow
            label="Linie mostów"
            desc="Jeden most na linię (obfs4 / snowflake / meek_lite)"
          >
            <textarea
              rows={5}
              value={settings.torBridgeLines}
              onChange={(e) => patchSettings({ torBridgeLines: e.target.value })}
              onBlur={() => {
                void window.shell?.torBridges?.({
                  mode: 'custom',
                  customLines: settings.torBridgeLines
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter(Boolean),
                });
              }}
              placeholder={'obfs4 IP:PORT FINGERPRINT cert=… iat-mode=0'}
              spellCheck={false}
              style={{
                width: '100%',
                fontFamily: 'var(--mono, monospace)',
                fontSize: 12,
              }}
            />
          </FieldRow>
        )}
        <p
          className="muted"
          style={{ margin: '8px 2px 0', fontSize: 12, lineHeight: 1.4 }}
        >
          DNS: Chromium przy SOCKS5 wysyła hostname do proxy (≈ socks5h). Nowa tożsamość:
          Ctrl+Shift+U — zamyka karty Tor, wipe sesji, SIGNAL NEWNYM. Izolacja SOCKS Auth
          per domena niedostępna w Electron.
        </p>
      </SettingsGroup>

      <SettingsGroup title="Podpowiedzi">
        <Toggle
          label="Podpowiedzi z historii"
          on={settings.suggestHistory}
          onChange={(v) => patchSettings({ suggestHistory: v })}
        />
        <Toggle
          label="Podpowiadaj bangs przy !"
          on={settings.suggestBangs}
          onChange={(v) => patchSettings({ suggestBangs: v })}
        />
      </SettingsGroup>

      <SettingsGroup title="Bangs">
        <div className="slist">
          {bangs.map((b) => (
            <div key={b.key} className="slist-row">
              <code>!{b.key}</code>
              <span className="grow">{b.label}</span>
              <span className="muted mono truncate">{b.url}</span>
              <button
                type="button"
                className="icon-btn sm"
                onClick={() => removeBang(b.key)}
                title="Usuń"
              >
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
        <div className="sform">
          <Input
            placeholder="klucz"
            value={bangKey}
            onChange={(e) => setBangKey(e.target.value)}
          />
          <Input
            placeholder="nazwa"
            value={bangLabel}
            onChange={(e) => setBangLabel(e.target.value)}
          />
          <Input
            className="grow"
            placeholder="https://…?q=%s"
            value={bangUrl}
            onChange={(e) => setBangUrl(e.target.value)}
          />
          <button
            type="button"
            className="sbtn primary"
            onClick={() => {
              if (!bangKey.trim() || !bangUrl.includes('%s')) return;
              addBang({
                key: bangKey.trim(),
                label: bangLabel.trim() || bangKey,
                url: bangUrl.trim(),
              });
              setBangKey('');
              setBangLabel('');
              setBangUrl('');
            }}
          >
            <Plus size={14} strokeWidth={1.75} /> Dodaj
          </button>
        </div>
      </SettingsGroup>
    </div>
  );
}
