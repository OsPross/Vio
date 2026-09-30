import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Bookmark,
  ClipboardCopy,
  Code2,
  Download,
  ExternalLink,
  Eye,
  FileDown,
  FileText,
  Fullscreen,
  History,
  Info,
  KeyRound,
  Menu as MenuIcon,
  Minus,
  Plus,
  Printer,
  QrCode,
  Search,
  Settings2,
  Shield,
  PanelLeft,
  TerminalSquare,
  Trash2,
  Wrench,
  ZoomIn,
} from 'lucide-react';
import { acceleratorForMenuId } from '../lib/shortcutsRegistry';

export type SidebarMode = 'on' | 'auto' | 'off';

export type AppMenuActions = {
  newTab: () => void;
  newWindow: () => void;
  newPrivateWindow: () => void;
  newTorWindow: () => void;
  setSidebarMode: (mode: SidebarMode) => void;
  openPasswords: () => void;
  openHistory: () => void;
  openBookmarks: () => void;
  openDownloads: () => void;
  clearBrowsingData: () => void;
  zoomOut: () => void;
  zoomIn: () => void;
  zoomReset: () => void;
  zoomPercent: number;
  toggleFullscreen: () => void;
  print: () => void;
  findInPage: () => void;
  savePage: () => void;
  savePdf?: () => void;
  copyLink: () => void;
  showQr: () => void;
  openTaskManager: () => void;
  openDevtools: () => void;
  openDevtoolsSettings?: () => void;
  viewSource: () => void;
  openAbout: () => void;
  openSettings: () => void;
  quit: () => void;
  allowInspect: boolean;
  sidebarMode: SidebarMode;
  /** When false, page-bound actions are disabled */
  hasPage?: boolean;
};

type Props = {
  actions: AppMenuActions;
};

type ActionItem = {
  kind: 'action';
  id: string;
  label: string;
  shortcut?: string;
  run: () => void;
  disabled?: boolean;
  hint?: string;
  icon: ReactNode;
};

type Item =
  | ActionItem
  | { kind: 'sep' }
  | { kind: 'sidebar' }
  | { kind: 'zoom' }
  | { kind: 'submenu'; id: string; label: string; icon: ReactNode; children: ActionItem[] };

const Ico = ({ children }: { children: ReactNode }) => (
  <span className="app-menu-ico" aria-hidden>
    {children}
  </span>
);

function useSafeTriangle(open: boolean, anchorRef: React.RefObject<HTMLElement | null>, panelRef: React.RefObject<HTMLElement | null>) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!open) {
      setArmed(false);
      return;
    }
    const t = window.setTimeout(() => setArmed(true), 40);
    return () => clearTimeout(t);
  }, [open]);

  const containsWithBridge = useCallback(
    (target: Node | null) => {
      if (!target || !armed) return false;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return true;
      // Bridge: if cursor moves diagonally toward submenu, keep open (checked via mouse move elsewhere)
      return false;
    },
    [armed, anchorRef, panelRef],
  );

  return { containsWithBridge };
}

