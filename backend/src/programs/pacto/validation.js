import { z } from 'zod';
import { uuid } from '../../validations/common.validation.js';

export const programParamsSchema = z.object({ id: uuid });
export const programSchoolParamsSchema = z.object({ id: uuid, schoolId: uuid });
export const programClassParamsSchema = z.object({ id: uuid, classId: uuid });
export const programAssessmentParamsSchema = z.object({ id: uuid, assessmentId: uuid });
export const publicTokenParamsSchema = z.object({ token: z.string().min(32).max(256) });
export const publicClassParamsSchema = z.object({ token: z.string().min(32).max(256), classId: uuid });

export const generateLinkSchema = z.object({
  expiresAt: z.coerce.date().refine((value) => value > new Date(), 'A validade deve estar no futuro'),
});

const classFields = {
  grade: z.coerce.number().int().min(1).max(2),
  shift: z.enum(['M', 'T']),
  name: z.string().trim().min(1).max(30).transform((value) => value.toUpperCase()),
};

export const adminClassSchema = z.object({
  schoolId: uuid,
  ...classFields,
});

export const publicClassSchema = z.object(classFields);

export const updateClassSchema = z.object(classFields).partial().refine(
  (value) => Object.keys(value).length > 0,
  'Informe ao menos um campo para atualizar',
);

const skillResultSchema = z.object({
  skill: z.string().trim().min(1).max(80),
  level: z.string().trim().min(1).max(80),
  count: z.coerce.number().int().min(0).max(10000),
});

const componentSchema = z.object({
  component: z.enum(['INICIAL', 'PORTUGUES', 'MATEMATICA']),
  enrolled: z.coerce.number().int().min(0).max(10000),
  evaluated: z.coerce.number().int().min(0).max(10000),
  results: z.array(skillResultSchema).max(30),
});

export const assessmentPayloadSchema = z.object({
  classId: uuid,
  code: z.enum(['A0', 'A1', 'A2', 'A3']),
  components: z.array(componentSchema).min(1).max(2),
});
