import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  Bookmark,
  ClipboardCopy,
  Code2,
  Download,
  ExternalLink,
  Eye,
  FileDown,
  FileText,
  Fingerprint,
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
  Puzzle,
  TerminalSquare,
  Trash2,
  Wrench,
  ZoomIn,
} from 'lucide-react';
import { acceleratorForMenuId } from '../lib/shortcutsRegistry';
import { isMotionOff, popupTransition } from '../lib/motionPresets';
import { useStore } from '../store';
import { useT } from '../i18n';

export type SidebarMode = 'on' | 'auto' | 'off';

export type AppMenuActions = {
  newTab: () => void;
  newWindow: () => void;
  newPrivateWindow: () => void;
  newTorWindow: () => void;
  setSidebarMode: (mode: SidebarMode) => void;
  openPasswords: () => void;
  openSitePermissions: () => void;
  openHistory: () => void;
  openBookmarks: () => void;
  openDownloads: () => void;
  openExtensions: () => void;
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
  openTabArchive: () => void;
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
  const settings = useStore((s) => s.settings);
  const motionOff = isMotionOff(settings);
  const popMotion = popupTransition(motionOff);
  const t = useT();

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

  const homeHint = t('chrome.unavailableOnHome');

  const items: Item[] = useMemo(
    () => [
      {
        kind: 'action',
        id: 'new-tab',
        label: t('chrome.newTab'),
        shortcut: acceleratorForMenuId('new-tab'),
        icon: <Plus size={16} strokeWidth={1.75} />,
        run: () => actions.newTab(),
      },
      {
        kind: 'action',
        id: 'new-win',
        label: t('chrome.newWindow'),
        shortcut: acceleratorForMenuId('new-win'),
        icon: <ExternalLink size={16} strokeWidth={1.75} />,
        run: () => actions.newWindow(),
      },
      {
        kind: 'action',
        id: 'new-priv',
        label: t('chrome.newPrivate'),
        shortcut: acceleratorForMenuId('new-priv'),
        icon: <Eye size={16} strokeWidth={1.75} />,
        run: () => actions.newPrivateWindow(),
      },
      {
        kind: 'action',
        id: 'new-tor',
        label: t('chrome.newTorWindow'),
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
        label: t('chrome.passwords'),
        shortcut: acceleratorForMenuId('passwords'),
        icon: <KeyRound size={16} strokeWidth={1.75} />,
        run: () => actions.openPasswords(),
      },
      {
        kind: 'action',
        id: 'permissions',
        label: t('chrome.sitePermissions'),
        icon: <Fingerprint size={16} strokeWidth={1.75} />,
        run: () => actions.openSitePermissions(),
      },
      {
        kind: 'action',
        id: 'history',
        label: t('chrome.history'),
        shortcut: acceleratorForMenuId('history'),
        icon: <History size={16} strokeWidth={1.75} />,
        run: () => actions.openHistory(),
      },
      {
        kind: 'action',
        id: 'archive',
        label: t('chrome.archivedTabs'),
        icon: <Archive size={16} strokeWidth={1.75} />,
        run: () => actions.openTabArchive(),
      },
      {
        kind: 'action',
        id: 'bookmarks',
        label: t('chrome.bookmarks'),
        shortcut: acceleratorForMenuId('bookmarks'),
        icon: <Bookmark size={16} strokeWidth={1.75} />,
        run: () => actions.openBookmarks(),
      },
      {
        kind: 'action',
        id: 'downloads',
        label: t('chrome.downloads'),
        shortcut: acceleratorForMenuId('downloads'),
        icon: <Download size={16} strokeWidth={1.75} />,
        run: () => actions.openDownloads(),
      },
      {
        kind: 'action',
        id: 'extensions',
        label: t('chrome.extensions'),
        icon: <Puzzle size={16} strokeWidth={1.75} />,
        run: () => actions.openExtensions(),
      },
      {
        kind: 'action',
        id: 'clear',
        label: t('chrome.clearBrowsingData'),
        shortcut: acceleratorForMenuId('clear'),
        icon: <Trash2 size={16} strokeWidth={1.75} />,
        run: () => actions.clearBrowsingData(),
      },
      { kind: 'sep' },
      { kind: 'zoom' },
      {
        kind: 'action',
        id: 'fs',
        label: t('chrome.fullscreen'),
        shortcut: acceleratorForMenuId('fs'),
        icon: <Fullscreen size={16} strokeWidth={1.75} />,
        run: () => actions.toggleFullscreen(),
      },
      { kind: 'sep' },
      {
        kind: 'action',
        id: 'print',
        label: t('menu.print'),
        shortcut: acceleratorForMenuId('print'),
        icon: <Printer size={16} strokeWidth={1.75} />,
        disabled: !hasPage,
        hint: hasPage ? undefined : homeHint,
        run: () => actions.print(),
      },
      {
        kind: 'action',
        id: 'find',
        label: t('chrome.find'),
        shortcut: acceleratorForMenuId('find'),
        icon: <Search size={16} strokeWidth={1.75} />,
        disabled: !hasPage,
        hint: hasPage ? undefined : homeHint,
        run: () => actions.findInPage(),
      },
      {
        kind: 'action',
        id: 'save',
        label: t('menu.savePageAs'),
        shortcut: acceleratorForMenuId('save'),
        icon: <FileText size={16} strokeWidth={1.75} />,
        disabled: !hasPage,
        hint: hasPage ? undefined : homeHint,
        run: () => actions.savePage(),
      },
      {
        kind: 'action',
        id: 'save-pdf',
        label: t('chrome.savePdfAs'),
        icon: <FileDown size={16} strokeWidth={1.75} />,
        disabled: !hasPage || !actions.savePdf,
        hint: hasPage ? undefined : homeHint,
        run: () => actions.savePdf?.(),
      },
      {
        kind: 'action',
        id: 'copy',
        label: t('chrome.copyLink'),
        icon: <ClipboardCopy size={16} strokeWidth={1.75} />,
        disabled: !hasPage,
        hint: hasPage ? undefined : homeHint,
        run: () => actions.copyLink(),
      },
      {
        kind: 'action',
        id: 'qr',
        label: t('chrome.createQrCode'),
        icon: <QrCode size={16} strokeWidth={1.75} />,
        disabled: !hasPage,
        hint: hasPage ? undefined : homeHint,
        run: () => actions.showQr(),
      },
      { kind: 'sep' },
      {
        kind: 'submenu',
        id: 'more',
        label: t('chrome.moreTools'),
        icon: <Wrench size={16} strokeWidth={1.75} />,
        children: [
          {
            kind: 'action',
            id: 'task',
            label: t('chrome.taskManager'),
            shortcut: acceleratorForMenuId('task'),
            icon: <TerminalSquare size={16} strokeWidth={1.75} />,
            run: () => actions.openTaskManager(),
          },
          {
            kind: 'action',
            id: 'devtools',
            label: t('chrome.devtools'),
            shortcut: acceleratorForMenuId('devtools'),
            icon: <Code2 size={16} strokeWidth={1.75} />,
            run: () => actions.openDevtools(),
          },
          {
            kind: 'action',
            id: 'source',
            label: t('menu.viewPageSource'),
            shortcut: acceleratorForMenuId('source'),
            icon: <Code2 size={16} strokeWidth={1.75} />,
            disabled: !hasPage,
            hint: hasPage ? undefined : homeHint,
            run: () => actions.viewSource(),
          },
        ],
      },
      { kind: 'sep' },
      {
        kind: 'action',
        id: 'about',
        label: t('chrome.helpAbout'),
        icon: <Info size={16} strokeWidth={1.75} />,
        run: () => actions.openAbout(),
      },
      {
        kind: 'action',
        id: 'settings',
        label: t('chrome.settings'),
        shortcut: acceleratorForMenuId('settings'),
        icon: <Settings2 size={16} strokeWidth={1.75} />,
        run: () => actions.openSettings(),
      },
      {
        kind: 'action',
        id: 'quit',
        label: t('chrome.quit'),
        shortcut: acceleratorForMenuId('quit'),
        icon: <Minus size={16} strokeWidth={1.75} />,
        run: () => actions.quit(),
      },
    ],
    [t, actions, hasPage, homeHint],
  );

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
    // Force layout so width/height are real before placing
    const pw = panel.offsetWidth || 280;
    const ph = panel.offsetHeight || 120;
    const gap = 2;
    const spaceRight = window.innerWidth - wr.right;
    const spaceLeft = wr.left;
    const preferLeft = spaceRight < pw + 12 && spaceLeft >= spaceRight;
    setSubSide(preferLeft ? 'left' : 'right');

    let left = preferLeft ? wr.left - pw + 6 : wr.right - 6;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));

    // Align top edge of flyout with the submenu trigger row
    let top = wr.top - gap;
    if (top + ph > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - ph - 8);
    }
    if (top < 4) top = 4;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }, []);

  useLayoutEffect(() => {
    if (!subOpen) return;
    placeSubmenu();
    const id = window.requestAnimationFrame(() => placeSubmenu());
    return () => window.cancelAnimationFrame(id);
  }, [subOpen, subSide, placeSubmenu]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || subPanelRef.current?.contains(t)) return;
      close();
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
          clearCloseSubTimer();
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
          clearCloseSubTimer();
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
    }, 80);
  };

  /** Short delay only for the gap between trigger and flyout. */
  const scheduleCloseSub = () => {
    clearHoverTimer();
    clearCloseSubTimer();
    closeSubTimer.current = window.setTimeout(() => setSubOpen(null), 120);
  };

  /** Other menu rows — close submenu immediately (no sticky flyout). */
  const closeSubNow = () => {
    clearHoverTimer();
    clearCloseSubTimer();
    setSubOpen(null);
  };

  const openSubNow = (id: string) => {
    clearHoverTimer();
    clearCloseSubTimer();
    setSubOpen(id);
    setSubFocus(0);
  };

  return (
    <div className="app-menu" ref={rootRef}>
      <button
        type="button"
        className={`icon-btn app-menu-trigger ${open ? 'on' : ''}`}
        title={t('chrome.appMenu')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <MenuIcon size={16} strokeWidth={1.75} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="app-menu-popover motion-popup"
            id={menuId}
            role="menu"
            ref={popoverRef}
            initial={popMotion.initial}
            animate={popMotion.animate}
            exit={popMotion.exit}
            transition={popMotion.transition}
            style={{ transformOrigin: 'top right' }}
          >
          <div className="app-menu-scroll">
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
                  aria-label={t('chrome.sidebarBar')}
                  onMouseEnter={() => {
                    setFocusIdx(fIdx);
                    closeSubNow();
                  }}
                >
                  <div className="app-menu-sidebar-label">
                    <Ico>
                      <PanelLeft size={16} strokeWidth={1.75} />
                    </Ico>
                    <span>{t('chrome.sidebarBar')}</span>
                  </div>
                  <div className="app-menu-seg">
                    {(
                      [
                        ['on', t('chrome.sidebarModeOn')],
                        ['auto', t('chrome.sidebarModeAuto')],
                        ['off', t('chrome.sidebarModeOff')],
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
                    closeSubNow();
                  }}
                >
                  <Ico>
                    <ZoomIn size={16} strokeWidth={1.75} />
                  </Ico>
                  <span className="app-menu-label">{t('chrome.zoom')}</span>
                  <div className="app-menu-zoom">
                    <button
                      type="button"
                      onClick={() => actions.zoomOut()}
                      aria-label={t('chrome.zoomOut')}
                    >
                      −
                    </button>
                    <button type="button" className="zoom-pct" onClick={() => actions.zoomReset()}>
                      {Math.round(actions.zoomPercent)}%
                    </button>
                    <button
                      type="button"
                      onClick={() => actions.zoomIn()}
                      aria-label={t('chrome.zoomIn')}
                    >
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
                  onMouseLeave={(e) => {
                    const to = e.relatedTarget as Node | null;
                    if (to && subPanelRef.current?.contains(to)) return;
                    scheduleCloseSub();
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={subOpen === it.id}
                    className={`app-menu-item has-sub ${focused ? 'focused' : ''} ${subOpen === it.id ? 'active' : ''}`}
                    onClick={() => {
                      if (subOpen === it.id) {
                        setSubOpen(null);
                      } else {
                        openSubNow(it.id);
                      }
                    }}
                  >
                    <Ico>{it.icon}</Ico>
                    <span className="app-menu-label">{it.label}</span>
                    <span className="app-menu-chevron" aria-hidden>
                      ›
                    </span>
                  </button>
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
                  closeSubNow();
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
          </motion.div>
        )}
      </AnimatePresence>
      {createPortal(
        <AnimatePresence>
          {open && subOpen
            ? (() => {
                const sub = items.find((x) => x.kind === 'submenu' && x.id === subOpen);
                if (!sub || sub.kind !== 'submenu') return null;
                return (
                  <motion.div
                    key={sub.id}
                    className={`app-menu-submenu side-${subSide} motion-popup`}
                    role="menu"
                    ref={subPanelRef}
                    initial={popMotion.initial}
                    animate={popMotion.animate}
                    exit={popMotion.exit}
                    transition={popMotion.transition}
                    style={{ transformOrigin: subSide === 'left' ? 'top right' : 'top left' }}
                    onMouseEnter={() => clearCloseSubTimer()}
                    onMouseLeave={(e) => {
                      const to = e.relatedTarget as Node | null;
                      if (to && subWrapRef.current?.contains(to)) return;
                      closeSubNow();
                    }}
                  >
                    {sub.children.map((ch, ci) => (
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
                  </motion.div>
                );
              })()
            : null}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
