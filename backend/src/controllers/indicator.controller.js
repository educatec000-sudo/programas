import * as indicatorService from '../services/indicator.service.js';
import { wrap } from '../lib/wrap.js';
import { getClientIp } from '../lib/auth.js';
import { parseIdParams } from '../middlewares/validate.js';

export const list = wrap(async (req, res) => {
  res.json(await indicatorService.listIndicators(req.query));
});

export const get = wrap(async (req, res) => {
  res.json(await indicatorService.getIndicator(parseIdParams(req)));
});

export const create = wrap(async (req, res) => {
  res.status(201).json(await indicatorService.createIndicator(req.data.body, req.user, getClientIp(req)));
});

export const update = wrap(async (req, res) => {
  res.json(await indicatorService.updateIndicator(parseIdParams(req), req.data.body, req.user, getClientIp(req)));
});

export const remove = wrap(async (req, res) => {
  await indicatorService.deleteIndicator(parseIdParams(req), req.user, getClientIp(req));
  res.json({ message: 'Indicador removido (exclusão lógica)' });
});

export const listCategories = wrap(async (_req, res) => {
  res.json(await indicatorService.listCategories());
});

export const createCategory = wrap(async (req, res) => {
  res.status(201).json(await indicatorService.createCategory(req.data.body, req.user, getClientIp(req)));
});

export const updateCategory = wrap(async (req, res) => {
  res.json(await indicatorService.updateCategory(parseIdParams(req), req.data.body, req.user, getClientIp(req)));
});

export const deleteCategory = wrap(async (req, res) => {
  await indicatorService.deleteCategory(parseIdParams(req), req.user, getClientIp(req));
  res.json({ message: 'Categoria excluída' });
});
