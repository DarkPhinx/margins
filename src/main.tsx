import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/literata';
import './index.css';
import { App } from './App';
import { setOfflineState } from './offline';

if ('serviceWorker' in navigator) {
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
