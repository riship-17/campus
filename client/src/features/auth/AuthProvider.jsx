import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from './auth.context.js';
import {
  api,
  bootstrapSession,
  postLogout,
  setAccessToken,
  setSessionLostHandler,
} from '../../lib/apiClient.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    if (mounted.current) {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  // When a refresh attempt fails anywhere in the app, fall back to signed-out in one place.
  useEffect(() => {
    setSessionLostHandler(clearSession);
    return () => setSessionLostHandler(null);
  }, [clearSession]);

  /**
   * On a cold load the access token is gone (it only ever lived in memory), so trade the
   * httpOnly refresh cookie for a new one before rendering any guarded route. A visitor with
   * no cookie simply lands as anonymous — that is not an error state.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const session = await bootstrapSession();
      if (cancelled || !mounted.current) return;

      if (session?.user) {
        setUser(session.user);
        setStatus('authenticated');
      } else {
        setStatus('anonymous');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (credentials) => {
    const { data } = await api.post('/auth/login', credentials);
    setAccessToken(data.data.accessToken);
    setUser(data.data.user);
    setStatus('authenticated');
    return data.data.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await postLogout();
    } catch {
      // A failed logout call still ends the session on this device; the refresh token
      // expires on its own. Never leave the user stuck on a "signing out…" screen.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const reloadUser = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUser(data.data.user);
    setStatus('authenticated');
    return data.data.user;
  }, []);

  const value = useMemo(
    () => ({ user, status, signIn, signOut, reloadUser }),
    [user, status, signIn, signOut, reloadUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
