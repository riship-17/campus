import { Link } from 'react-router-dom';
import { DateBlock } from '../../../components/ui/DateBlock.jsx';
import { SeatBar } from '../../../components/ui/SeatBar.jsx';
import { Tag } from '../../../components/ui/Tag.jsx';
import { deadlineLabel, formatTime } from '../../../lib/format.js';

const REGISTRATION_TONE = {
  REGISTERED: { tone: 'forest', label: "You're registered" },
  WAITLISTED: { tone: 'mustard', label: 'On the waitlist' },
  ATTENDED: { tone: 'forest', label: 'Attended' },
  NO_SHOW: { tone: 'neutral', label: 'Marked absent' },
};

/**
 * Everything a decision needs without a click: when, where, who is running it, how full it
 * is, and when registration closes.
 */
export function EventCard({ event }) {
  const deadline = deadlineLabel(event.registrationDeadline);
  const mine = event.myRegistration ? REGISTRATION_TONE[event.myRegistration.status] : null;

  return (
    <article className="flex gap-4 border-b border-line bg-surface p-4 transition-ui last:border-b-0 hover:bg-wash/40">
      <DateBlock value={event.startAt} />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Tag>{event.category}</Tag>
          {mine && <Tag tone={mine.tone}>{mine.label}</Tag>}
          {event.status === 'CANCELLED' && <Tag tone="brick">Cancelled</Tag>}
        </div>

        <h3 className="text-[19px] leading-snug">
          <Link to={`/events/${event.slug}`} className="rounded-xs hover:text-brick">
            {event.title}
          </Link>
        </h3>

        <p className="text-[13px] text-muted">
          {event.club?.name} · {event.venue}
        </p>

        {event.summary && (
          <p className="line-clamp-2 text-[14px] leading-relaxed text-muted">{event.summary}</p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
          <span data-numeric className="text-ink">
            {formatTime(event.startAt)}
          </span>
          <span className={deadline.urgent ? 'font-medium text-brick' : 'text-muted'}>
            {deadline.text}
          </span>
        </div>
      </div>

      <div className="hidden w-40 shrink-0 flex-col justify-center sm:flex">
        <SeatBar
          registered={event.registeredCount}
          capacity={event.capacity}
          waitlisted={event.waitlistedCount}
        />
      </div>
    </article>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="flex gap-4 border-b border-line bg-surface p-4 last:border-b-0">
      <div className="h-14 w-14 shrink-0 animate-pulse rounded-xs bg-wash" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="h-3 w-20 animate-pulse rounded-xs bg-wash" />
        <div className="h-5 w-2/3 animate-pulse rounded-xs bg-wash" />
        <div className="h-3 w-1/3 animate-pulse rounded-xs bg-wash" />
        <div className="h-3 w-1/2 animate-pulse rounded-xs bg-wash" />
      </div>
    </div>
  );
}
