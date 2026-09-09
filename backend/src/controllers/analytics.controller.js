import {
  evolutionSeries,
  classificationDistribution,
  compareSchools,
  comparePrograms,
  goalsStatus,
  computeRanking,
} from '../services/scoring.service.js';
import { wrap } from '../lib/wrap.js';
import { z } from 'zod';
import { HttpError } from '../lib/errors.js';

const query = z.object({
  programId: z.string().uuid().optional(),
  indicatorId: z.string().uuid().optional(),
  schoolId: z.string().uuid().optional(),
  schoolIds: z.string().optional(), // csv de uuids
  year: z.coerce.number().int().min(2000).max(2100),
  period: z.string().optional(),
});

function requireProgram(params) {
  if (!params.programId) {
    throw new HttpError(
      422,
      'Selecione um programa. Análises avaliativas não combinam programas diferentes.',
      'PROGRAM_REQUIRED',
    );
  }
  return params;
}

export const overview = wrap(async (req, res) => {
  const params = requireProgram(query.parse(req.query));
  const ranking = await computeRanking(params);
  const [evolution, distribution, goals] = await Promise.all([
    evolutionSeries(params),
    classificationDistribution({ ...params, ranking }),
    goalsStatus({ ...params, ranking }),
  ]);
  res.json({ evolution, distribution, goals });
});

export const evolution = wrap(async (req, res) => {
  const params = requireProgram(query.parse(req.query));
  res.json(await evolutionSeries(params));
});

export const distribution = wrap(async (req, res) => {
  const params = requireProgram(query.parse(req.query));
  res.json(await classificationDistribution(params));
});

export const compareSchoolsEndpoint = wrap(async (req, res) => {
  const parsed = requireProgram(query.partial({ year: true }).parse(req.query));
  const schoolIds = (parsed.schoolIds || parsed.schoolId || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const year = parsed.year || new Date().getFullYear();
  res.json(await compareSchools({ schoolIds, programId: parsed.programId, year }));
});

export const compareProgramsEndpoint = wrap(async (req, res) => {
  const parsed = query.partial({ year: true }).parse(req.query);
  const year = parsed.year || new Date().getFullYear();
  res.json(await comparePrograms({ year, period: parsed.period }));
});

export const goals = wrap(async (req, res) => {
  const params = requireProgram(query.parse(req.query));
  res.json(await goalsStatus(params));
});

export const topSchools = wrap(async (req, res) => {
  const params = requireProgram(
    query.extend({ limit: z.coerce.number().int().min(1).max(50).optional() }).parse(req.query),
  );
  res.json(await computeRanking(params));
});
