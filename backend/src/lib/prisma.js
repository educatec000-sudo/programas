import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

const globalForPrisma = globalThis;

function getDatasourceUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    // Limita o pool de conexões do Prisma a 5 clientes para evitar estourar
    // pools de sessão externos (como PgBouncer / Supabase / Neon / AWS RDS limitados a 15)
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '5');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '20');
    }
    return url.toString();
  } catch {
    return raw;
  }
}

const datasourceUrl = getDatasourceUrl();

export const prisma =
  globalForPrisma.__cpePrisma ||
  new PrismaClient({
    datasources: datasourceUrl ? { db: { url: datasourceUrl } } : undefined,
    log: env.isDev ? ['warn', 'error'] : ['error'],
  });

if (env.isDev) globalForPrisma.__cpePrisma = prisma;
