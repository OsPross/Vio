import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';

/** Toolbar badge while Soul (automation API) is connected; click disconnects. */
export function SoulIndicator() {
  const [connected, setConnected] = useState(0);

  useEffect(() => {
    const off = window.shell?.onAutomationStatus?.((p) => setConnected(Number(p.connected) || 0));
    return () => off?.();
  }, []);

  if (!connected) return null;
  return (
    <button
      type="button"
      className="icon-btn on"
      title="Soul steruje przeglądarką — kliknij, aby rozłączyć"
      aria-label="Rozłącz Soul"
      onClick={() => void window.shell?.automationDisconnect?.()}
    >
      <Bot size={16} strokeWidth={1.75} />
    </button>
  );
}
