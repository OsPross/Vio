import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { faviconImgFallback, letterFavicon, resolveFavicon } from '../lib/favicon';
import { useT } from '../i18n';
import { WidgetEmpty } from './WidgetFrame';

type HistItem = { id: string; url: string; title: string };

const DEMO: HistItem[] = [
  { id: '1', url: 'https://github.com', title: 'GitHub' },
  { id: '2', url: 'https://wikipedia.org', title: 'Wikipedia' },
];

export function RecentWidget({
  onGo,
  size,
  preview,
}: {
  onGo?: (url: string) => void;
  size: 'S' | 'M' | 'L';
  preview?: boolean;
}) {
  const t = useT();
  const [items, setItems] = useState<HistItem[]>(preview ? DEMO : []);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void window.shell?.historyList?.({ limit: 12 }).then((res) => {
      if (cancelled || !res?.items) return;
      setItems(
        res.items
          .filter((i) => i.url && !i.url.startsWith('about:'))
          .slice(0, size === 'S' ? 4 : size === 'M' ? 6 : 10)
          .map((i) => ({ id: i.id, url: i.url, title: i.title || i.url })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [size, preview]);

  if (!items.length) {
    return <WidgetEmpty icon={History} text={t('widgets.ui.recent.empty')} />;
  }

  return (
    <ul className={`hw-list hw-size-${size}`}>
      {items.map((it) => (
        <li key={it.id}>
          <button
            type="button"
            className="hw-list-row"
            disabled={preview}
            onClick={() => onGo?.(it.url)}
            title={it.url}
          >
            <img
              src={resolveFavicon(it.url) || letterFavicon(it.url)}
              alt=""
              onError={(e) => faviconImgFallback(e, it.url)}
            />
            <span className="grow">{it.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
