import { z } from 'zod';
import { uuid, paginationQuery } from './common.validation.js';

const optionalNote = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(300).nullable().optional(),
);

export const createLinksSchema = z.object({
  schoolId: uuid,
  technicianIds: z.array(uuid).min(1, 'selecione ao menos um técnico').max(50),
  notes: optionalNote,
});

export const updateLinkSchema = z.object({
  notes: optionalNote,
});

/** Query da visão Geral/Escola (lista de escolas com seus técnicos). */
export const geralQuerySchema = paginationQuery.extend({
  municipality: z.string().trim().max(120).optional(),
  situation: z.enum(['ATIVA', 'PARALISADA', 'INATIVA']).optional(),
  zone: z.enum(['URBANA', 'RURAL']).optional(),
  unassigned: z.enum(['true', 'false']).optional(), // true = somente escolas SEM técnico
});

/** Query da visão Técnico (lista de técnicos com suas escolas). */
export const techniciansQuerySchema = paginationQuery.extend({
  unassigned: z.enum(['true', 'false']).optional(), // true = somente técnicos SEM escola
  eligible: z.enum(['true', 'false']).optional(), // true = somente usuários elegíveis (p/ seleção)
});

export const idParamsSchema = z.object({ id: uuid });
