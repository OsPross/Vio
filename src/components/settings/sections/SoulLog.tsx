import { useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import { Row } from '../SettingsControls';

type Entry = { time: number; cmd: string; tabId: string; result: string };

/** Settings → Advanced → Soul: last 200 automation commands (no field values) + disconnect. */
export function SoulLog() {
  const t = useT();
  const [log, setLog] = useState<Entry[]>([]);

  useEffect(() => {
    const load = () => void window.shell?.automationLog?.().then((l) => setLog(l ?? []));
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <Row label={t('settings.advanced.soulDisconnectLabel')}>
        <button
          type="button"
          className="sbtn"
          onClick={() => void window.shell?.automationDisconnect?.()}
        >
          {t('settings.advanced.soulDisconnect')}
        </button>
      </Row>
      <p className="snote">{t('settings.advanced.soulLogNote')}</p>
      <div className="soul-log">
        {log.length === 0 && <p className="snote">{t('settings.advanced.soulLogEmpty')}</p>}
        {[...log].reverse().map((e, i) => (
          <div key={i}>
            <span>{new Date(e.time).toLocaleTimeString()}</span>
            <span>{e.cmd}</span>
            <span>{e.tabId}</span>
            <span className={e.result === 'ok' ? '' : 'err'}>{e.result}</span>
          </div>
        ))}
      </div>
    </>
  );
}
