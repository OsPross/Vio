import { useCallback, useEffect, useState } from 'react';
import { Puzzle, FolderOpen, Trash2, RefreshCw, Pin, Link2 } from 'lucide-react';
import { InternalPage } from './InternalPage';

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
    <InternalPage
      className="extensions-page"
      title="Rozszerzenia"
      icon={<Puzzle size={18} strokeWidth={1.75} />}
      subtitle="Chrome Web Store / CRX / folder — Tor nigdy. Okno prywatne tylko gdy włączysz per rozszerzenie."
      toolbar={
        <>
          <button
            type="button"
            className="history-sbtn secondary"
            onClick={() => void reload()}
            title="Odśwież"
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
            Folder / ZIP / CRX…
          </button>
        </>
      }
    >
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
        <button
          type="button"
          className="history-sbtn secondary"
          disabled={busy || !storeInput.trim()}
          onClick={() => void installStore()}
        >
          Zainstaluj
        </button>
      </div>

      {err ? <p className="extensions-err">{err}</p> : null}

      {rows.length === 0 ? (
        <div className="ip-empty">
          <span className="ip-empty-ico" aria-hidden>
            <Puzzle size={28} strokeWidth={1.5} />
          </span>
          <p>Brak zainstalowanych rozszerzeń</p>
          <span className="muted">
            Na Chrome Web Store kliknij „Dodaj do Vio”, wskaż folder / .zip / .crx albo wklej link
            powyżej.
          </span>
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
                  {ext.electronId || ext.chromeId || ext.id
                    ? ` · ${(ext.electronId || ext.chromeId || ext.id).slice(0, 8)}…`
                    : ''}
                  {ext.usesWebRequest ? ' · webRequest (wstrzymuje Ghostery sieć)' : ''}
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
                    void window.shell
                      ?.extensionsSetEnabled?.(ext.id, e.target.checked)
                      .then(() => reload());
                  }}
                />
                Włączone
              </label>
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
                W prywatnym
              </label>
              <label className="extensions-toggle" title="Przypnij ikonę na pasku narzędzi">
                <input
                  type="checkbox"
                  checked={!!ext.pinned}
                  onChange={(e) => {
                    void window.shell
                      ?.extensionsSetPinned?.(ext.id, e.target.checked)
                      .then(() => reload());
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

      <footer className="extensions-foot muted">
        <p>
          Rozszerzenia z <code>webRequest</code> / DNR wyłączają sieciowy silnik Ghostery (konflikt
          Chromium) — filtracja przechodzi wtedy na rozszerzenie. Content scripts i popupy działają
          w sesji głównej; Tor jest zawsze bez rozszerzeń.
        </p>
      </footer>
    </InternalPage>
  );
}
