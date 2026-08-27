import { createApp } from './app.js';
import { assertRuntimeEnv, env } from './config/env.js';
import { prisma } from './lib/prisma.js';

assertRuntimeEnv();
const app = createApp();

const server = app.listen(env.port, '0.0.0.0', () => {
  console.log(`[CPE] API rodando em http://localhost:${env.port}${env.apiPrefix} (${env.nodeEnv})`);
});

async function shutdown(signal) {
  console.log(`[CPE] Encerrando (${signal})...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
