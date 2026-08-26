import { HttpError } from '../lib/errors.js';

/**
 * Validação com Zod.
 * Uso: validate({ body: schema, query: schema, params: schema })
 * Os dados validados ficam em req.data.body / req.data.query / req.data.params
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    req.data = {};
    for (const [part, schema] of Object.entries(schemas)) {
      if (!schema) continue;
      req.data[part] = schema.parse(req[part]);
    }
    next();
  } catch (err) {
    next(err);
  }
};

export const parseIdParams = (req) => {
  const id = req.params?.id;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    throw new HttpError(400, 'Identificador inválido', 'INVALID_ID');
  }
  return id;
};
