import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import hpp from 'hpp';
import pinoHttp from 'pino-http';
import { env, isProd } from './config/env.js';
import { logger } from './config/logger.js';
import { mongoSanitize } from './middleware/sanitize.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes.js';

export function createApp() {
  const app = express();

  // Behind Render/Railway/Vercel there is exactly one proxy hop; trusting more than that
  // would let a client spoof X-Forwarded-For and dodge per-IP rate limits.
  app.set('trust proxy', env.TRUST_PROXY === 'true' ? 1 : env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.set('etag', false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: isProd ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and server-to-server calls arrive with no Origin header.
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
      exposedHeaders: ['RateLimit', 'RateLimit-Policy'],
      maxAge: 600,
    })
  );

  app.use(
    pinoHttp({
      logger,
      customLogLevel(_req, res, err) {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customProps: (req) => ({ userId: req.auth?.id }),
    })
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(hpp());
  app.use(mongoSanitize);
  app.use(globalLimiter);

  app.use(env.API_PREFIX, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
