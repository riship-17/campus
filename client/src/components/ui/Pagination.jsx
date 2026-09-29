import { Button } from './Button.jsx';

/** Prev/next with a plain statement of where you are. No infinite scroll on a register. */
export function Pagination({ meta, onChange }) {
  if (!meta || meta.totalPages <= 1) return null;

  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"
    >
      <p className="text-[13px] text-muted">
        Showing{' '}
        <span data-numeric className="text-ink">
          {from}–{to}
        </span>{' '}
        of{' '}
        <span data-numeric className="text-ink">
          {meta.total}
        </span>
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onChange(meta.page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!meta.hasMore}
          onClick={() => onChange(meta.page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
