import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  FolderOpen,
  Info,
  MoreHorizontal,
  Pin,
  Plus,
  Puzzle,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useT } from '../i18n';
import { useStore } from '../store';
import { InternalPage } from './InternalPage';
import { LibrarySwitcher } from './LibrarySwitcher';
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

const WEBSTORE = 'https://chromewebstore.google.com/';

export function ExtensionsPage() {
  const t = useT();
  const activeId = useStore((s) => s.activeId);
  const updateTab = useStore((s) => s.updateTab);
  const [rows, setRows] = useState<ExtRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [storeInput, setStoreInput] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const addRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(async () => {
    const res = await window.shell?.extensionsList?.();
    if (res?.ok && Array.isArray(res.extensions)) setRows(res.extensions as ExtRow[]);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!addOpen && !menuId) return;
    const onPtr = (e: PointerEvent) => {
      const n = e.target as Node;
      if (addOpen && !addRef.current?.contains(n)) setAddOpen(false);
      if (menuId && !menuRef.current?.contains(n)) setMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAddOpen(false);
        setMenuId(null);
        setDetailsId(null);
      }
    };
    window.addEventListener('pointerdown', onPtr, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPtr, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [addOpen, menuId]);

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
      setAddOpen(false);
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
      setAddOpen(false);
    }
  };

  const updateOne = async (id: string) => {
    setBusy(true);
    setErr(null);
    setMenuId(null);
    try {
      const res = await window.shell?.extensionsUpdate?.(id);
      if (!res?.ok) setErr(res?.error || t('internal.extUpdateFailed'));
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const displayName = (ext: ExtRow) => {
    if (!ext.name || ext.name.startsWith('__MSG_')) return ext.chromeId || ext.id;
    return ext.name;
  };

  return (
    <InternalPage
      className="extensions-page library-page"
      title={t('internal.extensions')}
      subtitle={<LibrarySwitcher active="extensions" />}
      toolbar={
        <>
          <button
            type="button"
            className="history-sbtn secondary"
            onClick={() => {
              if (activeId) updateTab(activeId, { url: WEBSTORE, title: 'Chrome Web Store' });
            }}
          >
            <ExternalLink size={14} strokeWidth={1.6} />
            {t('internal.extOpenWebStore')}
          </button>
          <div className="ext-add-wrap" ref={addRef}>
            <button
              type="button"
              className="history-sbtn secondary"
              disabled={busy}
              onClick={() => setAddOpen((v) => !v)}
            >
              <Plus size={14} strokeWidth={1.6} />
              {t('internal.extAddCompact')}
            </button>
            {addOpen && (
              <div className="ext-add-pop">
                <button type="button" disabled={busy} onClick={() => void installFolder()}>
                  <FolderOpen size={14} />
                  {t('internal.extFolderZip')}
                </button>
                <div className="ext-add-link">
                  <input
                    type="text"
                    value={storeInput}
                    onChange={(e) => setStoreInput(e.target.value)}
                    placeholder={t('internal.extStorePlaceholder')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void installStore();
                    }}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="history-sbtn secondary sm"
                    disabled={busy || !storeInput.trim()}
                    onClick={() => void installStore()}
                  >
                    {t('internal.extInstall')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      }
    >
      {err ? <p className="extensions-err">{err}</p> : null}

      {rows.length === 0 ? (
        <div className="ip-empty library-empty">
          <p>{t('internal.extensionsEmpty')}</p>
        </div>
      ) : (
        <ul className="ext-card-grid">
          {rows.map((ext) => (
            <li key={ext.id} className={`ext-card ${ext.enabled ? '' : 'off'}`}>
              <div className="ext-card-ico" aria-hidden>
                {ext.icon ? (
                  <img src={ext.icon} alt="" width={40} height={40} />
                ) : (
                  <Puzzle size={22} strokeWidth={1.5} />
                )}
              </div>
              <div className="ext-card-meta">
                <strong title={displayName(ext)}>{displayName(ext)}</strong>
                <span className="ext-card-ver">
                  {ext.version}
                  {ext.limitedSupport || (ext.warnings && ext.warnings.length > 0) ? (
                    <span
                      className="ext-card-info"
                      title={ext.warnings?.[0] || t('internal.extLimitedSupport')}
                    >
                      <Info size={12} strokeWidth={1.75} aria-hidden />
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="ext-card-actions">
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
                <Switch
                  on={ext.enabled}
                  onChange={(on) => {
                    void window.shell?.extensionsSetEnabled?.(ext.id, on).then(() => reload());
                  }}
                  aria-label={
                    ext.enabled
                      ? t('chrome.disableExtension', { name: displayName(ext) })
                      : t('chrome.enableExtension', { name: displayName(ext) })
                  }
                />
                <div className="ext-card-more" ref={menuId === ext.id ? menuRef : undefined}>
                  <button
                    type="button"
                    className="icon-btn sm"
                    title={t('common.more')}
                    onClick={() => setMenuId((id) => (id === ext.id ? null : ext.id))}
                  >
                    <MoreHorizontal size={14} strokeWidth={1.75} />
                  </button>
                  {menuId === ext.id && (
                    <div className="ext-card-menu">
                      <button
                        type="button"
                        onClick={() => {
                          setDetailsId((cur) => (cur === ext.id ? null : ext.id));
                          setMenuId(null);
                        }}
                      >
                        {t('internal.extDetails')}
                      </button>
                      {ext.canUpdate ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void updateOne(ext.id)}
                        >
                          <RefreshCw size={12} /> {t('internal.extUpdate')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          setMenuId(null);
                          if (!window.confirm(t('internal.extRemoveConfirm', { name: displayName(ext) })))
                            return;
                          void window.shell?.extensionsRemove?.(ext.id).then(() => reload());
                        }}
                      >
                        <Trash2 size={12} /> {t('common.delete')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {detailsId === ext.id ? (
                <div className="ext-card-details">
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
                  {ext.permissions && ext.permissions.length > 0 ? (
                    <ul className="extensions-perms-list">
                      {ext.permissions.map((p) => (
                        <li key={p}>
                          <code>{p}</code>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </InternalPage>
  );
}
