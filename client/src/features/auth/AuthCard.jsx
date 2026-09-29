import { Link } from 'react-router-dom';

/** The shared frame for every auth page: a single sheet of paper on the notice board. */
export function AuthCard({ kicker, title, intro, children, footer }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-md border border-line bg-surface">
        <div className="border-b border-line px-6 py-5">
          <p className="kicker text-brick">{kicker}</p>
          <h1 className="mt-1 text-[26px]">{title}</h1>
          {intro && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{intro}</p>}
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
      {footer && <p className="mt-4 text-center text-[13px] text-muted">{footer}</p>}
    </div>
  );
}

export function AuthLink({ to, children }) {
  return (
    <Link to={to} className="rounded-xs font-medium text-brick underline underline-offset-2">
      {children}
    </Link>
  );
}
