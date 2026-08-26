import rateLimit from 'express-rate-limit';

/** Limite p/ rotas sensíveis de autenticação (por IP). */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMIT', message: 'Muitas requisições. Aguarde um momento.' },
  },
});

import { env } from '../config/env.js';

/**
 * Proteção CSRF leve: em requisições que alteram estado, exige que o header
 * Origin (quando presente) corresponda ao host da requisição ou ao frontend.
 * Em desenvolvimento o proxy do Vite reescreve o Host, então a checagem é
 * relaxada (limitada pelo CORS + rate limit); em produção ela é estrita.
 */
export function originCheck(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next(); // clientes API sem browser
  if (env.isDev) return next();

  const allowed = new Set(
    [
      env.corsOrigin,
      req.headers.host ? `https://${req.headers.host}` : null,
      req.headers.host ? `http://${req.headers.host}` : null,
    ].filter(Boolean),
  );
  try {
    const { host } = new URL(origin);
    const reqHost = (req.headers.host || '').split(':')[0];
    if (host === reqHost || allowed.has(origin)) return next();
  } catch {
    /* origin inválido */
  }
  return res.status(403).json({
    error: { code: 'BAD_ORIGIN', message: 'Origem não permitida' },
  });
}

