import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clubsApi } from '../../features/clubs/clubs.api.js';
import { eventsApi } from '../../features/events/events.api.js';
import { eventKeys } from '../../features/events/events.queries.js';
import { Table } from '../../components/ui/Table.jsx';
import { Tag } from '../../components/ui/Tag.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Notice } from '../../components/ui/Notice.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useUrlFilters } from '../../lib/useUrlFilters.js';
import { formatDateTime } from '../../lib/format.js';
import { toApiError } from '../../lib/apiError.js';

const STATUS_TAG = {
  DRAFT: { tone: 'neutral', label: 'Draft' },
  PENDING_APPROVAL: { tone: 'mustard', label: 'Awaiting SAC' },
  PUBLISHED: { tone: 'forest', label: 'Published' },
  CANCELLED: { tone: 'brick', label: 'Cancelled' },
  COMPLETED: { tone: 'neutral', label: 'Finished' },
};

const DEFAULTS = { status: '', page: 1 };

export default function ClubEventsPage() {
  const { clubId } = useParams();
  const { filters, setFilters } = useUrlFilters(DEFAULTS);
  const queryClient = useQueryClient();
  const toast = useToast();

  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState('');

  const register = useQuery({
    queryKey: eventKeys.clubRegister(clubId, filters),
    queryFn: () => clubsApi.events(clubId, filters),
    placeholderData: (previous) => previous,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'events'] });

  const publish = useMutation({
    mutationFn: (id) => eventsApi.publish(id),
    onSuccess: (data) => {
      toast.show(data.message, 'success');
      invalidate();
    },
    onError: (error) => toast.show(toApiError(error).message, 'error'),
  });

  const cancel = useMutation({
    mutationFn: ({ id, reason: why }) => eventsApi.cancel(id, why),
    onSuccess: (data) => {
      toast.show(
        data.releasedRegistrations > 0
          ? `Cancelled. ${data.releasedRegistrations} registrations were released — tell them why.`
          : 'Cancelled.',
        'success'
      );
      setCancelling(null);
      setReason('');
      invalidate();
    },
    onError: (error) => toast.show(toApiError(error).message, 'error'),
  });

  const columns = [
    {
      key: 'title',
      header: 'Event',
      render: (event) => (
        <div>
          <Link to={`/events/${event.slug}`} className="rounded-xs font-medium hover:text-brick">
            {event.title}
          </Link>
          <p className="text-[13px] text-muted">{event.venue}</p>
        </div>
      ),
    },
    {
      key: 'when',
      header: 'When',
      nowrap: true,
      numeric: true,
      render: (event) => <span className="text-[13px]">{formatDateTime(event.startAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      nowrap: true,
      render: (event) => {
        const tag = STATUS_TAG[event.status] ?? { tone: 'neutral', label: event.status };
        return <Tag tone={tag.tone}>{tag.label}</Tag>;
      },
    },
    {
      key: 'seats',
      header: 'Seats',
      align: 'right',
      numeric: true,
      nowrap: true,
      render: (event) => (
        <span>
          {event.registeredCount}/{event.capacity}
          {event.waitlistedCount > 0 && (
            <span className="text-muted"> +{event.waitlistedCount} waiting</span>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      nowrap: true,
      render: (event) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          {(event.status === 'DRAFT' || event.status === 'PENDING_APPROVAL') && (
            <Link to={`/club/events/${event.id}/edit`}>
              <Button size="sm" variant="ghost">
                Edit
              </Button>
            </Link>
          )}
          {event.status === 'DRAFT' && (
            <Button
              size="sm"
              variant="secondary"
              loading={publish.isPending && publish.variables === event.id}
              onClick={() => publish.mutate(event.id)}
            >
              Submit
            </Button>
          )}
          {['PUBLISHED', 'COMPLETED'].includes(event.status) && (
            <Link to={`/club/events/${event.id}/registrations`}>
              <Button size="sm" variant="secondary">
                Attendees
              </Button>
            </Link>
          )}
          {['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED'].includes(event.status) && (
            <Button size="sm" variant="ghost" onClick={() => setCancelling(event)}>
              Cancel
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          <nav className="kicker mb-2 text-muted">
            <Link to="/club" className="rounded-xs hover:text-ink">
              Club desk
            </Link>
          </nav>
          <h1 className="text-[28px]">Event register</h1>
        </div>
        <Link to={`/club/${clubId}/events/new`}>
          <Button>New event</Button>
        </Link>
      </header>

      <Tabs
        label="Status"
        value={filters.status}
        onChange={(status) => setFilters({ ...filters, status, page: 1 })}
        options={[
          { value: '', label: 'All' },
          { value: 'DRAFT', label: 'Drafts' },
          { value: 'PENDING_APPROVAL', label: 'Awaiting SAC' },
          { value: 'PUBLISHED', label: 'Published' },
          { value: 'COMPLETED', label: 'Finished' },
          { value: 'CANCELLED', label: 'Cancelled' },
        ]}
      />

      {register.isError && <Notice tone="error">{register.error.message}</Notice>}

      {register.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Table
          columns={columns}
          rows={register.data?.data ?? []}
          keyOf={(event) => event.id}
          empty="Nothing on the register yet. Post your first event."
        />
      )}

      <Pagination
        meta={register.data?.meta}
        onChange={(page) => setFilters({ ...filters, page })}
      />

      <Modal
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title="Cancel this event?"
        description={
          cancelling
            ? `Everyone holding a place at “${cancelling.title}” loses it, including the waitlist. This cannot be undone.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              disabled={reason.trim().length < 5}
              onClick={() => cancel.mutate({ id: cancelling.id, reason: reason.trim() })}
            >
              Cancel the event
            </Button>
          </>
        }
      >
        <label className="kicker text-muted" htmlFor="cancel-reason">
          Why? Attendees will see this.
        </label>
        <textarea
          id="cancel-reason"
          rows={3}
          value={reason}
          onChange={(changed) => setReason(changed.target.value)}
          placeholder="The visiting speaker cancelled their trip."
          className="mt-1.5 w-full rounded-xs border border-line-strong bg-surface px-3 py-2 text-[14px] transition-ui placeholder:text-muted/70 hover:border-ink/40 focus:outline-none"
        />
      </Modal>
    </div>
  );
}
