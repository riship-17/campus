import clsx from 'clsx';

/**
 * How full an event is, in one line.
 *
 * Colour alone never carries the message — the number beside the bar says the same thing,
 * so this works in greyscale and for anyone who cannot tell the red from the green.
 */
export function SeatBar({ registered, capacity, waitlisted = 0, className }) {
  const ratio = capacity > 0 ? Math.min(1, registered / capacity) : 0;
  const left = Math.max(0, capacity - registered);
  const full = left === 0;

  const tone = full ? 'bg-brick' : ratio > 0.85 ? 'bg-mustard' : 'bg-forest';

  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span data-numeric className="text-muted">
          {registered}/{capacity} taken
        </span>
        <span className={clsx('font-medium', full ? 'text-brick' : 'text-ink')}>
          {full ? (waitlisted > 0 ? `Full · ${waitlisted} waiting` : 'Full') : `${left} left`}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-xs bg-wash"
        role="img"
        aria-label={`${registered} of ${capacity} seats taken`}
      >
        <div className={clsx('h-full', tone)} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
