import * as programService from '../services/program.service.js';
import { wrap } from '../lib/wrap.js';
import { getClientIp } from '../lib/auth.js';
import { parseIdParams } from '../middlewares/validate.js';

export const list = wrap(async (req, res) => {
  res.json(await programService.listPrograms(req.query));
});

export const get = wrap(async (req, res) => {
  res.json(await programService.getProgram(parseIdParams(req)));
});

export const create = wrap(async (req, res) => {
  res.status(201).json(await programService.createProgram(req.data.body, req.user, getClientIp(req)));
});

export const update = wrap(async (req, res) => {
  res.json(await programService.updateProgram(parseIdParams(req), req.data.body, req.user, getClientIp(req)));
});

export const remove = wrap(async (req, res) => {
  await programService.deleteProgram(parseIdParams(req), req.user, getClientIp(req));
  res.json({ message: 'Programa removido (exclusão lógica)' });
});

export const history = wrap(async (req, res) => {
  res.json(await programService.listProgramHistory(parseIdParams(req), req.data.query));
});

export const schoolEvaluation = wrap(async (req, res) => {
  res.json(
    await programService.getSchoolProgramEvaluation(
      parseIdParams(req),
      req.params.schoolId,
      req.data.query,
    ),
  );
});

export const createCriterion = wrap(async (req, res) => {
  res.status(201).json(
    await programService.createProgramCriterion(
      parseIdParams(req),
      req.data.body,
      req.user,
      getClientIp(req),
    ),
  );
});

export const addSchools = wrap(async (req, res) => {
  res.json(await programService.addSchools(parseIdParams(req), req.data.body.schoolIds, req.user, getClientIp(req)));
});

export const updateSchoolLink = wrap(async (req, res) => {
  await programService.updateSchoolLink(
    parseIdParams(req),
    req.params.schoolId,
    req.data.body.active,
    req.user,
    getClientIp(req),
  );
  res.json({ message: 'Vínculo atualizado' });
});

export const removeSchool = wrap(async (req, res) => {
  await programService.removeSchool(parseIdParams(req), req.params.schoolId, req.user, getClientIp(req));
  res.json({ message: 'Escola removida do programa' });
});

export const addIndicators = wrap(async (req, res) => {
  res.json(await programService.addIndicators(parseIdParams(req), req.data.body.items, req.user, getClientIp(req)));
});

export const updateProgramIndicator = wrap(async (req, res) => {
  await programService.updateProgramIndicator(
    parseIdParams(req),
    req.params.indicatorId,
    req.data.body,
    req.user,
    getClientIp(req),
  );
  res.json({ message: 'Indicador atualizado no programa' });
});

export const removeIndicator = wrap(async (req, res) => {
  await programService.removeIndicator(parseIdParams(req), req.params.indicatorId, req.user, getClientIp(req));
  res.json({ message: 'Indicador removido do programa' });
});
