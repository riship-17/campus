import { z } from 'zod';

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

/** Shared page/limit query fields. Spread into an endpoint's own `.strict()` object. */
export const paginationFields = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

export function toSkip({ page, limit }) {
  return (page - 1) * limit;
}

export function pageMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasMore: page * limit < total,
  };
}

/**
 * Escapes a user string for safe use inside a RegExp.
 *
 * Prefer the text index for real search; this exists for prefix filters where `$text`
 * is the wrong tool. Without it, a query of `(((((` is a ReDoS and `.*` is a full scan.
 */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
