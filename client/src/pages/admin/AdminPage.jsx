import { EmptyState } from '../../components/ui/EmptyState.jsx';

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="border-b border-line pb-4">
        <p className="kicker text-brick">Dean of Student Affairs</p>
        <h1 className="mt-1 text-[30px]">Administration</h1>
        <p className="mt-1.5 text-[14px] text-muted">
          Campus-wide register of people, clubs, sanctioned events and the audit trail.
        </p>
      </header>

      <EmptyState
        title="Analytics and approvals are not wired up yet"
        description="User management, club approvals, announcements and the audit log land in a later build. Every action taken so far is already being recorded."
      />
    </div>
  );
}
