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

export type UseBookmarkHandlersArgs = {
  active: Tab | undefined;
  activeIsTor: boolean;
  navigateActive: (url: string, query?: string, opts?: { typed?: boolean }) => void;
};

export type UseBookmarkHandlersResult = {
  bookmarkPop: { url: string; title: string } | null;
  setBookmarkPop: Dispatch<SetStateAction<{ url: string; title: string } | null>>;
  bookmarkStarRef: RefObject<HTMLButtonElement | null>;
  openBookmarkDialog: (url?: string, title?: string) => void;
  openBookmarkUrl: (url: string, opts?: { newTab?: boolean }) => void;
};

export function useBookmarkHandlers({
  active,
  activeIsTor,
  navigateActive,
}: UseBookmarkHandlersArgs): UseBookmarkHandlersResult {
  const newTab = useStore((s) => s.newTab);
  const newTorTab = useStore((s) => s.newTorTab);

  const [bookmarkPop, setBookmarkPop] = useState<{ url: string; title: string } | null>(null);
  const bookmarkStarRef = useRef<HTMLButtonElement>(null);

  const openBookmarkDialog = useCallback(
    (url?: string, title?: string) => {
      const u = url ?? active?.url ?? '';
      const t = title ?? active?.title ?? u;
      if (!isBookmarkableUrl(u)) return;
      setBookmarkPop({ url: u, title: t });
    },
    [active?.url, active?.title],
  );

  useEffect(() => {
    const onBookmark = () => openBookmarkDialog();
    window.addEventListener('djxxr-bookmark-page', onBookmark);
    return () => window.removeEventListener('djxxr-bookmark-page', onBookmark);
  }, [openBookmarkDialog]);

  const openBookmarkUrl = (url: string, opts?: { newTab?: boolean }) => {
    if (activeIsTor && active?.partition) {
      if (opts?.newTab) {
        newTorTab({ url, partition: active.partition, background: true });
      } else {
        navigateActive(url);
      }
      return;
    }
    if (opts?.newTab) newTab(url);
    else navigateActive(url);
  };

  return {
    bookmarkPop,
    setBookmarkPop,
    bookmarkStarRef,
    openBookmarkDialog,
    openBookmarkUrl,
  };
}
