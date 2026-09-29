import clsx from 'clsx';
import { calendarParts } from '../../lib/format.js';

/** A tear-off calendar block. Month band, day, weekday — the way a wall calendar reads. */
export function DateBlock({ value, className }) {
  const { month, day, weekday } = calendarParts(value);

  return (
    <div
      className={clsx(
        'w-14 shrink-0 overflow-hidden rounded-xs border border-line text-center',
        className
      )}
    >
      <div className="bg-brick py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white">
        {month}
      </div>
      <div className="bg-surface py-0.5">
        <div className="font-serif text-[20px] font-semibold leading-none" data-numeric>
          {day}
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          {weekday}
        </div>
      </div>
    </div>
  );
}
