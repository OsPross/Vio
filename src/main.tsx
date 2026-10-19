import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useStore } from './store';
import { PerfGate } from './components/PerfGate';
import { installPerfGlobals } from './lib/perfProbe';
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/instrument-sans/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles.css';
import './styles/scrollbars.css';
import './styles/motion.css';
import './styles/personalize.css';
import './styles/settings.css';
import './styles/ui.css';
import './styles/passwords.css';
import './styles/resources.css';
import './styles/permissions.css';
import './styles/extensions-menu.css';
import './styles/chrome-flyouts.css';
import './styles/tor.css';
import './styles/soul.css';
import './styles/privacy-extra.css';
import './styles/chrome-layout.css';
import './styles/widgets.css';
import './styles/chrome-pages.css';

declare global {
  interface Window {
    __DJXXR_STORE__?: typeof useStore;
  }
}
window.__DJXXR_STORE__ = useStore;
installPerfGlobals();
try {
  performance.mark('djxxr-react-mount');
} catch {
  /* */
}

createRoot(document.getElementById('root')!).render(
  <PerfGate id="App">
    <App />
  </PerfGate>,
);
try {
  requestAnimationFrame(() => {
    try {
      performance.mark('djxxr-first-raf');
    } catch {
      /* */
    }
  });
} catch {
  /* */
}
