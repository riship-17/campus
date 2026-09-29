import clsx from 'clsx';

/**
 * A row of filter tabs. Rendered as real buttons in a tablist so arrow keys and screen
 * readers behave, rather than styled divs.
 */
export function Tabs({ value, onChange, options, label = 'Filter', className }) {
  return (
    <div role="tablist" aria-label={label} className={clsx('flex flex-wrap gap-1', className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={clsx(
              'rounded-xs border px-3 py-1.5 text-[13px] transition-ui',
              selected
                ? 'border-ink bg-ink text-white'
                : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span data-numeric className="ml-1.5 opacity-70">
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
