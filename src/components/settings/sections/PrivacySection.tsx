import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Input } from '../../ui/Input';
import { useStore } from '../../../store';
import { FieldRow, Row, SettingsGroup, Toggle } from '../SettingsControls';

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
          wtedy użyj tarczy: „Wyłącz ochronę dla tej strony”.
        </p>
      </SettingsGroup>

      <SettingsGroup title="Blokada reklam i trackerów">
        <Toggle
          label="Włącz blokadę"
          hint="EasyList, EasyPrivacy, uBlock, Peter Lowe (Ghostery) · Standardowa + Ścisła"
          on={settings.adblockEnabled}
          onChange={(v) => patchSettings({ adblockEnabled: v })}
        />
        <Toggle
          label="Aktualizuj listy filtrów (1×/dzień)"
          hint="Pobiera listy z internetu — jedyne zapytanie sieciowe ochrony"
          on={settings.adblockUpdateLists}
          onChange={(v) => patchSettings({ adblockUpdateLists: v })}
        />
        <Toggle
          label="Blokuj żądania reklam"
          on={settings.adblockNetwork}
          onChange={(v) => patchSettings({ adblockNetwork: v })}
        />
        <Toggle
          label="Blokuj trackery"
          on={settings.adblockTrackers}
          onChange={(v) => patchSettings({ adblockTrackers: v })}
        />
        <Toggle
          label="Filtry kosmetyczne (CSS)"
          on={settings.adblockCosmetic}
          onChange={(v) => patchSettings({ adblockCosmetic: v })}
        />
        <FieldRow label="Własne reguły" desc="Jedna na linię">
          <textarea
            className="stextarea"
            rows={4}
            value={settings.adblockCustomRules}
            onChange={(e) => patchSettings({ adblockCustomRules: e.target.value })}
            spellCheck={false}
          />
        </FieldRow>
      </SettingsGroup>

      <SettingsGroup title="Ciasteczka i śledzenie">
        <FieldRow
          label="Ciasteczka stron trzecich"
          desc="trackers = Standardowa · all = Ścisła (może psuć SSO)"
        >
          <select
            value={settings.privacyThirdPartyCookies}
            onChange={(e) =>
              patchSettings({
                privacyThirdPartyCookies: e.target.value as 'trackers' | 'all' | 'allow',
              })
            }
          >
            <option value="trackers">Tylko trackery</option>
            <option value="all">Wszystkie 3P</option>
            <option value="allow">Zezwalaj</option>
          </select>
        </FieldRow>
        <Toggle
          label="Czyść parametry śledzące z URL"
          hint="utm_*, fbclid, gclid… · omija banki/logowanie"
          on={settings.privacyStripTracking}
          onChange={(v) => patchSettings({ privacyStripTracking: v })}
        />
        <Toggle
          label="Sec-GPC: 1"
          on={settings.privacySecGpc}
          onChange={(v) => patchSettings({ privacySecGpc: v })}
        />
        <Toggle
          label="DNT: 1"
          hint="Tylko Ścisła — większość serwisów i tak ignoruje"
          on={settings.privacyDnt}
          onChange={(v) => patchSettings({ privacyDnt: v })}
        />
        <Toggle
          label="Referer: strict-origin-when-cross-origin"
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
          label="HTTPS-Only"
          desc="upgrade = Standardowa · block = Ścisła (ostrzeżenie)"
        >
          <select
            value={settings.privacyHttpsOnly}
            onChange={(e) =>
              patchSettings({
                privacyHttpsOnly: e.target.value as 'upgrade' | 'block' | 'off',
              })
            }
          >
            <option value="upgrade">Podnoś do HTTPS (cichy fallback)</option>
            <option value="block">Wymagaj HTTPS (ostrzejsze)</option>
            <option value="off">Wyłączone</option>
          </select>
        </FieldRow>
        <FieldRow
          label="DNS over HTTPS"
          desc="automatic = Standardowa (fallback firmowy/hotel)"
        >
          <select
            value={settings.privacyDoh}
            onChange={(e) =>
              patchSettings({
                privacyDoh: e.target.value as typeof settings.privacyDoh,
              })
            }
          >
            <option value="automatic">Automatic (Quad9 + Cloudflare)</option>
            <option value="quad9">Quad9 (secure)</option>
            <option value="cloudflare">Cloudflare</option>
            <option value="mullvad">Mullvad</option>
            <option value="nextdns">NextDNS</option>
            <option value="custom">Własny</option>
            <option value="off">Wyłączone</option>
          </select>
        </FieldRow>
        {settings.privacyDoh === 'custom' && (
          <FieldRow label="Własny DoH URL">
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
        <FieldRow label="WebRTC IP handling">
          <select
            value={settings.privacyWebRtc}
            onChange={(e) =>
              patchSettings({
                privacyWebRtc: e.target.value as typeof settings.privacyWebRtc,
              })
            }
          >
            <option value="public_only">Tylko publiczny interfejs (Standardowa)</option>
            <option value="disable_udp">Wyłącz non-proxied UDP (Ścisła)</option>
            <option value="default">Domyślny Chromium</option>
          </select>
        </FieldRow>
        <Toggle
          label="Ochrona fingerprint (canvas/WebGL/CPU)"
          hint="Ścisła / ręcznie — może psuć captchę i banki"
          on={settings.privacyFingerprint}
          onChange={(v) => patchSettings({ privacyFingerprint: v })}
        />
        <Toggle
          label="Sugestie wyszukiwania (silnik)"
          hint="Ścisła: wyłączone — tylko lokalna historia"
          on={settings.privacySearchSuggest}
          onChange={(v) => patchSettings({ privacySearchSuggest: v })}
        />
        <Toggle
          label="Zezwalaj na aktualizacje list / DoH sieci aplikacji"
          on={settings.privacyAllowAppNetwork}
          onChange={(v) => patchSettings({ privacyAllowAppNetwork: v })}
        />
      </SettingsGroup>

      <SettingsGroup title="Wyjątki ochrony">
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
          Domeny z wyłączoną ochroną (tarcza w omniboxie).
        </p>
        <div className="slist">
          {(settings.privacySiteExceptions || []).map((d) => (
            <div key={d} className="slist-row">
              <span className="grow">{d}</span>
              <button
                type="button"
                className="icon-btn sm"
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
          {!settings.privacySiteExceptions?.length && (
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Brak wyjątków
            </p>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Historia przeglądania">
        <Row label="Retencja historii">
          <select
            value={settings.historyRetention || '90'}
            onChange={(e) =>
              patchSettings({
                historyRetention: e.target.value as '7' | '30' | '90' | 'always' | 'off',
              })
            }
          >
            <option value="7">7 dni</option>
            <option value="30">30 dni</option>
            <option value="90">90 dni</option>
            <option value="always">Zawsze</option>
            <option value="off">Nie zapisuj</option>
          </select>
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
