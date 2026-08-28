import { computeRanking } from '../services/scoring.service.js';
import * as evaluationService from '../services/evaluation.service.js';
import { wrap } from '../lib/wrap.js';
import { getClientIp } from '../lib/auth.js';
import { z } from 'zod';
import { PERIODS } from '../lib/constants.js';

const rankingQuerySchema = z.object({
  programId: z.string().uuid({ message: 'Selecione um programa' }),
  indicatorId: z.string().uuid().optional(),
  schoolId: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100),
  period: z
    .string()
    .optional()
    .transform((v) => (v === 'todos' || v === '' ? undefined : v)),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const ranking = wrap(async (req, res) => {
  const params = rankingQuerySchema.parse(req.query);
  res.json(await computeRanking(params));
});

const consolidateSchema = z.object({
  programId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  period: z.string().refine((p) => PERIODS.includes(p), 'Período inválido'),
});

export const consolidate = wrap(async (req, res) => {
  const params = consolidateSchema.parse(req.body);
  res.status(201).json(await evaluationService.consolidate(params, req.user, getClientIp(req)));
});

export const evaluations = wrap(async (req, res) => {
  res.json(await evaluationService.listEvaluations(req.query));
});
