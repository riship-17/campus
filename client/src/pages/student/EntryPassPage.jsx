import { Link, useParams } from 'react-router-dom';
import { useMyRegistrations } from '../../features/events/events.queries.js';
import { Notice } from '../../components/ui/Notice.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { Tag } from '../../components/ui/Tag.jsx';
import { formatRange } from '../../lib/format.js';

/**
 * Placeholder for the real pass.
 *
 * The live pass is a rotating HMAC-signed QR that refreshes every 25 seconds, and it belongs
 * with the attendance scanner — building half of it now would mean shipping a static ticket
 * that looks like a pass and is not one. Until then this shows the ticket reference, which is
 * genuinely useful at a manual check-in desk.
 */
export default function EntryPassPage() {
  const { registrationId } = useParams();
  const { data, isPending } = useMyRegistrations({ when: 'all', limit: 50 });

  if (isPending) return <Skeleton className="mx-auto h-64 w-full max-w-md" />;

  const registration = data?.data?.find((row) => row.id === registrationId);

  if (!registration) {
    return (
      <div className="mx-auto max-w-md py-10">
        <Notice tone="error" title="No pass for this registration">
          It may have been cancelled, or it belongs to a different account.
        </Notice>
        <Link to="/me/registrations" className="mt-4 inline-block">
          <Button variant="secondary">Your registrations</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-md border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="kicker text-muted">Admission</p>
          <Tag tone="forest">{registration.status === 'ATTENDED' ? 'Checked in' : 'Confirmed'}</Tag>
        </div>

        <div className="flex flex-col gap-4 px-4 py-5">
          <div>
            <h1 className="text-[22px] leading-snug">{registration.event.title}</h1>
            <p className="mt-1 text-[13px] text-muted" data-numeric>
              {formatRange(registration.event.startAt, registration.event.endAt)}
            </p>
            <p className="text-[13px] text-muted">
              {registration.event.club?.name} · {registration.event.venue}
            </p>
          </div>

          <div className="rounded-xs border border-dashed border-line-strong px-4 py-5 text-center">
            <p className="kicker text-muted">Ticket reference</p>
            <p className="mt-1 font-mono text-[24px] tracking-[0.15em]" data-numeric>
              {registration.ticketId}
            </p>
          </div>

          <Notice tone="info" title="Scannable pass coming">
            The rotating QR code arrives with the attendance scanner. Until then, give this
            reference and your institute smart card at the desk.
          </Notice>
        </div>
      </div>

      <Link to="/me/registrations" className="mt-4 inline-block">
        <Button variant="ghost" size="sm">
          Back to your registrations
        </Button>
      </Link>
    </div>
  );
}
