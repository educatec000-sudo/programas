/**
 * Erro HTTP da aplicação.
 * code: identificador estável p/ o frontend (TOKEN_EXPIRED, FORBIDDEN, ...)
 */
export class HttpError extends Error {
  constructor(status, message, code = 'ERROR', details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Não autenticado', code = 'UNAUTHORIZED') =>
  new HttpError(401, msg, code);
export const forbidden = (msg = 'Acesso negado') => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Registro não encontrado') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg) => new HttpError(409, msg, 'CONFLICT');

export function notFoundHandler(req, _res, next) {
  next(new HttpError(404, `Rota não encontrada: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  // Zod
  if (err?.name === 'ZodError') {
    const details = err.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos', details },
    });
  }

  // Multer
  if (err?.name === 'MulterError') {
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Arquivo muito grande (máx. ${req.app.get('maxUploadMb') || 10} MB)`
        : `Erro no upload: ${err.message}`;
    return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: msg } });
  }

  // Prisma
  if (err?.code === 'P2002') {
    const rawTarget = err.meta?.target;
    const target = Array.isArray(rawTarget) ? rawTarget.join(', ') : rawTarget || 'campo único';
    return res
      .status(409)
      .json({ error: { code: 'DUPLICATE', message: `Registro duplicado (${target})` } });
  }
  if (err?.code === 'P2025') {
    return res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Registro não encontrado' } });
  }
  if (err?.code === 'P2003') {
    return res.status(409).json({
      error: { code: 'FK_CONSTRAINT', message: 'Existem registros vinculados a este item' },
    });
  }

  if (err instanceof HttpError) {
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
  }

  // Erro inesperado
  console.error('[CPE][ERROR]', err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'Erro interno do servidor',
      ...(req.app.get('env') === 'development' && { details: String(err?.message) }),
    },
  });
}
