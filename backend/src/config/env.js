import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function int(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: int(process.env.PORT, 4000),
  apiPrefix: process.env.API_PREFIX || '/api',
  databaseUrl: process.env.DATABASE_URL,

  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || '15m',
  jwtRefreshTtlDays: int(process.env.JWT_REFRESH_TTL_DAYS, 7),

  loginMaxAttempts: int(process.env.LOGIN_MAX_ATTEMPTS, 5),
  loginLockMinutes: int(process.env.LOGIN_LOCK_MINUTES, 15),

  passwordResetTtlHours: int(process.env.PASSWORD_RESET_TTL_HOURS, 24),
  exposeResetUrl: (process.env.EXPOSE_RESET_URL || 'false') === 'true',

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadMb: int(process.env.MAX_UPLOAD_MB, 10),
};

export const cookies = {
  access: 'cpe_at',
  refresh: 'cpe_rt',
};
