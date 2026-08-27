import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function int(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function list(value, fallback = []) {
  const entries = String(value || '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return entries.length ? entries : fallback;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const corsOrigins = list(process.env.CORS_ORIGIN, ['http://localhost:5173']);

export const env = {
  nodeEnv,
  isDev: nodeEnv === 'development',
  isProd: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: int(process.env.PORT, 4000, { min: 1, max: 65535 }),
  apiPrefix: process.env.API_PREFIX || '/api',
  databaseUrl: process.env.DATABASE_URL,

  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || '15m',
  jwtRefreshTtlDays: int(process.env.JWT_REFRESH_TTL_DAYS, 7, { min: 1, max: 365 }),

  loginMaxAttempts: int(process.env.LOGIN_MAX_ATTEMPTS, 5, { min: 1, max: 100 }),
  loginLockMinutes: int(process.env.LOGIN_LOCK_MINUTES, 15, { min: 1, max: 1440 }),

  passwordResetTtlHours: int(process.env.PASSWORD_RESET_TTL_HOURS, 24, { min: 1, max: 168 }),
  exposeResetUrl: bool(process.env.EXPOSE_RESET_URL, false),

  corsOrigin: corsOrigins[0],
  corsOrigins,

  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadMb: int(process.env.MAX_UPLOAD_MB, 10, { min: 1, max: 100 }),
};

/**
 * Falha cedo com uma mensagem clara, antes de a API começar a aceitar conexões.
 * Em desenvolvimento os segredos padrão continuam permitidos; em produção não.
 */
export function assertRuntimeEnv() {
  const errors = [];
  if (!['development', 'test', 'production'].includes(env.nodeEnv)) {
    errors.push('NODE_ENV deve ser development, test ou production');
  }
  if (!env.databaseUrl) errors.push('DATABASE_URL é obrigatória');
  if (!env.apiPrefix.startsWith('/')) errors.push('API_PREFIX deve começar com "/"');

  if (env.isProd) {
    if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32) {
      errors.push('JWT_ACCESS_SECRET deve ter pelo menos 32 caracteres em produção');
    }
    if (env.exposeResetUrl) {
      errors.push('EXPOSE_RESET_URL deve ser false em produção');
    }
  }

  if (errors.length) {
    throw new Error(`Configuração inválida:\n- ${errors.join('\n- ')}`);
  }
}

export const cookies = {
  access: 'cpe_at',
  refresh: 'cpe_rt',
};
