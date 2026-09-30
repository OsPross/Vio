import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useStore } from './store';
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
import './styles/tor.css';
import './styles/privacy-extra.css';
import './styles/chrome-layout.css';
import './styles/widgets.css';

declare global {
  interface Window {
    __DJXXR_STORE__?: typeof useStore;
  }
}
window.__DJXXR_STORE__ = useStore;

createRoot(document.getElementById('root')!).render(<App />);
