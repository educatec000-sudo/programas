import { z } from 'zod';
import { uuid, emptyToNull } from './common.validation.js';

export const createIndicatorSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(3).max(200),
  description: emptyToNull(z.string().max(2000)),
  categoryId: uuid.nullable().optional(),
  unit: emptyToNull(z.string().max(30)),
  polarity: z.enum(['MAIOR_MELHOR', 'MENOR_MELHOR']).default('MAIOR_MELHOR'),
  weight: z.coerce.number().min(0).max(1000).default(1),
  defaultGoal: z.coerce.number().min(0).max(100000).nullable().optional(),
  minValue: z.coerce.number().nullable().optional(),
  maxValue: z.coerce.number().nullable().optional(),
  periodLabel: emptyToNull(z.string().max(60)),
  status: z.enum(['ATIVO', 'INATIVO']).default('ATIVO'),
});

export const updateIndicatorSchema = createIndicatorSchema.partial();

export const createCategorySchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: emptyToNull(z.string().max(300)),
});
