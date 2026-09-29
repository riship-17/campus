import clsx from 'clsx';

/** Placeholder block sized to the content it stands in for, so nothing jumps on load. */
export function Skeleton({ className }) {
  return <div aria-hidden="true" className={clsx('animate-pulse bg-wash rounded-xs', className)} />;
}
