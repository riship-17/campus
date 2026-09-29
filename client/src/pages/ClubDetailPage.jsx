import { Link, useParams } from 'react-router-dom';
import { useClub, useToggleFollow } from '../features/clubs/clubs.queries.js';
import { useEvents } from '../features/events/events.queries.js';
import { EventCard, EventCardSkeleton } from '../features/events/components/EventCard.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Tag } from '../components/ui/Tag.jsx';
import { Notice } from '../components/ui/Notice.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { useAuth } from '../features/auth/auth.context.js';
import { pluralise } from '../lib/format.js';

export default function ClubDetailPage() {
  const { slug } = useParams();
  const { data: club, isPending, isError, error } = useClub(slug);
  const { status, user } = useAuth();
  const toggleFollow = useToggleFollow(slug);

  const upcoming = useEvents({ club: slug, limit: 10, when: 'upcoming' });
  const past = useEvents({ club: slug, limit: 5, when: 'past' });

  if (isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Notice tone="error" title="Cannot show this club">
          {error.message}
        </Notice>
        <Link to="/clubs" className="mt-4 inline-block">
          <Button variant="secondary">Back to the register</Button>
        </Link>
      </div>
    );
  }

  const canFollow = status === 'authenticated' && user.isEmailVerified;

  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-line pb-5">
        <nav className="kicker mb-3 text-muted">
          <Link to="/clubs" className="rounded-xs hover:text-ink">
            Clubs
          </Link>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Tag>{club.category}</Tag>
              {club.foundedYear && (
                <span className="text-[13px] text-muted" data-numeric>
                  Since {club.foundedYear}
                </span>
              )}
            </div>
            <h1 className="mt-2 text-[32px] leading-tight">{club.name}</h1>
            <p className="mt-1 text-[13px] text-muted" data-numeric>
              {pluralise(club.followersCount, 'follower')}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canFollow && (
              <Button
                variant={club.isFollowing ? 'secondary' : 'primary'}
                loading={toggleFollow.isPending}
                onClick={() =>
                  toggleFollow.mutate({ clubId: club.id, isFollowing: club.isFollowing })
                }
              >
                {club.isFollowing ? 'Following' : 'Follow'}
              </Button>
            )}
            {club.canManage && (
              <Link to={`/club/${club.id}/events`}>
                <Button variant="secondary">Manage this club</Button>
              </Link>
            )}
          </div>
        </div>

        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed">{club.description}</p>

        {(club.room || club.contactEmail) && (
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
            {club.room && (
              <div>
                <dt className="kicker text-muted">Find them</dt>
                <dd className="mt-0.5">{club.room}</dd>
              </div>
            )}
            {club.contactEmail && (
              <div>
                <dt className="kicker text-muted">Write to</dt>
                <dd className="mt-0.5">
                  <a
                    href={`mailto:${club.contactEmail}`}
                    className="rounded-xs text-brick underline underline-offset-2"
                  >
                    {club.contactEmail}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        )}
      </header>

      <EventSection
        title="Coming up"
        query={upcoming}
        empty="Nothing scheduled right now. Follow the club and you will see the next one here."
      />

      {(past.data?.data?.length ?? 0) > 0 && (
        <EventSection title="Recently" query={past} empty="" />
      )}
    </div>
  );
}

function EventSection({ title, query, empty }) {
  const events = query.data?.data ?? [];

  return (
    <section>
      <h2 className="mb-3 border-b border-line pb-2 text-[20px]">{title}</h2>

      <div className="rounded-md border border-line bg-surface">
        {query.isPending ? (
          Array.from({ length: 2 }, (_, index) => <EventCardSkeleton key={index} />)
        ) : events.length ? (
          events.map((event) => <EventCard key={event.id} event={event} />)
        ) : (
          <div className="p-4">
            <EmptyState title="Nothing listed" description={empty} />
          </div>
        )}
      </div>
    </section>
  );
}
