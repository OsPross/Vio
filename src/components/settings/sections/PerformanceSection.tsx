import { useEffect, useState } from 'react';
import { applyPerfPreset, useStore, type PerfMode } from '../../../store';
import { Select } from '../../ui/Select';
import { Row, SettingsGroup, SliderRow, Toggle } from '../SettingsControls';

export function PerformanceSection() {
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
    const t = setInterval(pull, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="settings-stack">
      <SettingsGroup title="Profil i status">
        {mem && (
          <Row label="Pamięć robocza">
            <span className="sr-value">
              {mem.workingSetMb} MB, {mem.processes} procesów
            </span>
          </Row>
        )}
        <Row label="Profil">
          <Select
            aria-label="Profil wydajności"
            value={settings.perfMode}
            onChange={(v) => {
              const mode = v as PerfMode;
              patchSettings(applyPerfPreset(mode));
              setRestartHint(true);
            }}
            options={[
              { value: 'saver', label: 'Oszczędzanie' },
              { value: 'balanced', label: 'Zrównoważony' },
              { value: 'performance', label: 'Wydajność' },
            ]}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Pamięć i karty">
        <Toggle
          label="Leniwe ładowanie kart"
          hint="Przy starcie nieaktywne karty sesji śpią do pierwszego kliknięcia. Link otwarty w tle ładuje się od razu; po odwiedzeniu karta zostaje żywa (jak Chrome)."
          on={settings.perfLazyTabs}
          onChange={(v) => patchSettings({ perfLazyTabs: v })}
        />
        <Toggle
          label="Wyrzucaj nieaktywne karty"
          hint="Odmontowuje kartę po czasie bezczynności (nigdy przy audio/PiP/formularzu)"
          on={settings.perfDiscardTabs}
          onChange={(v) => patchSettings({ perfDiscardTabs: v })}
        />
        <SliderRow
          label="Wyrzuć po"
          value={`${settings.perfDiscardMinutes} min`}
          min={2}
          max={60}
          valueNum={settings.perfDiscardMinutes}
          disabled={!settings.perfDiscardTabs}
          onChange={(n) => patchSettings({ perfDiscardMinutes: n })}
        />
        <SliderRow
          label="Limit cache"
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

      <SettingsGroup title="CPU / render">
        <Toggle
          label="Przyspieszanie sprzętowe (GPU)"
          hint="Zmiana wymaga restartu"
          on={settings.perfHardwareAcceleration}
          onChange={(v) => {
            patchSettings({ perfHardwareAcceleration: v });
            void window.shell?.perfBoot?.({ hardwareAcceleration: v });
            setRestartHint(true);
          }}
        />
        <Toggle
          label="Throttling w tle"
          hint="Spowalnia karty gdy okno jest zminimowane / przykryte"
          on={settings.perfBackgroundThrottling}
          onChange={(v) => {
            patchSettings({ perfBackgroundThrottling: v });
            void window.shell?.perfBoot?.({ backgroundThrottling: v });
            void window.shell?.perfApplySession?.({ backgroundThrottling: v });
          }}
        />
        <Toggle
          label="Płynne przewijanie"
          hint="Wyłącz przy słabszym CPU (restart)"
          on={settings.perfSmoothScrolling}
          onChange={(v) => {
            patchSettings({ perfSmoothScrolling: v });
            void window.shell?.perfBoot?.({ smoothScrolling: v });
            setRestartHint(true);
          }}
        />
        <Toggle
          label="Ogranicz animacje UI"
          on={settings.perfReduceMotion}
          onChange={(v) => patchSettings({ perfReduceMotion: v, uiMotion: !v })}
        />
        <Toggle
          label="Oszczędny zegar na home"
          hint="Aktualizacja co 30 s + pauza gdy okno ukryte"
          on={settings.perfLowPowerClock}
          onChange={(v) => patchSettings({ perfLowPowerClock: v })}
        />
        <Toggle
          label="Blokuj ciężkie media w tle (eksperymentalne)"
          hint="Mniej autoplay / ciężkich zasobów w UI"
          on={settings.perfBlockHeavyMedia}
          onChange={(v) => patchSettings({ perfBlockHeavyMedia: v })}
        />
        <Toggle
          label="Sprawdzanie pisowni"
          hint="pl + en-US (wyłączone w oknach Tor — słowniki nie pobierają się poza siecią Tor)"
          on={settings.perfSpellcheck}
          onChange={(v) => patchSettings({ perfSpellcheck: v })}
        />
      </SettingsGroup>

      <SettingsGroup title="Narzędzia">
        <Row label="Cache sesji">
          <button
            type="button"
            className="sbtn"
            onClick={() => {
              void window.shell?.perfClearCache?.().then(() => {
                setCacheMsg('Cache wyczyszczony');
                setTimeout(() => setCacheMsg(''), 2500);
              });
            }}
          >
            Wyczyść cache
          </button>
        </Row>
        <Row label="Pamięć">
          <button
            type="button"
            className="sbtn text"
            onClick={() => {
              void window.shell?.perfMemory?.().then((m) => {
                if (m) setMem({ workingSetMb: m.workingSetMb, processes: m.processes });
              });
            }}
          >
            Odśwież RAM
          </button>
        </Row>
        {cacheMsg && <p className="snote">{cacheMsg}</p>}
        {restartHint && (
          <p className="snote warn">
            Niektóre zmiany (GPU, scroll, limity procesów) wymagają pełnego restartu aplikacji.
          </p>
        )}
      </SettingsGroup>
    </div>
  );
}
