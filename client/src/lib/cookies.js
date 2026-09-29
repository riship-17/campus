/** Reads a non-httpOnly cookie. Only used for the CSRF companion token. */
export function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export const CSRF_COOKIE = 'cc_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';
