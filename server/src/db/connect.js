import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { detectTransactionSupport } from '../utils/db.js';

/**
 * Last line of defence against NoSQL operator injection. Any nested object with a `$`-prefixed
 * key that reaches a filter is degraded to a literal `$eq` comparison, so `{ email: { $ne: null } }`
 * matches nothing instead of matching everyone.
 *
 * Because that also neutralises operators *we* legitimately write, server-built operator
 * objects must be wrapped in `trusted()` from `utils/db.js`. Forgetting to is a harmless
 * no-match rather than a hole — the failure mode points the safe way.
 */
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);

export async function connectDatabase(uri = env.MONGODB_URI) {
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: env.NODE_ENV !== 'production',
  });

  await detectTransactionSupport();

  logger.info('MongoDB connected');
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.connection.close();
}
