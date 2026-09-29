import mongoose from 'mongoose';
import { logger } from '../config/logger.js';

/**
 * Marks an operator object as one *we* wrote, not one that arrived in a request.
 *
 * `mongoose.set('sanitizeFilter', true)` neutralises every nested object whose keys start
 * with `$` by wrapping it in `$eq`. That is exactly what we want for user input — a body of
 * `{ email: { $ne: null } }` becomes a literal comparison and matches nothing — but it also
 * breaks our own legitimate `{ startAt: { $gte: now } }` filters.
 *
 * Mongoose's own `trusted()` marks only the object handed to it, which makes a composite
 * filter a minefield: `trusted({ $or: [{ years: { $size: 0 } }] })` looks marked but the
 * inner `$size` is still rewritten, and the query fails with a confusing cast error one
 * layer down. So this wrapper descends through plain objects and arrays and marks every
 * level. Dates, ObjectIds and RegExps are left alone.
 *
 * Only ever call it on literals built from server-side values. Anything derived from a
 * request should reach a filter as a primitive, having been through a strict Zod schema.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function trusted(value) {
  if (Array.isArray(value)) return value.map(trusted);

  // Plain objects only: a Date or an ObjectId is a value, not a nested operator clause.
  if (value !== null && typeof value === 'object' && value.constructor === Object) {
    for (const [key, nested] of Object.entries(value)) {
      value[key] = trusted(nested);
    }
    return mongoose.trusted(value);
  }

  return value;
}

/** Narrow, explicit ObjectId check — never pass a raw string straight into a query. */
export const isObjectId = (value) => mongoose.isValidObjectId(value);

export const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

let transactionsAvailable = null;

/**
 * Asks the server whether it can run transactions — true on a replica set or a sharded
 * cluster (so: any Atlas deployment), false on a lone `mongod`.
 *
 * Probing the topology once at startup beats discovering it by having a real registration
 * blow up mid-write, and it means a developer running a plain local mongod still gets a
 * working app rather than a confusing IllegalOperation.
 */
export async function detectTransactionSupport() {
  try {
    const info = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsAvailable = Boolean(info.setName || info.msg === 'isdbgrid');
  } catch (err) {
    logger.warn({ err }, 'Could not determine transaction support; assuming unavailable');
    transactionsAvailable = false;
  }

  if (!transactionsAvailable) {
    logger.warn(
      'MongoDB is a standalone server, so multi-document transactions are unavailable. ' +
        'Registration stays correct via guarded counters and compensating writes, but run a ' +
        'replica set (or Atlas) in production.'
    );
  }

  return transactionsAvailable;
}

export function hasTransactions() {
  return transactionsAvailable === true;
}

/**
 * Runs `fn` inside a transaction where the deployment supports one, and directly otherwise.
 *
 * Callers must be correct either way: every operation that mutates a counter is written as a
 * guarded `$inc` plus an explicit compensating write on failure, so the transaction is an
 * extra guarantee rather than the only thing standing between us and a double-booked seat.
 *
 * @template T
 * @param {(session: import('mongoose').ClientSession | null) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(fn) {
  if (!hasTransactions()) return fn(null);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** `{ session }` when there is one, `{}` otherwise — keeps call sites free of conditionals. */
export const inSession = (session) => (session ? { session } : {});
