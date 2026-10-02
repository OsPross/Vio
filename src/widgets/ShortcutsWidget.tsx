import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { faviconImgFallback, letterFavicon } from '../lib/favicon';

const MAX_DOCK = 12;
const POP_W = 280;
const POP_H = 200;
const POP_GAP = 8;

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

/** Prefer below the anchor; flip above when there is not enough room. */
function placeUnderOrAbove(anchor: DOMRect, popW: number, popH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 8;
  let left = Math.min(
    Math.max(pad, anchor.left + anchor.width / 2 - popW / 2),
    Math.max(pad, vw - popW - pad),
  );
  const spaceBelow = vh - anchor.bottom - pad;
  const openUp = spaceBelow < popH + POP_GAP && anchor.top > spaceBelow;
  let top = openUp ? anchor.top - popH - POP_GAP : anchor.bottom + POP_GAP;
  top = Math.min(Math.max(pad, top), Math.max(pad, vh - popH - pad));
  return { left, top, openUp };
}

function ShortcutForm({
  initialLabel,
  initialUrl,
  onSave,
  onCancel,
  title,
  anchorEl,
}: {
  initialLabel: string;
  initialUrl: string;
  onSave: (label: string, url: string) => void;
  onCancel: () => void;
  title: string;
  anchorEl: HTMLElement | null;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [url, setUrl] = useState(initialUrl);
  const [err, setErr] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const formId = useId();

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const update = () => {
      const r = anchorEl.getBoundingClientRect();
      const measured = panelRef.current?.getBoundingClientRect();
      const popW = measured?.width || POP_W;
      const popH = measured?.height || POP_H;
      const next = placeUnderOrAbove(r, popW, popH);
      setPos({ left: next.left, top: next.top });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorEl, err]);

  useEffect(() => {
    // Defer so the portal is mounted before focusing.
    const id = window.requestAnimationFrame(() => labelRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
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

  if (!anchorEl) return null;

  const box =
    pos ??
    (() => {
      const r = anchorEl.getBoundingClientRect();
      const next = placeUnderOrAbove(r, POP_W, POP_H);
      return { left: next.left, top: next.top };
    })();

  return createPortal(
    <div
      ref={panelRef}
      className="home-dock-popover"
      role="dialog"
      aria-labelledby={formId}
      style={{ position: 'fixed', left: box.left, top: box.top, zIndex: 90 }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
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
        <input
          ref={labelRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          spellCheck={false}
        />
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
    </div>,
    document.body,
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
  const [formAnchor, setFormAnchor] = useState<HTMLElement | null>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!ctx && !form) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.('.home-dock-popover')) return;
      if (t.closest?.('.home-dock-ctx')) return;
      setCtx(null);
      setForm(null);
      setFormAnchor(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCtx(null);
        setForm(null);
        setFormAnchor(null);
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

  const closeForm = () => {
    setForm(null);
    setFormAnchor(null);
  };

  return (
    <>
      <nav className={`home-dock hw-shortcuts hw-size-${size}`} aria-label="Aplikacje">
        {dockShortcuts.map((s) => (
          <button
            key={s.id}
            type="button"
            className="home-dock-item"
            ref={(el) => {
              if (el) itemRefs.current.set(s.id, el);
              else itemRefs.current.delete(s.id);
            }}
            onClick={() => onGo(s.url)}
            onContextMenu={(e) => {
              e.preventDefault();
              closeForm();
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
              setFormAnchor(addBtnRef.current);
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
        <ShortcutForm
          title="Nowy skrót"
          initialLabel=""
          initialUrl="https://"
          anchorEl={formAnchor}
          onCancel={closeForm}
          onSave={(label, url) => {
            addShortcut({ label, url });
            closeForm();
          }}
        />
      )}

      {form?.mode === 'edit' && editing && (
        <ShortcutForm
          title="Edytuj skrót"
          initialLabel={editing.label}
          initialUrl={editing.url}
          anchorEl={formAnchor}
          onCancel={closeForm}
          onSave={(label, url) => {
            if (typeof patchShortcut === 'function') {
              patchShortcut(editing.id, { label, url });
            } else {
              removeShortcut(editing.id);
              addShortcut({ label, url });
            }
            closeForm();
          }}
        />
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
              const el = itemRefs.current.get(ctx.id) ?? null;
              setFormAnchor(el);
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
