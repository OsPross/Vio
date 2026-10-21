import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useStore } from './store';
import { PerfGate } from './components/PerfGate';
import { installPerfGlobals } from './lib/perfProbe';
/** First-paint fonts + chrome (home / omnibox / widgets). */
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/instrument-sans/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import './styles.css';
import './styles/scrollbars.css';
import './styles/motion.css';
import './styles/personalize.css';
import './styles/ui.css';
import './styles/chrome-layout.css';
import './styles/widgets.css';

/** Secondary surfaces — load after first paint (settings, vault, Tor, about pages…). */
function loadDeferredStyles() {
  void import('@fontsource/jetbrains-mono/400.css');
  void import('@fontsource/jetbrains-mono/500.css');
  void import('./styles/passwords.css');
  void import('./styles/resources.css');
  void import('./styles/permissions.css');
  void import('./styles/extensions-menu.css');
  void import('./styles/chrome-flyouts.css');
  void import('./styles/tor.css');
  void import('./styles/soul.css');
  void import('./styles/privacy-extra.css');
  void import('./styles/chrome-pages.css');
  void import('./styles/settings.css');
}
requestAnimationFrame(() => {
  requestAnimationFrame(loadDeferredStyles);
});

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
