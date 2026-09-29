import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button.jsx';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <p className="kicker text-brick">404</p>
      <h1 className="mt-2 text-[28px]">That page is not on the board</h1>
      <p className="mt-2 text-[14px] text-muted">
        The link may be old, or the listing may have been taken down.
      </p>
      <Link to="/" className="mt-5 inline-block">
        <Button variant="secondary">Back to the front page</Button>
      </Link>
    </div>
  );
}
