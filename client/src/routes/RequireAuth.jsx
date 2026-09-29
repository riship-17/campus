import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/auth.context.js';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { Notice } from '../components/ui/Notice.jsx';

const HOME_FOR_ROLE = { STUDENT: '/dashboard', CLUB_REP: '/club', ADMIN: '/admin' };

/**
 * Route guard.
 *
 * This hides what you cannot use; it does not protect anything. Every endpoint behind it
 * re-checks the role *and* ownership server-side, because a guard in the browser is a
 * convenience for honest users and nothing more.
 *
 * @param {{ roles?: string[] }} props
 */
export function RequireAuth({ roles }) {
  const { status, user } = useAuth();
  const location = useLocation();

  // Wait for the silent refresh to settle, or a reload would bounce a signed-in user to /login.
  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (roles?.length && !roles.includes(user.role)) {
    return (
      <div className="mx-auto max-w-md py-10">
        <Notice tone="error" title="Not your area">
          This part of CampusConnect is for {roles.join(' and ').toLowerCase().replace(/_/g, ' ')}{' '}
          accounts.{' '}
          <a
            className="font-medium underline underline-offset-2"
            href={HOME_FOR_ROLE[user.role] ?? '/'}
          >
            Go to your dashboard
          </a>
          .
        </Notice>
      </div>
    );
  }

  return <Outlet />;
}

/** Keeps signed-in users off /login and /signup. */
export function RedirectIfAuthenticated({ children }) {
  const { status, user } = useAuth();
  if (status === 'authenticated') {
    return <Navigate to={HOME_FOR_ROLE[user.role] ?? '/'} replace />;
  }
  return children;
}
