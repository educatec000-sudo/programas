import * as roleService from '../services/role.service.js';
import { wrap } from '../lib/wrap.js';
import { getClientIp } from '../lib/auth.js';
import { parseIdParams } from '../middlewares/validate.js';

export const list = wrap(async (_req, res) => {
  res.json(await roleService.listRoles());
});

export const permissions = wrap(async (_req, res) => {
  res.json(await roleService.listPermissions());
});

export const create = wrap(async (req, res) => {
  res.status(201).json(await roleService.createRole(req.data.body, req.user, getClientIp(req)));
});

export const update = wrap(async (req, res) => {
  res.json(await roleService.updateRole(parseIdParams(req), req.data.body, req.user, getClientIp(req)));
});
