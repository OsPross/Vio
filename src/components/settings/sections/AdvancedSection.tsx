import { useCallback, useEffect, useState } from 'react';
import { Input } from '../../ui/Input';
import { useStore } from '../../../store';
import { FieldRow, Row, SettingsGroup, Toggle } from '../SettingsControls';
import { SoulLog } from './SoulLog';

type DevSyncCommit = { hash: string; author: string; subject: string };
type DevSyncCheck = {
  ok: boolean;
  error?: string;
  dirty?: boolean;
  behind?: number;
  ahead?: number;
  canFastForward?: boolean;
  message?: string;
  commits?: DevSyncCommit[];
};

export function AdvancedSection() {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const resetSettings = useStore((s) => s.resetSettings);

  const [devSyncOn, setDevSyncOn] = useState(false);
  const [devBusy, setDevBusy] = useState(false);
  const [devMsg, setDevMsg] = useState<string | null>(null);
  const [devCheck, setDevCheck] = useState<DevSyncCheck | null>(null);

  const [updBusy, setUpdBusy] = useState(false);
  const [updMsg, setUpdMsg] = useState<string | null>(null);
  const [updReady, setUpdReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const info = await window.shell?.appInfo?.();
      const av = await window.shell?.devSyncAvailable?.();
      if (cancelled) return;
      setDevSyncOn(Boolean(av?.available) && info?.packaged === false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const off = window.shell?.onUpdateStatus?.((p) => {
      if (p.status === 'downloaded') {
        setUpdReady(true);
        setUpdMsg('Aktualizacja pobrana. Kliknij „Uruchom ponownie”, aby zainstalować.');
      } else if (p.status === 'available') {
        setUpdMsg('Znaleziono aktualizację — pobieranie w tle…');
      } else if (p.status === 'not-available') {
        setUpdMsg('Brak nowszej wersji.');
      } else if (p.status === 'error') {
        setUpdMsg(String(p.error || 'Błąd aktualizacji'));
      }
    });
    return () => off?.();
  }, []);

  const onDevCheck = useCallback(async () => {
    setDevBusy(true);
    setDevMsg(null);
    try {
      const r = (await window.shell?.devSyncCheck?.()) as DevSyncCheck;
      setDevCheck(r || null);
      setDevMsg(r?.error || r?.message || null);
    } finally {
      setDevBusy(false);
    }
  }, []);

  const onDevApply = useCallback(async () => {
    if (!devCheck?.canFastForward) return;
    const n = devCheck.behind || 0;
    const authors = [...new Set((devCheck.commits || []).map((c) => c.author))].join(', ');
    const ok = confirm(
      `Pobrać ${n} commit(ów)${authors ? ` (autorzy: ${authors})` : ''}?\n\nZostanie wykonane: git pull --ff-only` +
        (`, ewentualnie npm ci`) +
        `, potem restart.`,
    );
    if (!ok) return;
    setDevBusy(true);
    setDevMsg(null);
    try {
      const r = await window.shell?.devSyncApply?.();
      setDevMsg(r?.error || r?.message || null);
      if (!r?.ok) setDevBusy(false);
    } catch (err) {
      setDevMsg(String((err as Error)?.message || err));
      setDevBusy(false);
    }
  }, [devCheck]);

  const onUpdateCheck = useCallback(async () => {
    setUpdBusy(true);
    setUpdMsg(null);
    try {
      const r = await window.shell?.updateCheck?.();
      if (!r?.ok) setUpdMsg(r?.error || 'Nie udało się sprawdzić aktualizacji.');
      else if (r.status) setUpdMsg(`Status: ${r.status}`);
    } finally {
      setUpdBusy(false);
    }
  }, []);

  const onUpdateInstall = useCallback(async () => {
    setUpdBusy(true);
    try {
      const r = await window.shell?.updateInstall?.();
      if (!r?.ok) setUpdMsg(r?.error || 'Instalacja nieudana.');
    } finally {
      setUpdBusy(false);
    }
  }, []);

  return (
    <div className="settings-stack">
      <SettingsGroup title="Status">
        <FieldRow label="Aktualny silnik">
          <Input readOnly value={settings.searchEngine} />
        </FieldRow>
        <FieldRow label="Proxy (normalne karty)">
          <Input readOnly value="system — Tor tylko na kartach Tor" />
        </FieldRow>
        <p className="snote">
          Skróty: <code>Ctrl+,</code> ustawienia · <code>Ctrl+B</code> sidebar ·{' '}
          <code>Ctrl+T</code> karta · <code>Ctrl+L</code> omnibox · <code>Shift+Esc</code>{' '}
          menedżer zadań.
        </p>
      </SettingsGroup>
      <SettingsGroup title="Narzędzia deweloperskie">
        <Toggle
          label="„Zbadaj element” w menu kontekstowym"
          hint="F12 / Ctrl+Shift+I zawsze otwierają DevTools. Ten przełącznik steruje tylko pozycją „Zbadaj” w PPM."
          on={settings.allowInspect}
          onChange={(v) => patchSettings({ allowInspect: v })}
        />
      </SettingsGroup>
      <SettingsGroup title="Soul">
        <Toggle
          label="Pozwól Soul sterować przeglądarką"
          hint="Lokalny serwer 127.0.0.1 dla asystenta Soul (tylko zwykłe karty; Tor, prywatne i strony wewnętrzne są niedostępne). Przy pierwszym połączeniu Vio zapyta o zgodę."
          on={settings.automationEnabled}
          onChange={(v) => patchSettings({ automationEnabled: v })}
        />
        {settings.automationEnabled && <SoulLog />}
      </SettingsGroup>

      {devSyncOn && (
        <SettingsGroup title="Współpraca (tylko tryb deweloperski)">
          <p className="snote">
            Pobiera zmiany z Git (<code>fetch</code> / <code>pull --ff-only</code>). Ukryte w
            zbudowanym .exe.
          </p>
          <Row label="Sprawdź remote i pokaż nowe commity">
            <button type="button" className="sbtn" disabled={devBusy} onClick={() => void onDevCheck()}>
              Sprawdź zmiany
            </button>
          </Row>
          {devCheck?.commits && devCheck.commits.length > 0 && (
            <ul className="snote" style={{ margin: '0.5rem 0', paddingLeft: '1.2rem' }}>
              {devCheck.commits.map((c) => (
                <li key={c.hash}>
                  <code>{c.hash}</code> · {c.author} — {c.subject}
                </li>
              ))}
            </ul>
          )}
          <Row label="Pobierz (ff-only) + ewentualnie npm ci + restart">
            <button
              type="button"
              className="sbtn"
              disabled={devBusy || !devCheck?.canFastForward}
              onClick={() => void onDevApply()}
            >
              Pobierz zmiany
            </button>
          </Row>
          {devMsg && <p className="snote">{devMsg}</p>}
        </SettingsGroup>
      )}

      <SettingsGroup title="Aktualizacje aplikacji">
        <p className="snote">
          Zbudowany .exe sprawdza publiczne Releases (patrz docs/REPO.md). Pobranie w tle;
          instalacja dopiero po „Uruchom ponownie”.
        </p>
        <Row label="Sprawdź dostępność nowej wersji">
          <button type="button" className="sbtn" disabled={updBusy} onClick={() => void onUpdateCheck()}>
            Sprawdź aktualizacje
          </button>
        </Row>
        <Row label="Zainstaluj pobraną aktualizację">
          <button
            type="button"
            className="sbtn"
            disabled={updBusy || !updReady}
            onClick={() => void onUpdateInstall()}
          >
            Uruchom ponownie
          </button>
        </Row>
        {updMsg && <p className="snote">{updMsg}</p>}
      </SettingsGroup>

      <SettingsGroup title="Reset">
        <Row label="Przywraca fabryczne ustawienia, bangs i skróty">
          <button
            type="button"
            className="sbtn danger-text"
            onClick={() => {
              if (confirm('Przywrócić wszystko do fabryki?')) resetSettings();
            }}
          >
            Reset wszystkiego
          </button>
        </Row>
      </SettingsGroup>
    </div>
  );
}
