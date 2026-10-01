import {
  HOME_URL,
  HISTORY_URL,
  DOWNLOADS_URL,
  BOOKMARKS_URL,
  EXTENSIONS_URL,
  ABOUT_URL,
  TOR_HOME_URL,
  isTorTab,
  type Tab,
} from '../store';

export type ActiveTabFlags = {
  activeIsTor: boolean;
  isHistoryPage: boolean;
  isDownloadsPage: boolean;
  isBookmarksPage: boolean;
  isExtensionsPage: boolean;
  isAboutPage: boolean;
  isInternalAbout: boolean;
  isHome: boolean;
  isTorHome: boolean;
};

export function getActiveTabFlags(active: Tab | undefined): ActiveTabFlags {
  const activeIsTor = isTorTab(active);
  const isHistoryPage = !!active && !activeIsTor && active.url === HISTORY_URL;
  const isDownloadsPage = !!active && !activeIsTor && active.url === DOWNLOADS_URL;
  const isBookmarksPage = !!active && !activeIsTor && active.url === BOOKMARKS_URL;
  const isExtensionsPage = !!active && !activeIsTor && active.url === EXTENSIONS_URL;
  const isAboutPage =
    !!active &&
    !activeIsTor &&
    (active.url === ABOUT_URL ||
      active.url === 'about:about' ||
      active.url === 'djxxr://about' ||
      /^https?:\/\/djxxr\/about\/?$/i.test(active.url));
  const isInternalAbout =
    isHistoryPage || isDownloadsPage || isBookmarksPage || isExtensionsPage || isAboutPage;
  const isHome =
    !!active &&
    !isInternalAbout &&
    (active.url === HOME_URL ||
      (active.url.startsWith('about:') &&
        !activeIsTor &&
        active.url !== ABOUT_URL &&
        active.url !== 'about:about' &&
        active.url !== TOR_HOME_URL));
  const isTorHome =
    !!active &&
    activeIsTor &&
    (active.url === TOR_HOME_URL || active.url === HOME_URL || active.url === 'about:blank');
  return {
    activeIsTor,
    isHistoryPage,
    isDownloadsPage,
    isBookmarksPage,
    isExtensionsPage,
    isAboutPage,
    isInternalAbout,
    isHome,
    isTorHome,
  };
}
