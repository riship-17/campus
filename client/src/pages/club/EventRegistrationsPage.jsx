import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { eventsApi } from '../../features/events/events.api.js';
import { eventKeys } from '../../features/events/events.queries.js';
import { Table } from '../../components/ui/Table.jsx';
import { Tag } from '../../components/ui/Tag.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Notice } from '../../components/ui/Notice.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useUrlFilters } from '../../lib/useUrlFilters.js';
import { formatDateTime } from '../../lib/format.js';
import { toApiError } from '../../lib/apiError.js';

const STATUS_TAG = {
  REGISTERED: { tone: 'forest', label: 'Registered' },
  WAITLISTED: { tone: 'mustard', label: 'Waitlisted' },
  ATTENDED: { tone: 'forest', label: 'Attended' },
  NO_SHOW: { tone: 'neutral', label: 'No show' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled' },
};

const DEFAULTS = { status: '', q: '', page: 1, limit: 50 };

export default function EventRegistrationsPage() {
  const { eventId } = useParams();
  const { filters, setFilters } = useUrlFilters(DEFAULTS);
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);

  const attendees = useQuery({
    queryKey: eventKeys.registrations(eventId, filters),
    queryFn: () => eventsApi.registrations(eventId, filters),
    placeholderData: (previous) => previous,
  });

  const meta = attendees.data?.meta;
  const counts = meta?.counts;

  const download = async () => {
    setDownloading(true);
    try {
      await eventsApi.downloadRegistrationsCsv(eventId, `${meta?.event?.title ?? 'event'}.csv`);
      toast.show('Exported. Open it in Sheets or Excel.', 'success');
    } catch (error) {
      toast.show(toApiError(error).message, 'error');
    } finally {
      setDownloading(false);
    }
  };

  const columns = [
    {
      key: 'student',
      header: 'Who',
      render: (row) => (
        <div>
          <p className="font-medium">{row.student.name}</p>
          <p className="text-[13px] text-muted">
            {[row.student.department, row.student.year && `Year ${row.student.year}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      ),
    },
    {
      key: 'roll',
      header: 'Roll',
      numeric: true,
      nowrap: true,
      render: (row) => row.student.rollNumber ?? '—',
    },
    {
      key: 'ticket',
      header: 'Ticket',
      numeric: true,
      nowrap: true,
      render: (row) => row.ticketId,
    },
    {
      key: 'status',
      header: 'Status',
      nowrap: true,
      render: (row) => {
        const tag = STATUS_TAG[row.status] ?? { tone: 'neutral', label: row.status };
        return <Tag tone={tag.tone}>{tag.label}</Tag>;
      },
    },
    {
      key: 'registered',
      header: 'Signed up',
      numeric: true,
      nowrap: true,
      align: 'right',
      render: (row) => <span className="text-[13px]">{formatDateTime(row.createdAt)}</span>,
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
          <h1 className="text-[28px]">{meta?.event?.title ?? 'Attendees'}</h1>
          {counts && (
            <p className="mt-1 text-[14px] text-muted" data-numeric>
              {counts.REGISTERED} registered · {counts.WAITLISTED} waiting · {counts.ATTENDED}{' '}
              attended · {counts.CANCELLED} cancelled
            </p>
          )}
        </div>
        <Button variant="secondary" loading={downloading} onClick={download}>
          Export CSV
        </Button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          label="Status"
          value={filters.status}
          onChange={(status) => setFilters({ ...filters, status, page: 1 })}
          options={[
            { value: '', label: 'Everyone' },
            { value: 'REGISTERED', label: 'Registered', count: counts?.REGISTERED },
            { value: 'WAITLISTED', label: 'Waitlist', count: counts?.WAITLISTED },
            { value: 'ATTENDED', label: 'Attended', count: counts?.ATTENDED },
            { value: 'CANCELLED', label: 'Cancelled', count: counts?.CANCELLED },
          ]}
        />

        <input
          type="search"
          value={filters.q}
          onChange={(changed) => setFilters({ ...filters, q: changed.target.value, page: 1 })}
          placeholder="Name or roll number"
          aria-label="Search attendees"
          className="w-56 rounded-xs border border-line-strong bg-surface px-3 py-1.5 text-[14px] transition-ui placeholder:text-muted/70 hover:border-ink/40 focus:outline-none"
        />
      </div>

      {attendees.isError && <Notice tone="error">{attendees.error.message}</Notice>}

      {attendees.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Table
          columns={columns}
          rows={attendees.data?.data ?? []}
          keyOf={(row) => row.id}
          empty={filters.q ? 'Nobody matches that search.' : 'Nobody has registered yet.'}
        />
      )}

      <Pagination meta={meta} onChange={(page) => setFilters({ ...filters, page })} />
    </div>
  );
}
