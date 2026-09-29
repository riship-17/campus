import axios from 'axios';
import { CSRF_COOKIE, CSRF_HEADER, readCookie } from './cookies.js';
import { toApiError } from './apiError.js';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * The access token lives here — in a module closure, in memory, for the lifetime of the tab.
 * Not localStorage, not sessionStorage, not a readable cookie. A reload loses it, and that
 * is fine: `bootstrapSession()` trades the httpOnly refresh cookie for a new one on startup.
 */
let accessToken = null;
let onSessionLost = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

/** Called when refreshing fails, so the AuthProvider can drop to the signed-out state. */
export function setSessionLostHandler(handler) {
  onSessionLost = handler;
}

export const api = axios.create({
  baseURL,
  // Sends the httpOnly refresh cookie on the /auth routes it is scoped to.
  withCredentials: true,
  timeout: 20_000,
  headers: { Accept: 'application/json' },
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/** Endpoints that must not be retried after a refresh — they *are* the session machinery. */
const AUTH_ENDPOINTS = ['/auth/refresh', '/auth/login', '/auth/logout'];

/**
 * A single in-flight refresh, shared by every request that 401s at the same moment.
 * Without this, a dashboard that fires six queries on mount would rotate the refresh token
 * six times in parallel — and the server's reuse detection would correctly read that as a
 * replay attack and revoke the whole family.
 */
let refreshPromise = null;

function refreshSession() {
  refreshPromise ??= (async () => {
    const csrfToken = readCookie(CSRF_COOKIE);
    const { data } = await axios.post(
      `${baseURL}/auth/refresh`,
      {},
      {
        withCredentials: true,
        headers: csrfToken ? { [CSRF_HEADER]: csrfToken } : {},
      }
    );
    setAccessToken(data.data.accessToken);
    return data.data;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const status = response?.status;
    const url = config?.url ?? '';

    const isAuthPlumbing = AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint));

    if (status === 401 && config && !config.__retried && !isAuthPlumbing) {
      config.__retried = true;
      try {
        await refreshSession();
        return api(config);
      } catch (refreshError) {
        setAccessToken(null);
        onSessionLost?.(toApiError(refreshError));
        return Promise.reject(toApiError(error));
      }
    }

    return Promise.reject(toApiError(error));
  }
);

/**
 * Restores a session on a cold load. Resolves to the session payload, or null when there is
 * no usable refresh cookie — which is the ordinary state for a first-time visitor, not an error.
 */
export async function bootstrapSession() {
  try {
    return await refreshSession();
  } catch {
    setAccessToken(null);
    return null;
  }
}

/** POST /auth/logout needs the CSRF header too, since it is cookie-authenticated. */
export async function postLogout() {
  const csrfToken = readCookie(CSRF_COOKIE);
  await api.post('/auth/logout', {}, { headers: csrfToken ? { [CSRF_HEADER]: csrfToken } : {} });
}
