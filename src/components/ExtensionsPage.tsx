import { useCallback, useEffect, useState } from 'react';
import { Puzzle, FolderOpen, Trash2, RefreshCw, Pin, Link2, AlertTriangle } from 'lucide-react';
import { useT } from '../i18n';
import { InternalPage } from './InternalPage';
import { Switch } from './ui/Switch';

type ExtRow = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  allowPrivate: boolean;
  pinned?: boolean;
  permissions?: string[];
  loaded?: boolean;
  manifestVersion?: number;
  path?: string;
  source?: string;
  electronId?: string | null;
  chromeId?: string;
  usesWebRequest?: boolean;
  icon?: string | null;
  limitedSupport?: boolean;
  warnings?: string[];
  canUpdate?: boolean;
};

export function ExtensionsPage() {
  const t = useT();
  const [rows, setRows] = useState<ExtRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [storeInput, setStoreInput] = useState('');
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await window.shell?.extensionsList?.();
    if (res?.ok && Array.isArray(res.extensions)) setRows(res.extensions as ExtRow[]);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const installFolder = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await window.shell?.extensionsInstallFolder?.();
      if (res?.canceled) return;
      if (!res?.ok) setErr(res?.error || t('internal.extInstallFailed'));
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const installStore = async () => {
    const input = storeInput.trim();
    if (!input) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await window.shell?.extensionsInstallStore?.(input);
      if (!res?.ok) setErr(res?.error || t('internal.extInstallStoreFailed'));
      else setStoreInput('');
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const updateOne = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await window.shell?.extensionsUpdate?.(id);
      if (!res?.ok) setErr(res?.error || t('internal.extUpdateFailed'));
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <InternalPage
      className="extensions-page"
      title={t('internal.extensions')}
      icon={<Puzzle size={18} strokeWidth={1.75} />}
      subtitle={t('internal.extensionsSub')}
      toolbar={
        <>
          <button
            type="button"
            className="history-sbtn secondary"
            onClick={() => void reload()}
            title={t('common.refresh')}
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            className="history-sbtn secondary"
            disabled={busy}
            onClick={() => void installFolder()}
          >
            <FolderOpen size={14} />
            {t('internal.extFolderZip')}
          </button>
        </>
      }
    >
      <div className="extensions-store-row">
        <Link2 size={14} />
        <input
          type="text"
          className="extensions-store-input"
          placeholder={t('internal.extStorePlaceholder')}
          value={storeInput}
          onChange={(e) => setStoreInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void installStore();
          }}
          disabled={busy}
        />
        <button
          type="button"
          className="history-sbtn secondary"
          disabled={busy || !storeInput.trim()}
          onClick={() => void installStore()}
        >
          {t('internal.extInstall')}
        </button>
      </div>

      {err ? <p className="extensions-err">{err}</p> : null}

      {rows.length === 0 ? (
        <div className="ip-empty">
          <span className="ip-empty-ico" aria-hidden>
            <Puzzle size={28} strokeWidth={1.5} />
          </span>
          <p>{t('internal.extensionsEmpty')}</p>
          <span className="muted">{t('internal.extensionsEmptyHint')}</span>
        </div>
      ) : (
        <ul className="extensions-list">
          {rows.map((ext) => (
            <li key={ext.id} className={`extensions-row ${ext.enabled ? '' : 'off'}`}>
              <div className="extensions-ico" aria-hidden>
                {ext.icon ? (
                  <img src={ext.icon} alt="" width={32} height={32} />
                ) : (
                  <Puzzle size={20} strokeWidth={1.5} />
                )}
              </div>
              <div className="extensions-meta">
                <strong>{ext.name}</strong>
                <span className="muted">
                  v{ext.version}
                  {ext.manifestVersion ? ` · MV${ext.manifestVersion}` : ''}
                  {ext.loaded
                    ? ` · ${t('internal.extActive')}`
                    : ` · ${t('internal.extDisabledSession')}`}
                  {ext.usesWebRequest ? ` · ${t('internal.extWebRequestGhostery')}` : ''}
                </span>
                {ext.limitedSupport ? (
                  <p className="extensions-warn">
                    <AlertTriangle size={12} strokeWidth={2} />
                    {t('internal.extLimitedSupport')}
                    {ext.warnings?.[0] ? ` — ${ext.warnings[0]}` : ''}
                  </p>
                ) : null}
                {detailsId === ext.id && ext.permissions && ext.permissions.length > 0 ? (
                  <ul className="extensions-perms-list">
                    {ext.permissions.map((p) => (
                      <li key={p}>
                        <code>{p}</code>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="extensions-actions">
                <Switch
                  on={ext.enabled}
                  onChange={(on) => {
                    void window.shell?.extensionsSetEnabled?.(ext.id, on).then(() => reload());
                  }}
                  aria-label={
                    ext.enabled
                      ? t('chrome.disableExtension', { name: ext.name })
                      : t('chrome.enableExtension', { name: ext.name })
                  }
                />
                <button
                  type="button"
                  className={`icon-btn sm ${ext.pinned ? 'on' : ''}`}
                  title={ext.pinned ? t('chrome.unpinFromBar') : t('chrome.pinToBar')}
                  disabled={!ext.enabled}
                  onClick={() => {
                    void window.shell
                      ?.extensionsSetPinned?.(ext.id, !ext.pinned)
                      .then(() => reload());
                  }}
                >
                  <Pin size={13} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="history-sbtn secondary sm"
                  onClick={() => setDetailsId((cur) => (cur === ext.id ? null : ext.id))}
                >
                  {t('internal.extDetails')}
                </button>
                {ext.canUpdate ? (
                  <button
                    type="button"
                    className="history-sbtn secondary sm"
                    disabled={busy}
                    title={t('internal.extUpdate')}
                    onClick={() => void updateOne(ext.id)}
                  >
                    <RefreshCw size={12} />
                    {t('internal.extUpdate')}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="icon-btn"
                  title={t('common.delete')}
                  onClick={() => {
                    if (!window.confirm(t('internal.extRemoveConfirm', { name: ext.name }))) return;
                    void window.shell?.extensionsRemove?.(ext.id).then(() => reload());
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {detailsId === ext.id ? (
                <div className="extensions-details">
                  <label className="extensions-toggle">
                    <input
                      type="checkbox"
                      checked={ext.allowPrivate}
                      onChange={(e) => {
                        void window.shell
                          ?.extensionsSetPrivate?.(ext.id, e.target.checked)
                          .then(() => reload());
                      }}
                    />
                    {t('internal.extPrivate')}
                  </label>
                  <span className="muted extensions-id" title={ext.id}>
                    ID: {ext.chromeId || ext.electronId || ext.id}
                  </span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <footer className="extensions-foot muted">
        <p>{t('internal.extFootnote')}</p>
      </footer>
    </InternalPage>
  );
}
