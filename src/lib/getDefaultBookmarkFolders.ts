import { getUiLocale, translate } from '../i18n/core';
import {
  BOOKMARKS_BAR_FOLDER_ID,
  BOOKMARKS_OTHER_FOLDER_ID,
} from '../store/constants';
import type { BookmarkFolder } from '../store/types';

/** Default bookmark folder titles follow UI locale (user-visible on first run). */
export function getDefaultBookmarkFolders(): BookmarkFolder[] {
  const locale = getUiLocale();
  return [
    {
      id: BOOKMARKS_BAR_FOLDER_ID,
      title: translate(locale, 'folders.bookmarksBar'),
    },
    {
      id: BOOKMARKS_OTHER_FOLDER_ID,
      title: translate(locale, 'folders.otherBookmarks'),
    },
  ];
}
