import { AuditLog } from './auditLog.model.js';
import { logger } from '../../config/logger.js';

/**
 * Writes an audit entry. Deliberately fire-and-forget-safe: an audit failure must never
 * turn a successful login into a 500, but it must be loud in the logs.
 *
 * @param {object} entry
 * @param {string} entry.action
 * @param {string} entry.entityType
 * @param {import('mongoose').Types.ObjectId|string} [entry.entityId]
 * @param {import('mongoose').Types.ObjectId|string} [entry.actorId]
 * @param {object} [entry.metadata]
 * @param {import('express').Request} [req]
 */
export async function recordAudit(entry, req) {
  try {
    await AuditLog.create({
      ...entry,
      ip: req?.ip,
      userAgent: req?.get?.('user-agent')?.slice(0, 400),
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, 'Failed to write audit log');
  }
}
