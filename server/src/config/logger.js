import pino from 'pino';
import { env, isDev, isTest } from './env.js';

const redact = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-csrf-token"]',
    'res.headers["set-cookie"]',
    'req.body.password',
    'req.body.currentPassword',
    'req.body.newPassword',
    'req.body.token',
    'req.body.refreshToken',
    '*.passwordHash',
    '*.tokenHash',
  ],
  censor: '[redacted]',
};

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact,
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
});
