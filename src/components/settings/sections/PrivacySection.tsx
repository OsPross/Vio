import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { useT } from '../../../i18n';
import { useStore } from '../../../store';
import { FieldRow, Row, SettingsDisclosure, SettingsGroup, Toggle } from '../SettingsControls';

function SitePermissionsSection() {
  const t = useT();
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
    <SettingsGroup title={t('settings.privacy.sitePermissions')}>
      {entries.length === 0 && (
        <p className="snote">{t('settings.privacy.noStoredPermissions')}</p>
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
            {t('settings.privacy.revoke')}
          </button>
        </div>
      ))}
      {entries.length > 0 && (
        <div className="slist-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="sbtn ghost" onClick={() => refresh()}>
            {t('common.refresh')}
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
  const t = useT();

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
      <SettingsGroup title={t('settings.privacy.preset')}>
        <div className="privacy-preset-seg" role="tablist">
          {(
            [
              ['standard', t('settings.privacy.presetStandard')],
              ['strict', t('settings.privacy.presetStrict')],
              ['custom', t('settings.privacy.presetCustom')],
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
          {t('settings.privacy.presetHint')}
        </p>
      </SettingsGroup>

      <SettingsGroup title={t('settings.privacy.cookies')}>
        <FieldRow
          label={t('settings.privacy.thirdPartyCookies')}
          desc={t('settings.privacy.thirdPartyCookiesDesc')}
        >
          <Select
            aria-label={t('settings.privacy.thirdPartyCookies')}
            value={settings.privacyThirdPartyCookies}
            onChange={(v) =>
              patchSettings({
                privacyThirdPartyCookies: v as 'trackers' | 'all' | 'allow',
              })
            }
            options={[
              { value: 'trackers', label: t('settings.privacy.cookieBlockTrackers') },
              { value: 'all', label: t('settings.privacy.cookieBlockAll') },
              { value: 'allow', label: t('settings.privacy.cookieAllow') },
            ]}
          />
        </FieldRow>
        <Toggle
          label={t('settings.privacy.stripTracking')}
          hint={t('settings.privacy.stripTrackingHint')}
          on={settings.privacyStripTracking}
          onChange={(v) => patchSettings({ privacyStripTracking: v })}
        />
        <Toggle
          label={t('settings.privacy.secGpc')}
          on={settings.privacySecGpc}
          onChange={(v) => patchSettings({ privacySecGpc: v })}
        />
        <Toggle
          label={t('settings.privacy.dnt')}
          hint={t('settings.privacy.dntHint')}
          on={settings.privacyDnt}
          onChange={(v) => patchSettings({ privacyDnt: v })}
        />
        <Toggle
          label={t('settings.privacy.referrerPolicy')}
          on={settings.privacyReferrerPolicy}
          onChange={(v) => patchSettings({ privacyReferrerPolicy: v })}
        />
        <Toggle
          label={t('settings.privacy.clearOnQuit')}
          hint={t('settings.privacy.clearOnQuitHint')}
          on={settings.privacyClearOnQuit}
          onChange={(v) => patchSettings({ privacyClearOnQuit: v })}
        />
        {settings.privacyClearOnQuit && (
          <FieldRow
            label={t('settings.privacy.clearOnQuitKeep')}
            desc={t('settings.privacy.clearOnQuitKeepDesc')}
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

      <SettingsGroup title={t('settings.privacy.encryption')}>
        <FieldRow
          label={t('settings.privacy.httpsOnly')}
          desc={t('settings.privacy.httpsOnlyDesc')}
        >
          <Select
            aria-label={t('settings.privacy.httpsOnly')}
            value={settings.privacyHttpsOnly}
            onChange={(v) =>
              patchSettings({
                privacyHttpsOnly: v as 'upgrade' | 'block' | 'off',
              })
            }
            options={[
              { value: 'upgrade', label: t('settings.privacy.httpsUpgrade') },
              { value: 'block', label: t('settings.privacy.httpsBlock') },
              { value: 'off', label: t('settings.privacy.httpsOff') },
            ]}
          />
        </FieldRow>
        <FieldRow label={t('settings.privacy.doh')} desc={t('settings.privacy.dohDesc')}>
          <Select
            aria-label={t('settings.privacy.doh')}
            value={settings.privacyDoh}
            onChange={(v) =>
              patchSettings({
                privacyDoh: v as typeof settings.privacyDoh,
              })
            }
            options={[
              { value: 'automatic', label: t('settings.privacy.dohAutomatic') },
              { value: 'quad9', label: t('settings.privacy.dohQuad9') },
              { value: 'cloudflare', label: t('settings.privacy.dohCloudflare') },
              { value: 'mullvad', label: t('settings.privacy.dohMullvad') },
              { value: 'nextdns', label: t('settings.privacy.dohNextdns') },
              { value: 'custom', label: t('settings.privacy.dohCustom') },
              { value: 'off', label: t('settings.privacy.dohOff') },
            ]}
          />
        </FieldRow>
        {settings.privacyDoh === 'custom' && (
          <FieldRow label={t('settings.privacy.dohCustomUrl')}>
            <Input
              value={settings.privacyDohCustom}
              onChange={(e) => patchSettings({ privacyDohCustom: e.target.value })}
              placeholder="https://dns.example/dns-query"
            />
          </FieldRow>
        )}
      </SettingsGroup>

      <SettingsGroup title={t('settings.privacy.fingerprint')}>
        <Toggle
          label={t('settings.privacy.chromeUa')}
          on={settings.privacyChromeUa}
          onChange={(v) => patchSettings({ privacyChromeUa: v })}
        />
        <FieldRow label={t('settings.privacy.webRtc')} desc={t('settings.privacy.webRtcDesc')}>
          <Select
            aria-label={t('settings.privacy.webRtc')}
            value={settings.privacyWebRtc}
            onChange={(v) =>
              patchSettings({
                privacyWebRtc: v as typeof settings.privacyWebRtc,
              })
            }
            options={[
              { value: 'public_only', label: t('settings.privacy.webRtcPublic') },
              { value: 'disable_udp', label: t('settings.privacy.webRtcDisableUdp') },
              { value: 'default', label: t('settings.privacy.webRtcDefault') },
            ]}
          />
        </FieldRow>
        <Toggle
          label={t('settings.privacy.fingerprintProtect')}
          hint={t('settings.privacy.fingerprintHint')}
          on={settings.privacyFingerprint}
          onChange={(v) => patchSettings({ privacyFingerprint: v })}
        />
        <Toggle
          label={t('settings.privacy.searchSuggest')}
          hint={t('settings.privacy.searchSuggestHint')}
          on={settings.privacySearchSuggest}
          onChange={(v) => patchSettings({ privacySearchSuggest: v })}
        />
        <Toggle
          label={t('settings.privacy.allowAppNetwork')}
          on={settings.privacyAllowAppNetwork}
          onChange={(v) => patchSettings({ privacyAllowAppNetwork: v })}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.privacy.exceptions')}>
        <SettingsDisclosure
          title={t('settings.privacy.exceptionsNoShield')}
          summary={t('settings.privacy.exceptionsNoShieldSummary')}
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
                  aria-label={t('settings.privacy.removeExceptionAria', { domain: d })}
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
              <p className="snote">{t('settings.privacy.noExceptions')}</p>
            ) : null}
          </div>
        </SettingsDisclosure>
      </SettingsGroup>

      <SettingsGroup title={t('settings.privacy.history')}>
        <Row label={t('settings.privacy.historyRetention')}>
          <Select
            aria-label={t('settings.privacy.historyRetention')}
            value={settings.historyRetention || '90'}
            onChange={(v) =>
              patchSettings({
                historyRetention: v as '7' | '30' | '90' | 'always' | 'off',
              })
            }
            options={[
              { value: '7', label: t('settings.privacy.retention7') },
              { value: '30', label: t('settings.privacy.retention30') },
              { value: '90', label: t('settings.privacy.retention90') },
              { value: 'always', label: t('settings.privacy.retentionAlways') },
              { value: 'off', label: t('settings.privacy.retentionOff') },
            ]}
          />
        </Row>
        <Row label={t('settings.privacy.savedQueries')}>
          <span className="sr-value">{queryCount}</span>
        </Row>
        <Row label={t('settings.privacy.openHistory')}>
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
                title: t('internal.history'),
              });
              st.setView('browser');
            }}
          >
            about:history (Ctrl+H)
          </button>
        </Row>
        <Row label={t('settings.privacy.clearDataRow')}>
          <button
            type="button"
            className="sbtn danger-text"
            onClick={() => {
              if (!confirm(t('settings.privacy.clearHistoryConfirm'))) return;
              clearHistory();
              setQueryCount(0);
            }}
          >
            {t('settings.privacy.clearHistory')}
          </button>
        </Row>
      </SettingsGroup>

      <SitePermissionsSection />

      <SettingsGroup title={t('settings.privacy.reset')}>
        <Row label={t('settings.privacy.resetSettingsLabel')}>
          <button
            type="button"
            className="sbtn"
            onClick={() => {
              if (confirm(t('settings.privacy.resetSettingsConfirm'))) resetSettings();
            }}
          >
            {t('settings.privacy.resetSettings')}
          </button>
        </Row>
      </SettingsGroup>
    </div>
  );
}
