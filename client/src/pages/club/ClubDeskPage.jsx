import { Link } from 'react-router-dom';
import { useMyClubs } from '../../features/clubs/clubs.queries.js';
import { Tag } from '../../components/ui/Tag.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { Notice } from '../../components/ui/Notice.jsx';
import { pluralise } from '../../lib/format.js';

export default function ClubDeskPage() {
  const { data: clubs, isPending, isError, error } = useMyClubs();

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b border-line pb-4">
        <p className="kicker text-brick">Club desk</p>
        <h1 className="mt-1 text-[30px]">Clubs you convene</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          Post events, check who has registered, and export the list for the door.
        </p>
      </header>

      {isError && <Notice tone="error">{error.message}</Notice>}

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : clubs?.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {clubs.map((club) => (
            <article key={club.id} className="rounded-md border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[19px]">{club.name}</h2>
                  <p className="text-[13px] text-muted" data-numeric>
                    {pluralise(club.followersCount, 'follower')}
                  </p>
                </div>
                <Tag>{club.category}</Tag>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={`/club/${club.id}/events`}>
                  <Button size="sm">Event register</Button>
                </Link>
                <Link to={`/club/${club.id}/events/new`}>
                  <Button size="sm" variant="secondary">
                    New event
                  </Button>
                </Link>
                <Link to={`/clubs/${club.slug}`}>
                  <Button size="sm" variant="ghost">
                    Public page
                  </Button>
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No clubs assigned to you yet"
          description="The SAC office appoints conveners. Ask them to add you to your club on CampusConnect, and this page will fill up."
        />
      )}
    </div>
  );
}
