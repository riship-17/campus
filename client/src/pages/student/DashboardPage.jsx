import { Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/auth.context.js';
import { useMyRegistrations } from '../../features/events/events.queries.js';
import { useEvents } from '../../features/events/events.queries.js';
import { Notice } from '../../components/ui/Notice.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Tag } from '../../components/ui/Tag.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { DateBlock } from '../../components/ui/DateBlock.jsx';
import { EventCard, EventCardSkeleton } from '../../features/events/components/EventCard.jsx';
import { formatRange } from '../../lib/format.js';

export default function DashboardPage() {
  const { user } = useAuth();
  const upcoming = useMyRegistrations({ when: 'upcoming', limit: 3 });
  const thisWeek = useEvents({ limit: 4, openOnly: true, hasSeats: true });

  const next = upcoming.data?.data?.[0] ?? null;
  const later = upcoming.data?.data?.slice(1) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b border-line pb-4">
        <p className="kicker text-brick">Student dossier</p>
        <h1 className="mt-1 text-[30px]">Welcome back, {user.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-muted">
          {user.rollNumber && <span data-numeric>Roll {user.rollNumber}</span>}
          {user.department && <span>{user.department}</span>}
          {user.year && <span data-numeric>Year {user.year}</span>}
          <Tag tone={user.isEmailVerified ? 'forest' : 'mustard'}>
            {user.isEmailVerified ? 'Email confirmed' : 'Email unconfirmed'}
          </Tag>
        </div>
      </header>

      {!user.isEmailVerified && (
        <Notice tone="error" title="Confirm your email">
          You cannot register for events until your college address is confirmed. Check your inbox
          for the link we sent when you signed up.
        </Notice>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between border-b border-line pb-2">
          <h2 className="text-[20px]">Your next event</h2>
          <Link to="/me/registrations" className="kicker rounded-xs text-muted hover:text-ink">
            All registrations
          </Link>
        </div>

        {upcoming.isPending ? (
          <div className="rounded-md border border-line bg-surface">
            <EventCardSkeleton />
          </div>
        ) : next ? (
          <div className="rounded-md border border-line bg-surface">
            <div className="flex flex-wrap gap-4 p-4">
              <DateBlock value={next.event.startAt} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone={next.status === 'WAITLISTED' ? 'mustard' : 'forest'}>
                    {next.status === 'WAITLISTED' ? 'On the waitlist' : 'Confirmed'}
                  </Tag>
                  <span className="text-[13px] text-muted" data-numeric>
                    Ticket {next.ticketId}
                  </span>
                </div>
                <h3 className="mt-1.5 text-[20px] leading-snug">
                  <Link to={`/events/${next.event.slug}`} className="rounded-xs hover:text-brick">
                    {next.event.title}
                  </Link>
                </h3>
                <p className="mt-1 text-[13px] text-muted" data-numeric>
                  {formatRange(next.event.startAt, next.event.endAt)}
                </p>
                <p className="text-[13px] text-muted">
                  {next.event.club?.name} · {next.event.venue}
                </p>
              </div>
              {next.status === 'REGISTERED' && (
                <div className="flex items-center">
                  <Link to={`/pass/${next.id}`}>
                    <Button variant="secondary">Show entry pass</Button>
                  </Link>
                </div>
              )}
            </div>

            {later.length > 0 && (
              <ul className="border-t border-line">
                {later.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5 text-[14px] last:border-b-0"
                  >
                    <Link to={`/events/${row.event.slug}`} className="rounded-xs hover:text-brick">
                      {row.event.title}
                    </Link>
                    <span className="text-[13px] text-muted" data-numeric>
                      {formatRange(row.event.startAt, row.event.endAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <EmptyState
            title="You haven't registered for anything yet"
            description="Here's what's open this week, with seats still free."
          />
        )}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between border-b border-line pb-2">
          <h2 className="text-[20px]">Open now, seats free</h2>
          <Link to="/events" className="kicker rounded-xs text-muted hover:text-ink">
            All events
          </Link>
        </div>

        <div className="rounded-md border border-line bg-surface">
          {thisWeek.isPending ? (
            Array.from({ length: 3 }, (_, index) => <EventCardSkeleton key={index} />)
          ) : thisWeek.data?.data?.length ? (
            thisWeek.data.data.map((event) => <EventCard key={event.id} event={event} />)
          ) : (
            <div className="p-4">
              <EmptyState
                title="Nothing open for registration right now"
                description="Clubs post most events about two weeks ahead. Follow a few and they will show up here."
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
