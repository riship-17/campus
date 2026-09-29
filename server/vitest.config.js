import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    globals: false,
    // Each file gets its own in-memory MongoDB, so they must not share a process.
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/campusconnect-test',
      JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-000000',
      TOKEN_PEPPER: 'test-token-pepper-that-is-long-enough-00000000',
      QR_SIGNING_SECRET: 'test-qr-signing-secret-that-is-long-enough-000',
      ALLOWED_EMAIL_DOMAINS: 'iitb.ac.in',
      CLIENT_URL: 'http://localhost:5173',
      CORS_ORIGINS: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
    },
  },
});
