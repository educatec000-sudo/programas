import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { HttpError, unauthorized } from '../lib/errors.js';
import {
  comparePassword,
  generateRefreshToken,
  hashPassword,
  hashResetToken,
  hashToken,
  generateResetToken,
  signAccessToken,
  minutesLeft,
} from '../lib/auth.js';
import { audit, AuditAction } from '../lib/audit.js';

function lockError(minutes) {
  return new HttpError(
    429,
    `Conta bloqueada por excesso de tentativas. Tente novamente em ${minutes} minuto(s).`,
    'ACCOUNT_LOCKED',
  );
}

export async function login({ email, password, ip, userAgent }) {
  const attemptsKey = email.trim().toLowerCase();

  // 1) Usuário bloqueado?
  const existing = await prisma.user.findUnique({
    where: { email: attemptsKey },
    include: { role: { select: { active: true } } },
  });
  if (existing?.lockedUntil && existing.lockedUntil > new Date()) {
    await prisma.loginAttempt.create({
      data: { email: attemptsKey, ip, userAgent, success: false, userId: existing.id },
    });
    throw lockError(minutesLeft(existing.lockedUntil));
  }

  const user = existing;
  const passwordOk = user ? await comparePassword(password, user.passwordHash) : false;

  if (!user || !passwordOk) {
    let justLocked = false;
    let remaining = env.loginMaxAttempts;

    if (user) {
      const failedAttempts = user.failedAttempts + 1;
      remaining = Math.max(0, env.loginMaxAttempts - failedAttempts);
      const shouldLock = failedAttempts >= env.loginMaxAttempts;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: shouldLock ? 0 : failedAttempts,
          lockedUntil: shouldLock ? new Date(Date.now() + env.loginLockMinutes * 60_000) : null,
        },
      });
      if (shouldLock) {
        justLocked = true;
        await audit({
          userId: user.id,
          userName: user.name,
          action: AuditAction.LOGIN_BLOQUEIO,
          entity: 'User',
          entityId: user.id,
          ip,
          metadata: { email: attemptsKey },
        });
      }
    }

    await prisma.loginAttempt.create({
      data: { email: attemptsKey, ip, userAgent, success: false, userId: user?.id || null },
    });

    if (justLocked) throw lockError(env.loginLockMinutes);
    throw unauthorized(
      `Credenciais inválidas.${remaining > 0 ? ` Restam ${remaining} tentativa(s) antes do bloqueio.` : ''}`,
      'INVALID_CREDENTIALS',
    );
  }

  if (!user.active || !user.role.active) {
    await prisma.loginAttempt.create({
      data: { email: attemptsKey, ip, userAgent, success: false, userId: user.id },
    });
    throw new HttpError(403, 'Usuário ou perfil desativado. Contate o administrador.', 'USER_INACTIVE');
  }

  // 2) Credenciais válidas — cria sessão
  const { token: refreshToken, tokenHash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.jwtRefreshTtlDays * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: { userId: user.id, tokenHash, ip, userAgent, expiresAt },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await prisma.loginAttempt.create({
    data: { email: attemptsKey, ip, userAgent, success: true, userId: user.id },
  });

  const role = await prisma.role.findUniqueOrThrow({
    where: { id: user.roleId },
    include: { permissions: { include: { permission: true } } },
  });

  const accessToken = signAccessToken({ sub: user.id, sid: session.id, role: role.name });

  await audit({
    userId: user.id,
    userName: user.name,
    action: AuditAction.LOGIN,
    entity: 'Session',
    entityId: session.id,
    ip,
    metadata: { userAgent },
  });

  return {
    accessToken,
    refreshToken,
    user: toSafeUser(user, role),
  };
}

export function toSafeUser(user, role) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    role: {
      id: role.id,
      name: role.name,
      level: role.level,
      permissions: role.permissions.map((rp) => rp.permission.key),
    },
  };
}

