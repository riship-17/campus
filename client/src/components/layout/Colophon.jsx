/** Footer. Contact details people actually need, set like the back page of a bulletin. */
export function Colophon() {
  return (
    <footer className="mt-12 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 sm:grid-cols-3">
        <div>
          <p className="kicker text-muted">CampusConnect</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            The single register of recognised clubs, sanctioned events, attendance and certificates.
          </p>
        </div>
        <div>
          <p className="kicker text-muted">Student Affairs Desk</p>
          <ul className="mt-1.5 space-y-0.5 text-[13px] text-muted">
            <li>Main Administrative Building, 2nd floor</li>
            <li>Mon–Fri, 9:30 AM – 5:30 PM</li>
            <li data-numeric>Intercom 7002 / 7004</li>
          </ul>
        </div>
        <div>
          <p className="kicker text-muted">Something wrong?</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Report an incorrect listing to your club convener, or write to the SAC office.
          </p>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-5 py-3 text-[12px] text-muted">
          © {new Date().getFullYear()} CampusConnect · Indian Institute of Technology Bombay
        </p>
      </div>
    </footer>
  );
}
