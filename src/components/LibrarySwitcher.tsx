import { useT } from '../i18n';
import {
  BOOKMARKS_URL,
  DOWNLOADS_URL,
  EXTENSIONS_URL,
  HISTORY_URL,
  useStore,
} from '../store';

export type LibraryTab = 'bookmarks' | 'history' | 'downloads' | 'extensions';

const TABS: { id: LibraryTab; url: string; labelKey: string }[] = [
  { id: 'bookmarks', url: BOOKMARKS_URL, labelKey: 'internal.bookmarks' },
  { id: 'history', url: HISTORY_URL, labelKey: 'internal.history' },
  { id: 'downloads', url: DOWNLOADS_URL, labelKey: 'internal.downloads' },
  { id: 'extensions', url: EXTENSIONS_URL, labelKey: 'internal.extensions' },
];

export function LibrarySwitcher({ active }: { active: LibraryTab }) {
  const t = useT();
  const activeId = useStore((s) => s.activeId);
  const updateTab = useStore((s) => s.updateTab);

  return (
    <div className="library-switch" role="tablist" aria-label={t('internal.libraryNav')}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={active === tab.id ? 'on' : ''}
          onClick={() => {
            if (!activeId || active === tab.id) return;
            updateTab(activeId, { url: tab.url, title: t(tab.labelKey) });
          }}
        >
          {t(tab.labelKey)}
        </button>
      ))}
    </div>
  );
}
