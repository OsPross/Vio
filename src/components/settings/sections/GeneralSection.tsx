import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { useT } from '../../../i18n';
import { useStore, type UiLocale } from '../../../store';
import { FieldRow, SettingsGroup, Toggle } from '../SettingsControls';

export function GeneralSection() {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const t = useT();

  return (
    <div className="settings-stack">
      <SettingsGroup title={t('settings.general.app')}>
        <FieldRow label={t('settings.general.uiLocale')} desc={t('settings.general.uiLocaleDesc')}>
          <Select
            aria-label={t('settings.general.uiLocale')}
            value={settings.uiLocale || 'pl'}
            onChange={(v) => patchSettings({ uiLocale: v as UiLocale })}
            options={[
              { value: 'pl', label: t('settings.general.localePl') },
              { value: 'en', label: t('settings.general.localeEn') },
            ]}
          />
        </FieldRow>
        <FieldRow label={t('settings.general.appName')}>
          <Input
            value={settings.appName}
            onChange={(e) => patchSettings({ appName: e.target.value })}
          />
        </FieldRow>
        <FieldRow label={t('settings.general.homepage')} desc={t('settings.general.homepageDesc')}>
          <Input
            value={settings.homepage}
            onChange={(e) => patchSettings({ homepage: e.target.value })}
            placeholder="about:home"
          />
        </FieldRow>
      </SettingsGroup>

      <SettingsGroup title={t('settings.general.downloads')}>
        <Toggle
          label={t('settings.general.askWhere')}
          hint={t('settings.general.askWhereHint')}
          on={settings.downloadsAskWhere}
          onChange={(v) => patchSettings({ downloadsAskWhere: v })}
        />
        <FieldRow
          label={t('settings.general.downloadsFolder')}
          desc={t('settings.general.downloadsFolderDesc')}
        >
          <Input
            value={settings.downloadsFolder || ''}
            onChange={(e) => patchSettings({ downloadsFolder: e.target.value })}
            placeholder="e.g. C:\\Users\\…\\Downloads"
          />
        </FieldRow>
      </SettingsGroup>

      <SettingsGroup title={t('settings.general.behavior')}>
        <FieldRow label={t('settings.general.onStartup')}>
          <Select
            aria-label={t('settings.general.onStartup')}
            value={settings.startupMode || 'session'}
            onChange={(v) =>
              patchSettings({
                startupMode: v as 'session' | 'newtab' | 'pages',
              })
            }
            options={[
              { value: 'session', label: t('settings.general.startupSession') },
              { value: 'newtab', label: t('settings.general.startupNewtab') },
              { value: 'pages', label: t('settings.general.startupPages') },
            ]}
          />
        </FieldRow>
        {(settings.startupMode || 'session') === 'pages' && (
          <FieldRow
            label={t('settings.general.startupPagesLabel')}
            desc={t('settings.general.startupPagesDesc')}
          >
            <textarea
              rows={4}
              value={settings.startupPages || ''}
              onChange={(e) => patchSettings({ startupPages: e.target.value })}
              placeholder={'https://example.com\nhttps://wikipedia.org'}
            />
          </FieldRow>
        )}
        <Toggle
          label={t('settings.general.newTabIsSearch')}
          on={settings.newTabIsSearch}
          onChange={(v) => patchSettings({ newTabIsSearch: v })}
        />
        <Toggle
          label={t('settings.general.openSearchInNewTab')}
          on={settings.openSearchInNewTab}
          onChange={(v) => patchSettings({ openSearchInNewTab: v })}
        />
        <Toggle
          label={t('settings.general.openExternalInApp')}
          hint={t('settings.general.openExternalInAppHint')}
          on={settings.openExternalInApp}
          onChange={(v) => patchSettings({ openExternalInApp: v })}
        />
        <Toggle
          label={t('settings.general.autoPip')}
          hint={t('settings.general.autoPipHint')}
          on={settings.autoPipOnTabSwitch}
          onChange={(v) => patchSettings({ autoPipOnTabSwitch: v })}
        />
      </SettingsGroup>
    </div>
  );
}
