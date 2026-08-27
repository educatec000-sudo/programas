import { z } from 'zod';
import { uuid, emptyToNull, periodEnum } from './common.validation.js';

export const createProgramSchema = z.object({
  code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(3).max(200),
  description: emptyToNull(z.string().max(2000)),
  objective: emptyToNull(z.string().max(2000)),
  organ: emptyToNull(z.string().max(120)),
  year: z.coerce.number().int().min(2000).max(2100),
  periodLabel: emptyToNull(z.string().max(60)),
  status: z.enum(['PLANEJAMENTO', 'EM_EXECUCAO', 'CONCLUIDO', 'SUSPENSO', 'CANCELADO']).default('EM_EXECUCAO'),
  globalGoal: z.coerce.number().min(0).max(10000).nullable().optional(),
});

export const updateProgramSchema = createProgramSchema.partial();

export const addProgramSchoolsSchema = z.object({
  schoolIds: z.array(uuid).min(1, 'selecione ao menos uma escola'),
});

export const updateProgramSchoolSchema = z.object({
  active: z.boolean(),
});

export const addProgramIndicatorsSchema = z.object({
  items: z
    .array(
      z.object({
        indicatorId: uuid,
        weight: z.coerce.number().min(0).max(1000).nullable().optional(),
        goal: z.coerce.number().min(0).max(100000).nullable().optional(),
      }),
    )
    .min(1, 'selecione ao menos um indicador'),
});

export const updateProgramIndicatorSchema = z.object({
  weight: z.coerce.number().min(0).max(1000).nullable().optional(),
  goal: z.coerce.number().min(0).max(100000).nullable().optional(),
  active: z.boolean().optional(),
});
