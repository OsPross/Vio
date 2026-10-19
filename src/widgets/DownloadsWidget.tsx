import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useT } from '../i18n';
import { WidgetEmpty } from './WidgetFrame';

type Dl = { id: string; filename: string; state: string; savePath: string };

export function DownloadsWidget({ size, preview }: { size: 'S' | 'M' | 'L'; preview?: boolean }) {
  const t = useT();
  const [items, setItems] = useState<Dl[]>([]);

  useEffect(() => {
    if (preview) {
      setItems([
        { id: '1', filename: t('widgets.ui.downloads.demoPdf'), state: 'completed', savePath: '' },
        {
          id: '2',
          filename: t('widgets.ui.downloads.demoPhoto'),
          state: 'completed',
          savePath: '',
        },
      ]);
      return;
    }
    let cancelled = false;
    const load = () => {
      void window.shell?.downloadsList?.().then((list) => {
        if (cancelled || !Array.isArray(list)) return;
        setItems(
          list
            .slice()
            .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
            .slice(0, size === 'S' ? 3 : size === 'M' ? 5 : 8)
            .map((d) => ({
              id: d.id,
              filename: d.filename,
              state: d.state,
              savePath: d.savePath,
            })),
        );
      });
    };
    load();
    const unsub = window.shell?.onDownloadsChanged?.(() => load());
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [size, preview, t]);

  if (!items.length) {
    return <WidgetEmpty icon={Download} text={t('widgets.ui.downloads.empty')} />;
  }

  return (
    <ul className={`hw-list hw-size-${size}`}>
      {items.map((it) => (
        <li key={it.id}>
          <button
            type="button"
            className="hw-list-row"
            disabled={preview}
            onClick={() => void window.shell?.downloadsShow?.(it.id)}
            title={it.savePath}
          >
            <Download size={13} strokeWidth={1.75} />
            <span className="grow">{it.filename}</span>
            <em className="hw-muted">
              {it.state === 'completed' ? t('widgets.ui.downloads.completed') : it.state}
            </em>
          </button>
        </li>
      ))}
    </ul>
  );
}
