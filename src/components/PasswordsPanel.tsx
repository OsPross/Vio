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
import { useT } from '../i18n';
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
  const t = useT();
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
          String((st as { error?: string }).error || t('settings.passwords.statusReadFailed')),
        );
        return;
      }
      if (st && typeof st === 'object' && 'setup' in st) {
        setStatus(st as Status);
        return;
      }
      setStatus(null);
      setLoadError(t('settings.passwords.statusNoResponse'));
    } catch (err) {
      setStatus(null);
      setLoadError(String((err as Error)?.message || err || t('settings.passwords.statusIpcError')));
    }
  }, [t]);

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
      const totpRes = await window.shell?.passwordsTotp?.(detail!.id);
      if (!alive) return;
      if (totpRes && 'code' in totpRes) setTotp(totpRes);
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
      setError(t('settings.passwords.mismatch'));
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
      setError(res?.error || t('settings.passwords.exportFailed'));
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
      setError(res?.error || t('settings.passwords.importFailed'));
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
        ('error' in (res || {}) && (res as { error?: string }).error) ||
          t('settings.passwords.addFailed'),
      );
      return;
    }
    setDraft({ origin: '', username: '', password: '', note: '', totpSecret: '' });
    await refreshList();
  };

  const unlocked = Boolean(status?.unlocked);

  const idleOptions = useMemo(
    () => [
      { id: 5, label: t('settings.passwords.idleMin', { n: 5 }) },
      { id: 15, label: t('settings.passwords.idleMin', { n: 15 }) },
      { id: 30, label: t('settings.passwords.idleMin', { n: 30 }) },
      { id: 60, label: t('settings.passwords.idleMin', { n: 60 }) },
    ],
    [t],
  );

  if (shellMissing) {
    return (
      <p className="snote">
        {t('settings.passwords.shellMissingBefore')}{' '}
        <code>npm run electron:dev</code>
        {t('settings.passwords.shellMissingAfter')}
      </p>
    );
  }

  if (loadError && !status) {
    return (
      <div className="snote" style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
        <span>{loadError}</span>
        <button type="button" className="sbtn" onClick={() => void refreshStatus()}>
          {t('errors.tryAgain')}
        </button>
      </div>
    );
  }

  if (!status) {
    return <p className="snote">{t('settings.passwords.loading')}</p>;
  }

  if (!status.setup) {
    return (
      <>
        <SettingsGroup title={t('settings.passwords.createVault')}>
          <SettingsRow
            label={t('settings.passwords.masterPassword')}
            hint={t('settings.passwords.masterHint')}
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={master}
              onChange={(e) => setMaster(e.target.value)}
            />
          </SettingsRow>
          <SettingsRow label={t('settings.passwords.repeatPassword')}>
            <Input
              type="password"
              autoComplete="new-password"
              value={master2}
              onChange={(e) => setMaster2(e.target.value)}
            />
          </SettingsRow>
          <SettingsRow
            label={t('settings.passwords.rememberDevice')}
            hint={t('settings.passwords.rememberHintSetup')}
          >
            <Switch
              on={remember && !!status.rememberAvailable}
              disabled={!status.rememberAvailable}
              onChange={(v) => setRemember(v)}
              aria-label={t('settings.passwords.rememberAria')}
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
              {t('settings.passwords.createVault')}
            </button>
          </div>
        </SettingsGroup>
      </>
    );
  }

  if (!unlocked) {
    return (
      <>
        <SettingsGroup title={t('settings.passwords.unlockVault')}>
          <SettingsRow
            label={t('settings.passwords.masterPassword')}
            hint={t('settings.passwords.savedAccounts', { count: status.entryCount })}
          >
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
            label={t('settings.passwords.rememberDevice')}
            hint={t('settings.passwords.rememberHintUnlock')}
          >
            <Switch
              on={remember && !!status.rememberAvailable}
              disabled={!status.rememberAvailable}
              onChange={(v) => setRemember(v)}
              aria-label={t('settings.passwords.rememberAria')}
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
              <Lock size={14} strokeWidth={1.75} /> {t('settings.passwords.unlock')}
            </button>
          </div>
        </SettingsGroup>
      </>
    );
  }

  return (
    <>
      <SettingsGroup title={t('settings.passwords.prefs')}>
        <SettingsRow
          label={t('settings.passwords.manager')}
          hint={t('settings.passwords.managerHint')}
        >
          <Switch
            on={!!settings.passwordsEnabled}
            onChange={(v) => patchSettings({ passwordsEnabled: v })}
            aria-label={t('settings.passwords.manager')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('settings.passwords.autofill')}
          hint={t('settings.passwords.autofillHint')}
        >
          <Switch
            on={!!settings.passwordsAutofill}
            onChange={(v) => patchSettings({ passwordsAutofill: v })}
            aria-label={t('settings.passwords.autofill')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('settings.passwords.offerSave')}
          hint={t('settings.passwords.offerSaveHint')}
        >
          <Switch
            on={!!settings.passwordsOfferSave}
            onChange={(v) => patchSettings({ passwordsOfferSave: v })}
            aria-label={t('settings.passwords.offerSave')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('settings.passwords.autoLock')}
          hint={t('settings.passwords.autoLockHint')}
        >
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
            {t('settings.passwords.lockNow')}
          </button>
        </div>
      </SettingsGroup>

      <div className="pw-tabs">
        {(
          [
            ['list', 'tabAccounts'],
            ['generator', 'tabGenerator'],
            ['audit', 'tabAudit'],
            ['import', 'tabImport'],
          ] as const
        ).map(([id, key]) => (
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
            {t(`settings.passwords.${key}`)}
          </button>
        ))}
      </div>

      {panel === 'list' && (
        <>
          <SettingsGroup title={t('settings.passwords.savedAccountsTitle')}>
            <div className="pw-search">
              <Search size={14} strokeWidth={1.75} />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('settings.passwords.searchPlaceholder')}
              />
            </div>
            <div className="pw-list">
              {entries.length === 0 && <p className="snote">{t('settings.passwords.empty')}</p>}
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
            <SettingsGroup title={t('settings.passwords.details')}>
              <SettingsRow label={t('settings.passwords.site')}>
                <span className="sr-value">{detail.origin}</span>
              </SettingsRow>
              <SettingsRow label={t('settings.passwords.username')}>
                <span className="sr-value">{detail.username || '—'}</span>
              </SettingsRow>
              <SettingsRow label={t('settings.passwords.password')}>
                <div className="pw-inline">
                  <code>{showPw ? detail.password : '••••••••••••'}</code>
                  <button
                    type="button"
                    className="sbtn ghost"
                    onClick={() => setShowPw((v) => !v)}
                    title={t('settings.passwords.show')}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    type="button"
                    className="sbtn ghost"
                    title={t('settings.passwords.copyClear')}
                    onClick={() => void window.shell?.passwordsCopy?.(detail.id)}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </SettingsRow>
              {totp && (
                <SettingsRow
                  label={t('settings.passwords.totpCode')}
                  hint={t('settings.passwords.totpRefresh', { s: totp.remaining })}
                >
                  <code className="sr-value">{totp.code}</code>
                </SettingsRow>
              )}
              {detail.note ? (
                <SettingsRow label={t('settings.passwords.note')}>
                  <span className="sr-value">{detail.note}</span>
                </SettingsRow>
              ) : null}
              <div className="slist-row" style={{ justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="sbtn danger-text"
                  onClick={() => {
                    if (!confirm(t('settings.passwords.removeConfirm'))) return;
                    void window.shell?.passwordsRemove?.(detail.id).then(() => {
                      setSelected(null);
                      setDetail(null);
                      void refreshList();
                    });
                  }}
                >
                  <Trash2 size={14} /> {t('common.delete')}
                </button>
              </div>
            </SettingsGroup>
          )}

          <SettingsGroup title={t('settings.passwords.addManual')}>
            <SettingsRow label={t('settings.passwords.origin')}>
              <Input
                value={draft.origin}
                onChange={(e) => setDraft((d) => ({ ...d, origin: e.target.value }))}
                placeholder="https://example.com"
              />
            </SettingsRow>
            <SettingsRow label={t('settings.passwords.username')}>
              <Input
                value={draft.username}
                onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
              />
            </SettingsRow>
            <SettingsRow label={t('settings.passwords.password')}>
              <Input
                type="password"
                value={draft.password}
                onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
              />
            </SettingsRow>
            <SettingsRow label={t('settings.passwords.note')}>
              <Input
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />
            </SettingsRow>
            <SettingsRow
              label={t('settings.passwords.totpOptional')}
              hint={t('settings.passwords.totpSecretHint')}
            >
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
                <Plus size={14} /> {t('common.add')}
              </button>
            </div>
          </SettingsGroup>
        </>
      )}

      {panel === 'generator' && (
        <SettingsGroup title={t('settings.passwords.generator')}>
          <SettingsRow label={t('settings.passwords.passphrase')}>
            <Switch
              on={genPassphrase}
              onChange={setGenPassphrase}
              aria-label={t('settings.passwords.passphrase')}
            />
          </SettingsRow>
          {!genPassphrase && (
            <>
              <SettingsRow
                label={t('settings.passwords.length')}
                hint={t('settings.passwords.chars', { n: genLen })}
              >
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
              <SettingsRow label={t('settings.passwords.symbols')}>
                <Switch
                  on={genSymbols}
                  onChange={setGenSymbols}
                  aria-label={t('settings.passwords.symbols')}
                />
              </SettingsRow>
            </>
          )}
          <div className="slist-row" style={{ gap: 8 }}>
            <button type="button" className="sbtn" onClick={() => void onGenerate()}>
              <RefreshCw size={14} /> {t('settings.passwords.generate')}
            </button>
            {genOut ? (
              <button
                type="button"
                className="sbtn ghost"
                onClick={() => void navigator.clipboard.writeText(genOut)}
              >
                <Copy size={14} /> {t('common.copy')}
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
        <SettingsGroup title={t('settings.passwords.auditTitle')}>
          <SettingsRow label={t('settings.passwords.allEntries')}>
            <span className="sr-value">{audit?.total ?? '—'}</span>
          </SettingsRow>
          <SettingsRow
            label={t('settings.passwords.weak')}
            hint={t('settings.passwords.weakHint')}
          >
            <span className="sr-value">{audit?.weak.length ?? 0}</span>
          </SettingsRow>
          <SettingsRow label={t('settings.passwords.reused')}>
            <span className="sr-value">{audit?.reused.length ?? 0}</span>
          </SettingsRow>
          <SettingsRow label={t('settings.passwords.olderThanYear')}>
            <span className="sr-value">{audit?.old.length ?? 0}</span>
          </SettingsRow>
          {(audit?.weak.length || 0) > 0 && (
            <div className="pw-audit-list">
              <div className="sg-title" style={{ margin: '12px 16px 8px' }}>
                <ShieldAlert size={12} style={{ display: 'inline', marginRight: 6 }} />
                {t('settings.passwords.weakPasswords')}
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
              {t('settings.passwords.refreshAudit')}
            </button>
          </div>
        </SettingsGroup>
      )}

      {panel === 'import' && (
        <>
          <SettingsGroup title={t('settings.passwords.importCsv')}>
            <p className="snote">{t('settings.passwords.importHint')}</p>
            <div className="slist-row">
              <label className="sbtn">
                <Upload size={14} /> {t('settings.passwords.chooseFile')}
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
          <SettingsGroup title={t('settings.passwords.exportCsv')}>
            <SettingsRow
              label={t('settings.passwords.confirmMaster')}
              hint={t('settings.passwords.confirmMasterHint')}
            >
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
                <Download size={14} /> {t('settings.passwords.export')}
              </button>
            </div>
          </SettingsGroup>
          {neverList.length > 0 && (
            <SettingsGroup title={t('settings.passwords.neverSave')}>
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
                    {t('common.delete')}
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
