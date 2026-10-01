import {
  lazy,
  Suspense,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AppWindow,
  PictureInPicture2,
  Fingerprint,
  Globe,
  KeyRound,
  Lock,
  Mic,
  PanelLeft,
  Puzzle,
  RefreshCw,
  Settings2,
  Shield,
  Star,
  TriangleAlert,
  Video,
} from 'lucide-react';
import { DownloadsButton } from '../../components/DownloadsUI';
import { BookmarkPopover } from '../../components/BookmarkPopover';
import { AppMenu, type SidebarMode } from '../../components/AppMenu';
import { OmniboxSuggest } from '../../components/OmniboxSuggest';
import { MetricsDot } from '../../components/metrics/MetricsDot';
import { getWindowPartition } from '../../lib/windowBoot';
import {
  ABOUT_URL,
  BOOKMARKS_URL,
  DOWNLOADS_URL,
  EXTENSIONS_URL,
  HISTORY_URL,
  isBookmarkableUrl,
  useStore,
  type Tab,
} from '../../store';
import type { TorStatusInfo } from '../../components/TorLanding';
import type { PopupBlocked } from '../../hooks/useIpcEvents';
import type { WebviewEl } from '../tabs';

const ShieldPanel = lazy(() =>
  import('../../components/ShieldPanel').then((m) => ({ default: m.ShieldPanel })),
);

export type OmniMenuState = { x: number; y: number } | null;

export type BrowserChromeProps = {
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  omniEditingRef: MutableRefObject<boolean>;
  omniFocusedRef: MutableRefObject<boolean>;
  omniMenu: OmniMenuState;
  setOmniMenu: Dispatch<SetStateAction<OmniMenuState>>;
  nav: { back: boolean; forward: boolean };
  go: (raw: string, opts?: { typed?: boolean; fromSuggest?: boolean }) => void;
  navigateActive: (url: string, query?: string, opts?: { typed?: boolean }) => void;
  currentView: () => WebviewEl | null;
  toggleSidebar: () => void;
  active: Tab | undefined;
  activeIsTor: boolean;
  isHome: boolean;
  isTorHome: boolean;
  isInternalAbout: boolean;
  isHistoryPage: boolean;
  windowMode: 'normal' | 'private' | 'tor';
  guestWc: Record<string, number>;
  zoomFlash: number | null;
  zoomPercent: number;
  popupBlocked: PopupBlocked | null;
  setPopupBlocked: Dispatch<SetStateAction<PopupBlocked | null>>;
  pageHasVideo: boolean;
  togglePictureInPicture: () => void;
  mediaFlags: { mic: boolean; cam: boolean };
  pageBookmarked: boolean;
  openBookmarkDialog: (url?: string, title?: string) => void;
  bookmarkPop: { url: string; title: string } | null;
  setBookmarkPop: Dispatch<SetStateAction<{ url: string; title: string } | null>>;
  bookmarkStarRef: MutableRefObject<HTMLButtonElement | null>;
  pwForPage: number;
  shieldOpen: boolean;
  setShieldOpen: Dispatch<SetStateAction<boolean>>;
  blockedToday: number;
  torInfo: TorStatusInfo | null;
  requestNewIdentity: () => void | Promise<void>;
  bumpZoom: (delta: number, pageUrl?: string) => void;
  applyZoom: (factor: number, pageUrl?: string) => void;
  printActivePage: () => void;
  saveActivePdf: () => void;
  pageUrlForShare: string;
  setTaskMgrOpen: Dispatch<SetStateAction<boolean>>;
  setClearDataOpen: Dispatch<SetStateAction<boolean>>;
  setQrOpen: Dispatch<SetStateAction<boolean>>;
  setFindOpen: Dispatch<SetStateAction<boolean>>;
};

