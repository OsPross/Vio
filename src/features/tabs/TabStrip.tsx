import { type Dispatch, type SetStateAction } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Globe, Moon, Plus, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { PerfGate } from '../../components/PerfGate';
import { useT } from '../../i18n';
import { formatUrlPlain } from '../../lib/url-display';
import { isInternalPageUrl, titleForInternalUrl } from '../../lib/tabNavigate';
import { isPrivateTab, isTorTab, useStore } from '../../store';

export type TabMenuState = { x: number; y: number; tabId: string } | null;
export type NewTabMenuState = { x: number; y: number } | null;

export type TabStripProps = {
  hotTabs: Record<string, number>;
  torBusy: boolean;
  openTorTab: (url?: string) => void | Promise<void>;
  tabMenu: TabMenuState;
  newTabMenu: NewTabMenuState;
  setTabMenu: Dispatch<SetStateAction<TabMenuState>>;
  setNewTabMenu: Dispatch<SetStateAction<NewTabMenuState>>;
};

export function TabStrip({
  hotTabs,
  torBusy,
  openTorTab,
  tabMenu,
  newTabMenu,
  setTabMenu,
  setNewTabMenu,
}: TabStripProps) {
  const {
    tabs,
    activeId,
    closedTabs,
    newTab,
    newTorTab,
    newTabBeside,
    closeTab,
    setActive,
    updateTab,
    pinTab,
    muteTab,
    reopenClosedTab,
    closeOtherTabs,
    closeTabsToRight,
    duplicateTab,
    settings,
  } = useStore(
    useShallow((s) => ({
      tabs: s.tabs,
      activeId: s.activeId,
      closedTabs: s.closedTabs,
      newTab: s.newTab,
      newTorTab: s.newTorTab,
      newTabBeside: s.newTabBeside,
      closeTab: s.closeTab,
      setActive: s.setActive,
      updateTab: s.updateTab,
      pinTab: s.pinTab,
      muteTab: s.muteTab,
      reopenClosedTab: s.reopenClosedTab,
      closeOtherTabs: s.closeOtherTabs,
      closeTabsToRight: s.closeTabsToRight,
      duplicateTab: s.duplicateTab,
      settings: s.settings,
    })),
  );

  const tr = useT();

  const motionOff =
    settings.perfReduceMotion ||
    !settings.uiMotion ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  return (
    <>
      <div
        className="tabs"
        onDragOver={(e) => {
          if (
            e.dataTransfer.types.includes('text/uri-list') ||
            e.dataTransfer.types.includes('Files')
          ) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'link';
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          const uri = e.dataTransfer.getData('text/uri-list').split('\n')[0]?.trim();
          if (uri) {
            const st = useStore.getState();
            const tab = st.tabs.find((t) => t.id === st.activeId);
            if (isTorTab(tab)) {
              const part = st.tabs.find((t) => t.mode === 'tor')?.partition;
              if (part) newTorTab({ url: uri, partition: part });
            } else {
              newTab(uri);
            }
            return;
          }
          const file = e.dataTransfer.files?.[0];
          if (file) {
            const path = (file as File & { path?: string }).path;
            if (path) {
              const fileUrl = path.startsWith('file:')
                ? path
                : `file:///${path.replace(/\\/g, '/').replace(/^\/+/, '')}`;
              newTab(fileUrl);
            }
          }
        }}
      >
        <LayoutGroup id="chrome-tabs">
          <AnimatePresence initial={false} mode="popLayout">
            {tabs.map((t) => (
              <motion.button
                key={t.id}
                type="button"
                layout={!motionOff}
                className={`tab ${t.id === activeId ? 'active' : ''} ${t.mode === 'tor' ? 'tor-tab' : ''} ${t.mode === 'private' ? 'private-tab' : ''} ${t.pinned ? 'pinned' : ''} ${t.muted ? 'muted-tab' : ''}`}
                onClick={() => setActive(t.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setTabMenu({ x: e.clientX, y: e.clientY, tabId: t.id });
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(t.id);
                  }
                }}
                initial={motionOff ? { opacity: 0 } : { opacity: 0, scaleX: 0.85 }}
                animate={{ opacity: 1, scaleX: 1 }}
                exit={motionOff ? { opacity: 0 } : { opacity: 0, scaleX: 0.85 }}
                transition={{ duration: motionOff ? 0.12 : 0.2, ease: [0.16, 1, 0.3, 1] }}
                style={{ originX: 0 }}
                title={
                  t.mode === 'tor'
                    ? tr('tabs.torTabTitle')
                    : t.pinned
                      ? t.title
                      : t.url
                        ? formatUrlPlain(t.url)
                        : undefined
                }
              >
                <PerfGate id={`Tab:${t.id}`}>
                  {t.id === activeId && !motionOff && (
                    <motion.span
                      className="tab-indicator"
                      layoutId="tab-active-indicator"
                      transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                    />
                  )}
                  {t.id === activeId && motionOff && <span className="tab-indicator" />}
                  {t.mode === 'tor' ? (
                    <span className="tab-onion" aria-hidden>
                      ◉
                    </span>
                  ) : t.favicon ? (
                    <img
                      className="tab-fav"
                      src={t.favicon}
                      alt=""
                      width={14}
                      height={14}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <Globe size={12} strokeWidth={1.8} />
                  )}
                  <span className="tab-title">
                    {t.discarded && t.id !== activeId ? '○ ' : ''}
                    {isInternalPageUrl(t.url)
                      ? titleForInternalUrl(t.url, isTorTab(t), isPrivateTab(t))
                      : t.title || tr('tabs.untitled')}
                  </span>
                  {!t.pinned && (hotTabs[t.id] || 0) >= 3 && !t.discarded && (
                    <span className="tab-cpu-hint" title={tr('tabs.highCpuSleep')}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateTab(t.id, { discarded: true });
                        }}
                      >
                        <Moon size={11} strokeWidth={1.75} />
                      </button>
                    </span>
                  )}
                  <span
                    className="tab-x"
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(t.id);
                    }}
                  >
                    <X size={12} />
                  </span>
                </PerfGate>
              </motion.button>
            ))}
          </AnimatePresence>
        </LayoutGroup>
        <button
          type="button"
          className="tab-add"
          title={tr('tabs.newTabTitle')}
          onClick={() => newTab()}
          onContextMenu={(e) => {
            e.preventDefault();
            setNewTabMenu({ x: e.clientX, y: e.clientY });
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const target = e.currentTarget;
            const timer = window.setTimeout(() => {
              const r = target.getBoundingClientRect();
              setNewTabMenu({ x: r.left, y: r.bottom + 4 });
            }, 450);
            const clear = () => {
              window.clearTimeout(timer);
              target.removeEventListener('pointerup', clear);
              target.removeEventListener('pointerleave', clear);
            };
            target.addEventListener('pointerup', clear);
            target.addEventListener('pointerleave', clear);
          }}
        >
          <Plus size={15} strokeWidth={1.8} />
        </button>
      </div>

      {newTabMenu && (
        <div
          className="tab-ctx-backdrop"
          onMouseDown={() => setNewTabMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setNewTabMenu(null);
          }}
        >
          <div
            className="tab-ctx-menu"
            style={{ left: newTabMenu.x, top: newTabMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                newTab();
                setNewTabMenu(null);
              }}
            >
              {tr('tabs.newTab')}
              <kbd>Ctrl+T</kbd>
            </button>
            <button
              type="button"
              disabled={torBusy}
              onClick={() => {
                setNewTabMenu(null);
                void openTorTab();
              }}
            >
              {tr('tabs.newTorTab')}
              <kbd>Shift+Alt+N</kbd>
            </button>
            <button
              type="button"
              onClick={() => {
                setNewTabMenu(null);
                void window.shell?.newWindow?.({ boot: 'tor' });
              }}
            >
              {tr('tabs.newTorWindow')}
            </button>
          </div>
        </div>
      )}
      {tabMenu && (
        <div
          className="tab-ctx-backdrop"
          onMouseDown={() => setTabMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setTabMenu(null);
          }}
        >
          <div
            className="tab-ctx-menu"
            style={{ left: tabMenu.x, top: tabMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {(() => {
              const tab = tabs.find((x) => x.id === tabMenu.tabId);
              const tor = isTorTab(tab);
              const priv = isPrivateTab(tab);
              return (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      newTabBeside(tabMenu.tabId);
                      setTabMenu(null);
                    }}
                  >
                    {tr('tabs.newTabBeside')}
                    <kbd>Ctrl+T</kbd>
                  </button>
                  <button
                    type="button"
                    disabled={tor}
                    onClick={() => {
                      duplicateTab(tabMenu.tabId);
                      setTabMenu(null);
                    }}
                  >
                    {tr('tabs.duplicate')}
                  </button>
                  <button
                    type="button"
                    disabled={tor}
                    onClick={() => {
                      if (tab) pinTab(tab.id);
                      setTabMenu(null);
                    }}
                  >
                    {tab?.pinned ? tr('tabs.unpin') : tr('tabs.pin')}
                  </button>
                  <button
                    type="button"
                    disabled={tor || !tab || tab.url.startsWith('about:')}
                    onClick={() => {
                      if (tab) muteTab(tab.id);
                      setTabMenu(null);
                    }}
                  >
                    {tab?.muted ? tr('tabs.unmute') : tr('tabs.mute')}
                  </button>
                  <button
                    type="button"
                    disabled={tor || !tab?.url || tab.url.startsWith('about:')}
                    onClick={() => {
                      const u = tab?.url;
                      setTabMenu(null);
                      if (u) void openTorTab(u);
                    }}
                  >
                    {tr('tabs.openInTor')}
                  </button>
                  <hr />
                  <button
                    type="button"
                    onClick={() => {
                      closeOtherTabs(tabMenu.tabId);
                      setTabMenu(null);
                    }}
                  >
                    {tr('tabs.closeOthers')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeTabsToRight(tabMenu.tabId);
                      setTabMenu(null);
                    }}
                  >
                    {tr('tabs.closeToRight')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeTab(tabMenu.tabId);
                      setTabMenu(null);
                    }}
                  >
                    {tr('tabs.closeTab')}
                    <kbd>Ctrl+W</kbd>
                  </button>
                  <hr />
                  <button
                    type="button"
                    disabled={!closedTabs.length || tor || priv}
                    onClick={() => {
                      reopenClosedTab();
                      setTabMenu(null);
                    }}
                  >
                    {tr('tabs.reopenClosed')}
                    {closedTabs.length ? ` (${closedTabs.length})` : ''}
                    <kbd>Ctrl+Shift+T</kbd>
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}
