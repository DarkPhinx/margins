import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/literata';
import './index.css';
import './study/study.css';
import './home/home.css';
import './shell/shell.css';
import './xrefs/xrefs.css';
import './words/words.css';
import './sync/sync.css';
import { App } from './App';
import { setOfflineState } from './offline';
import { applyScreenSettings } from './settings/apply';

// Dark mode and text size, before the first render.
applyScreenSettings();

// The Windows app has everything on the computer already; the web app saves it with a service worker.
if (!__DESKTOP__ && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onOfflineReady: () => setOfflineState('ready'),
    onRegisteredSW: (_url, registration) => {
      if (registration?.active && navigator.serviceWorker.controller) setOfflineState('ready');
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
