import { Button } from './Button.jsx';

/**
 * Plain words and a way forward — no illustration. An empty list should tell you what is
 * missing and what to do next, not apologise at you.
 */
export function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-md border border-line bg-surface px-5 py-8 text-center">
      <h3 className="text-[18px]">{title}</h3>
      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-[14px] text-muted">{description}</p>
      )}
      {action && (
        <Button className="mt-4" variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
