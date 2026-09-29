import { Link, useParams } from 'react-router-dom';
import { useCancelRegistration, useEvent, useRegister } from '../features/events/events.queries.js';
import { useAuth } from '../features/auth/auth.context.js';
import { RichText } from '../components/RichText.jsx';
import { SeatBar } from '../components/ui/SeatBar.jsx';
import { Tag } from '../components/ui/Tag.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Notice } from '../components/ui/Notice.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { deadlineLabel, formatDateTime, formatRange, formatTime } from '../lib/format.js';

export default function EventDetailPage() {
  const { slug } = useParams();
  const { data: event, isPending, isError, error } = useEvent(slug);
  const { user, status } = useAuth();

  const register = useRegister(slug);
  const cancel = useCancelRegistration(slug);

  if (isPending) return <EventDetailSkeleton />;

  if (isError) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Notice tone="error" title="Cannot show this event">
          {error.message}
        </Notice>
        <Link to="/events" className="mt-4 inline-block">
          <Button variant="secondary">Back to all events</Button>
        </Link>
      </div>
    );
  }

  const deadline = deadlineLabel(event.registrationDeadline);
  const mine = event.myRegistration;
  const isSignedIn = status === 'authenticated';

  return (
    <article className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div>
        <nav className="kicker mb-3 flex flex-wrap items-center gap-1.5 text-muted">
          <Link to="/events" className="rounded-xs hover:text-ink">
            Events
          </Link>
          <span aria-hidden="true">/</span>
          <Link to={`/clubs/${event.club?.slug}`} className="rounded-xs hover:text-ink">
            {event.club?.name}
          </Link>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <Tag>{event.category}</Tag>
          {event.status === 'CANCELLED' && <Tag tone="brick">Cancelled</Tag>}
          {event.status === 'COMPLETED' && <Tag>Finished</Tag>}
          {event.eligibility?.years?.length > 0 && (
            <Tag tone="mustard">Years {event.eligibility.years.join(', ')} only</Tag>
          )}
          {event.eligibility?.departments?.length > 0 && (
            <Tag tone="mustard">{event.eligibility.departments.join(', ')} only</Tag>
          )}
        </div>

        <h1 className="mt-2 text-[32px] leading-tight">{event.title}</h1>

        <dl className="mt-5 grid gap-x-8 gap-y-3 border-y border-line py-4 sm:grid-cols-2">
          <Detail label="When" value={formatRange(event.startAt, event.endAt)} numeric />
          <Detail label="Where" value={event.venue} />
          <Detail label="Run by" value={event.club?.name} />
          <Detail
            label="Registration"
            value={
              deadline.closed ? 'Closed' : `Closes ${formatDateTime(event.registrationDeadline)}`
            }
            numeric
            tone={deadline.urgent ? 'text-brick' : undefined}
          />
          {event.reportingTime && (
            <Detail
              label="Report by"
              value={formatTime(event.reportingTime)}
              numeric
              tone="text-brick"
            />
          )}
        </dl>

        {event.status === 'CANCELLED' && event.cancellationReason && (
          <Notice tone="error" title="This event was cancelled" className="mt-5">
            {event.cancellationReason}
          </Notice>
        )}

        {event.prerequisites && (
          <div className="mt-5 rounded-md border-l-2 border-y border-r border-line border-l-brick bg-surface px-4 py-3">
            <p className="kicker text-brick">Before you come</p>
            <p className="mt-1 text-[14px] leading-relaxed">{event.prerequisites}</p>
          </div>
        )}

        <RichText html={event.description} className="prose-notice mt-6" />
      </div>

      <aside className="rounded-md border border-line bg-surface lg:sticky lg:top-6">
        <div className="border-b border-line px-4 py-3">
          <p className="kicker text-muted">Your place</p>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4">
          <SeatBar
            registered={event.registeredCount}
            capacity={event.capacity}
            waitlisted={event.waitlistedCount}
          />

          {mine?.status === 'REGISTERED' && (
            <Notice tone="success" title="You’re registered">
              Ticket <span data-numeric>{mine.ticketId}</span>. Your entry pass is on your
              dashboard.
            </Notice>
          )}

          {mine?.status === 'WAITLISTED' && (
            <Notice tone="info" title="On the waitlist">
              We will email you the moment a seat opens up.
            </Notice>
          )}

          {mine?.status === 'ATTENDED' && (
            <Notice tone="success" title="You attended this">
              Scanned in at the door.
            </Notice>
          )}

          {!isSignedIn && (
            <>
              <p className="text-[14px] text-muted">Sign in with your college email to register.</p>
              <Link to="/login" state={{ from: `/events/${slug}` }}>
                <Button className="w-full">Sign in to register</Button>
              </Link>
            </>
          )}

          {isSignedIn && !user.isEmailVerified && (
            <Notice tone="error" title="Confirm your email first">
              Check your inbox for the link we sent when you signed up.
            </Notice>
          )}

          {isSignedIn && user.isEmailVerified && event.eligibility?.meetsRequirements === false && (
            <Notice tone="error" title="Not open to you">
              This one is limited to specific years or departments.
            </Notice>
          )}

          {isSignedIn &&
            user.isEmailVerified &&
            event.eligibility?.meetsRequirements !== false &&
            event.status === 'PUBLISHED' && (
              <RegistrationAction
                event={event}
                mine={mine}
                deadline={deadline}
                onRegister={() => register.mutate(event.id)}
                onCancel={() => cancel.mutate(event.id)}
                registering={register.isPending}
                cancelling={cancel.isPending}
              />
            )}
        </div>
      </aside>
    </article>
  );
}

function RegistrationAction({
  event,
  mine,
  deadline,
  onRegister,
  onCancel,
  registering,
  cancelling,
}) {
  const holdsPlace = mine?.status === 'REGISTERED' || mine?.status === 'WAITLISTED';

  if (holdsPlace) {
    return (
      <Button variant="danger" className="w-full" loading={cancelling} onClick={onCancel}>
        {mine.status === 'WAITLISTED' ? 'Leave the waitlist' : 'Cancel my registration'}
      </Button>
    );
  }

  if (deadline.closed) {
    return <p className="text-[14px] text-muted">Registration closed.</p>;
  }

  const full = event.seatsLeft === 0;

  if (full && !event.waitlistEnabled) {
    return <p className="text-[14px] text-muted">This one is full and has no waitlist.</p>;
  }

  return (
    <Button className="w-full" loading={registering} onClick={onRegister}>
      {full ? 'Join the waitlist' : 'Register'}
    </Button>
  );
}

function Detail({ label, value, numeric, tone }) {
  return (
    <div>
      <dt className="kicker text-muted">{label}</dt>
      <dd className={`mt-0.5 text-[14px] ${tone ?? ''}`} data-numeric={numeric || undefined}>
        {value}
      </dd>
    </div>
  );
}

function EventDetailSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]" aria-busy="true">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
