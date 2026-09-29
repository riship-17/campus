import { Link } from 'react-router-dom';
import { useMyRegistrations } from '../../features/events/events.queries.js';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { Tag } from '../../components/ui/Tag.jsx';
import { DateBlock } from '../../components/ui/DateBlock.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { Notice } from '../../components/ui/Notice.jsx';
import { useUrlFilters } from '../../lib/useUrlFilters.js';
import { formatRange } from '../../lib/format.js';

const STATUS_TAG = {
  REGISTERED: { tone: 'forest', label: 'Registered' },
  WAITLISTED: { tone: 'mustard', label: 'Waitlisted' },
  ATTENDED: { tone: 'forest', label: 'Attended' },
  NO_SHOW: { tone: 'neutral', label: 'Marked absent' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled' },
};

const DEFAULTS = { when: 'upcoming', page: 1 };

export default function MyRegistrationsPage() {
  const { filters, setFilters } = useUrlFilters(DEFAULTS);
  const { data, isPending, isError, error } = useMyRegistrations(filters);

  const rows = data?.data ?? [];

  return (
    <div>
      <header className="mb-4 border-b border-line pb-4">
        <p className="kicker text-brick">Your record</p>
        <h1 className="mt-1 text-[30px]">Registrations</h1>
      </header>

      <Tabs
        className="mb-4"
        label="Time range"
        value={filters.when}
        onChange={(when) => setFilters({ ...filters, when, page: 1 })}
        options={[
          { value: 'upcoming', label: 'Coming up' },
          { value: 'past', label: 'Been and gone' },
          { value: 'all', label: 'Everything' },
        ]}
      />

      {isError && <Notice tone="error">{error.message}</Notice>}

      <div className="rounded-md border border-line bg-surface">
        {isPending ? (
          Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="border-b border-line p-4 last:border-b-0">
              <Skeleton className="h-16 w-full" />
            </div>
          ))
        ) : rows.length ? (
          rows.map((row) => <RegistrationRow key={row.id} row={row} />)
        ) : (
          <div className="p-4">
            <EmptyState
              title={
                filters.when === 'past'
                  ? 'Nothing in your history yet'
                  : "You haven't registered for anything yet"
              }
              description="Here's what's happening this week →"
              action={{ label: 'Browse events', onClick: () => window.location.assign('/events') }}
            />
          </div>
        )}
      </div>

      <div className="mt-4">
        <Pagination meta={data?.meta} onChange={(page) => setFilters({ ...filters, page })} />
      </div>
    </div>
  );
}

function RegistrationRow({ row }) {
  const tag = STATUS_TAG[row.status] ?? { tone: 'neutral', label: row.status };
  const cancelled = row.event.status === 'CANCELLED';

  return (
    <article className="flex gap-4 border-b border-line p-4 last:border-b-0">
      <DateBlock value={row.event.startAt} />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone={tag.tone}>{tag.label}</Tag>
          {cancelled && <Tag tone="brick">Event cancelled</Tag>}
        </div>

        <h2 className="text-[18px] leading-snug">
          <Link to={`/events/${row.event.slug}`} className="rounded-xs hover:text-brick">
            {row.event.title}
          </Link>
        </h2>

        <p className="text-[13px] text-muted">
          {row.event.club?.name} · {row.event.venue}
        </p>
        <p className="text-[13px] text-muted" data-numeric>
          {formatRange(row.event.startAt, row.event.endAt)}
        </p>
      </div>

      <div className="flex w-36 shrink-0 flex-col items-end justify-between gap-2">
        <div className="text-right">
          <p className="kicker text-muted">Ticket</p>
          <p className="text-[13px]" data-numeric>
            {row.ticketId}
          </p>
        </div>

        {row.status === 'REGISTERED' && !cancelled && (
          <Link to={`/pass/${row.id}`}>
            <Button size="sm" variant="secondary">
              Entry pass
            </Button>
          </Link>
        )}
      </div>
    </article>
  );
}
