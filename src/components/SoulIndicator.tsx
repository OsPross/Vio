import { useEffect, useState } from 'react';
import { Bot, Square, X } from 'lucide-react';

type SoulState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'acting';
type Panel = {
  open?: boolean;
  content?: { title: string; items: { text: string; action?: string; payload?: unknown }[] };
};

const STATE_LABEL: Record<SoulState, string> = {
  idle: 'gotowy',
  listening: 'słucha',
  thinking: 'myśli',
  speaking: 'mówi',
  acting: 'działa',
};

/**
 * Toolbar icon while Soul (automation API) is connected: state badge, STOP while acting,
 * click → soulIconClicked. Also hosts the small Soul side panel driven by the `panel` command.
 */
export function SoulIndicator() {
  const [connected, setConnected] = useState(0);
  const [soul, setSoul] = useState<{ state: SoulState; text: string }>({ state: 'idle', text: '' });
  const [panel, setPanel] = useState<Panel>({ open: false });

  useEffect(() => {
    const offs = [
      window.shell?.onAutomationStatus?.((p) => {
        const n = Number(p.connected) || 0;
        setConnected(n);
        if (!n) {
          setSoul({ state: 'idle', text: '' });
          setPanel({ open: false });
        }
      }),
      window.shell?.onAutomationSoulState?.((p) =>
        setSoul({ state: p.state ?? 'idle', text: p.text ?? '' }),
      ),
      window.shell?.onAutomationPanel?.((p) => setPanel(p)),
    ];
    return () => offs.forEach((off) => off?.());
  }, []);

  if (!connected) return null;
  const ui = (name: string, data?: unknown) => void window.shell?.automationUiEvent?.(name, data);
  const label = `Soul — ${STATE_LABEL[soul.state]}${soul.text ? `: ${soul.text}` : ''}`;
  return (
    <>
      <button
        type="button"
        className={`icon-btn on soul-btn soul-${soul.state}`}
        title={label}
        aria-label={label}
        onClick={() => ui('soulIconClicked')}
      >
        <Bot size={16} strokeWidth={1.75} />
        {soul.state !== 'idle' && <span className="soul-dot" aria-hidden />}
      </button>
      {soul.state === 'acting' && (
        <button
          type="button"
          className="soul-stop"
          title="Zatrzymaj Soul"
          onClick={() => ui('stopRequested')}
        >
          <Square size={10} strokeWidth={2.5} fill="currentColor" /> STOP
        </button>
      )}
      {panel.open && panel.content && (
        <aside className="soul-panel" aria-label="Soul">
          <header>
            <Bot size={14} strokeWidth={1.75} />
            <strong>{panel.content.title || 'Soul'}</strong>
            <button
              type="button"
              className="icon-btn sm"
              aria-label="Zamknij panel Soul"
              onClick={() => setPanel({ open: false })}
            >
              <X size={14} />
            </button>
          </header>
          <ul>
            {panel.content.items.map((it, i) => (
              <li key={i}>
                {it.action ? (
                  <button
                    type="button"
                    onClick={() => ui('panelAction', { action: it.action, payload: it.payload ?? null })}
                  >
                    {it.text}
                  </button>
                ) : (
                  <span>{it.text}</span>
                )}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </>
  );
}
