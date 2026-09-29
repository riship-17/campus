import { Tag } from '../../../components/ui/Tag.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { useAuth } from '../../auth/auth.context.js';

export const CATEGORIES = [
  'Workshop',
  'Competition',
  'Talk',
  'Screening',
  'Performance',
  'Hackathon',
  'Sports Fixture',
  'Meetup',
];

const TOGGLES = [
  { key: 'hasSeats', label: 'Seats available' },
  { key: 'openOnly', label: 'Registration open' },
  { key: 'eligibleForMe', label: 'I am eligible', needsAuth: true },
];

/**
 * The filter rail. Every control writes to the URL, so a filtered view can be pasted into a
 * hostel group chat and open the same way for whoever taps it.
 */
export function EventFilters({ filters, onChange, onReset, clubs = [] }) {
  const { status } = useAuth();
  const isSignedIn = status === 'authenticated';

  const set = (patch) => onChange({ ...filters, ...patch, page: 1 });

  const active =
    Boolean(filters.q || filters.category || filters.club || filters.hasSeats) ||
    Boolean(filters.openOnly || filters.eligibleForMe) ||
    filters.when !== 'upcoming';

  return (
    <div className="flex flex-col gap-5 rounded-md border border-line bg-surface p-4">
      <div>
        <label htmlFor="event-search" className="kicker text-muted">
          Search
        </label>
        <input
          id="event-search"
          type="search"
          value={filters.q ?? ''}
          onChange={(changed) => set({ q: changed.target.value })}
          placeholder="Title, venue or keyword"
          className="mt-1.5 w-full rounded-xs border border-line-strong bg-surface px-3 py-2 text-[14px] transition-ui placeholder:text-muted/70 hover:border-ink/40 focus:outline-none"
        />
      </div>

      <fieldset>
        <legend className="kicker text-muted">Category</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CATEGORIES.map((category) => {
            const selected = filters.category === category;
            return (
              <button
                key={category}
                type="button"
                aria-pressed={selected}
                onClick={() => set({ category: selected ? '' : category })}
                className={
                  selected
                    ? 'rounded-xs border border-ink bg-ink px-2 py-1 text-[12px] text-white transition-ui'
                    : 'rounded-xs border border-line bg-surface px-2 py-1 text-[12px] text-muted transition-ui hover:border-line-strong hover:text-ink'
                }
              >
                {category}
              </button>
            );
          })}
        </div>
      </fieldset>

      {clubs.length > 0 && (
        <div>
          <label htmlFor="event-club" className="kicker text-muted">
            Club
          </label>
          <select
            id="event-club"
            value={filters.club ?? ''}
            onChange={(changed) => set({ club: changed.target.value })}
            className="mt-1.5 w-full rounded-xs border border-line-strong bg-surface px-3 py-2 text-[14px] transition-ui hover:border-ink/40 focus:outline-none"
          >
            <option value="">All clubs</option>
            {clubs.map((club) => (
              <option key={club.slug} value={club.slug}>
                {club.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset>
        <legend className="kicker text-muted">Show</legend>
        <div className="mt-2 flex flex-col gap-2">
          {TOGGLES.map((toggle) => (
            <label
              key={toggle.key}
              className={
                toggle.needsAuth && !isSignedIn
                  ? 'flex cursor-not-allowed items-center gap-2 text-[14px] text-muted/60'
                  : 'flex cursor-pointer items-center gap-2 text-[14px]'
              }
            >
              <input
                type="checkbox"
                className="accent-brick"
                disabled={toggle.needsAuth && !isSignedIn}
                checked={Boolean(filters[toggle.key])}
                onChange={(changed) => set({ [toggle.key]: changed.target.checked })}
              />
              {toggle.label}
              {toggle.needsAuth && !isSignedIn && <Tag>Sign in</Tag>}
            </label>
          ))}

          <label className="flex cursor-pointer items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              className="accent-brick"
              checked={filters.when === 'past'}
              onChange={(changed) => set({ when: changed.target.checked ? 'past' : 'upcoming' })}
            />
            Events that already happened
          </label>
        </div>
      </fieldset>

      {active && (
        <Button variant="ghost" size="sm" className="self-start" onClick={onReset}>
          Clear all filters
        </Button>
      )}
    </div>
  );
}
