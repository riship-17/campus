import { useEvents } from '../features/events/events.queries.js';
import { useClubs } from '../features/clubs/clubs.queries.js';
import { EventCard, EventCardSkeleton } from '../features/events/components/EventCard.jsx';
import { EventFilters } from '../features/events/components/EventFilters.jsx';
import { Pagination } from '../components/ui/Pagination.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { Notice } from '../components/ui/Notice.jsx';
import { useUrlFilters } from '../lib/useUrlFilters.js';
import { pluralise } from '../lib/format.js';

const DEFAULTS = {
  q: '',
  category: '',
  club: '',
  when: 'upcoming',
  hasSeats: false,
  openOnly: false,
  eligibleForMe: false,
  sort: 'soonest',
  page: 1,
};

export default function EventsPage() {
  const { filters, setFilters, reset } = useUrlFilters(DEFAULTS);
  const { data, isPending, isError, error } = useEvents(filters);
  const clubs = useClubs({ limit: 50 });

  const events = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_1fr] lg:items-start">
      <aside className="lg:sticky lg:top-6">
        <EventFilters
          filters={filters}
          onChange={setFilters}
          onReset={reset}
          clubs={clubs.data?.data ?? []}
        />
      </aside>

      <section>
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
          <div>
            <p className="kicker text-brick">{filters.when === 'past' ? 'Archive' : 'What’s on'}</p>
            <h1 className="mt-1 text-[30px]">
              {filters.when === 'past' ? 'Events that have happened' : 'Campus events'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {meta && <p className="text-[13px] text-muted">{pluralise(meta.total, 'event')}</p>}
            <label className="flex items-center gap-2 text-[13px] text-muted">
              Sort
              <select
                value={filters.sort}
                onChange={(changed) =>
                  setFilters({ ...filters, sort: changed.target.value, page: 1 })
                }
                className="rounded-xs border border-line-strong bg-surface px-2 py-1 text-[13px] text-ink transition-ui hover:border-ink/40 focus:outline-none"
              >
                <option value="soonest">Soonest first</option>
                <option value="latest">Furthest away</option>
                <option value="seats">Most seats left</option>
                <option value="newest">Recently posted</option>
              </select>
            </label>
          </div>
        </header>

        {isError && <Notice tone="error">{error.message}</Notice>}

        <div className="rounded-md border border-line bg-surface">
          {isPending ? (
            Array.from({ length: 5 }, (_, index) => <EventCardSkeleton key={index} />)
          ) : events.length ? (
            events.map((event) => <EventCard key={event.id} event={event} />)
          ) : (
            <div className="p-4">
              <EmptyState
                title="Nothing matches those filters"
                description="Try widening the category, or clear the filters to see everything coming up this month."
                action={{ label: 'Clear filters', onClick: reset }}
              />
            </div>
          )}
        </div>

        <div className="mt-4">
          <Pagination meta={meta} onChange={(page) => setFilters({ ...filters, page })} />
        </div>
      </section>
    </div>
  );
}
