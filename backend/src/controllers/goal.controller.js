import * as goalService from '../services/goal.service.js';
import { wrap } from '../lib/wrap.js';
import { getClientIp } from '../lib/auth.js';
import { parseIdParams } from '../middlewares/validate.js';

export const list = wrap(async (req, res) => {
  res.json(await goalService.listGoals(req.query));
});

export const lookup = wrap(async (req, res) => {
  res.json(await goalService.lookupGoal(req.data.query));
});

export const create = wrap(async (req, res) => {
  res.status(201).json(await goalService.createGoal(req.data.body, req.user, getClientIp(req)));
});

export const update = wrap(async (req, res) => {
  res.json(await goalService.updateGoal(parseIdParams(req), req.data.body, req.user, getClientIp(req)));
});

export const remove = wrap(async (req, res) => {
  await goalService.deleteGoal(parseIdParams(req), req.user, getClientIp(req));
  res.json({ message: 'Meta excluída' });
});
