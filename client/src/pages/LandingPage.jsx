import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button.jsx';
import { useAuth } from '../features/auth/auth.context.js';

const HOME_FOR_ROLE = { STUDENT: '/dashboard', CLUB_REP: '/club', ADMIN: '/admin' };

export default function LandingPage() {
  const { user, status } = useAuth();

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <section>
        <p className="kicker text-brick">Autumn semester · Week 11</p>
        <h1 className="mt-2 text-[38px] leading-[1.1] sm:text-[46px]">
          Everything happening on campus, on one board.
        </h1>
        <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-muted">
          Clubs post here. You register here. Attendance is scanned at the door, and your
          certificate is issued against that scan — so what the certificate says actually happened.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {status === 'authenticated' ? (
            <Link to={HOME_FOR_ROLE[user.role] ?? '/events'}>
              <Button>Go to your dashboard</Button>
            </Link>
          ) : (
            <>
              <Link to="/signup">
                <Button>Sign up with college email</Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary">Log in</Button>
              </Link>
            </>
          )}
        </div>
      </section>

      <aside className="rounded-md border border-line bg-surface">
        <div className="border-b border-line px-5 py-3">
          <p className="kicker text-muted">How it works</p>
        </div>
        <ol className="divide-y divide-line">
          {[
            ['Find it', 'Filter by club, category or date. Seats and deadlines are on the card.'],
            ['Register', 'Full event? You join the waitlist and move up automatically.'],
            ['Show up', 'Your pass is a rotating QR code. Screenshots stop working in 30 seconds.'],
            ['Collect', 'Attended and gave feedback? Your certificate is verifiable by anyone.'],
          ].map(([title, body], index) => (
            <li key={title} className="flex gap-3 px-5 py-3.5">
              <span className="kicker mt-1 text-brick" data-numeric>
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-[13px] leading-relaxed text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