export function BrowserChrome({
  draft,
  setDraft,
  omniEditingRef,
  omniFocusedRef,
  omniMenu,
  setOmniMenu,
  nav,
  go,
  navigateActive,
  currentView,
  toggleSidebar,
  active,
  activeIsTor,
  isHome,
  isTorHome,
  isInternalAbout,
  isHistoryPage,
  windowMode,
  guestWc,
  zoomFlash,
  zoomPercent,
  popupBlocked,
  setPopupBlocked,
  pageHasVideo,
  togglePictureInPicture,
  mediaFlags,
  pageBookmarked,
  openBookmarkDialog,
  bookmarkPop,
  setBookmarkPop,
  bookmarkStarRef,
  pwForPage,
  shieldOpen,
  setShieldOpen,
  blockedToday,
  torInfo,
  requestNewIdentity,
  bumpZoom,
  applyZoom,
  printActivePage,
  saveActivePdf,
  pageUrlForShare,
  setTaskMgrOpen,
  setClearDataOpen,
  setQrOpen,
  setFindOpen,
}: BrowserChromeProps) {
  const settings = useStore((s) => s.settings);
  const bangs = useStore((s) => s.bangs);
  const shortcuts = useStore((s) => s.shortcuts);
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeId);
  const newTab = useStore((s) => s.newTab);
  const newTorTab = useStore((s) => s.newTorTab);
  const setActive = useStore((s) => s.setActive);
  const setView = useStore((s) => s.setView);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const patchSettings = useStore((s) => s.patchSettings);

  return (
    <>
      <div className={`bar ${settings.uiGlass ? 'glass' : ''} ${activeIsTor ? 'tor-mode' : ''}`}>
        <div className="bar-nav">
          {!settings.showSidebar && (
            <button
              type="button"
              className="icon-btn"
              onClick={toggleSidebar}
              title="Pokaż sidebar (Ctrl+B)"
            >
              <PanelLeft size={16} strokeWidth={1.75} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            disabled={isHome || isTorHome || isHistoryPage || !nav.back}
            onClick={() => currentView()?.goBack()}
            title="Wstecz"
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={isHome || isTorHome || isHistoryPage || !nav.forward}
            onClick={() => currentView()?.goForward()}
            title="Dalej"
          >
            <ArrowRight size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={isHome || isTorHome || isHistoryPage}
            onClick={() => currentView()?.reload()}
            title="Odśwież"
          >
            <RefreshCw size={16} strokeWidth={1.75} />
          </button>
        </div>

        <form
          className={`omnibox ${settings.uiGlass ? 'glass' : ''} ${activeIsTor ? 'tor-mode' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            go(draft, { typed: true });
          }}
        >
          {activeIsTor ? (
            <span className="omnibox-sec tor" title="Połączenie przez Tor">
              <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>
                ◉
              </span>
            </span>
          ) : /^http:\/\//i.test(active?.url || '') ? (
            <span className="omnibox-sec warn" title="Połączenie niezabezpieczone (HTTP)">
              <TriangleAlert size={16} strokeWidth={1.75} />
            </span>
          ) : /^https:\/\//i.test(active?.url || '') ? (
            <span className="omnibox-sec ok" title="Połączenie zabezpieczone (HTTPS)">
              <Lock size={16} strokeWidth={1.75} />
            </span>
          ) : (
            <span className="omnibox-sec" title="Strona startowa">
              <Globe size={16} strokeWidth={1.75} />
            </span>
          )}
          <OmniboxSuggest
            value={draft}
            onChange={setDraft}
            pageUrl={
              isHome || isTorHome || isInternalAbout
                ? ''
                : active?.url && !active.url.startsWith('about:')
                  ? active.url
                  : ''
            }
            onEditingChange={(editing) => {
              omniEditingRef.current = editing;
            }}
            onFocusChange={(focused) => {
              omniFocusedRef.current = focused;
              if (!focused && !omniEditingRef.current) {
                /* synced */
              }
            }}
            onSubmit={(raw, opts) => {
              omniEditingRef.current = false;
              go(raw, opts);
            }}
            onSwitchTab={(tabId) => {
              omniEditingRef.current = false;
              setActive(tabId);
              setView('browser');
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setOmniMenu({ x: e.clientX, y: e.clientY });
            }}
            torMode={activeIsTor}
            placeholder={activeIsTor ? 'Adres przez Tor…' : settings.omniboxPlaceholder}
            bangs={bangs}
            shortcuts={shortcuts}
            tabs={tabs}
          />
          <div className="omnibox-actions">
            {!activeIsTor ? (
              <>
                {/* Custom element from electron-chrome-extensions (injectBrowserAction in preload) */}
                <browser-action-list
                  className="ext-browser-actions"
                  partition={
                    windowMode === 'private' && getWindowPartition()
                      ? getWindowPartition()!
                      : 'persist:main'
                  }
                  tab={String(guestWc[activeId] || '')}
                  alignment="bottom left"
                />
                <button
                  type="button"
                  className="icon-btn"
                  title="Rozszerzenia"
                  aria-label="Rozszerzenia"
                  onClick={() => navigateActive(EXTENSIONS_URL)}
                >
                  <Puzzle size={16} strokeWidth={2} />
                </button>
              </>
            ) : null}
            {((zoomFlash != null && zoomFlash !== 100) ||
              (zoomPercent !== 100 && !isHome && !isTorHome && !isInternalAbout)) &&
            !isHome &&
            !isTorHome &&
            !isInternalAbout ? (
              <span
                className={`omnibox-zoom-badge ${zoomFlash != null ? 'flash' : ''}`}
                aria-live="polite"
              >
                {zoomFlash != null ? zoomFlash : zoomPercent}%
              </span>
            ) : null}
            {popupBlocked && !isHome && !isTorHome && !isInternalAbout ? (
              <button
                type="button"
                className="icon-btn on"
                title={`Zablokowano wyskakujące okno — kliknij, aby pozwolić\n${popupBlocked.url}`}
                onClick={() => {
                  const blocked = popupBlocked;
                  setPopupBlocked(null);
                  if (blocked.origin) void window.shell?.popupAllow?.(blocked.origin);
                  void window.shell?.popupOpenAllowed?.(blocked.url, blocked.webContentsId);
                }}
              >
                <AppWindow size={16} strokeWidth={1.75} />
              </button>
            ) : null}
            {pageHasVideo && !isHome && !isTorHome && !isInternalAbout ? (
              <button
                type="button"
                className="icon-btn"
                title="Obraz w obrazie (Alt+P)"
                onClick={() => togglePictureInPicture()}
              >
                <PictureInPicture2 size={16} strokeWidth={1.75} />
              </button>
            ) : null}
            {(mediaFlags.mic || mediaFlags.cam) && (
              <span className="media-use-badges" title="Strona ma dostęp do mediów">
                {mediaFlags.mic && <Mic size={14} strokeWidth={1.75} />}
                {mediaFlags.cam && <Video size={14} strokeWidth={1.75} />}
              </span>
            )}
            <div className="omnibox-bookmark-wrap">
              <button
                ref={bookmarkStarRef}
                type="button"
                className={`icon-btn ${pageBookmarked ? 'on' : ''}`}
                title={pageBookmarked ? 'Edytuj zakładkę (Ctrl+D)' : 'Dodaj zakładkę (Ctrl+D)'}
                disabled={!isBookmarkableUrl(active?.url)}
                onClick={() => openBookmarkDialog()}
                style={{ opacity: isBookmarkableUrl(active?.url) ? 1 : 0.35 }}
              >
                <Star
                  size={16}
                  strokeWidth={1.75}
                  fill={pageBookmarked ? 'currentColor' : 'none'}
                />
              </button>
              {bookmarkPop ? (
                <BookmarkPopover
                  open
                  onClose={() => setBookmarkPop(null)}
                  url={bookmarkPop.url}
                  title={bookmarkPop.title}
                  anchorRef={bookmarkStarRef}
                />
              ) : null}
            </div>
            <button
              type="button"
              className={`icon-btn ${pwForPage > 0 && !activeIsTor ? 'on' : ''}`}
              title={
                activeIsTor
                  ? 'Hasła wyłączone w trybie Tor'
                  : pwForPage > 0
                    ? `${pwForPage} zapisanych kont — otwórz Hasła`
                    : 'Menedżer haseł'
              }
              onClick={() => setSettingsTab('passwords')}
              disabled={!settings.passwordsEnabled || activeIsTor}
              style={{ opacity: settings.passwordsEnabled && !activeIsTor ? 1 : 0.35 }}
            >
              <KeyRound size={16} strokeWidth={1.75} />
              {pwForPage > 0 && (
                <span className="adblock-count">{pwForPage > 9 ? '9+' : pwForPage}</span>
              )}
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Uprawnienia stron"
              onClick={() => setSettingsTab('privacy')}
            >
              <Fingerprint size={16} strokeWidth={1.75} />
            </button>
            <div className="bar-shield-wrap">
              <button
                type="button"
                className={`icon-btn adblock-btn ${settings.adblockEnabled ? 'on' : ''}`}
                title={
                  settings.adblockEnabled
                    ? `Ochrona · dziś ${blockedToday} — kliknij panel tarczy`
                    : 'Ochrona wyłączona'
                }
                onClick={() => setShieldOpen((v) => !v)}
              >
                <Shield size={16} strokeWidth={1.75} />
                {settings.adblockEnabled && blockedToday > 0 && (
                  <span className="adblock-count">
                    {blockedToday > 99 ? '99+' : blockedToday}
                  </span>
                )}
              </button>
              {!activeIsTor && (
                <Suspense fallback={null}>
                  <ShieldPanel
                    open={shieldOpen}
                    onClose={() => setShieldOpen(false)}
                    pageUrl={active?.url || ''}
                    blockedToday={blockedToday}
                    protectionOn={
                      !!active?.url &&
                      !settings.privacySiteExceptions.some((ex) => {
                        try {
                          const h = new URL(active.url).hostname;
                          return h === ex || h.endsWith(`.${ex}`);
                        } catch {
                          return false;
                        }
                      })
                    }
                    onToggleProtection={(on) => {
                      try {
                        const h = new URL(active?.url || '').hostname.replace(/^www\./, '');
                        const base = h.split('.').slice(-2).join('.');
                        if (!on) {
                          patchSettings({
                            privacySiteExceptions: [
                              ...new Set([...(settings.privacySiteExceptions || []), base || h]),
                            ],
                          });
                          void window.shell?.privacyExceptionAdd?.(base || h);
                          const el = currentView();
                          try {
                            el?.reloadIgnoringCache?.();
                          } catch {
                            el?.reload?.();
                          }
                        } else {
                          patchSettings({
                            privacySiteExceptions: (settings.privacySiteExceptions || []).filter(
                              (x) => x !== base && x !== h,
                            ),
                          });
                          void window.shell?.privacyExceptionRemove?.(base || h);
                        }
                      } catch {
                        /* */
                      }
                    }}
                    onDisableOnThisPage={() => {
                      try {
                        const h = new URL(active?.url || '').hostname.replace(/^www\./, '');
                        const base = h.split('.').slice(-2).join('.');
                        patchSettings({
                          privacySiteExceptions: [
                            ...new Set([...(settings.privacySiteExceptions || []), base || h]),
                          ],
                        });
                        void window.shell?.privacyExceptionAdd?.(base || h);
                        const el = currentView();
                        try {
                          el?.reloadIgnoringCache?.();
                        } catch {
                          el?.reload?.();
                        }
                      } catch {
                        /* */
                      }
                    }}
                    onForget={() => {
                      void window.shell?.privacyForgetSite?.(active?.url || '');
                      setShieldOpen(false);
                    }}
                  />
                </Suspense>
              )}
            </div>
          </div>
        </form>

        {activeIsTor && (
          <span className="tor-chip" title="Tryb Tor — izolowana sesja">
            Tor
            {torInfo?.exitIp ? <em>{torInfo.exitIp}</em> : null}
            <button
              type="button"
              className="tor-chip-newid"
              title="Nowa tożsamość (Ctrl+Shift+U)"
              onClick={() => void requestNewIdentity()}
            >
              Nowa tożsamość
            </button>
          </span>
        )}

        <div className="bar-actions">
          <DownloadsButton
            onOpenAll={() => {
              if (activeIsTor) return;
              navigateActive(DOWNLOADS_URL);
            }}
          />
          <MetricsDot onOpenTaskMgr={() => setTaskMgrOpen(true)} />
          <button
            type="button"
            className="icon-btn"
            title="Ustawienia (Ctrl+,)"
            onClick={() => setSettingsTab('general')}
          >
            <Settings2 size={16} strokeWidth={1.75} />
          </button>
          <AppMenu
            actions={{
              newTab: () => newTab(),
              newWindow: () => void window.shell?.newWindow?.(),
              newPrivateWindow: () => void window.shell?.newWindow?.({ boot: 'private' }),
              newTorWindow: () => void window.shell?.newWindow?.({ boot: 'tor' }),
              sidebarMode: (settings.sidebarMode ||
                (settings.showSidebar ? 'on' : 'off')) as SidebarMode,
              setSidebarMode: (mode) => patchSettings({ sidebarMode: mode }),
              openPasswords: () => setSettingsTab('passwords'),
              openHistory: () => {
                if (activeIsTor) return;
                navigateActive(HISTORY_URL);
              },
              openBookmarks: () => {
                if (activeIsTor) return;
                navigateActive(BOOKMARKS_URL);
              },
              openDownloads: () => {
                if (activeIsTor) return;
                navigateActive(DOWNLOADS_URL);
              },
              openExtensions: () => {
                if (activeIsTor) return;
                navigateActive(EXTENSIONS_URL);
              },
              clearBrowsingData: () => setClearDataOpen(true),
              zoomOut: () => bumpZoom(-0.1),
              zoomIn: () => bumpZoom(0.1),
              zoomReset: () => applyZoom(1),
              zoomPercent,
              toggleFullscreen: () => {
                void window.shell?.windowToggleFullscreen?.();
              },
              print: () => printActivePage(),
              findInPage: () => setFindOpen(true),
              savePage: () => {
                window.dispatchEvent(new CustomEvent('djxxr-save-page'));
              },
              savePdf: () => saveActivePdf(),
              copyLink: () => {
                if (pageUrlForShare) void navigator.clipboard.writeText(pageUrlForShare);
              },
              showQr: () => {
                if (pageUrlForShare) setQrOpen(true);
              },
              openTaskManager: () => setTaskMgrOpen(true),
              openDevtools: () => {
                try {
                  currentView()?.openDevTools?.();
                } catch {
                  /* */
                }
              },
              openDevtoolsSettings: () => setSettingsTab('advanced'),
              viewSource: () => {
                const u = pageUrlForShare;
                if (!u) return;
                const src = u.startsWith('view-source:') ? u : `view-source:${u}`;
                if (activeIsTor && active?.partition) {
                  newTorTab({ url: src, partition: active.partition });
                } else {
                  newTab(src);
                }
              },
              openAbout: () => {
                if (activeIsTor) return;
                navigateActive(ABOUT_URL);
              },
              openSettings: () => setSettingsTab('general'),
              quit: () => void window.shell?.quitApp?.(),
              allowInspect: Boolean(settings.allowInspect),
              hasPage: Boolean(pageUrlForShare),
            }}
          />
        </div>
      </div>

      {omniMenu && (
        <div
          className="tab-ctx-backdrop"
          onMouseDown={() => setOmniMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setOmniMenu(null);
          }}
        >
          <div
            className="tab-ctx-menu"
            style={{ left: omniMenu.x, top: omniMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                document.execCommand('cut');
                setOmniMenu(null);
              }}
            >
              Wytnij
              <kbd>Ctrl+X</kbd>
            </button>
            <button
              type="button"
              onClick={() => {
                document.execCommand('copy');
                setOmniMenu(null);
              }}
            >
              Kopiuj
              <kbd>Ctrl+C</kbd>
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const t = await navigator.clipboard.readText();
                  const el = document.getElementById('omnibox-input') as HTMLInputElement | null;
                  if (el) {
                    const start = el.selectionStart ?? el.value.length;
                    const end = el.selectionEnd ?? el.value.length;
                    const next = el.value.slice(0, start) + t + el.value.slice(end);
                    setDraft(next);
                  }
                } catch {
                  /* */
                }
                setOmniMenu(null);
              }}
            >
              Wklej
              <kbd>Ctrl+V</kbd>
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const t = (await navigator.clipboard.readText()).trim();
                  if (t) go(t, { typed: true });
                } catch {
                  /* */
                }
                setOmniMenu(null);
              }}
            >
              Wklej i przejdź
            </button>
            <hr />
            <button
              type="button"
              onClick={() => {
                document.getElementById('omnibox-input')?.focus();
                (document.getElementById('omnibox-input') as HTMLInputElement | null)?.select();
                setOmniMenu(null);
              }}
            >
              Zaznacz wszystko
              <kbd>Ctrl+A</kbd>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
