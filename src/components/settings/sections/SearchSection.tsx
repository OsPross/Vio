import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { SEARCH_ENGINES, useStore, type SearchEngine, type SearchLanguage } from '../../../store';
import { useT } from '../../../i18n';
import { FieldRow, Row, SettingsDisclosure, SettingsGroup, Toggle } from '../SettingsControls';

export function SearchSection() {
  const t = useT();
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
      <SettingsGroup title={t('settings.search.engineGroup')}>
        <Row label={t('settings.search.engine')}>
          <Select
            aria-label={t('settings.search.engine')}
            value={settings.searchEngine}
            onChange={(v) => patchSettings({ searchEngine: v as SearchEngine })}
            groups={[
              {
                label: t('settings.search.groupWeb'),
                options: SEARCH_ENGINES.filter((e) => e.group === 'web').map((e) => ({
                  value: e.id,
                  label: e.label,
                })),
              },
              {
                label: t('settings.search.groupPrivacy'),
                options: SEARCH_ENGINES.filter((e) => e.group === 'privacy').map((e) => ({
                  value: e.id,
                  label: e.label,
                })),
              },
              {
                label: t('settings.search.groupOnion'),
                options: SEARCH_ENGINES.filter((e) => e.group === 'onion').map((e) => ({
                  value: e.id,
                  label: e.label,
                })),
              },
              {
                label: t('settings.search.groupLocal'),
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
          <FieldRow label={t('settings.search.searxUrl')}>
            <Input
              value={settings.searxUrl}
              onChange={(e) => patchSettings({ searxUrl: e.target.value })}
              placeholder="http://127.0.0.1:8080"
            />
          </FieldRow>
        )}
        {settings.searchEngine === 'custom' && (
          <FieldRow label={t('settings.search.customUrl')} desc={t('settings.search.customUrlDesc')}>
            <Input
              value={settings.customSearchUrl}
              onChange={(e) => patchSettings({ customSearchUrl: e.target.value })}
              placeholder="https://example.com/search?q=%s"
            />
          </FieldRow>
        )}
        <Row label={t('settings.search.resultsLang')} desc={t('settings.search.resultsLangDesc')}>
          <Select
            aria-label={t('settings.search.resultsLang')}
            value={settings.searchLanguage || 'en'}
            onChange={(v) => patchSettings({ searchLanguage: v as SearchLanguage })}
            options={[
              { value: 'en', label: t('settings.search.resultsEn') },
              { value: 'pl', label: t('settings.search.resultsPl') },
              { value: 'auto', label: t('settings.search.resultsAuto') },
            ]}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('settings.search.torMode')}>
        <p className="tor-settings-note">{t('settings.search.torNote1')}</p>
        <p className="tor-settings-note" style={{ marginTop: 8 }}>
          {t('settings.search.torNote2')}
        </p>
        <FieldRow label={t('settings.search.torSocks')} desc={t('settings.search.torSocksDesc')}>
          <Input
            value={settings.torProxyUrl}
            onChange={(e) => patchSettings({ torProxyUrl: e.target.value })}
            placeholder="socks5://127.0.0.1:9050"
          />
        </FieldRow>
        <Toggle
          label={t('settings.search.torDaemonAutostart')}
          hint={t('settings.search.torDaemonAutostartHint')}
          on={settings.torDaemonAutostart}
          onChange={(v) => {
            patchSettings({ torDaemonAutostart: v });
            void window.shell
              ?.torDaemonAutostart?.(v)
              .then((r: { ok?: boolean; error?: string }) => {
                if (r && r.ok === false && v) {
                  patchSettings({ torDaemonAutostart: false });
                  window.alert(r.error || t('settings.search.torDaemonAutostartFail'));
                }
              });
          }}
        />
        <Row label={t('settings.search.torOpenTab')} desc={t('settings.search.torOpenTabDesc')}>
          <button
            type="button"
            className="sbtn primary"
            onClick={() => {
              setView('browser');
              window.dispatchEvent(new CustomEvent('djxxr-open-tor'));
            }}
          >
            {t('settings.search.torNewTab')}
          </button>
        </Row>
        <FieldRow label={t('settings.search.torBridges')} desc={t('settings.search.torBridgesDesc')}>
          <Select
            aria-label={t('settings.search.torBridgesAria')}
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
              { value: 'none', label: t('settings.search.torBridgeNone') },
              { value: 'obfs4', label: t('settings.search.torBridgeObfs4') },
              { value: 'snowflake', label: t('settings.search.torBridgeSnowflake') },
              { value: 'meek', label: t('settings.search.torBridgeMeek') },
              { value: 'custom', label: t('settings.search.torBridgeCustom') },
            ]}
          />
        </FieldRow>
        {settings.torBridgeMode === 'custom' && (
          <FieldRow
            label={t('settings.search.torBridgeLines')}
            desc={t('settings.search.torBridgeLinesDesc')}
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
        <p className="muted" style={{ margin: '8px 2px 0', fontSize: 12, lineHeight: 1.4 }}>
          {t('settings.search.torDnsNote')}
        </p>
      </SettingsGroup>

      <SettingsGroup title={t('settings.search.suggestions')}>
        <Toggle
          label={t('settings.search.suggestHistory')}
          on={settings.suggestHistory}
          onChange={(v) => patchSettings({ suggestHistory: v })}
        />
        <Toggle
          label={t('settings.search.suggestBangs')}
          on={settings.suggestBangs}
          onChange={(v) => patchSettings({ suggestBangs: v })}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.search.bangs')}>
        <SettingsDisclosure
          title={t('settings.search.yourBangs')}
          summary={t('settings.search.bangsSummary')}
          badge={bangs.length}
          defaultOpen={bangs.length > 0 && bangs.length <= 10}
        >
          <div className="sdense">
            {bangs.map((b) => (
              <div key={b.key} className="sdense-row">
                <div className="sdense-copy">
                  <span className="sdense-label">
                    <code>!{b.key}</code>
                    <span className="sdense-inline-sep">{b.label}</span>
                  </span>
                  <span className="sdense-detail mono truncate">{b.url}</span>
                </div>
                <button
                  type="button"
                  className="icon-btn sm"
                  onClick={() => removeBang(b.key)}
                  aria-label={t('settings.search.removeBangAria', { key: b.key })}
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              </div>
            ))}
            {!bangs.length ? <p className="snote">{t('settings.search.noBangs')}</p> : null}
          </div>
          <div className="sfold-footer">
            <Input
              placeholder={t('settings.search.bangKeyPlaceholder')}
              value={bangKey}
              onChange={(e) => setBangKey(e.target.value)}
            />
            <Input
              placeholder={t('settings.search.bangLabelPlaceholder')}
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
              <Plus size={14} strokeWidth={1.75} /> {t('common.add')}
            </button>
          </div>
        </SettingsDisclosure>
      </SettingsGroup>
    </div>
  );
}
