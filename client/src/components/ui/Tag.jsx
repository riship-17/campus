import clsx from 'clsx';

const TONES = {
  neutral: 'border-line-strong text-muted',
  brick: 'border-brick text-brick',
  forest: 'border-forest text-forest',
  mustard: 'border-mustard text-[#7a5a11]',
};

/** Small uppercase label. Category, status, seat state — never decorative. */
export function Tag({ tone = 'neutral', className, children }) {
  return (
    <span
      className={clsx(
        'kicker inline-flex items-center rounded-xs border px-1.5 py-0.5',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