/** Renovação com rotação do refresh token (mesma sessão, novo token). */
export async function refresh(refreshToken, { ip }) {
  if (!refreshToken) throw unauthorized('Sessão não encontrada', 'NO_TOKEN');
  const tokenHash = hashToken(refreshToken);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw unauthorized('Sessão encerrada ou expirada', 'SESSION_INVALID');
  }
  if (!session.user.active || !session.user.role.active) {
    throw unauthorized('Usuário ou perfil inativo', 'USER_INACTIVE');
  }

  const rotated = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.jwtRefreshTtlDays * 24 * 60 * 60 * 1000);

  const rotatedSession = await prisma.session.updateMany({
    where: {
      id: session.id,
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { tokenHash: rotated.tokenHash, lastUsedAt: new Date(), expiresAt, ...(ip && { ip }) },
  });
  if (rotatedSession.count !== 1) {
    throw unauthorized('Este token de renovação já foi utilizado', 'SESSION_ROTATED');
  }

  const accessToken = signAccessToken({
    sub: session.user.id,
    sid: session.id,
    role: session.user.role.name,
  });

  return { accessToken, refreshToken: rotated.token };
}

export async function logout(sessionId, user, ip) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
  await audit({
    userId: user.id,
    userName: user.name,
    action: AuditAction.LOGOUT,
    entity: 'Session',
    entityId: sessionId,
    ip,
  });
}

export async function listSessions(userId) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      ip: true,
      userAgent: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: { lastUsedAt: 'desc' },
  });
  return sessions;
}

export async function revokeSession(userId, sessionId, actor, ip) {
  const session = await prisma.session.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw new HttpError(404, 'Sessão não encontrada', 'NOT_FOUND');
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.LOGOUT_SESSAO,
    entity: 'Session',
    entityId: sessionId,
    ip,
  });
}

export async function me(userId) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  return toSafeUser(user, user.role);
}

export async function forgotPassword(email, ip) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  const response = {
    message:
      'Se o e-mail estiver cadastrado, um link de redefinição foi enviado. Verifique sua caixa de entrada.',
  };

  await audit({
    action: AuditAction.PASSWORD_RESET_REQUEST,
    entity: 'User',
    entityId: user?.id || null,
    ip,
    metadata: { email },
  });
  if (!user || !user.active) return response;

  const { token, tokenHash } = generateResetToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + env.passwordResetTtlHours * 3600_000),
      ip,
    },
  });
  await prisma.notification.create({
    data: {
      userId: user.id,
      type: 'ALERTA',
      title: 'Redefinição de senha solicitada',
      message: `Um link de redefinição de senha foi gerado às ${new Date().toLocaleString('pt-BR')} e expira em ${env.passwordResetTtlHours}h.`,
    },
  });

  // Em produção o link seria enviado por e-mail. Em dev, é devolvido na resposta.
  if (env.exposeResetUrl) response.resetUrl = `/redefinir-senha?token=${token}`;
  return response;
}

export async function resetPassword(token, newPassword, ip) {
  const tokenHash = hashResetToken(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  const invalid = new HttpError(400, 'Token inválido ou expirado. Solicite uma nova redefinição.', 'INVALID_TOKEN');
  if (!record || record.usedAt || record.expiresAt < new Date()) throw invalid;

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    // A reivindicação condicional torna o token de uso único mesmo com duas
    // requisições concorrentes tentando consumi-lo ao mesmo tempo.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalid;

    await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
    await tx.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await audit({
    userId: record.userId,
    userName: record.user.name,
    action: AuditAction.PASSWORD_RESET,
    entity: 'User',
    entityId: record.userId,
    ip,
  });
}

export async function changePassword(userId, currentPassword, newPassword, ip, currentSessionId) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const ok = await comparePassword(currentPassword, user.passwordHash);
  if (!ok) throw new HttpError(400, 'Senha atual incorreta', 'INVALID_PASSWORD');

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
    }),
    // Revoga todas as sessões, exceto a atual
    prisma.session.updateMany({
      where: { userId, revokedAt: null, id: { not: currentSessionId } },
      data: { revokedAt: new Date() },
    }),
  ]);

  await audit({
    userId,
    userName: user.name,
    action: AuditAction.PASSWORD_CHANGE,
    entity: 'User',
    entityId: userId,
    ip,
  });
}
