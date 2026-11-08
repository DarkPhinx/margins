import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { loadRemoteProviders } from './translations/registry';
import { Reader } from './reader/Reader';
import { Home } from './home/Home';
import { JournalPage } from './home/JournalPage';
import { StudyProvider } from './study/StudyContext';
import { AppShell } from './shell/AppShell';
import { JournalListPage } from './pages/JournalListPage';
import { NotesPage } from './pages/NotesPage';
import { OriginalSearchPage, OriginalVersePage, OriginalWordPage } from './words/OriginalPages';

export function AppRoutes() {
  // Study state sits above the routes, so the panel and a selection survive
  // changing chapter or translation.
  return (
    <StudyProvider>
      <Routes>
        {/* Every page sits beside the sidebar. */}
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/journal" element={<JournalListPage />} />
          <Route path="/journal/:id" element={<JournalPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/original" element={<OriginalSearchPage />} />
          <Route path="/original/search" element={<OriginalSearchPage />} />
          <Route path="/original/verse/:range" element={<OriginalVersePage />} />
          <Route path="/original/word/:strong" element={<OriginalWordPage />} />
          <Route path="/:translation/:book/:chapter" element={<Reader />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Route>
      </Routes>
    </StudyProvider>
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
