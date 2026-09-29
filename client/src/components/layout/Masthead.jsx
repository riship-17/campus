import { Link, NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '../../features/auth/auth.context.js';
import { Button } from '../ui/Button.jsx';

const PUBLIC_LINKS = [
  { to: '/events', label: 'Events' },
  { to: '/clubs', label: 'Clubs' },
];

const ROLE_HOME = {
  STUDENT: { to: '/dashboard', label: 'My dashboard' },
  CLUB_REP: { to: '/club', label: 'Club desk' },
  ADMIN: { to: '/admin', label: 'Admin' },
};

const NavItem = ({ to, children }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      clsx(
        'kicker rounded-xs pb-0.5 transition-ui',
        isActive
          ? 'border-b-2 border-brick text-brick'
          : 'border-b-2 border-transparent text-muted hover:text-ink'
      )
    }
  >
    {children}
  </NavLink>
);

/** The paper masthead: a dateline rule, the title, and a thin navigation row. */
export function Masthead() {
  const { user, status, signOut } = useAuth();
  const home = user ? ROLE_HOME[user.role] : null;

  const today = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  return (
    <header className="border-b border-line bg-surface">
      <div className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-1.5">
          <span className="kicker text-muted" data-numeric>
            {today}
          </span>
          <span className="kicker text-muted">Student Affairs Council · Campus notice board</span>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
        <Link to="/" className="rounded-xs">
          <span className="block font-serif text-[26px] leading-none tracking-tight">
            CampusConnect
          </span>
          <span className="kicker text-muted">Clubs · Events · Attendance · Certificates</span>
        </Link>

        <nav aria-label="Main" className="flex flex-wrap items-center gap-4">
          {PUBLIC_LINKS.map((link) => (
            <NavItem key={link.to} to={link.to}>
              {link.label}
            </NavItem>
          ))}

          {status === 'authenticated' && <NavItem to="/me/registrations">My registrations</NavItem>}

          {status === 'authenticated' && home && <NavItem to={home.to}>{home.label}</NavItem>}
        </nav>

        <div className="flex items-center gap-3">
          {status === 'authenticated' ? (
            <>
              <span className="hidden text-[13px] text-muted sm:inline">{user.name}</span>
              <Button variant="secondary" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="kicker rounded-xs text-muted transition-ui hover:text-ink"
              >
                Log in
              </Link>
              <Link to="/signup">
                <Button size="sm">Sign up with college email</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
