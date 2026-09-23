import { z } from 'zod';
import { paginationQuery } from './common.validation.js';

const year = z.coerce.number().int().min(2000).max(2100);
const uuid = z.string().uuid();
const stageCode = z.string().trim().min(2).max(30).transform((value) => value.toUpperCase());

export const yearsQuerySchema = paginationQuery.extend({
  baseYear: year.optional(),
  projectedYear: year.optional(),
  runId: uuid.optional(),
});

export const previewEnrollmentImportSchema = z.object({
  referenceYear: year,
  targetYear: year.optional(),
  notes: z.string().max(1000).optional(),
});

export const confirmEnrollmentImportSchema = z.object({
  jobId: uuid,
  notes: z.string().max(1000).optional(),
  publishAsOfficial: z.coerce.boolean().optional().default(true),
});

export const updateRuleSetSchema = z.object({
  ruleSetId: uuid.optional(),
  name: z.string().trim().min(3).max(160),
  notes: z.string().max(2000).optional(),
  baseYear: year,
  projectedYear: year,
  items: z.array(z.object({
    stageCode,
    nextStageCode: stageCode.nullish(),
    promotionRate: z.coerce.number().min(0).max(100),
    repetitionRate: z.coerce.number().min(0).max(100),
    dropoutRate: z.coerce.number().min(0).max(100),
    entryRate: z.coerce.number().min(0).max(300),
    capacityLimit: z.coerce.number().int().min(1).max(100).nullable().optional(),
    roundingMode: z.enum(['ARREDONDAR', 'BAIXO', 'CIMA']).optional().default('ARREDONDAR'),
    active: z.coerce.boolean().optional().default(true),
  })).min(1),
});

export const schoolSettingSchema = z.object({
  projectedYear: year,
  entryStageCode: stageCode.nullish(),
  capacityOverrides: z.record(z.string().trim().max(30), z.coerce.number().int().min(1).max(100)).optional().default({}),
  notes: z.string().max(1000).optional(),
});

export const projectionRunSchema = z.object({
  datasetId: uuid.optional(),
  ruleSetId: uuid.optional(),
  baseYear: year.optional(),
  projectedYear: year.optional(),
  mode: z.enum(['OFICIAL', 'SIMULACAO']).optional().default('OFICIAL'),
  notes: z.string().max(1000).optional(),
  adjustments: z.array(z.object({
    schoolId: uuid,
    stageCode,
    delta: z.coerce.number().int().min(-5000).max(5000).optional().default(0),
    plannedClasses: z.coerce.number().int().min(0).max(100).optional(),
  })).optional().default([]),
});

export const projectedSchoolsQuerySchema = yearsQuerySchema.extend({
  search: z.string().max(120).optional(),
  zone: z.enum(['URBANA', 'RURAL', 'SEDE', 'ESTRADAS', 'ILHAS']).optional(),
  stageCode: stageCode.optional(),
});

export const schoolIdParamsSchema = z.object({
  schoolId: uuid,
});
