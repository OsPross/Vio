import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Copy,
  Download,
  Eye,
  EyeOff,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { useStore } from '../store';
import { Input } from './ui/Input';
import { Switch } from './ui/Switch';

type PwPublic = {
  id: string;
  origin: string;
  username: string;
  note: string;
  hasTotp: boolean;
  createdAt: number;
  lastUsedAt: number;
  updatedAt: number;
};

type Status = {
  setup: boolean;
  unlocked: boolean;
  remember: boolean;
  rememberAvailable: boolean;
  entryCount: number;
  idleMinutes: number;
};

import { resolveFavicon, faviconImgFallback } from '../lib/favicon';

function faviconFor(origin: string, cached?: string) {
  return resolveFavicon(origin, cached);
}

function hostOf(origin: string) {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sg">
      <h3 className="sg-title">{title}</h3>
      <div className="sg-block">{children}</div>
    </section>
  );
}

function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="sr">
      <div className="sr-text">
        <div className="sr-label">{label}</div>
        {hint ? <div className="sr-hint">{hint}</div> : null}
      </div>
      {children ? <div className="sr-control">{children}</div> : null}
    </div>
  );
}

export function PasswordsPanel() {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);

  const [status, setStatus] = useState<Status | null>(null);
  const [shellMissing, setShellMissing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [master, setMaster] = useState('');
  const [master2, setMaster2] = useState('');
  const [remember, setRemember] = useState(true);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<PwPublic[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<
    (PwPublic & { password: string; totpSecret: string }) | null
  >(null);
  const [showPw, setShowPw] = useState(false);
  const [totp, setTotp] = useState<{ code: string; remaining: number } | null>(null);
  const [panel, setPanel] = useState<'list' | 'generator' | 'audit' | 'import'>('list');
  const [genLen, setGenLen] = useState(20);
  const [genSymbols, setGenSymbols] = useState(true);
  const [genPassphrase, setGenPassphrase] = useState(false);
  const [genOut, setGenOut] = useState('');
  const [genLabel, setGenLabel] = useState('');
  const [audit, setAudit] = useState<{
    total: number;
    weak: PwPublic[];
    reused: PwPublic[];
    old: PwPublic[];
  } | null>(null);
  const [exportMaster, setExportMaster] = useState('');
  const [neverList, setNeverList] = useState<string[]>([]);
  const [draft, setDraft] = useState({
    origin: '',
    username: '',
    password: '',
    note: '',
    totpSecret: '',
  });
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoadError('');
    if (!window.shell?.passwordsStatus) {
      setShellMissing(true);
      return;
    }
    try {
      const st = await Promise.race([
        window.shell.passwordsStatus(),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('Timeout: shell:passwords-status')), 10_000),
        ),
      ]);
      if (st && typeof st === 'object' && 'ok' in st && (st as { ok?: boolean }).ok === false) {
        setStatus(null);
        setLoadError(
          String((st as { error?: string }).error || 'Nie udało się odczytać statusu sejfu'),
        );
        return;
      }
      if (st && typeof st === 'object' && 'setup' in st) {
        setStatus(st as Status);
        return;
      }
      setStatus(null);
      setLoadError('Brak odpowiedzi statusu sejfu');
    } catch (err) {
      setStatus(null);
      setLoadError(String((err as Error)?.message || err || 'Błąd IPC sejfu'));
    }
  }, []);

  const refreshList = useCallback(async () => {
    const list = await window.shell?.passwordsList?.(query);
    if (Array.isArray(list)) setEntries(list);
    else setEntries([]);
  }, [query]);

  useEffect(() => {
    void refreshStatus();
    void window.shell?.passwordsIdle?.(settings.passwordsIdleMinutes);
    const unsub = window.shell?.onPasswordsLocked?.(() => {
      setStatus((s) => (s ? { ...s, unlocked: false } : s));
      setEntries([]);
      setDetail(null);
      setSelected(null);
    });
    return () => unsub?.();
  }, [refreshStatus, settings.passwordsIdleMinutes]);

  useEffect(() => {
    if (status?.unlocked) void refreshList();
  }, [status?.unlocked, refreshList]);

  useEffect(() => {
    if (!selected || !status?.unlocked) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const d = await window.shell?.passwordsGet?.(selected);
      if (cancelled) return;
      if (d && 'password' in d && !('ok' in d && d.ok === false)) {
        setDetail(d as PwPublic & { password: string; totpSecret: string });
        setShowPw(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, status?.unlocked]);

  useEffect(() => {
    if (!detail?.hasTotp && !detail?.totpSecret) {
      setTotp(null);
      return;
    }
    let alive = true;
    const tick = async () => {
      const t = await window.shell?.passwordsTotp?.(detail!.id);
      if (!alive) return;
      if (t && 'code' in t) setTotp(t);
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [detail]);

  const onSetup = async () => {
    setError('');
    if (master !== master2) {
      setError('Hasła nie są takie same');
      return;
    }
    setBusy(true);
    const res = await window.shell?.passwordsSetup?.(master, remember);
    setBusy(false);
    if (!res?.ok && res?.error) {
      setError(res.error);
      return;
    }
    setMaster('');
    setMaster2('');
    await refreshStatus();
  };

  const onUnlock = async () => {
    setError('');
    setBusy(true);
    const res = await window.shell?.passwordsUnlock?.(master, remember);
    setBusy(false);
    if (res && res.ok === false && res.error) {
      setError(res.error);
      return;
    }
    if (res && !res.unlocked && res.error) {
      setError(res.error);
      return;
    }
    setMaster('');
    await refreshStatus();
  };

  const onLock = async () => {
    await window.shell?.passwordsLock?.();
    setDetail(null);
    setSelected(null);
    await refreshStatus();
  };

  const onGenerate = async () => {
    const res = await window.shell?.passwordsGenerate?.({
      length: genLen,
      symbols: genSymbols,
      passphrase: genPassphrase,
      words: 5,
    });
    if (res?.password) {
      setGenOut(res.password);
      setGenLabel(res.label);
    }
  };

  const onAudit = async () => {
    const a = await window.shell?.passwordsAudit?.();
    if (a && 'total' in a) setAudit(a);
  };

  const onExport = async () => {
    setError('');
    const res = await window.shell?.passwordsExport?.(exportMaster);
    if (!res?.ok || !res.csv) {
      setError(res?.error || 'Eksport nieudany');
      return;
    }
    const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vio-passwords.csv';
    a.click();
    URL.revokeObjectURL(url);
    setExportMaster('');
  };

  const onImportFile = async (file: File) => {
    setError('');
    const text = await file.text();
    const res = await window.shell?.passwordsImport?.(text, 'chrome');
    if (!res?.ok) {
      setError(res?.error || 'Import nieudany');
      return;
    }
    await refreshList();
    await refreshStatus();
  };

  const saveDraft = async () => {
    setError('');
    const res = await window.shell?.passwordsAdd?.(draft);
    if (!res || ('ok' in res && res.ok === false)) {
      setError(
        ('error' in (res || {}) && (res as { error?: string }).error) || 'Nie udało się dodać',
      );
      return;
    }
    setDraft({ origin: '', username: '', password: '', note: '', totpSecret: '' });
    await refreshList();
  };

  const unlocked = Boolean(status?.unlocked);

  const idleOptions = useMemo(
    () => [
      { id: 5, label: '5 min' },
      { id: 15, label: '15 min' },
      { id: 30, label: '30 min' },
      { id: 60, label: '60 min' },
    ],
    [],
  );

  if (shellMissing) {
    return (
      <p className="snote">
        Menedżer haseł działa tylko w oknie Electron (IPC). Otwórz aplikację przez{' '}
        <code>npm run electron:dev</code>, nie sam Vite w przeglądarce.
      </p>
    );
  }

  if (loadError && !status) {
    return (
      <div className="snote" style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
        <span>{loadError}</span>
        <button type="button" className="sbtn" onClick={() => void refreshStatus()}>
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  if (!status) {
    return <p className="snote">Ładowanie menedżera haseł…</p>;
  }

  if (!status.setup) {
    return (
      <>
        <SettingsGroup title="Utwórz sejf">
          <SettingsRow
            label="Hasło główne"
            hint="Minimum 8 znaków. Nie da się odzyskać — zapamiętaj je."
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={master}
              onChange={(e) => setMaster(e.target.value)}
            />
          </SettingsRow>
          <SettingsRow label="Powtórz hasło">
            <Input
              type="password"
              autoComplete="new-password"
              value={master2}
              onChange={(e) => setMaster2(e.target.value)}
            />
          </SettingsRow>
          <SettingsRow
            label="Zapamiętaj na tym urządzeniu"
            hint="Klucz chroniony przez Windows DPAPI (safeStorage). Każdy z dostępem do tego konta Windows może wtedy otworzyć sejf bez hasła głównego."
          >
            <Switch
              on={remember && !!status.rememberAvailable}
              disabled={!status.rememberAvailable}
              onChange={(v) => setRemember(v)}
              aria-label="Zapamiętaj"
            />
          </SettingsRow>
          {error ? (
            <p className="snote" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          ) : null}
          <div className="slist-row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              className="sbtn"
              disabled={busy || master.length < 8}
              onClick={() => void onSetup()}
            >
              Utwórz sejf
            </button>
          </div>
        </SettingsGroup>
      </>
    );
  }

  if (!unlocked) {
    return (
      <>
        <SettingsGroup title="Odblokuj sejf">
          <SettingsRow label="Hasło główne" hint={`${status.entryCount} zapisanych kont`}>
            <Input
              type="password"
              autoComplete="current-password"
              value={master}
              onChange={(e) => setMaster(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onUnlock();
              }}
            />
          </SettingsRow>
          <SettingsRow
            label="Zapamiętaj na tym urządzeniu"
            hint="DPAPI — każdy z dostępem do konta Windows może otworzyć sejf."
          >
            <Switch
              on={remember && !!status.rememberAvailable}
              disabled={!status.rememberAvailable}
              onChange={(v) => setRemember(v)}
              aria-label="Zapamiętaj"
            />
          </SettingsRow>
          {error ? (
            <p className="snote" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          ) : null}
          <div className="slist-row" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="sbtn"
              disabled={busy || !master}
              onClick={() => void onUnlock()}
            >
              <Lock size={14} strokeWidth={1.75} /> Odblokuj
            </button>
          </div>
        </SettingsGroup>
      </>
    );
  }

  return (
    <>
      <SettingsGroup title="Preferencje">
        <SettingsRow label="Menedżer haseł" hint="Wykrywanie logowań i ikona w omniboxie.">
          <Switch
            on={!!settings.passwordsEnabled}
            onChange={(v) => patchSettings({ passwordsEnabled: v })}
            aria-label="Menedżer haseł"
          />
        </SettingsRow>
        <SettingsRow
          label="Autouzupełnianie"
          hint="Tylko HTTPS, ścisły origin, bez cross-origin iframe."
        >
          <Switch
            on={!!settings.passwordsAutofill}
            onChange={(v) => patchSettings({ passwordsAutofill: v })}
            aria-label="Autouzupełnianie"
          />
        </SettingsRow>
        <SettingsRow label="Proponuj zapis" hint="Pasek po wysłaniu formularza logowania.">
          <Switch
            on={!!settings.passwordsOfferSave}
            onChange={(v) => patchSettings({ passwordsOfferSave: v })}
            aria-label="Proponuj zapis"
          />
        </SettingsRow>
        <SettingsRow label="Auto-blokada" hint="Po bezczynności i przy uśpieniu systemu.">
          <div className="sseg">
            {idleOptions.map((o) => (
              <button
                key={o.id}
                type="button"
                className={settings.passwordsIdleMinutes === o.id ? 'on' : ''}
                onClick={() => {
                  patchSettings({ passwordsIdleMinutes: o.id });
                  void window.shell?.passwordsIdle?.(o.id);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </SettingsRow>
        <div className="slist-row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="sbtn ghost" onClick={() => void onLock()}>
            Zablokuj teraz
          </button>
        </div>
      </SettingsGroup>

      <div className="pw-tabs">
        {(
          [
            ['list', 'Konta'],
            ['generator', 'Generator'],
            ['audit', 'Audyt'],
            ['import', 'Import / eksport'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={panel === id ? 'on' : ''}
            onClick={() => {
              setPanel(id);
              if (id === 'audit') void onAudit();
              if (id === 'import') {
                void window.shell?.passwordsNeverList?.().then((n) => {
                  if (Array.isArray(n)) setNeverList(n);
                });
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {panel === 'list' && (
        <>
          <SettingsGroup title="Zapisane konta">
            <div className="pw-search">
              <Search size={14} strokeWidth={1.75} />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Szukaj domeny lub loginu…"
              />
            </div>
            <div className="pw-list">
              {entries.length === 0 && <p className="snote">Brak wpisów.</p>}
              {entries.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={`pw-item ${selected === e.id ? 'on' : ''}`}
                  onClick={() => setSelected(e.id)}
                >
                  <img
                    src={faviconFor(e.origin)}
                    alt=""
                    width={16}
                    height={16}
                    onError={(ev) => faviconImgFallback(ev, e.origin)}
                  />
                  <span className="pw-item-text">
                    <strong>{hostOf(e.origin)}</strong>
                    <em>{e.username || '—'}</em>
                  </span>
                </button>
              ))}
            </div>
          </SettingsGroup>

          {detail && (
            <SettingsGroup title="Szczegóły">
              <SettingsRow label="Strona">
                <span className="sr-value">{detail.origin}</span>
              </SettingsRow>
              <SettingsRow label="Login">
                <span className="sr-value">{detail.username || '—'}</span>
              </SettingsRow>
              <SettingsRow label="Hasło">
                <div className="pw-inline">
                  <code>{showPw ? detail.password : '••••••••••••'}</code>
                  <button
                    type="button"
                    className="sbtn ghost"
                    onClick={() => setShowPw((v) => !v)}
                    title="Pokaż"
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    type="button"
                    className="sbtn ghost"
                    title="Kopiuj (wyczyść po 30 s)"
                    onClick={() => void window.shell?.passwordsCopy?.(detail.id)}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </SettingsRow>
              {totp && (
                <SettingsRow label="Kod 2FA" hint={`Odświeżenie za ${totp.remaining}s`}>
                  <code className="sr-value">{totp.code}</code>
                </SettingsRow>
              )}
              {detail.note ? (
                <SettingsRow label="Notatka">
                  <span className="sr-value">{detail.note}</span>
                </SettingsRow>
              ) : null}
              <div className="slist-row" style={{ justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="sbtn danger-text"
                  onClick={() => {
                    if (!confirm('Usunąć ten wpis?')) return;
                    void window.shell?.passwordsRemove?.(detail.id).then(() => {
                      setSelected(null);
                      setDetail(null);
                      void refreshList();
                    });
                  }}
                >
                  <Trash2 size={14} /> Usuń
                </button>
              </div>
            </SettingsGroup>
          )}

          <SettingsGroup title="Dodaj ręcznie">
            <SettingsRow label="Origin (https://…)">
              <Input
                value={draft.origin}
                onChange={(e) => setDraft((d) => ({ ...d, origin: e.target.value }))}
                placeholder="https://example.com"
              />
            </SettingsRow>
            <SettingsRow label="Login">
              <Input
                value={draft.username}
                onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
              />
            </SettingsRow>
            <SettingsRow label="Hasło">
              <Input
                type="password"
                value={draft.password}
                onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
              />
            </SettingsRow>
            <SettingsRow label="Notatka">
              <Input
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />
            </SettingsRow>
            <SettingsRow label="TOTP (opcjonalnie)" hint="Sekret base32">
              <Input
                value={draft.totpSecret}
                onChange={(e) => setDraft((d) => ({ ...d, totpSecret: e.target.value }))}
              />
            </SettingsRow>
            {error ? (
              <p className="snote" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            ) : null}
            <div className="slist-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="sbtn" onClick={() => void saveDraft()}>
                <Plus size={14} /> Dodaj
              </button>
            </div>
          </SettingsGroup>
        </>
      )}

      {panel === 'generator' && (
        <SettingsGroup title="Generator">
          <SettingsRow label="Fraza słowna">
            <Switch on={genPassphrase} onChange={setGenPassphrase} aria-label="Fraza słowna" />
          </SettingsRow>
          {!genPassphrase && (
            <>
              <SettingsRow label="Długość" hint={`${genLen} znaków`}>
                <div className="sslider">
                  <input
                    type="range"
                    min={8}
                    max={64}
                    value={genLen}
                    onChange={(e) => setGenLen(Number(e.target.value))}
                  />
                  <span className="sslider-val">{genLen}</span>
                </div>
              </SettingsRow>
              <SettingsRow label="Symbole">
                <Switch on={genSymbols} onChange={setGenSymbols} aria-label="Symbole" />
              </SettingsRow>
            </>
          )}
          <div className="slist-row" style={{ gap: 8 }}>
            <button type="button" className="sbtn" onClick={() => void onGenerate()}>
              <RefreshCw size={14} /> Generuj
            </button>
            {genOut ? (
              <button
                type="button"
                className="sbtn ghost"
                onClick={() => void navigator.clipboard.writeText(genOut)}
              >
                <Copy size={14} /> Kopiuj
              </button>
            ) : null}
          </div>
          {genOut ? (
            <div className="pw-gen-out">
              <code>{genOut}</code>
              <span>{genLabel}</span>
            </div>
          ) : null}
        </SettingsGroup>
      )}

      {panel === 'audit' && (
        <SettingsGroup title="Audyt bezpieczeństwa">
          <SettingsRow label="Wszystkie wpisy">
            <span className="sr-value">{audit?.total ?? '—'}</span>
          </SettingsRow>
          <SettingsRow label="Słabe" hint="Niska entropia / krótkie">
            <span className="sr-value">{audit?.weak.length ?? 0}</span>
          </SettingsRow>
          <SettingsRow label="Powtórzone">
            <span className="sr-value">{audit?.reused.length ?? 0}</span>
          </SettingsRow>
          <SettingsRow label="Starsze niż rok">
            <span className="sr-value">{audit?.old.length ?? 0}</span>
          </SettingsRow>
          {(audit?.weak.length || 0) > 0 && (
            <div className="pw-audit-list">
              <div className="sg-title" style={{ margin: '12px 16px 8px' }}>
                <ShieldAlert size={12} style={{ display: 'inline', marginRight: 6 }} />
                Słabe hasła
              </div>
              {audit!.weak.slice(0, 12).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="pw-item"
                  onClick={() => {
                    setPanel('list');
                    setSelected(e.id);
                  }}
                >
                  <img
                    src={faviconFor(e.origin)}
                    alt=""
                    width={16}
                    height={16}
                    onError={(ev) => faviconImgFallback(ev, e.origin)}
                  />
                  <span className="pw-item-text">
                    <strong>{hostOf(e.origin)}</strong>
                    <em>{e.username}</em>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="slist-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="sbtn ghost" onClick={() => void onAudit()}>
              Odśwież audyt
            </button>
          </div>
        </SettingsGroup>
      )}

      {panel === 'import' && (
        <>
          <SettingsGroup title="Import CSV">
            <p className="snote">
              Chrome / Edge / Firefox / Bitwarden — kolumny url, username, password.
            </p>
            <div className="slist-row">
              <label className="sbtn">
                <Upload size={14} /> Wybierz plik
                <input
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onImportFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </SettingsGroup>
          <SettingsGroup title="Eksport CSV">
            <SettingsRow label="Potwierdź hasłem głównym" hint="Wymagane przed eksportem.">
              <Input
                type="password"
                value={exportMaster}
                onChange={(e) => setExportMaster(e.target.value)}
              />
            </SettingsRow>
            {error ? (
              <p className="snote" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            ) : null}
            <div className="slist-row" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="sbtn"
                disabled={!exportMaster}
                onClick={() => void onExport()}
              >
                <Download size={14} /> Eksportuj
              </button>
            </div>
          </SettingsGroup>
          {neverList.length > 0 && (
            <SettingsGroup title="Nigdy nie zapisuj">
              {neverList.map((o) => (
                <div key={o} className="slist-row">
                  <span className="grow mono">{o}</span>
                  <button
                    type="button"
                    className="sbtn ghost"
                    onClick={() =>
                      void window.shell?.passwordsNeverRemove?.(o).then(() => {
                        setNeverList((xs) => xs.filter((x) => x !== o));
                      })
                    }
                  >
                    Usuń
                  </button>
                </div>
              ))}
            </SettingsGroup>
          )}
        </>
      )}
    </>
  );
}
