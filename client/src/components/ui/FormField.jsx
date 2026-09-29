import { forwardRef, useId } from 'react';
import clsx from 'clsx';

const controlClasses = (error) =>
  clsx(
    'w-full rounded-xs border bg-surface px-3 py-2 text-[15px] text-ink transition-ui',
    'placeholder:text-muted/70 focus:outline-none',
    error ? 'border-brick' : 'border-line-strong hover:border-ink/40'
  );

/**
 * Label, control, hint and error in one block.
 *
 * Forwards the ref so react-hook-form's `register()` can be spread straight onto it —
 * without that, the ref is swallowed by the function component and the field never registers.
 */
export const FormField = forwardRef(function FormField(
  { label, hint, error, numeric = false, as = 'input', className, children, ...props },
  ref
) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const shared = {
    id,
    ref,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': describedBy,
    'data-numeric': numeric || undefined,
    className: controlClasses(error),
    ...props,
  };

  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="kicker text-muted">
        {label}
      </label>

      {as === 'select' ? (
        <select {...shared}>{children}</select>
      ) : as === 'textarea' ? (
        <textarea {...shared} />
      ) : (
        <input {...shared} />
      )}

      {hint && !error && (
        <p id={hintId} className="text-[13px] text-muted">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-[13px] font-medium text-brick">
          {error}
        </p>
      )}
    </div>
  );
});
