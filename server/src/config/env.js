import 'dotenv/config';
import { z } from 'zod';

const csv = (value) =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  // Auth
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  TOKEN_PEPPER: z.string().min(32, 'TOKEN_PEPPER must be at least 32 characters'),
  QR_SIGNING_SECRET: z.string().min(32, 'QR_SIGNING_SECRET must be at least 32 characters'),

  // Institution rules
  ALLOWED_EMAIL_DOMAINS: z
    .string()
    .default('iitb.ac.in')
    .transform((value) => csv(value).map((d) => d.toLowerCase())),

  // HTTP
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) => csv(value)),
  COOKIE_DOMAIN: z.string().optional(),
  TRUST_PROXY: z.string().default('loopback'),

  // Infrastructure (optional in Phase 1; rate limiting falls back to in-memory)
  REDIS_URL: z.string().optional(),

  // Mail
  MAIL_FROM: z.string().default('CampusConnect <no-reply@campusconnect.local>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // Links inside emails
  CLIENT_URL: z.string().url().default('http://localhost:5173'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Fail fast and loudly: a half-configured auth service is worse than no service.
  console.error(`Invalid environment configuration:\n${details}`);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDev = env.NODE_ENV === 'development';
