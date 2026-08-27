import { z } from 'zod';

const optionalStr = (max) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max).nullable().optional(),
  );

/** Coordenada decimal: aceita número ou string ("−1,45" / "-1.45"), valida faixa. */
const coord = (min, max) =>
  z.preprocess(
    (v) => {
      if (v === '' || v === null || v === undefined) return null;
      if (typeof v === 'string') return Number(v.replace(/\s/g, '').replace(',', '.'));
      return v;
    },
    z
      .number({ invalid_type_error: `Coordenada deve ser um número entre ${min} e ${max}` })
      .min(min, `Mínimo ${min}`)
      .max(max, `Máximo ${max}`)
      .nullable()
      .optional(),
  );

export const schoolBody = {
  // INEP é o identificador principal, mas opcional — sem ele, a importação
  // usa o nome normalizado e o cadastro manual continua válido
  inep: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z
      .string()
      .trim()
      .regex(/^\d{6,10}$/, 'INEP deve conter de 6 a 10 dígitos')
      .nullable()
      .optional(),
  ),
  name: z.string().trim().min(3, 'nome muito curto').max(200),
  schoolType: optionalStr(120),
  address: optionalStr(200),
  addressNumber: optionalStr(20),
  addressComplement: optionalStr(120),
  district: optionalStr(120),
  cep: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : String(v).replace(/\D/g, '')),
    z.string().regex(/^\d{8}$/, 'CEP deve ter 8 dígitos').nullable().optional(),
  ),
  zone: z.enum(['URBANA', 'RURAL', 'SEDE', 'ESTRADAS', 'ILHAS']).nullable().optional(),
  adminDependency: z.enum(['FEDERAL', 'ESTADUAL', 'MUNICIPAL', 'PRIVADA']).nullable().optional(),
  situation: z.enum(['ATIVA', 'PARALISADA', 'INATIVA']).optional().default('ATIVA'),
  phone: optionalStr(30),
  email: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      z.string().email('e-mail inválido').nullable().optional(),
    ),
  responsible: optionalStr(120),
  notes: optionalStr(500),
  latitude: coord(-90, 90),
  longitude: coord(-180, 180),
};

export const createSchoolSchema = z.object(schoolBody);
export const updateSchoolSchema = z.object(schoolBody).partial();

/** Exclusão em lote (soft delete). */
export const batchDeleteSchema = z.object({
  ids: z
    .array(z.string().uuid('id de escola inválido'))
    .min(1, 'selecione ao menos uma escola')
    .max(500, 'máximo de 500 escolas por lote'),
});
