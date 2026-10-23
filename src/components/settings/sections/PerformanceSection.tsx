import { useEffect, useState } from 'react';
import { applyPerfPreset, useStore, type PerfMode } from '../../../store';
import { Select } from '../../ui/Select';
import { useT } from '../../../i18n';
import { Row, SettingsGroup, SliderRow, Toggle } from '../SettingsControls';

export function PerformanceSection() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const [mem, setMem] = useState<{ workingSetMb: number; processes: number } | null>(null);
  const [cacheMsg, setCacheMsg] = useState('');
  const [restartHint, setRestartHint] = useState(false);

  useEffect(() => {
    let alive = true;
    const pull = () => {
      void window.shell?.perfMemory?.().then((m) => {
        if (alive && m) setMem({ workingSetMb: m.workingSetMb, processes: m.processes });
      });
    };
    pull();
    const id = setInterval(pull, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="settings-stack">
      <SettingsGroup title={t('settings.perf.profileStatus')}>
        {mem && (
          <Row label={t('settings.perf.workingSet')}>
            <span className="sr-value">
              {t('settings.perf.workingSetValue', {
                mb: mem.workingSetMb,
                processes: mem.processes,
              })}
            </span>
          </Row>
        )}
        <Row label={t('settings.perf.profile')}>
          <Select
            aria-label={t('settings.perf.profileAria')}
            value={settings.perfMode}
            onChange={(v) => {
              const mode = v as PerfMode;
              patchSettings(applyPerfPreset(mode));
              setRestartHint(true);
            }}
            options={[
              { value: 'saver', label: t('settings.perf.modeSaver') },
              { value: 'balanced', label: t('settings.perf.modeBalanced') },
              { value: 'performance', label: t('settings.perf.modePerformance') },
            ]}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('settings.perf.memoryTabs')}>
        <Toggle
          label={t('settings.perf.lazyTabs')}
          on={settings.perfLazyTabs}
          onChange={(v) => patchSettings({ perfLazyTabs: v })}
        />
        <Row label={t('settings.perf.discardAfter')}>
          <Select
            aria-label={t('settings.perf.discardAfterAria')}
            value={
              settings.perfDiscardTabs ? String(settings.perfDiscardMinutes || 30) : 'off'
            }
            onChange={(v) => {
              if (v === 'off') {
                patchSettings({ perfDiscardTabs: false });
                return;
              }
              const n = Number(v);
              patchSettings({
                perfDiscardTabs: true,
                perfDiscardMinutes: n === 15 || n === 60 ? n : 30,
              });
            }}
            options={[
              { value: 'off', label: t('settings.perf.discardOff') },
              { value: '15', label: t('settings.perf.discardMin', { n: 15 }) },
              { value: '30', label: t('settings.perf.discardMin', { n: 30 }) },
              { value: '60', label: t('settings.perf.discardMin', { n: 60 }) },
            ]}
          />
        </Row>
        {settings.perfDiscardTabs && (
          <Toggle
            label={t('settings.perf.discardKeepPinned')}
            on={settings.perfDiscardKeepPinned !== false}
            onChange={(v) => patchSettings({ perfDiscardKeepPinned: v })}
          />
        )}
        <Row label={t('settings.perf.archiveAfter')}>
          <Select
            aria-label={t('settings.perf.archiveAfterAria')}
            value={String(settings.tabArchiveHours ?? 12)}
            onChange={(v) => {
              const n = Number(v);
              patchSettings({
                tabArchiveHours: n === 0 || n === 6 || n === 24 ? n : 12,
              });
            }}
            options={[
              { value: '0', label: t('settings.perf.archiveOff') },
              { value: '6', label: t('settings.perf.archiveHours', { n: 6 }) },
              { value: '12', label: t('settings.perf.archiveHours', { n: 12 }) },
              { value: '24', label: t('settings.perf.archiveHours', { n: 24 }) },
            ]}
          />
        </Row>
        <SliderRow
          label={t('settings.perf.cacheLimit')}
          value={`${settings.perfCacheMb} MB`}
          min={64}
          max={1024}
          step={32}
          valueNum={settings.perfCacheMb}
          onChange={(n) => {
            patchSettings({ perfCacheMb: n });
            void window.shell?.perfApplySession?.({ cacheMb: n });
          }}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.perf.cpuRender')}>
        <Toggle
          label={t('settings.perf.hwAccel')}
          hint={t('settings.perf.hwAccelHint')}
          on={settings.perfHardwareAcceleration}
          onChange={(v) => {
            patchSettings({ perfHardwareAcceleration: v });
            void window.shell?.perfBoot?.({ hardwareAcceleration: v });
            setRestartHint(true);
          }}
        />
        <Toggle
          label={t('settings.perf.bgThrottle')}
          on={settings.perfBackgroundThrottling}
          onChange={(v) => {
            patchSettings({ perfBackgroundThrottling: v });
            void window.shell?.perfBoot?.({ backgroundThrottling: v });
            void window.shell?.perfApplySession?.({ backgroundThrottling: v });
          }}
        />
        <Toggle
          label={t('settings.perf.smoothScroll')}
          on={settings.perfSmoothScrolling}
          onChange={(v) => {
            patchSettings({ perfSmoothScrolling: v });
            void window.shell?.perfBoot?.({ smoothScrolling: v });
            setRestartHint(true);
          }}
        />
        <Toggle
          label={t('settings.perf.reduceAnim')}
          on={settings.perfReduceMotion}
          onChange={(v) => patchSettings({ perfReduceMotion: v, uiMotion: !v })}
        />
        <Toggle
          label={t('settings.perf.lowPowerClock')}
          on={settings.perfLowPowerClock}
          onChange={(v) => patchSettings({ perfLowPowerClock: v })}
        />
        <Toggle
          label={t('settings.perf.blockHeavyMedia')}
          on={settings.perfBlockHeavyMedia}
          onChange={(v) => patchSettings({ perfBlockHeavyMedia: v })}
        />
        <Toggle
          label={t('settings.perf.spellcheck')}
          on={settings.perfSpellcheck}
          onChange={(v) => patchSettings({ perfSpellcheck: v })}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.perf.tools')}>
        <Row label={t('settings.perf.sessionCache')}>
          <button
            type="button"
            className="sbtn"
            onClick={() => {
              void window.shell?.perfClearCache?.().then(() => {
                setCacheMsg(t('settings.perf.cacheCleared'));
                setTimeout(() => setCacheMsg(''), 2500);
              });
            }}
          >
            {t('settings.perf.clearCache')}
          </button>
        </Row>
        <Row label={t('settings.perf.memory')}>
          <button
            type="button"
            className="sbtn text"
            onClick={() => {
              void window.shell?.perfMemory?.().then((m) => {
                if (m) setMem({ workingSetMb: m.workingSetMb, processes: m.processes });
              });
            }}
          >
            {t('settings.perf.refreshRam')}
          </button>
        </Row>
        {cacheMsg && <p className="snote">{cacheMsg}</p>}
        {restartHint && <p className="snote warn">{t('settings.perf.restartHint')}</p>}
      </SettingsGroup>
    </div>
  );
}
