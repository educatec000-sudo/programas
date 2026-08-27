import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env, cookies } from '../config/env.js';

// ------------------------------ Senhas ------------------------------

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// ------------------------------ Tokens ------------------------------

/** Access token: JWT curto (padrão 15 min). */
export function signAccessToken(payload) {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.jwtAccessTtl });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

/** Refresh token: opaco (aleatório). Só o hash SHA-256 é persistido. */
export function generateRefreshToken() {
  const token = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(token);
  return { token, tokenHash };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashResetToken(token) };
}

export const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

/** Converte TTL simples aceito pelo jsonwebtoken (30s, 15m, 2h, 7d) em ms. */
export function durationToMs(value, fallback = 15 * 60 * 1000) {
  if (typeof value === 'number' && Number.isFinite(value)) return value * 1000;
  const match = String(value || '').trim().match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const factors = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * factors[match[2].toLowerCase()];
}

// ------------------------------ Cookies ------------------------------

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd,
    // Vercel e Render possuem origens diferentes. SameSite=None + Secure é
    // necessário para o navegador enviar os cookies nas chamadas cross-site.
    sameSite: env.isProd ? 'none' : 'lax',
    path: '/',
    // Sem "domain": o cookie permanece host-only no domínio do backend Render.
  };
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  const base = authCookieOptions();
  res.cookie(cookies.access, accessToken, { ...base, maxAge: durationToMs(env.jwtAccessTtl) });
  res.cookie(cookies.refresh, refreshToken, {
    ...base,
    maxAge: env.jwtRefreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res) {
  const opts = authCookieOptions();
  res.clearCookie(cookies.access, opts);
  res.clearCookie(cookies.refresh, opts);
}

// ------------------------------ Utilidades ------------------------------

export function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}

export function minutesLeft(date) {
  return Math.max(1, Math.ceil((new Date(date).getTime() - Date.now()) / 60000));
}
