import { z } from 'zod';
import { uuid, emptyToNull, periodEnum } from './common.validation.js';

const resultCore = {
  programId: uuid,
  schoolId: uuid,
  indicatorId: uuid,
  year: z.coerce.number().int().min(2000).max(2100),
  period: periodEnum,
  value: z.coerce.number().min(-1_000_000).max(1_000_000_000),
  notes: emptyToNull(z.string().max(500)),
};

export const createResultSchema = z.object(resultCore);

export const createResultsBatchSchema = z.object({
  items: z.array(z.object(resultCore)).min(1, 'envie ao menos um resultado').max(500),
});

export const updateResultSchema = z.object({
  value: z.coerce.number().min(-1_000_000).max(1_000_000_000),
  notes: emptyToNull(z.string().max(500)),
});

export const resultQuerySchema = z.object({
  programId: uuid.optional(),
  schoolId: uuid.optional(),
  indicatorId: uuid.optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  period: z.string().trim().max(30).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(1000).optional(),
  sort: z.string().trim().max(50).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
});

export const createGoalSchema = z
  .object({
    scope: z.enum(['GERAL', 'PROGRAMA', 'ESCOLA', 'INDICADOR']).default('GERAL'),
    programId: uuid.nullable().optional(),
    schoolId: uuid.nullable().optional(),
    indicatorId: uuid.nullable().optional(),
    year: z.coerce.number().int().min(2000).max(2100),
    period: periodEnum.nullable().optional(),
    value: z.coerce.number().min(0).max(1_000_000_000),
    description: emptyToNull(z.string().max(500)),
  })
  .superRefine((data, ctx) => {
    const requiredByScope = {
      PROGRAMA: ['programId', 'programa'],
      ESCOLA: ['schoolId', 'escola'],
      INDICADOR: ['indicatorId', 'indicador'],
    };
    if (data.scope === 'GERAL' && (data.programId || data.schoolId || data.indicatorId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scope'],
        message: 'Uma meta geral não pode estar vinculada a programa, escola ou indicador',
      });
    }
    const required = requiredByScope[data.scope];
    if (required && !data[required[0]]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [required[0]],
        message: `Informe o ${required[1]} para este escopo`,
      });
    }
  });

export const updateGoalSchema = z.object({
  value: z.coerce.number().min(0).max(1_000_000_000).optional(),
  period: periodEnum.nullable().optional(),
  description: emptyToNull(z.string().max(500)),
  active: z.boolean().optional(),
});