export function AppMenu({ actions }: Props) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [subOpen, setSubOpen] = useState<string | null>(null);
  const [subSide, setSubSide] = useState<'right' | 'left'>('left');
  const [subFocus, setSubFocus] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const subWrapRef = useRef<HTMLDivElement>(null);
  const subPanelRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);
  const closeSubTimer = useRef<number | null>(null);
  const menuId = useId();
  const hasPage = actions.hasPage !== false;

  const clearHoverTimer = () => {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  const clearCloseSubTimer = () => {
    if (closeSubTimer.current) {
      window.clearTimeout(closeSubTimer.current);
      closeSubTimer.current = null;
    }
  };

  const items: Item[] = [
    {
      kind: 'action',
      id: 'new-tab',
      label: 'Nowa karta',
      shortcut: acceleratorForMenuId('new-tab'),
      icon: <Plus size={16} strokeWidth={1.75} />,
      run: () => actions.newTab(),
    },
    {
      kind: 'action',
      id: 'new-win',
      label: 'Nowe okno',
      shortcut: acceleratorForMenuId('new-win'),
      icon: <ExternalLink size={16} strokeWidth={1.75} />,
      run: () => actions.newWindow(),
    },
    {
      kind: 'action',
      id: 'new-priv',
      label: 'Nowe okno prywatne',
      shortcut: acceleratorForMenuId('new-priv'),
      icon: <Eye size={16} strokeWidth={1.75} />,
      run: () => actions.newPrivateWindow(),
    },
    {
      kind: 'action',
      id: 'new-tor',
      label: 'Nowe okno Tor',
      shortcut: acceleratorForMenuId('new-tor'),
      icon: <Shield size={16} strokeWidth={1.75} />,
      run: () => actions.newTorWindow(),
    },
    { kind: 'sep' },
    { kind: 'sidebar' },
    { kind: 'sep' },
    {
      kind: 'action',
      id: 'passwords',
      label: 'Hasła',
      icon: <KeyRound size={16} strokeWidth={1.75} />,
      run: () => actions.openPasswords(),
    },
    {
      kind: 'action',
      id: 'history',
      label: 'Historia',
      shortcut: acceleratorForMenuId('history'),
      icon: <History size={16} strokeWidth={1.75} />,
      run: () => actions.openHistory(),
    },
    {
      kind: 'action',
      id: 'bookmarks',
      label: 'Zakładki',
      shortcut: acceleratorForMenuId('bookmarks'),
      icon: <Bookmark size={16} strokeWidth={1.75} />,
      run: () => actions.openBookmarks(),
    },
    {
      kind: 'action',
      id: 'downloads',
      label: 'Pobrane',
      shortcut: acceleratorForMenuId('downloads'),
      icon: <Download size={16} strokeWidth={1.75} />,
      run: () => actions.openDownloads(),
    },
    {
      kind: 'action',
      id: 'clear',
      label: 'Usuń dane przeglądania…',
      shortcut: acceleratorForMenuId('clear'),
      icon: <Trash2 size={16} strokeWidth={1.75} />,
      run: () => actions.clearBrowsingData(),
    },
    { kind: 'sep' },
    { kind: 'zoom' },
    {
      kind: 'action',
      id: 'fs',
      label: 'Pełny ekran',
      shortcut: acceleratorForMenuId('fs'),
      icon: <Fullscreen size={16} strokeWidth={1.75} />,
      run: () => actions.toggleFullscreen(),
    },
    { kind: 'sep' },
    {
      kind: 'action',
      id: 'print',
      label: 'Drukuj…',
      shortcut: acceleratorForMenuId('print'),
      icon: <Printer size={16} strokeWidth={1.75} />,
      disabled: !hasPage,
      hint: hasPage ? undefined : 'Niedostępne na stronie startowej',
      run: () => actions.print(),
    },
    {
      kind: 'action',
      id: 'find',
      label: 'Znajdź na stronie',
      shortcut: acceleratorForMenuId('find'),
      icon: <Search size={16} strokeWidth={1.75} />,
      disabled: !hasPage,
      hint: hasPage ? undefined : 'Niedostępne na stronie startowej',
      run: () => actions.findInPage(),
    },
    {
      kind: 'action',
      id: 'save',
      label: 'Zapisz stronę jako…',
      shortcut: acceleratorForMenuId('save'),
      icon: <FileText size={16} strokeWidth={1.75} />,
      disabled: !hasPage,
      hint: hasPage ? undefined : 'Niedostępne na stronie startowej',
      run: () => actions.savePage(),
    },
    {
      kind: 'action',
      id: 'save-pdf',
      label: 'Zapisz jako PDF…',
      icon: <FileDown size={16} strokeWidth={1.75} />,
      disabled: !hasPage || !actions.savePdf,
      hint: hasPage ? undefined : 'Niedostępne na stronie startowej',
      run: () => actions.savePdf?.(),
    },
    {
      kind: 'action',
      id: 'copy',
      label: 'Kopiuj link',
      icon: <ClipboardCopy size={16} strokeWidth={1.75} />,
      disabled: !hasPage,
      hint: hasPage ? undefined : 'Niedostępne na stronie startowej',
      run: () => actions.copyLink(),
    },
    {
      kind: 'action',
      id: 'qr',
      label: 'Utwórz kod QR',
      icon: <QrCode size={16} strokeWidth={1.75} />,
      disabled: !hasPage,
      hint: hasPage ? undefined : 'Niedostępne na stronie startowej',
      run: () => actions.showQr(),
    },
    { kind: 'sep' },
    {
      kind: 'submenu',
      id: 'more',
      label: 'Więcej narzędzi',
      icon: <Wrench size={16} strokeWidth={1.75} />,
      children: [
        {
          kind: 'action',
          id: 'task',
          label: 'Menedżer zadań',
          shortcut: acceleratorForMenuId('task'),
          icon: <TerminalSquare size={16} strokeWidth={1.75} />,
          run: () => actions.openTaskManager(),
        },
        {
          kind: 'action',
          id: 'devtools',
          label: 'Narzędzia deweloperskie',
          shortcut: acceleratorForMenuId('devtools'),
          icon: <Code2 size={16} strokeWidth={1.75} />,
          run: () => actions.openDevtools(),
        },
        {
          kind: 'action',
          id: 'source',
          label: 'Wyświetl źródło strony',
          shortcut: acceleratorForMenuId('source'),
          icon: <Code2 size={16} strokeWidth={1.75} />,
          disabled: !hasPage,
          hint: hasPage ? undefined : 'Niedostępne na stronie startowej',
          run: () => actions.viewSource(),
        },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'action',
      id: 'about',
      label: 'Pomoc / O djxxr',
      icon: <Info size={16} strokeWidth={1.75} />,
      run: () => actions.openAbout(),
    },
    {
      kind: 'action',
      id: 'settings',
      label: 'Ustawienia',
      icon: <Settings2 size={16} strokeWidth={1.75} />,
      run: () => actions.openSettings(),
    },
    {
      kind: 'action',
      id: 'quit',
      label: 'Zakończ',
      shortcut: acceleratorForMenuId('quit'),
      icon: <Minus size={16} strokeWidth={1.75} />,
      run: () => actions.quit(),
    },
  ];

  const focusables = items.map((it, i) => ({ it, i })).filter(({ it }) => it.kind !== 'sep');

  const close = useCallback(() => {
    clearHoverTimer();
    clearCloseSubTimer();
    setOpen(false);
    setSubOpen(null);
    setFocusIdx(0);
    setSubFocus(0);
  }, []);

  const placeSubmenu = useCallback(() => {
    const wrap = subWrapRef.current;
    const panel = subPanelRef.current;
    if (!wrap || !panel) return;
    const wr = wrap.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    const spaceRight = window.innerWidth - wr.right;
    const spaceLeft = wr.left;
    const preferLeft = spaceRight < pr.width + 12 && spaceLeft > spaceRight;
    setSubSide(preferLeft ? 'left' : 'right');
    // Vertical flip/shift
    let top = 0;
    const below = window.innerHeight - wr.top;
    if (pr.height > below - 8) {
      top = Math.min(0, below - pr.height - 8);
    }
    panel.style.top = `${top}px`;
  }, []);

  useLayoutEffect(() => {
    if (subOpen) placeSubmenu();
  }, [subOpen, placeSubmenu]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (subOpen) {
          setSubOpen(null);
          return;
        }
        close();
        return;
      }
      const subItem = focusables[focusIdx]?.it;
      if (subOpen && subItem?.kind === 'submenu') {
        const kids = subItem.children;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSubFocus((v) => (v + 1) % kids.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSubFocus((v) => (v - 1 + kids.length) % kids.length);
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setSubOpen(null);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const ch = kids[subFocus];
          if (ch && !ch.disabled) {
            ch.run();
            close();
          } else if (ch?.hint) {
            ch.run();
            close();
          }
          return;
        }
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIdx((v) => (v + 1) % focusables.length);
        setSubOpen(null);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIdx((v) => (v - 1 + focusables.length) % focusables.length);
        setSubOpen(null);
      }
      if (e.key === 'ArrowRight') {
        const cur = focusables[focusIdx]?.it;
        if (cur?.kind === 'submenu') {
          e.preventDefault();
          setSubOpen(cur.id);
          setSubFocus(0);
        }
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cur = focusables[focusIdx]?.it;
        if (!cur) return;
        if (cur.kind === 'action' && !cur.disabled) {
          cur.run();
          close();
        } else if (cur.kind === 'submenu') {
          setSubOpen(cur.id);
          setSubFocus(0);
        }
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, focusIdx, focusables, subOpen, subFocus]);

  const scheduleOpenSub = (id: string) => {
    clearCloseSubTimer();
    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => {
      setSubOpen(id);
      setSubFocus(0);
    }, 120);
  };

  const scheduleCloseSub = () => {
    clearHoverTimer();
    clearCloseSubTimer();
    closeSubTimer.current = window.setTimeout(() => setSubOpen(null), 180);
  };

  // Safe triangle: while moving toward submenu, cancel close
  useEffect(() => {
    if (!subOpen) return;
    const onMove = (e: MouseEvent) => {
      const wrap = subWrapRef.current;
      const panel = subPanelRef.current;
      if (!wrap || !panel) return;
      const wr = wrap.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      const inWrap = x >= wr.left && x <= wr.right && y >= wr.top && y <= wr.bottom;
      const inPanel = x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom;
      // Triangle between wrap right/left edge and panel
      const bridgeLeft = Math.min(wr.left, pr.left) - 4;
      const bridgeRight = Math.max(wr.right, pr.right) + 4;
      const bridgeTop = Math.min(wr.top, pr.top) - 8;
      const bridgeBottom = Math.max(wr.bottom, pr.bottom) + 8;
      const inBridge = x >= bridgeLeft && x <= bridgeRight && y >= bridgeTop && y <= bridgeBottom;
      if (inWrap || inPanel || inBridge) clearCloseSubTimer();
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, [subOpen]);

  void useSafeTriangle; // keep helper available for future; bridge handled above

  return (
    <div className="app-menu" ref={rootRef}>
      <button
        type="button"
        className={`icon-btn app-menu-trigger ${open ? 'on' : ''}`}
        title="Menu aplikacji"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <MenuIcon size={16} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="app-menu-popover" id={menuId} role="menu" ref={popoverRef}>
          {items.map((it, i) => {
            if (it.kind === 'sep') return <hr key={`sep-${i}`} className="app-menu-sep" />;
            const fIdx = focusables.findIndex((f) => f.i === i);
            const focused = fIdx === focusIdx;

            if (it.kind === 'sidebar') {
              return (
                <div
                  key="sidebar"
                  className={`app-menu-sidebar ${focused ? 'focused' : ''}`}
                  role="group"
                  aria-label="Pasek boczny"
                  onMouseEnter={() => {
                    setFocusIdx(fIdx);
                    scheduleCloseSub();
                  }}
                >
                  <div className="app-menu-sidebar-label">
                    <Ico>
                      <PanelLeft size={16} strokeWidth={1.75} />
                    </Ico>
                    <span>Pasek boczny</span>
                  </div>
                  <div className="app-menu-seg">
                    {(
                      [
                        ['on', 'Włączony'],
                        ['auto', 'Auto'],
                        ['off', 'Wyłączony'],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        className={actions.sidebarMode === mode ? 'on' : ''}
                        onClick={() => actions.setSidebarMode(mode)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            if (it.kind === 'zoom') {
              return (
                <div
                  key="zoom"
                  className={`app-menu-item zoom-row ${focused ? 'focused' : ''}`}
                  onMouseEnter={() => {
                    setFocusIdx(fIdx);
                    scheduleCloseSub();
                  }}
                >
                  <Ico>
                    <ZoomIn size={16} strokeWidth={1.75} />
                  </Ico>
                  <span className="app-menu-label">Powiększenie</span>
                  <div className="app-menu-zoom">
                    <button type="button" onClick={() => actions.zoomOut()} aria-label="Pomniejsz">
                      −
                    </button>
                    <button type="button" className="zoom-pct" onClick={() => actions.zoomReset()}>
                      {Math.round(actions.zoomPercent)}%
                    </button>
                    <button type="button" onClick={() => actions.zoomIn()} aria-label="Powiększ">
                      +
                    </button>
                  </div>
                </div>
              );
            }

            if (it.kind === 'submenu') {
              return (
                <div
                  key={it.id}
                  className="app-menu-subwrap"
                  ref={subWrapRef}
                  onMouseEnter={() => {
                    setFocusIdx(fIdx);
                    scheduleOpenSub(it.id);
                  }}
                  onMouseLeave={() => scheduleCloseSub()}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={`app-menu-item has-sub ${focused ? 'focused' : ''} ${subOpen === it.id ? 'active' : ''}`}
                    onClick={() => {
                      setSubOpen((s) => (s === it.id ? null : it.id));
                      setSubFocus(0);
                    }}
                  >
                    <Ico>{it.icon}</Ico>
                    <span className="app-menu-label">{it.label}</span>
                    <span className="app-menu-chevron" aria-hidden>
                      ›
                    </span>
                  </button>
                  {subOpen === it.id && (
                    <div
                      className={`app-menu-submenu side-${subSide}`}
                      role="menu"
                      ref={subPanelRef}
                      onMouseEnter={() => clearCloseSubTimer()}
                      onMouseLeave={() => scheduleCloseSub()}
                    >
                      {it.children.map((ch, ci) => (
                        <button
                          key={ch.id}
                          type="button"
                          role="menuitem"
                          className={`app-menu-item ${subFocus === ci ? 'focused' : ''}`}
                          disabled={ch.disabled}
                          title={ch.hint}
                          onMouseEnter={() => setSubFocus(ci)}
                          onClick={() => {
                            ch.run();
                            close();
                          }}
                        >
                          <Ico>{ch.icon}</Ico>
                          <span className="app-menu-label">
                            {ch.label}
                            {ch.hint ? <em className="app-menu-hint">{ch.hint}</em> : null}
                          </span>
                          {ch.shortcut ? <kbd>{ch.shortcut}</kbd> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <button
                key={it.id}
                type="button"
                role="menuitem"
                className={`app-menu-item ${focused ? 'focused' : ''}`}
                disabled={it.disabled}
                title={it.hint}
                onMouseEnter={() => {
                  setFocusIdx(fIdx);
                  scheduleCloseSub();
                }}
                onClick={() => {
                  if (it.disabled) return;
                  it.run();
                  close();
                }}
              >
                <Ico>{it.icon}</Ico>
                <span className="app-menu-label">{it.label}</span>
                {it.shortcut ? <kbd>{it.shortcut}</kbd> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
