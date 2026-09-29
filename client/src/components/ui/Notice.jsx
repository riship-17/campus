import clsx from 'clsx';

const TONES = {
  info: 'border-line-strong bg-wash text-ink',
  success: 'border-forest bg-forest/5 text-forest',
  error: 'border-brick bg-brick/5 text-brick',
};

/**
 * An inline message pinned to the top of a form or page — the paper-notice equivalent of a
 * toast. Errors are assertive so they interrupt; everything else waits its turn.
 */
export function Notice({ tone = 'info', title, children, className }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={clsx(
        'rounded-xs border-l-2 border-y border-r px-3 py-2.5',
        TONES[tone],
        className
      )}
    >
      {title && <p className="kicker mb-0.5">{title}</p>}
      <div className="text-[14px] leading-relaxed">{children}</div>
    </div>
  );
}
