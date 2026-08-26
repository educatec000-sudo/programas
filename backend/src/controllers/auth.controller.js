import { cookies, env } from '../config/env.js';
import {
  setAuthCookies,
  clearAuthCookies,
  getClientIp,
} from '../lib/auth.js';
import * as authService from '../services/auth.service.js';
import { wrap } from '../lib/wrap.js';

export const login = wrap(async (req, res) => {
  const { email, password } = req.data.body;
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || null;

  const result = await authService.login({ email, password, ip, userAgent });
  setAuthCookies(res, result);
  res.json({ user: result.user });
});

export const logout = wrap(async (req, res) => {
  await authService.logout(req.user.sessionId, req.user, getClientIp(req));
  clearAuthCookies(res);
  res.json({ message: 'Sessão encerrada' });
});

export const refresh = wrap(async (req, res) => {
  const token = req.cookies?.[cookies.refresh];
  const result = await authService.refresh(token, { ip: getClientIp(req) });
  setAuthCookies(res, result);
  res.json({ message: 'Sessão renovada' });
});

export const me = wrap(async (req, res) => {
  const user = await authService.me(req.user.id);
  res.json(user);
});

export const forgotPassword = wrap(async (req, res) => {
  const { email } = req.data.body;
  const result = await authService.forgotPassword(email, getClientIp(req));
  res.json(result);
});

export const resetPassword = wrap(async (req, res) => {
  const { token, password } = req.data.body;
  await authService.resetPassword(token, password, getClientIp(req));
  clearAuthCookies(res);
  res.json({ message: 'Senha redefinida com sucesso. Faça login novamente.' });
});

export const changePassword = wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.data.body;
  await authService.changePassword(
    req.user.id,
    currentPassword,
    newPassword,
    getClientIp(req),
    req.user.sessionId,
  );
  res.json({ message: 'Senha alterada com sucesso' });
});

export const listSessions = wrap(async (req, res) => {
  const sessions = await authService.listSessions(req.user.id);
  res.json(sessions.map((s) => ({ ...s, current: s.id === req.user.sessionId })));
});

export const revokeSession = wrap(async (req, res) => {
  await authService.revokeSession(req.user.id, req.params.id, req.user, getClientIp(req));
  res.json({ message: 'Sessão encerrada' });
});
