import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { isBookmarkableUrl, useStore, type Tab } from '../../store';

export type OpenBookmarkOpts = {
  newTab?: boolean;
  background?: boolean;
  private?: boolean;
};

export type UseBookmarkHandlersArgs = {
  active: Tab | undefined;
  activeIsTor: boolean;
  windowMode: 'normal' | 'private' | 'tor';
  navigateActive: (url: string, query?: string, opts?: { typed?: boolean }) => void;
};

export type UseBookmarkHandlersResult = {
  bookmarkPop: { url: string; title: string } | null;
  setBookmarkPop: Dispatch<SetStateAction<{ url: string; title: string } | null>>;
  bookmarkStarRef: RefObject<HTMLButtonElement | null>;
  openBookmarkDialog: (url?: string, title?: string) => void;
  openBookmarkUrl: (url: string, opts?: OpenBookmarkOpts) => void;
};

export function useBookmarkHandlers({
  active,
  activeIsTor,
  windowMode,
  navigateActive,
}: UseBookmarkHandlersArgs): UseBookmarkHandlersResult {
  const newTab = useStore((s) => s.newTab);
  const newTorTab = useStore((s) => s.newTorTab);
  const newPrivateTab = useStore((s) => s.newPrivateTab);

  const [bookmarkPop, setBookmarkPop] = useState<{ url: string; title: string } | null>(null);
  const bookmarkStarRef = useRef<HTMLButtonElement>(null);

  const openBookmarkDialog = useCallback(
    (url?: string, title?: string) => {
      const u = url ?? active?.url ?? '';
      const titleText = title ?? active?.title ?? u;
      if (!isBookmarkableUrl(u)) return;
      setBookmarkPop({ url: u, title: titleText });
    },
    [active?.url, active?.title],
  );

  useEffect(() => {
    const onBookmark = () => openBookmarkDialog();
    window.addEventListener('djxxr-bookmark-page', onBookmark);
    return () => window.removeEventListener('djxxr-bookmark-page', onBookmark);
  }, [openBookmarkDialog]);

  const openBookmarkUrl = useCallback(
    (url: string, opts?: OpenBookmarkOpts) => {
      if (opts?.private) {
        void window.shell?.newWindow?.({ boot: 'private', restoreTabs: [{ url }] });
        return;
      }
      if (activeIsTor && active?.partition) {
        if (opts?.newTab) {
          newTorTab({ url, partition: active.partition, background: opts.background !== false });
        } else {
          navigateActive(url);
        }
        return;
      }
      if (opts?.newTab) {
        newTab(url, { background: Boolean(opts.background) });
      } else if (windowMode === 'private') {
        newPrivateTab(url);
      } else {
        navigateActive(url);
      }
    },
    [active?.partition, activeIsTor, navigateActive, newPrivateTab, newTab, newTorTab, windowMode],
  );

  return {
    bookmarkPop,
    setBookmarkPop,
    bookmarkStarRef,
    openBookmarkDialog,
    openBookmarkUrl,
  };
}
