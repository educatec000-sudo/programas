import * as userService from '../services/user.service.js';
import { wrap } from '../lib/wrap.js';
import { getClientIp } from '../lib/auth.js';
import { parseIdParams } from '../middlewares/validate.js';

export const list = wrap(async (req, res) => {
  res.json(await userService.listUsers(req.data.query));
});

export const get = wrap(async (req, res) => {
  res.json(await userService.getUser(parseIdParams(req)));
});

export const create = wrap(async (req, res) => {
  const user = await userService.createUser(req.data.body, req.user, getClientIp(req));
  res.status(201).json(user);
});

export const update = wrap(async (req, res) => {
  res.json(await userService.updateUser(parseIdParams(req), req.data.body, req.user, getClientIp(req)));
});

export const remove = wrap(async (req, res) => {
  await userService.deleteUser(parseIdParams(req), req.user, getClientIp(req));
  res.json({ message: 'Usuário desativado' });
});

export const resetPassword = wrap(async (req, res) => {
  await userService.adminResetPassword(
    parseIdParams(req),
    req.data.body.newPassword,
    req.data.body.mustChangePassword,
    req.user,
    getClientIp(req),
  );
  res.json({ message: 'Senha redefinida' });
});

export const unlock = wrap(async (req, res) => {
  await userService.unlockUser(parseIdParams(req), req.user, getClientIp(req));
  res.json({ message: 'Usuário desbloqueado' });
});
