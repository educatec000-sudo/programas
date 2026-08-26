import { env, cookies } from '../config/env.js';
import { verifyAccessToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { unauthorized, HttpError } from '../lib/errors.js';

/**
 * Autenticação via cookie httpOnly (ou Bearer p/ clientes API).
 * O access token é um JWT curto; cada requisição valida também a sessão
 * no banco — revogar uma sessão invalida imediatamente o access token.
 */
export async function authenticate(req, _res, next) {
  try {
    let token = req.cookies?.[cookies.access];
    const header = req.headers.authorization || '';
    if (!token && header.startsWith('Bearer ')) token = header.slice(7);
    if (!token) throw unauthorized('Não autenticado', 'NO_TOKEN');

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError')
        throw unauthorized('Sessão expirada', 'TOKEN_EXPIRED');
      throw unauthorized('Token inválido', 'TOKEN_INVALID');
    }

    const session = await prisma.session.findUnique({
      where: { id: payload.sid },
      select: { id: true, revokedAt: true, expiresAt: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw unauthorized('Sessão encerrada', 'SESSION_INVALID');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        role: {
          select: {
            id: true,
            name: true,
            level: true,
            permissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    });
    if (!user || !user.active) throw unauthorized('Usuário inválido ou inativo', 'USER_INACTIVE');

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: { id: user.role.id, name: user.role.name, level: user.role.level },
      permissions: new Set(user.role.permissions.map((rp) => rp.permission.key)),
      sessionId: session.id,
    };
    next();
  } catch (err) {
    next(err);
  }
}

const ADMIN_LEVEL = 100;

/**
 * RBAC por permissão granular (ex.: requirePermission('schools:write')).
 * Perfis com nível 100 (Administrador) têm passe livre.
 */
export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role.level >= ADMIN_LEVEL) return next();
    if (req.user.permissions.has(permission)) return next();
    return next(
      new HttpError(403, `Acesso negado — esta operação requer a permissão "${permission}"`, 'FORBIDDEN'),
    );
  };
}
