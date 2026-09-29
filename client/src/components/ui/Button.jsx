import clsx from 'clsx';

const VARIANTS = {
  primary: 'bg-brick text-white border-brick hover:bg-brick-dark hover:border-brick-dark',
  secondary: 'bg-surface text-ink border-line-strong hover:bg-wash',
  ghost: 'bg-transparent text-muted border-transparent hover:text-ink hover:bg-wash',
  danger: 'bg-surface text-brick border-brick hover:bg-brick hover:text-white',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-[13px]',
  md: 'px-4 py-2.5 text-[14px]',
};

/**
 * One button. Borders rather than shadows, 2px radius, a 150ms colour transition and
 * nothing else — no scale, no lift, no glow.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  disabled,
  loading = false,
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xs border font-medium transition-ui',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
