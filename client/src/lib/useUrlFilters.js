import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Binds a filter object to the query string.
 *
 * The URL is the single source of truth: back and forward work, a filtered view is
 * shareable, and a reload lands on the same list. Values equal to their default are dropped
 * so the address bar stays readable.
 *
 * @param {Record<string, string|number|boolean>} defaults
 */
export function useUrlFilters(defaults) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => {
    const result = { ...defaults };
    for (const [key, fallback] of Object.entries(defaults)) {
      const raw = searchParams.get(key);
      if (raw === null) continue;

      if (typeof fallback === 'boolean') result[key] = raw === 'true';
      else if (typeof fallback === 'number') result[key] = Number(raw) || fallback;
      else result[key] = raw;
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults is a literal, stable by construction
  }, [searchParams]);

  const setFilters = useCallback(
    (next) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(next)) {
        const fallback = defaults[key];
        if (value === undefined || value === null || value === '' || value === false) continue;
        if (value === fallback) continue;
        params.set(key, String(value));
      }
      setSearchParams(params, { replace: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSearchParams]
  );

  const reset = useCallback(
    () => setSearchParams(new URLSearchParams(), { replace: true }),
    [setSearchParams]
  );

  return { filters, setFilters, reset };
}
