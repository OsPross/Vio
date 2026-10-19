import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { useStore } from '../../../store';
import { FieldRow, Row, SettingsDisclosure, SettingsGroup, Toggle } from '../SettingsControls';

function SitePermissionsSection() {
  const [list, setList] = useState<Record<string, Record<string, string>>>({});

  const refresh = () => {
    void window.shell?.permissionsList?.().then((l) => {
      if (l && typeof l === 'object') setList(l as Record<string, Record<string, string>>);
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  const entries = Object.entries(list);
  return (
    <SettingsGroup title="Uprawnienia stron">
      {entries.length === 0 && (
        <p className="snote">Brak zapisanych decyzji (kamera, mikrofon, lokalizacja…).</p>
      )}
      {entries.map(([origin, perms]) => (
        <div key={origin} className="slist-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="grow mono">{origin}</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {Object.entries(perms)
              .map(([k, v]) => `${k}:${v}`)
              .join(' · ')}
          </span>
          <button
            type="button"
            className="sbtn danger-text"
            onClick={() => {
              void window.shell?.permissionsRevoke?.(origin).then(() => refresh());
            }}
          >
            Cofnij
          </button>
        </div>
      ))}
      {entries.length > 0 && (
        <div className="slist-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="sbtn ghost" onClick={() => refresh()}>
            Odśwież
          </button>
        </div>
      )}
    </SettingsGroup>
  );
}

export function PrivacySection() {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const clearHistory = useStore((s) => s.clearHistory);
  const resetSettings = useStore((s) => s.resetSettings);

  const [queryCount, setQueryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void window.shell?.historyStatus?.().then((st) => {
        if (!cancelled && typeof st?.queries === 'number') setQueryCount(st.queries);
      });
    };
    refresh();
    const t = window.setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  return (
    <div className="settings-stack">
      <SettingsGroup title="Preset prywatności">
        <div className="privacy-preset-seg" role="tablist">
          {(
            [
              ['standard', 'Standardowa'],
              ['strict', 'Ścisła'],
              ['custom', 'Własna'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={settings.privacyPreset === id ? 'on' : ''}
              onClick={() => {
                if (id === 'custom') {
                  patchSettings({ privacyPreset: 'custom' });
                  return;
                }
                const preset =
                  id === 'strict'
                    ? {
                        privacyPreset: 'strict' as const,
                        adblockEnabled: true,
                        adblockNetwork: true,
                        adblockCosmetic: true,
                        adblockTrackers: true,
                        adblockUpdateLists: true,
                        privacyStripTracking: true,
                        privacySecGpc: true,
                        privacyDnt: true,
                        privacyReferrerPolicy: true,
                        privacyThirdPartyCookies: 'all' as const,
                        privacyHttpsOnly: 'block' as const,
                        privacyDoh: 'quad9' as const,
                        privacyChromeUa: true,
                        privacyWebRtc: 'disable_udp' as const,
                        privacyFingerprint: true,
                        privacySearchSuggest: false,
                      }
                    : {
                        privacyPreset: 'standard' as const,
                        adblockEnabled: true,
                        adblockNetwork: true,
                        adblockCosmetic: true,
                        adblockTrackers: true,
                        adblockUpdateLists: true,
                        privacyStripTracking: true,
                        privacySecGpc: true,
                        privacyDnt: false,
                        privacyReferrerPolicy: true,
                        privacyThirdPartyCookies: 'trackers' as const,
                        privacyHttpsOnly: 'upgrade' as const,
                        privacyDoh: 'automatic' as const,
                        privacyChromeUa: true,
                        privacyWebRtc: 'public_only' as const,
                        privacyFingerprint: false,
                        privacySearchSuggest: true,
                      };
                patchSettings(preset);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45 }}>
          Standardowa chroni przed reklamami i trackerami, ale zostawia SSO, YouTube,
          płatności i captchę. Ścisła jest mocniejsza i może psuć logowanie / banki —
          wtedy użyj tarczy lub wyjątków w ustawieniach Adblock.
        </p>
      </SettingsGroup>

      <SettingsGroup title="Ciasteczka i śledzenie">
        <FieldRow
          label="Ciasteczka stron trzecich"
          desc="Ścisła blokuje wszystkie — może psuć logowanie na niektórych stronach"
        >
          <Select
            aria-label="Ciasteczka stron trzecich"
            value={settings.privacyThirdPartyCookies}
            onChange={(v) =>
              patchSettings({
                privacyThirdPartyCookies: v as 'trackers' | 'all' | 'allow',
              })
            }
            options={[
              { value: 'trackers', label: 'Blokuj śledzące' },
              { value: 'all', label: 'Blokuj wszystkie (może psuć logowanie)' },
              { value: 'allow', label: 'Zezwalaj' },
            ]}
          />
        </FieldRow>
        <Toggle
          label="Czyść parametry śledzące z adresu"
          hint="Usuwa oznaczenia kampanii z linków; pomija banki i logowanie"
          on={settings.privacyStripTracking}
          onChange={(v) => patchSettings({ privacyStripTracking: v })}
        />
        <Toggle
          label="Wysyłaj sygnał Global Privacy Control"
          on={settings.privacySecGpc}
          onChange={(v) => patchSettings({ privacySecGpc: v })}
        />
        <Toggle
          label="Wysyłaj sygnał Do Not Track"
          hint="W trybie Ścisła — większość serwisów i tak go ignoruje"
          on={settings.privacyDnt}
          onChange={(v) => patchSettings({ privacyDnt: v })}
        />
        <Toggle
          label="Ograniczaj nagłówek Referer między stronami"
          on={settings.privacyReferrerPolicy}
          onChange={(v) => patchSettings({ privacyReferrerPolicy: v })}
        />
        <Toggle
          label="Czyść dane przy zamknięciu aplikacji"
          hint="Domyślnie wyłączone"
          on={settings.privacyClearOnQuit}
          onChange={(v) => patchSettings({ privacyClearOnQuit: v })}
        />
        {settings.privacyClearOnQuit && (
          <FieldRow
            label="Wyjątki przy czyszczeniu"
            desc="Domeny do zachowania (jedna na linię)"
          >
            <textarea
              className="stextarea"
              rows={3}
              value={(settings.privacyClearOnQuitKeep || []).join('\n')}
              onChange={(e) =>
                patchSettings({
                  privacyClearOnQuitKeep: e.target.value
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter(Boolean),
                })
              }
              spellCheck={false}
              placeholder="accounts.google.com"
            />
          </FieldRow>
        )}
      </SettingsGroup>

      <SettingsGroup title="Szyfrowanie i DNS">
        <FieldRow
          label="Tylko HTTPS"
          desc="W trybie Ścisła wymusza bezpieczne połączenie i ostrzega przy HTTP"
        >
          <Select
            aria-label="Tylko HTTPS"
            value={settings.privacyHttpsOnly}
            onChange={(v) =>
              patchSettings({
                privacyHttpsOnly: v as 'upgrade' | 'block' | 'off',
              })
            }
            options={[
              { value: 'upgrade', label: 'Podnoś do HTTPS (cichy fallback)' },
              { value: 'block', label: 'Wymagaj HTTPS (ostrzejsze)' },
              { value: 'off', label: 'Wyłączone' },
            ]}
          />
        </FieldRow>
        <FieldRow
          label="DNS przez HTTPS"
          desc="W trybie Standardowa używa bezpiecznego DNS z zapasowym serwerem"
        >
          <Select
            aria-label="DNS przez HTTPS"
            value={settings.privacyDoh}
            onChange={(v) =>
              patchSettings({
                privacyDoh: v as typeof settings.privacyDoh,
              })
            }
            options={[
              { value: 'automatic', label: 'Automatycznie (Quad9 i Cloudflare)' },
              { value: 'quad9', label: 'Quad9' },
              { value: 'cloudflare', label: 'Cloudflare' },
              { value: 'mullvad', label: 'Mullvad' },
              { value: 'nextdns', label: 'NextDNS' },
              { value: 'custom', label: 'Własny' },
              { value: 'off', label: 'Wyłączone' },
            ]}
          />
        </FieldRow>
        {settings.privacyDoh === 'custom' && (
          <FieldRow label="Własny adres DNS przez HTTPS">
            <Input
              value={settings.privacyDohCustom}
              onChange={(e) => patchSettings({ privacyDohCustom: e.target.value })}
              placeholder="https://dns.example/dns-query"
            />
          </FieldRow>
        )}
      </SettingsGroup>

      <SettingsGroup title="Fingerprinting i WebRTC">
        <Toggle
          label="User-Agent jak Chrome (bez Electron/Vio)"
          on={settings.privacyChromeUa}
          onChange={(v) => patchSettings({ privacyChromeUa: v })}
        />
        <FieldRow
          label="Obsługa adresu IP w WebRTC"
          desc="Ogranicza wyciek lokalnego adresu przy połączeniach wideo"
        >
          <Select
            aria-label="Obsługa adresu IP w WebRTC"
            value={settings.privacyWebRtc}
            onChange={(v) =>
              patchSettings({
                privacyWebRtc: v as typeof settings.privacyWebRtc,
              })
            }
            options={[
              { value: 'public_only', label: 'Tylko publiczny interfejs (Standardowa)' },
              { value: 'disable_udp', label: 'Wyłącz UDP poza proxy (Ścisła)' },
              { value: 'default', label: 'Domyślny Chromium' },
            ]}
          />
        </FieldRow>
        <Toggle
          label="Ochrona fingerprint (canvas, WebGL, CPU)"
          hint="W trybie Ścisła — może psuć captchę i banki"
          on={settings.privacyFingerprint}
          onChange={(v) => patchSettings({ privacyFingerprint: v })}
        />
        <Toggle
          label="Sugestie wyszukiwania (silnik)"
          hint="W trybie Ścisła wyłączone — tylko lokalna historia"
          on={settings.privacySearchSuggest}
          onChange={(v) => patchSettings({ privacySearchSuggest: v })}
        />
        <Toggle
          label="Zezwalaj na aktualizacje list i sieć aplikacji"
          on={settings.privacyAllowAppNetwork}
          onChange={(v) => patchSettings({ privacyAllowAppNetwork: v })}
        />
      </SettingsGroup>

      <SettingsGroup title="Wyjątki ochrony">
        <SettingsDisclosure
          title="Domeny bez tarczy"
          summary="Wyłączone z popupu tarczy w omniboxie"
          badge={settings.privacySiteExceptions?.length ?? 0}
          defaultOpen={(settings.privacySiteExceptions?.length ?? 0) > 0}
        >
          <div className="sdense">
            {(settings.privacySiteExceptions || []).map((d) => (
              <div key={d} className="sdense-row">
                <span className="sdense-label mono truncate grow">{d}</span>
                <button
                  type="button"
                  className="icon-btn sm"
                  aria-label={`Usuń wyjątek ${d}`}
                  onClick={() => {
                    patchSettings({
                      privacySiteExceptions: settings.privacySiteExceptions.filter(
                        (x) => x !== d,
                      ),
                    });
                    void window.shell?.privacyExceptionRemove?.(d);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {!settings.privacySiteExceptions?.length ? (
              <p className="snote">Brak — dodawane z tarczy przy stronie.</p>
            ) : null}
          </div>
        </SettingsDisclosure>
      </SettingsGroup>

      <SettingsGroup title="Historia przeglądania">
        <Row label="Retencja historii">
          <Select
            aria-label="Retencja historii"
            value={settings.historyRetention || '90'}
            onChange={(v) =>
              patchSettings({
                historyRetention: v as '7' | '30' | '90' | 'always' | 'off',
              })
            }
            options={[
              { value: '7', label: '7 dni' },
              { value: '30', label: '30 dni' },
              { value: '90', label: '90 dni' },
              { value: 'always', label: 'Zawsze' },
              { value: 'off', label: 'Nie zapisuj' },
            ]}
          />
        </Row>
        <Row label="Zapisane zapytania (omnibox)">
          <span className="sr-value">{queryCount}</span>
        </Row>
        <Row label="Otwórz historię">
          <button
            type="button"
            className="sbtn"
            onClick={() => {
              const st = useStore.getState();
              const tab = st.tabs.find((t) => t.id === st.activeId);
              if (tab?.mode === 'tor') {
                st.newTab('about:history');
                st.setView('browser');
                return;
              }
              st.updateTab(st.activeId, {
                url: 'about:history',
                title: 'Historia',
              });
              st.setView('browser');
            }}
          >
            about:history (Ctrl+H)
          </button>
        </Row>
        <Row label="Wyczyść dane">
          <button
            type="button"
            className="sbtn danger-text"
            onClick={() => {
              if (!confirm('Wyczyścić historię przeglądania i zapytania?')) return;
              clearHistory();
              setQueryCount(0);
            }}
          >
            Wyczyść historię
          </button>
        </Row>
      </SettingsGroup>

      <SitePermissionsSection />

      <SettingsGroup title="Reset">
        <Row label="Przywróć domyślne ustawienia, bangs i skróty">
          <button
            type="button"
            className="sbtn"
            onClick={() => {
              if (confirm('Przywrócić domyślne ustawienia, bangs i skróty?'))
                resetSettings();
            }}
          >
            Reset ustawień
          </button>
        </Row>
      </SettingsGroup>
    </div>
  );
}
