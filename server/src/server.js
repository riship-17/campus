import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './db/connect.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

async function main() {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`CampusConnect API listening on http://localhost:${env.PORT}${env.API_PREFIX}`);
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Do not let an in-flight request hold the process open forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection');
  process.exit(1);
});

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
