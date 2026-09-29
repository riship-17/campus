import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthCard, AuthLink } from '../../features/auth/AuthCard.jsx';
import { api } from '../../lib/apiClient.js';
import { toApiError } from '../../lib/apiError.js';
import { Notice } from '../../components/ui/Notice.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState(token ? 'checking' : 'missing');
  const [message, setMessage] = useState(null);
  // React 18 StrictMode mounts effects twice in development; the token is single-use, so a
  // second POST would report "already used" on a link that worked perfectly.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    (async () => {
      try {
        const { data } = await api.post('/auth/verify-email', { token });
        setMessage(data.data.message);
        setState('done');
      } catch (error) {
        setMessage(toApiError(error).message);
        setState('failed');
      }
    })();
  }, [token]);

  return (
    <AuthCard kicker="Email confirmation" title="Confirming your address">
      {state === 'checking' && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}

      {state === 'missing' && (
        <Notice tone="error" title="No token">
          This page needs the link from your email. Open the message we sent and click through from
          there.
        </Notice>
      )}

      {state === 'done' && (
        <>
          <Notice tone="success" title="Confirmed">
            {message}
          </Notice>
          <p className="mt-4 text-[14px] text-muted">
            <AuthLink to="/login">Sign in</AuthLink> to pick up where you left off.
          </p>
        </>
      )}

      {state === 'failed' && (
        <>
          <Notice tone="error" title="That link did not work">
            {message}
          </Notice>
          <p className="mt-4 text-[14px] leading-relaxed text-muted">
            Links expire after 30 minutes and work once. <AuthLink to="/login">Sign in</AuthLink> to
            send yourself a new one.
          </p>
        </>
      )}
    </AuthCard>
  );
}
