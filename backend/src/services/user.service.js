import { prisma } from '../lib/prisma.js';
import { HttpError, notFound, conflict } from '../lib/errors.js';
import { hashPassword } from '../lib/auth.js';
import { audit, AuditAction } from '../lib/audit.js';
import { parsePagination, buildPagination } from '../lib/pagination.js';

const ADMIN_LEVEL = 100;

function assertCanManageRole(actor, role) {
  if (!role?.active) throw new HttpError(422, 'Perfil inválido ou inativo', 'VALIDATION_ERROR');
  if (actor.role.level < ADMIN_LEVEL && role.level >= actor.role.level) {
    throw new HttpError(403, 'Você não pode atribuir um perfil de nível igual ou superior ao seu', 'FORBIDDEN');
  }
}

function assertCanManageUser(actor, target) {
  if (actor.role.level < ADMIN_LEVEL && target.role?.level >= actor.role.level) {
    throw new HttpError(403, 'Você não pode gerenciar um usuário de nível igual ou superior ao seu', 'FORBIDDEN');
  }
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  active: true,
  mustChangePassword: true,
  failedAttempts: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true, level: true } },
};

export async function listUsers(query) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const { search, roleId, active } = query;

  const where = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(roleId && { roleId }),
    ...(active !== undefined && active !== '' && { active: active === 'true' }),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: { ...userSelect, _count: { select: { sessions: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);

  return {
    data: users.map((u) => ({ ...u, sessions: u._count.sessions, _count: undefined })),
    pagination: buildPagination(total, page, pageSize),
  };
}

export async function getUser(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...userSelect,
      role: {
        select: {
          id: true,
          name: true,
          level: true,
          canBeTechnician: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  });
  if (!user) throw notFound('Usuário não encontrado');
  return {
    ...user,
    role: {
      ...user.role,
      permissions: user.role.permissions.map((rp) => rp.permission.key),
    },
  };
}

export async function createUser(data, actor, ip) {
  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) throw conflict('Já existe um usuário com este e-mail');

  const role = await prisma.role.findUnique({ where: { id: data.roleId } });
  assertCanManageRole(actor, role);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash: await hashPassword(data.password),
      phone: data.phone ?? null,
      roleId: data.roleId,
      active: data.active ?? true,
      mustChangePassword: data.mustChangePassword ?? false,
    },
    select: userSelect,
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'User',
    entityId: user.id,
    metadata: { email: user.email, role: role.name },
    ip,
  });
  return user;
}

export async function updateUser(id, data, actor, ip) {
  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!target) throw notFound('Usuário não encontrado');
  assertCanManageUser(actor, target);
  if (target.id === actor.id && (data.active === false || (data.roleId && data.roleId !== target.roleId))) {
    throw new HttpError(400, 'Você não pode desativar a própria conta nem alterar o próprio perfil', 'SELF_UPDATE');
  }
  if (data.roleId) {
    const role = await prisma.role.findUnique({ where: { id: data.roleId } });
    assertCanManageRole(actor, role);
  }

  if (data.email && data.email !== target.email) {
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw conflict('Já existe um usuário com este e-mail');
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.roleId !== undefined && { roleId: data.roleId }),
      ...(data.active !== undefined && { active: data.active }),
      ...(data.mustChangePassword !== undefined && { mustChangePassword: data.mustChangePassword }),
    },
    select: userSelect,
  });

  // Desativar usuário encerra suas sessões
  if (data.active === false) {
    await prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'User',
    entityId: id,
    metadata: data,
    ip,
  });
  return user;
}

/** Exclusão lógica: desativa e encerra sessões (mantém histórico/auditoria). */
export async function deleteUser(id, actor, ip) {
  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!target) throw notFound('Usuário não encontrado');
  if (target.id === actor.id) throw new HttpError(400, 'Você não pode excluir o próprio usuário', 'SELF_DELETE');
  assertCanManageUser(actor, target);

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { active: false } }),
    prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.DELETE,
    entity: 'User',
    entityId: id,
    metadata: { email: target.email },
    ip,
  });
}

export async function adminResetPassword(id, newPassword, mustChange, actor, ip) {
  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!target) throw notFound('Usuário não encontrado');
  assertCanManageUser(actor, target);

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: mustChange,
        failedAttempts: 0,
        lockedUntil: null,
        passwordChangedAt: new Date(),
      },
    }),
    prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  await prisma.notification.create({
    data: {
      userId: id,
      type: 'ALERTA',
      title: 'Senha redefinida pelo administrador',
      message: `Sua senha foi redefinida por ${actor.name}. Todas as sessões foram encerradas.`,
    },
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.PASSWORD_RESET,
    entity: 'User',
    entityId: id,
    ip,
  });
}

export async function unlockUser(id, actor, ip) {
  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!target) throw notFound('Usuário não encontrado');
  assertCanManageUser(actor, target);
  await prisma.user.update({ where: { id }, data: { failedAttempts: 0, lockedUntil: null } });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UNLOCK_USER,
    entity: 'User',
    entityId: id,
    ip,
  });
}
