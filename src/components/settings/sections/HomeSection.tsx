import { Segmented } from '../../ui';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { useT } from '../../../i18n';
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
  const t = useT();

  return (
    <div className="settings-stack">
      <SettingsGroup title={t('settings.home.texts')}>
        <FieldRow label={t('settings.home.headline')} desc={t('settings.home.headlineDesc')}>
          <Input
            value={settings.homeHeadline}
            onChange={(e) => patchSettings({ homeHeadline: e.target.value })}
            placeholder={t('settings.home.headlinePlaceholder')}
          />
        </FieldRow>
        <FieldRow label={t('settings.home.subline')} desc={t('settings.home.sublineDesc')}>
          <Input
            value={settings.homeSubline}
            onChange={(e) => patchSettings({ homeSubline: e.target.value })}
            placeholder={t('settings.home.sublinePlaceholder')}
          />
        </FieldRow>
      </SettingsGroup>

      <SettingsGroup title={t('settings.home.layoutGroup')}>
        <Row label={t('settings.home.layout')}>
          <Select
            aria-label={t('settings.home.layout')}
            value={settings.homeLayout}
            onChange={(v) => patchSettings({ homeLayout: v as HomeLayout })}
            options={[
              { value: 'dashboard', label: t('settings.home.layoutDashboard') },
              { value: 'minimal', label: t('settings.home.layoutMinimal') },
              { value: 'stack', label: t('settings.home.layoutStack') },
              { value: 'split', label: t('settings.home.layoutSplit') },
            ]}
          />
        </Row>
        <Row label={t('settings.home.align')}>
          <Segmented
            value={settings.homeAlign}
            options={[
              { id: 'left', label: t('settings.home.alignLeft') },
              { id: 'center', label: t('settings.home.alignCenter') },
            ]}
            onChange={(v) => patchSettings({ homeAlign: v as HomeAlign })}
          />
        </Row>
        <Row label={t('settings.home.density')}>
          <Segmented
            value={settings.homeDensity}
            options={[
              { id: 'compact', label: t('settings.home.densityCompact') },
              { id: 'comfortable', label: t('settings.home.densityComfortable') },
              { id: 'spacious', label: t('settings.home.densitySpacious') },
            ]}
            onChange={(v) => patchSettings({ homeDensity: v as HomeDensity })}
          />
        </Row>
        <Row label={t('settings.home.appsStyle')}>
          <Segmented
            value={settings.homeAppsStyle}
            options={[
              { id: 'icons', label: t('settings.home.appsIcons') },
              { id: 'list', label: t('settings.home.appsList') },
            ]}
            onChange={(v) => patchSettings({ homeAppsStyle: v as HomeAppsStyle })}
          />
        </Row>
        <Row label={t('settings.home.bgHome')}>
          <Select
            aria-label={t('settings.home.bgHome')}
            value={settings.bgStyle}
            onChange={(v) => patchSettings({ bgStyle: v as BgStyle })}
            options={[
              { value: 'solid', label: t('settings.home.bgSolid') },
              { value: 'soft', label: t('settings.home.bgSoft') },
              { value: 'panel', label: t('settings.home.bgPanel') },
              { value: 'mesh', label: t('settings.home.bgMesh') },
              { value: 'vignette', label: t('settings.home.bgVignette') },
            ]}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('settings.home.elements')}>
        <Toggle
          label={t('settings.home.showGreeting')}
          on={settings.homeShowGreeting}
          onChange={(v) => patchSettings({ homeShowGreeting: v })}
        />
        <Toggle
          label={t('settings.home.showClock')}
          on={settings.homeShowClock}
          onChange={(v) => patchSettings({ homeShowClock: v })}
        />
        <Toggle
          label={t('settings.home.showDate')}
          on={settings.homeShowDate}
          onChange={(v) => patchSettings({ homeShowDate: v })}
        />
        <Toggle
          label={t('settings.home.clock24h')}
          on={settings.clock24h}
          onChange={(v) => patchSettings({ clock24h: v })}
        />
        <Toggle
          label={t('settings.home.showBrand')}
          on={settings.homeShowBrand}
          onChange={(v) => patchSettings({ homeShowBrand: v })}
        />
        <Toggle
          label={t('settings.home.showEngine')}
          on={settings.homeShowEngine}
          onChange={(v) => patchSettings({ homeShowEngine: v })}
        />
        <Toggle
          label={t('settings.home.showApps')}
          on={settings.homeShowApps}
          onChange={(v) => patchSettings({ homeShowApps: v })}
        />
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
          {t('settings.home.widgetsHint')}
        </p>
        <Toggle
          label={t('settings.home.widgetRecent')}
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
          label={t('settings.home.widgetNotes')}
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
          label={t('settings.home.widgetResources')}
          hint={t('settings.home.widgetResourcesHint')}
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
          label={t('settings.home.widgetBangs')}
          on={settings.homeShowBangs}
          onChange={(v) => patchSettings({ homeShowBangs: v, suggestBangs: v })}
        />
      </SettingsGroup>
    </div>
  );
}
