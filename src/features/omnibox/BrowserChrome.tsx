import {
  lazy,
  Suspense,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AppWindow,
  PictureInPicture2,
  Globe,
  Lock,
  Mic,
  PanelLeft,
  Puzzle,
  RefreshCw,
  Shield,
  Star,
  TriangleAlert,
  Video,
} from 'lucide-react';
import { DownloadsButton } from '../../components/DownloadsUI';
import { SoulIndicator } from '../../components/SoulIndicator';
import { BookmarkPopover } from '../../components/BookmarkPopover';
import { AppMenu } from '../../components/AppMenu';
import { OmniboxSuggest } from '../../components/OmniboxSuggest';
import { getWindowPartition } from '../../lib/windowBoot';
import {
  DOWNLOADS_URL,
  EXTENSIONS_URL,
  isBookmarkableUrl,
  useStore,
  type Tab,
} from '../../store';
import type { TorStatusInfo } from '../../components/TorLanding';
import type { PopupBlocked } from '../../hooks/useIpcEvents';
import { useAppMenuActions } from '../../hooks/useAppMenuActions';
import { useT } from '../../i18n';
import type { WebviewEl } from '../tabs';

const ShieldPanel = lazy(() =>
  import('../../components/ShieldPanel').then((m) => ({ default: m.ShieldPanel })),
);
const ExtensionsPopup = lazy(() =>
  import('../../components/ExtensionsPopup').then((m) => ({ default: m.ExtensionsPopup })),
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
  doBrowserNav: (dir: 'back' | 'forward', source?: string) => void;
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
  doBrowserNav,
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
  const t = useT();
  const settings = useStore((s) => s.settings);
  const bangs = useStore((s) => s.bangs);
  const shortcuts = useStore((s) => s.shortcuts);
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeId);
  const setActive = useStore((s) => s.setActive);
  const setView = useStore((s) => s.setView);
  const patchSettings = useStore((s) => s.patchSettings);
  const [extMenuOpen, setExtMenuOpen] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);

  const menuActions = useAppMenuActions({
    activeIsTor,
    active,
    pageUrlForShare,
    zoomPercent,
    navigateActive,
    bumpZoom,
    applyZoom,
    printActivePage,
    saveActivePdf,
    currentView,
    setClearDataOpen,
    setFindOpen,
    setQrOpen,
    setTaskMgrOpen,
  });

  return (
    <>
      <div className={`bar ${settings.uiGlass ? 'glass' : ''} ${activeIsTor ? 'tor-mode' : ''}`}>
        <div className="bar-nav">
          {!settings.showSidebar && (
            <button
              type="button"
              className="icon-btn"
              onClick={toggleSidebar}
              title={t('chrome.showSidebar')}
            >
              <PanelLeft size={16} strokeWidth={1.75} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            disabled={isHome || isTorHome || !nav.back}
            onClick={() => doBrowserNav('back', 'chrome-btn')}
            title={t('chrome.back')}
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={isHome || isTorHome || !nav.forward}
            onClick={() => doBrowserNav('forward', 'chrome-btn')}
            title={t('chrome.forward')}
          >
            <ArrowRight size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={isHome || isTorHome || isHistoryPage}
            onClick={() => currentView()?.reload()}
            title={t('chrome.reload')}
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
            <span className="omnibox-sec tor" title={t('chrome.connectionTor')}>
              <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>
                ◉
              </span>
            </span>
          ) : /^http:\/\//i.test(active?.url || '') ? (
            <span className="omnibox-sec warn" title={t('chrome.connectionHttp')}>
              <TriangleAlert size={16} strokeWidth={1.75} />
            </span>
          ) : /^https:\/\//i.test(active?.url || '') ? (
            <span className="omnibox-sec ok" title={t('chrome.connectionHttps')}>
              <Lock size={16} strokeWidth={1.75} />
            </span>
          ) : (
            <span className="omnibox-sec" title={t('chrome.connectionHome')}>
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
            placeholder={
              activeIsTor ? t('chrome.torOmniboxPlaceholder') : t('chrome.omniboxPlaceholder')
            }
            bangs={bangs}
            shortcuts={shortcuts}
            tabs={tabs}
          />
          <div className="omnibox-actions">
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
                title={t('chrome.popupBlockedAllow', { url: popupBlocked.url })}
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
                title={t('chrome.pictureInPicture')}
                onClick={() => togglePictureInPicture()}
              >
                <PictureInPicture2 size={16} strokeWidth={1.75} />
              </button>
            ) : null}
            {(mediaFlags.mic || mediaFlags.cam) && (
              <span className="media-use-badges" title={t('chrome.mediaAccess')}>
                {mediaFlags.mic && <Mic size={14} strokeWidth={1.75} />}
                {mediaFlags.cam && <Video size={14} strokeWidth={1.75} />}
              </span>
            )}
            <div className="omnibox-bookmark-wrap">
              <button
                ref={bookmarkStarRef}
                type="button"
                className={`icon-btn ${pageBookmarked ? 'on' : ''}`}
                title={
                  pageBookmarked
                    ? t('chrome.bookmarkEditShortcut')
                    : t('chrome.bookmarkAddShortcut')
                }
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
          </div>
        </form>

        {activeIsTor && (
          <span className="tor-chip" title={t('chrome.torModeChip')}>
            Tor
            {torInfo?.exitIp ? <em>{torInfo.exitIp}</em> : null}
            <button
              type="button"
              className="tor-chip-newid"
              title={t('chrome.newIdentityTitle')}
              onClick={() => void requestNewIdentity()}
            >
              {t('chrome.newIdentity')}
            </button>
          </span>
        )}

        <div className="bar-actions">
          {!activeIsTor ? (
            <>
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
              <div className="bar-ext-wrap">
                <button
                  type="button"
                  className={`icon-btn ${extMenuOpen ? 'on' : ''}`}
                  data-ext-menu-btn
                  title={t('chrome.extensions')}
                  aria-label={t('chrome.extensions')}
                  aria-expanded={extMenuOpen}
                  onClick={() => {
                    setShieldOpen(false);
                    setDownloadsOpen(false);
                    setExtMenuOpen((v) => !v);
                  }}
                >
                  <Puzzle size={16} strokeWidth={1.75} />
                </button>
                <Suspense fallback={null}>
                  <ExtensionsPopup
                    open={extMenuOpen}
                    onClose={() => setExtMenuOpen(false)}
                    onManage={() => navigateActive(EXTENSIONS_URL)}
                  />
                </Suspense>
              </div>
            </>
          ) : null}
          <div className="bar-shield-wrap">
            <button
              type="button"
              className={`icon-btn adblock-btn ${settings.adblockEnabled ? 'on' : ''}`}
              title={
                settings.adblockEnabled
                  ? t('chrome.shieldOnToday', { count: blockedToday })
                  : t('chrome.shieldOff')
              }
              onClick={() => {
                setExtMenuOpen(false);
                setDownloadsOpen(false);
                setShieldOpen((v) => !v);
              }}
            >
              <Shield size={16} strokeWidth={1.75} />
              {settings.adblockEnabled && blockedToday > 0 ? (
                <span className="adblock-count">{Math.min(99, blockedToday)}</span>
              ) : null}
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
          <SoulIndicator />
          <DownloadsButton
            open={downloadsOpen}
            onOpenChange={(next) => {
              if (next) {
                setShieldOpen(false);
                setExtMenuOpen(false);
              }
              setDownloadsOpen(next);
            }}
            onOpenAll={() => {
              if (activeIsTor) return;
              setDownloadsOpen(false);
              navigateActive(DOWNLOADS_URL);
            }}
          />
          <AppMenu actions={menuActions} />
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
              {t('menu.cut')}
              <kbd>Ctrl+X</kbd>
            </button>
            <button
              type="button"
              onClick={() => {
                document.execCommand('copy');
                setOmniMenu(null);
              }}
            >
              {t('menu.copy')}
              <kbd>Ctrl+C</kbd>
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const clip = await navigator.clipboard.readText();
                  const el = document.getElementById('omnibox-input') as HTMLInputElement | null;
                  if (el) {
                    const start = el.selectionStart ?? el.value.length;
                    const end = el.selectionEnd ?? el.value.length;
                    const next = el.value.slice(0, start) + clip + el.value.slice(end);
                    setDraft(next);
                  }
                } catch {
                  /* */
                }
                setOmniMenu(null);
              }}
            >
              {t('chrome.paste')}
              <kbd>Ctrl+V</kbd>
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const clip = (await navigator.clipboard.readText()).trim();
                  if (clip) go(clip, { typed: true });
                } catch {
                  /* */
                }
                setOmniMenu(null);
              }}
            >
              {t('chrome.pasteAndGo')}
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
              {t('chrome.selectAll')}
              <kbd>Ctrl+A</kbd>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
