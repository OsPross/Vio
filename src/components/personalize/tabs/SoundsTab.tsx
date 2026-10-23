import { playSample } from '../../../hooks/useUiSounds';
import { configureSounds } from '../../../utils/soundEffects';
import { Segmented, Slider, Switch } from '../../ui';
import { useStore, type SoundProfile } from '../../../store';
import { useT } from '../../../i18n';

function SettingsRow({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="ui-settings-row">
      <div className="ui-settings-row-copy">
        <span className="ui-settings-row-title">{label}</span>
        {hint ? <span className="ui-settings-row-desc">{hint}</span> : null}
      </div>
      <Switch on={on} onChange={onChange} aria-label={label} />
    </div>
  );
}

export function SoundsTab() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const profile = (settings.soundProfile || 'ios') as SoundProfile;
  const volume = typeof settings.soundVolume === 'number' ? settings.soundVolume : 55;

  return (
    <div className="pz-tab-pane">
      <section className="pz-section">
        <h3>{t('home.personalize.sounds')}</h3>
        <div className="ui-settings-group">
          <SettingsRow
            label={t('settings.look.soundsEnable')}
            hint={t('settings.look.soundsEnableHint')}
            on={!!settings.uiSoundsEnabled}
            onChange={(uiSoundsEnabled) => patchSettings({ uiSoundsEnabled })}
          />
        </div>
      </section>

      <section className="pz-section">
        <h3>{t('settings.look.soundProfile')}</h3>
        <Segmented
          value={profile}
          options={[
            { id: 'ios', label: t('settings.look.soundIos') },
            { id: 'tactile', label: t('settings.look.soundTactile') },
            { id: 'minimal', label: t('settings.look.soundMinimal') },
          ]}
          onChange={(v) => patchSettings({ soundProfile: v as SoundProfile })}
        />
        <button
          type="button"
          className="pz-secondary-btn"
          style={{ marginTop: 12 }}
          onClick={() => {
            configureSounds({
              profile,
              volume,
              typing: true,
              tabs: true,
              ui: true,
              downloads: true,
            });
            playSample();
          }}
        >
          {t('settings.look.soundPreviewBtn')}
        </button>
        <label className="pz-slider-row" style={{ marginTop: 14 }}>
          <span>{t('settings.look.soundVolume')}</span>
          <Slider
            value={volume}
            min={0}
            max={100}
            onChange={(soundVolume) => patchSettings({ soundVolume })}
            aria-label={t('settings.look.soundVolume')}
          />
          <span className="pz-slider-val">{Math.round(volume)}%</span>
        </label>
      </section>

      <section className="pz-section">
        <h3>{t('home.personalize.soundCategories')}</h3>
        <div className="ui-settings-group">
          <SettingsRow
            label={t('settings.look.soundTyping')}
            on={settings.soundTyping !== false}
            onChange={(soundTyping) => patchSettings({ soundTyping })}
          />
          <SettingsRow
            label={t('settings.look.soundTabs')}
            on={settings.soundTabs !== false}
            onChange={(soundTabs) => patchSettings({ soundTabs })}
          />
          <SettingsRow
            label={t('settings.look.soundUi')}
            on={settings.soundUi !== false}
            onChange={(soundUi) => patchSettings({ soundUi })}
          />
          <SettingsRow
            label={t('settings.look.soundDownloads')}
            on={settings.soundDownloads !== false}
            onChange={(soundDownloads) => patchSettings({ soundDownloads })}
          />
        </div>
      </section>
    </div>
  );
}
