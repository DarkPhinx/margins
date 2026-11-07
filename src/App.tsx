import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { loadRemoteProviders } from './translations/registry';
import { Reader } from './reader/Reader';
import { getSettings } from './settings';

function Home() {
  const { translation, last } = getSettings();
  return <Navigate replace to={`/${translation}/${last.book}/${last.chapter}?v=${last.verse}`} />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/:translation/:book/:chapter" element={<Reader />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}

export function App() {
  const [ready, setReady] = useState(!__ESV_ENABLED__);
  useEffect(() => {
    if (__ESV_ENABLED__) void loadRemoteProviders().finally(() => setReady(true));
  }, []);
  if (!ready) return null;
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
