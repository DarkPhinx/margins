import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { loadRemoteProviders } from './translations/registry';
import { Reader } from './reader/Reader';
import { Home } from './home/Home';
import { JournalPage } from './home/JournalPage';
import { StudyProvider } from './study/StudyContext';
import { AppShell } from './shell/AppShell';
import { AuthGate } from './sync/AuthGate';
import { AccountOnly } from './sync/access';
import { SignInRoute } from './sync/SignInPage';
import { JournalListPage } from './pages/JournalListPage';
import { NotesPage } from './pages/NotesPage';
import { OriginalSearchPage, OriginalVersePage, OriginalWordPage } from './words/OriginalPages';

export function AppRoutes() {
  // Study state sits above the routes, so the panel and a selection survive
  // changing chapter or translation.
  return (
    <StudyProvider>
      <Routes>
        {/* Signing in, for someone reading signed out. */}
        <Route path="/signin" element={<SignInRoute />} />
        {/* Every page sits beside the sidebar. */}
        <Route element={<AppShell />}>
          {/* Signed out, home opens the Bible instead. */}
          <Route
            path="/"
            element={
              <AccountOnly readInstead>
                <Home />
              </AccountOnly>
            }
          />
          {/* What you've written needs an account; signed out, these pages explain why, with Sign in and Create account. */}
          <Route
            element={
              <AccountOnly title="Your journal">
                <Outlet />
              </AccountOnly>
            }
          >
            <Route path="/journal" element={<JournalListPage />} />
            <Route path="/journal/:id" element={<JournalPage />} />
          </Route>
          <Route
            path="/notes"
            element={
              <AccountOnly title="Your notes and questions">
                <NotesPage />
              </AccountOnly>
            }
          />
          {/* Reading and looking things up never need an account. */}
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
      {/* Signed out: reading and looking things up. Signed in: also everything you write, offline too, kept synced. */}
      <AuthGate>
        <AppRoutes />
      </AuthGate>
    </BrowserRouter>
  );
}
