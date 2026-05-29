// Init Sentry FIRST so its instrumentation can hook everything else.
import { initSentry } from './observability/sentry';
initSentry();

import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { disconnectPlatform } from './db/platformClient';
import { disconnectAllTenants } from './db/tenantClient';
import { patchAllTenantSchemas } from './db/tenantPatcher';

const app = createApp();

const server = app.listen(env.PORT, async () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
  // Bring existing tenant schemas up to the current template (idempotent).
  try {
    await patchAllTenantSchemas();
  } catch (err) {
    logger.error({ err }, 'tenant patch sweep failed');
  }
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close();
  await Promise.allSettled([disconnectPlatform(), disconnectAllTenants()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
