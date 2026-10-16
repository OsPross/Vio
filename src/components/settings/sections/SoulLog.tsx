import { useEffect, useState } from 'react';
import { Row } from '../SettingsControls';

type Entry = { time: number; cmd: string; tabId: string; result: string };

/** Settings → Zaawansowane → Soul: last 200 automation commands (no field values) + disconnect. */
export function SoulLog() {
  const [log, setLog] = useState<Entry[]>([]);

  useEffect(() => {
    const load = () => void window.shell?.automationLog?.().then((l) => setLog(l ?? []));
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <Row label="Rozłącz wszystkie połączenia Soul">
        <button
          type="button"
          className="sbtn"
          onClick={() => void window.shell?.automationDisconnect?.()}
        >
          Rozłącz Soul
        </button>
      </Row>
      <p className="snote">Ostatnie polecenia Soul (bez wpisywanych wartości):</p>
      <div className="soul-log">
        {log.length === 0 && <p className="snote">Brak poleceń.</p>}
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
