import { z } from 'zod';
import { uuid, paginationQuery } from './common.validation.js';

const optionalNote = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(300).nullable().optional(),
);

const technicianToSchoolsSchema = z.object({
  technicianId: uuid,
  schoolIds: z
    .array(uuid)
    .min(1, 'selecione ao menos uma escola')
    .max(1000, 'máximo de 1.000 escolas por vínculo')
    .refine((ids) => new Set(ids).size === ids.length, 'não repita a mesma escola'),
  notes: optionalNote,
});

// Mantém o atalho existente no detalhe da escola (uma escola → técnicos).
const schoolToTechniciansSchema = z.object({
  schoolId: uuid,
  technicianIds: z
    .array(uuid)
    .min(1, 'selecione ao menos um técnico')
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'não repita o mesmo técnico'),
  notes: optionalNote,
});

export const createLinksSchema = z.union([technicianToSchoolsSchema, schoolToTechniciansSchema]);

export const updateLinkSchema = z.object({
  notes: optionalNote,
});

/** Query da visão Geral/Escola (lista de escolas com seus técnicos). */
export const geralQuerySchema = paginationQuery.extend({
  situation: z.enum(['ATIVA', 'PARALISADA', 'INATIVA']).optional(),
  zone: z.enum(['URBANA', 'RURAL', 'SEDE', 'ESTRADAS', 'ILHAS']).optional(),
  unassigned: z.enum(['true', 'false']).optional(), // true = somente escolas SEM técnico
});

/** Query da visão Técnico (lista de técnicos com suas escolas). */
export const techniciansQuerySchema = paginationQuery.extend({
  unassigned: z.enum(['true', 'false']).optional(), // true = somente técnicos SEM escola
  eligible: z.enum(['true', 'false']).optional(), // true = somente usuários elegíveis (p/ seleção)
});

export const idParamsSchema = z.object({ id: uuid });
