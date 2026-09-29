import { Outlet } from 'react-router-dom';
import { Masthead } from './Masthead.jsx';
import { Colophon } from './Colophon.jsx';

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xs focus:border focus:border-ink focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <Masthead />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        <Outlet />
      </main>
      <Colophon />
    </div>
  );
}
