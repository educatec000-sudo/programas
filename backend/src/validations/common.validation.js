import { z } from 'zod';
import { PERIODS } from '../lib/constants.js';

export const uuid = z.string().uuid('identificador inválido');
export const uuidOptional = uuid.nullable().optional();

export const idParams = z.object({ id: uuid });

/** Aceita string vazia e converte em null (formulários enviam "" p/ campos opcionais). */
export const emptyToNull = (schema) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullable().optional());

export const numberish = (schema) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v), schema);

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(1000).optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.string().trim().max(50).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
});

export const periodEnum = z
  .string()
  .trim()
  .min(2)
  .max(30)
  .refine((p) => PERIODS.includes(p) || /^[0-9]{1,2}\/[0-9]{4}$/.test(p), {
    message: `Período inválido. Use: ${PERIODS.join(', ')}`,
  });
