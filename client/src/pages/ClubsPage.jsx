import { Link } from 'react-router-dom';
import { useClubs } from '../features/clubs/clubs.queries.js';
import { Tag } from '../components/ui/Tag.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { Notice } from '../components/ui/Notice.jsx';
import { useUrlFilters } from '../lib/useUrlFilters.js';
import { pluralise } from '../lib/format.js';

const CATEGORIES = [
  'Technical',
  'Cultural',
  'Literary',
  'Sports',
  'Academic',
  'Social Service',
  'Entrepreneurship',
];

const DEFAULTS = { category: '', q: '', page: 1 };

export default function ClubsPage() {
  const { filters, setFilters, reset } = useUrlFilters(DEFAULTS);
  const { data, isPending, isError, error } = useClubs({ ...filters, limit: 50 });

  const clubs = data?.data ?? [];

  return (
    <div>
      <header className="mb-5 border-b border-line pb-4">
        <p className="kicker text-brick">The register</p>
        <h1 className="mt-1 text-[30px]">Clubs and societies</h1>
        <p className="mt-1.5 max-w-2xl text-[15px] text-muted">
          Every recognised body on campus. Follow one and its events surface first on your
          dashboard.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-pressed={!filters.category}
          onClick={reset}
          className={
            filters.category
              ? 'rounded-xs border border-line bg-surface px-2.5 py-1 text-[13px] text-muted transition-ui hover:text-ink'
              : 'rounded-xs border border-ink bg-ink px-2.5 py-1 text-[13px] text-white'
          }
        >
          All
        </button>
        {CATEGORIES.map((category) => {
          const selected = filters.category === category;
          return (
            <button
              key={category}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                setFilters({ ...filters, category: selected ? '' : category, page: 1 })
              }
              className={
                selected
                  ? 'rounded-xs border border-ink bg-ink px-2.5 py-1 text-[13px] text-white'
                  : 'rounded-xs border border-line bg-surface px-2.5 py-1 text-[13px] text-muted transition-ui hover:border-line-strong hover:text-ink'
              }
            >
              {category}
            </button>
          );
        })}
      </div>

      {isError && <Notice tone="error">{error.message}</Notice>}

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-36 w-full" />
          ))}
        </div>
      ) : clubs.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {clubs.map((club) => (
            <ClubCard key={club.id} club={club} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No clubs in that category yet"
          description="Try another council, or look at the full register."
          action={{ label: 'Show all clubs', onClick: reset }}
        />
      )}
    </div>
  );
}

function ClubCard({ club }) {
  return (
    <article className="flex flex-col rounded-md border border-line bg-surface p-4 transition-ui hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xs bg-ink text-[13px] font-semibold text-white">
            {initials(club.name)}
          </div>
          <div>
            <h2 className="text-[18px] leading-snug">
              <Link to={`/clubs/${club.slug}`} className="rounded-xs hover:text-brick">
                {club.name}
              </Link>
            </h2>
            <p className="text-[13px] text-muted" data-numeric>
              {pluralise(club.followersCount, 'follower')}
            </p>
          </div>
        </div>
        <Tag>{club.category}</Tag>
      </div>

      <p className="mt-3 line-clamp-3 text-[14px] leading-relaxed text-muted">
        {club.shortDescription || club.description}
      </p>

      {club.room && <p className="mt-3 text-[13px] text-muted">{club.room}</p>}
    </article>
  );
}

/** "Systems Programming Club" → "SP". Two letters is what fits a 40px square. */
function initials(name) {
  return name
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}
