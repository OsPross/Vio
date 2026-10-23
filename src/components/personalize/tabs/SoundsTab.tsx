import { Volume2 } from 'lucide-react';
import { playSample } from '../../../hooks/useUiSounds';
import { configureSounds } from '../../../utils/soundEffects';
import { Segmented, Slider } from '../../ui';
import { useStore, type SoundProfile } from '../../../store';
import { useT } from '../../../i18n';
import { PzGroup, PzSection, PzSwitchRow } from './PzRows';

export function SoundsTab() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const profile = (settings.soundProfile || 'ios') as SoundProfile;
  const volume = typeof settings.soundVolume === 'number' ? settings.soundVolume : 55;
  const enabled = !!settings.uiSoundsEnabled;

  const preview = () => {
    configureSounds({ profile, volume, typing: true, tabs: true, ui: true, downloads: true });
    playSample();
  };

  return (
    <>
      <PzGroup>
        <PzSwitchRow
          label={t('home.personalize.soundsMaster')}
          hint={t('settings.look.soundsEnableHint')}
          on={enabled}
          onChange={(uiSoundsEnabled) => patchSettings({ uiSoundsEnabled })}
        />
      </PzGroup>

      <div className={`pz-sounds-body${enabled ? '' : ' is-off'}`}>
        <PzSection title={t('settings.look.soundProfile')}>
          <Segmented
            value={profile}
            aria-label={t('settings.look.soundProfile')}
            options={[
              { id: 'ios', label: t('settings.look.soundIos') },
              { id: 'tactile', label: t('settings.look.soundTactile') },
              { id: 'minimal', label: t('settings.look.soundMinimal') },
            ]}
            onChange={(v) => patchSettings({ soundProfile: v as SoundProfile })}
          />
        </PzSection>

        <PzSection title={t('settings.look.soundVolume')}>
          <div className="pz-volume">
            <Slider
              value={volume}
              min={0}
              max={100}
              onChange={(soundVolume) => patchSettings({ soundVolume })}
              aria-label={t('settings.look.soundVolume')}
            />
            <button type="button" className="pz-chip" onClick={preview}>
              <Volume2 size={14} strokeWidth={1.75} />
              {t('home.personalize.previewSound')}
            </button>
          </div>
        </PzSection>

        <PzSection title={t('home.personalize.soundCategories')}>
          <PzGroup>
            <PzSwitchRow
              label={t('settings.look.soundTyping')}
              on={settings.soundTyping !== false}
              onChange={(soundTyping) => patchSettings({ soundTyping })}
            />
            <PzSwitchRow
              label={t('settings.look.soundTabs')}
              on={settings.soundTabs !== false}
              onChange={(soundTabs) => patchSettings({ soundTabs })}
            />
            <PzSwitchRow
              label={t('settings.look.soundUi')}
              on={settings.soundUi !== false}
              onChange={(soundUi) => patchSettings({ soundUi })}
            />
            <PzSwitchRow
              label={t('settings.look.soundDownloads')}
              on={settings.soundDownloads !== false}
              onChange={(soundDownloads) => patchSettings({ soundDownloads })}
            />
          </PzGroup>
        </PzSection>
      </div>
    </>
  );
}
