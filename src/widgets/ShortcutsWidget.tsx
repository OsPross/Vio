import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from '../store';
import { faviconImgFallback, letterFavicon } from '../lib/favicon';

const MAX_DOCK = 12;

function ShortcutIcon({ url, label }: { url: string; label: string }) {
  const [src, setSrc] = useState(() => letterFavicon(url));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await window.shell?.faviconCacheGet?.(url);
      if (cancelled) return;
      if (cached) {
        setSrc(cached);
        return;
      }
      try {
        const origin = new URL(url).origin;
        const put = await window.shell?.faviconCachePut?.(url, `${origin}/favicon.ico`);
        if (!cancelled && put) setSrc(put);
      } catch {
        /* keep letter */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return <img src={src} alt="" title={label} onError={(e) => faviconImgFallback(e, url)} />;
}

function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function ShortcutForm({
  initialLabel,
  initialUrl,
  onSave,
  onCancel,
  title,
}: {
  initialLabel: string;
  initialUrl: string;
  onSave: (label: string, url: string) => void;
  onCancel: () => void;
  title: string;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [url, setUrl] = useState(initialUrl);
  const [err, setErr] = useState<string | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const formId = useId();

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  const submit = () => {
    const name = label.trim();
    const href = normalizeUrl(url);
    if (!name) {
      setErr('Podaj nazwę');
      return;
    }
    if (!href) {
      setErr('Nieprawidłowy adres');
      return;
    }
    onSave(name, href);
  };

  return (
    <div
      className="home-dock-popover"
      role="dialog"
      aria-labelledby={formId}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      }}
    >
      <strong id={formId}>{title}</strong>
      <label>
        Nazwa
        <input ref={labelRef} value={label} onChange={(e) => setLabel(e.target.value)} spellCheck={false} />
      </label>
      <label>
        Adres
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          spellCheck={false}
        />
      </label>
      {err && <p className="home-dock-popover-err">{err}</p>}
      <div className="home-dock-popover-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Anuluj
        </button>
        <button type="button" className="primary" onClick={submit}>
          {initialLabel ? 'Zapisz' : 'Dodaj'}
        </button>
      </div>
    </div>
  );
}

export function ShortcutsWidget({
  onGo,
  size = 'L',
}: {
  onGo: (url: string) => void;
  size?: 'S' | 'M' | 'L';
}) {
  const shortcuts = useStore((s) => s.shortcuts);
  const addShortcut = useStore((s) => s.addShortcut);
  const removeShortcut = useStore((s) => s.removeShortcut);
  const patchShortcut = useStore((s) => s.patchShortcut);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const [form, setForm] = useState<null | { mode: 'add' } | { mode: 'edit'; id: string }>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ctx && !form) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if ((t as HTMLElement).closest?.('.home-dock-popover')) return;
      if ((t as HTMLElement).closest?.('.home-dock-ctx')) return;
      setCtx(null);
      setForm(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCtx(null);
        setForm(null);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctx, form]);

  const dockShortcuts = shortcuts.slice(0, MAX_DOCK);
  const editing = form?.mode === 'edit' ? shortcuts.find((s) => s.id === form.id) : null;

  return (
    <>
      <nav className={`home-dock hw-shortcuts hw-size-${size}`} aria-label="Aplikacje">
        {dockShortcuts.map((s) => (
          <button
            key={s.id}
            type="button"
            className="home-dock-item"
            onClick={() => onGo(s.url)}
            onContextMenu={(e) => {
              e.preventDefault();
              setForm(null);
              setCtx({ id: s.id, x: e.clientX, y: e.clientY });
            }}
            title={s.label}
          >
            <span className="home-dock-ico">
              <ShortcutIcon url={s.url} label={s.label} />
            </span>
            <span className="home-dock-label">{s.label}</span>
          </button>
        ))}
        {dockShortcuts.length < MAX_DOCK && (
          <button
            ref={addBtnRef}
            type="button"
            className="home-dock-add"
            onClick={() => {
              setCtx(null);
              setForm({ mode: 'add' });
            }}
            title="Dodaj skrót"
          >
            <span className="home-dock-ico">+</span>
            <span className="home-dock-label">Dodaj</span>
          </button>
        )}
      </nav>

      {form?.mode === 'add' && (
        <div className="home-dock-popover-anchor">
          <ShortcutForm
            title="Nowy skrót"
            initialLabel=""
            initialUrl="https://"
            onCancel={() => setForm(null)}
            onSave={(label, url) => {
              addShortcut({ label, url });
              setForm(null);
            }}
          />
        </div>
      )}

      {form?.mode === 'edit' && editing && (
        <div className="home-dock-popover-anchor">
          <ShortcutForm
            title="Edytuj skrót"
            initialLabel={editing.label}
            initialUrl={editing.url}
            onCancel={() => setForm(null)}
            onSave={(label, url) => {
              if (typeof patchShortcut === 'function') {
                patchShortcut(editing.id, { label, url });
              } else {
                removeShortcut(editing.id);
                addShortcut({ label, url });
              }
              setForm(null);
            }}
          />
        </div>
      )}

      {ctx && (
        <div
          className="home-dock-ctx"
          style={{ left: ctx.x, top: ctx.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setForm({ mode: 'edit', id: ctx.id });
              setCtx(null);
            }}
          >
            Edytuj
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              removeShortcut(ctx.id);
              setCtx(null);
            }}
          >
            Usuń
          </button>
        </div>
      )}
    </>
  );
}
