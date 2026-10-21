/**
 * Sync Zustand bookmarks ↔ electron/bookmarks.cjs (djxxr-bookmarks.json).
 * Call once after store rehydrate; mutations debounce-flush to disk.
 */
import { useStore, type Bookmark, type BookmarkFolder } from '../store';

let wired = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let migrating = false;

function scheduleFlush() {
  if (migrating) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const { bookmarks, bookmarkFolders } = useStore.getState();
    void window.shell
      ?.bookmarksReplace?.({ bookmarks, folders: bookmarkFolders })
      .catch(() => {
        /* */
      });
  }, 280);
}

export async function initBookmarksDiskSync(): Promise<void> {
  if (wired) return;
  wired = true;

  const state = useStore.getState();
  const legacy = {
    bookmarks: state.bookmarks,
    folders: state.bookmarkFolders,
  };

  try {
    const mig = await window.shell?.bookmarksMigrate?.(legacy);
    if (mig?.ok && Array.isArray(mig.bookmarks) && Array.isArray(mig.folders)) {
      migrating = true;
      useStore.setState({
        bookmarks: mig.bookmarks as Bookmark[],
        bookmarkFolders: mig.folders as BookmarkFolder[],
      });
      migrating = false;
    } else {
      const res = await window.shell?.bookmarksGet?.();
      if (res?.ok && Array.isArray(res.bookmarks) && Array.isArray(res.folders)) {
        migrating = true;
        useStore.setState({
          bookmarks: res.bookmarks as Bookmark[],
          bookmarkFolders: res.folders as BookmarkFolder[],
        });
        migrating = false;
      }
    }
  } catch {
    migrating = false;
  }

  useStore.subscribe((s, prev) => {
    if (s.bookmarks === prev.bookmarks && s.bookmarkFolders === prev.bookmarkFolders) return;
    scheduleFlush();
  });
}
