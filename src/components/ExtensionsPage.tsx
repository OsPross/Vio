import { useCallback, useEffect, useState } from 'react';
import { Puzzle, FolderOpen, Trash2, RefreshCw, Pin, Link2 } from 'lucide-react';

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
};

export function ExtensionsPage() {
  const [rows, setRows] = useState<ExtRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [storeInput, setStoreInput] = useState('');

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
      if (!res?.ok) setErr(res?.error || 'Instalacja nieudana');
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
      if (!res?.ok) setErr(res?.error || 'Instalacja ze sklepu nieudana');
      else setStoreInput('');
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="internal-page extensions-page">
      <header className="internal-page-head">
        <div className="internal-page-head-text">
          <h1>
            <Puzzle size={22} strokeWidth={1.75} style={{ verticalAlign: '-4px', marginRight: 8 }} />
            Rozszerzenia
          </h1>
          <p className="internal-page-subtitle">
            <code>session.loadExtension</code> (MV3 gdzie Electron pozwala). Tor — nigdy. Prywatne — tylko
            gdy włączysz per rozszerzenie.
          </p>
        </div>
        <div className="internal-page-toolbar extensions-actions">
          <button type="button" className="sbtn" onClick={() => void reload()} title="Odśwież">
            <RefreshCw size={14} />
          </button>
          <button type="button" className="sbtn primary" disabled={busy} onClick={() => void installFolder()}>
            <FolderOpen size={14} />
            Folder / ZIP / CRX…
          </button>
        </div>
      </header>

      <div className="extensions-store-row">
        <Link2 size={14} />
        <input
          type="text"
          className="extensions-store-input"
          placeholder="Link lub ID z Chrome Web Store…"
          value={storeInput}
          onChange={(e) => setStoreInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void installStore();
          }}
          disabled={busy}
        />
        <button type="button" className="sbtn" disabled={busy || !storeInput.trim()} onClick={() => void installStore()}>
          Zainstaluj
        </button>
      </div>

      {err ? <p className="extensions-err">{err}</p> : null}

      <div className="internal-page-body">
        {rows.length === 0 ? (
          <div className="extensions-empty">
            <p>Brak zainstalowanych rozszerzeń.</p>
            <p className="muted">
              Wskaż rozpakowany katalog, plik .zip/.crx albo wklej link Chrome Web Store. Pełne popupy
              chrome.action wymagają biblioteki electron-chrome-extensions (na razie niepodłączonej).
            </p>
          </div>
        ) : (
          <ul className="extensions-list">
            {rows.map((ext) => (
              <li key={ext.id} className="extensions-row">
                <div className="extensions-meta">
                  <strong>{ext.name}</strong>
                  <span className="muted">
                    v{ext.version}
                    {ext.manifestVersion ? ` · MV${ext.manifestVersion}` : ''}
                    {ext.loaded ? ' · aktywne' : ' · wyłączone w sesji'}
                    {ext.source ? ` · ${ext.source}` : ''}
                  </span>
                  {ext.permissions && ext.permissions.length > 0 ? (
                    <details className="extensions-perms">
                      <summary>Uprawnienia ({ext.permissions.length})</summary>
                      <ul>
                        {ext.permissions.map((p) => (
                          <li key={p}>
                            <code>{p}</code>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
                <label className="extensions-toggle">
                  <input
                    type="checkbox"
                    checked={ext.enabled}
                    onChange={(e) => {
                      void window.shell?.extensionsSetEnabled?.(ext.id, e.target.checked).then(() => reload());
                    }}
                  />
                  Włączone
                </label>
                <label className="extensions-toggle">
                  <input
                    type="checkbox"
                    checked={ext.allowPrivate}
                    onChange={(e) => {
                      void window.shell?.extensionsSetPrivate?.(ext.id, e.target.checked).then(() => reload());
                    }}
                  />
                  W prywatnym
                </label>
                <label className="extensions-toggle" title="Ikona na pasku (bez pełnego chrome.action)">
                  <input
                    type="checkbox"
                    checked={!!ext.pinned}
                    onChange={(e) => {
                      void window.shell?.extensionsSetPinned?.(ext.id, e.target.checked).then(() => reload());
                    }}
                  />
                  <Pin size={12} />
                  Pasek
                </label>
                <button
                  type="button"
                  className="icon-btn"
                  title="Usuń"
                  onClick={() => {
                    if (!window.confirm(`Usunąć „${ext.name}”?`)) return;
                    void window.shell?.extensionsRemove?.(ext.id).then(() => reload());
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="extensions-foot muted">
        <p>
          Trade-off: natywne <code>loadExtension</code> nie emuluje <code>chrome.tabs</code> / action popup.
          <code> electron-chrome-extensions</code> dodałaby te API kosztem utrzymania — celowo odłożone.
        </p>
      </footer>
    </div>
  );
}
