import { prisma } from '../lib/prisma.js';
import { notFound, conflict } from '../lib/errors.js';
import { audit, AuditAction } from '../lib/audit.js';

// `permissions` em Role é a tabela de junção RolePermission — para ler a chave
// é preciso navegar até a permissão: permission.key
const rolePermissionsInclude = {
  permissions: { select: { permission: { select: { key: true } } } },
};

function serializeRole(role, usersCount) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    level: role.level,
    canBeTechnician: role.canBeTechnician,
    ...(usersCount !== undefined && { usersCount }),
    permissions: role.permissions.map((rp) => rp.permission.key),
  };
}

export async function listRoles() {
  const roles = await prisma.role.findMany({
    where: { active: true },
    include: {
      ...rolePermissionsInclude,
      _count: { select: { users: true } },
    },
    orderBy: { level: 'desc' },
  });
  return roles.map((r) => serializeRole(r, r._count.users));
}

export async function listPermissions() {
  const permissions = await prisma.permission.findMany({ orderBy: { key: 'asc' } });
  // agrupa por recurso: schools:write -> schools
  const groups = {};
  for (const p of permissions) {
    const resource = p.key.split(':')[0];
    (groups[resource] = groups[resource] || []).push(p);
  }
  return groups;
}

export async function createRole(data, actor, ip) {
  const exists = await prisma.role.findUnique({ where: { name: data.name } });
  if (exists) throw conflict('Já existe um perfil com este nome');

  const permissionKeys = data.permissionKeys || [];
  const permissions = permissionKeys.length
    ? await prisma.permission.findMany({ where: { key: { in: permissionKeys } } })
    : [];

  const role = await prisma.role.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      level: data.level ?? 10,
      canBeTechnician: data.canBeTechnician ?? false,
      permissions: {
        create: permissions.map((p) => ({ permissionId: p.id })),
      },
    },
    include: rolePermissionsInclude,
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'Role',
    entityId: role.id,
    metadata: {
      name: role.name,
      level: role.level,
      canBeTechnician: role.canBeTechnician,
      permissions: permissionKeys,
    },
    ip,
  });
  return serializeRole(role);
}

export async function updateRole(id, data, actor, ip) {
  const role = await prisma.role.findUnique({ where: { id }, include: { permissions: true } });
  if (!role) throw notFound('Perfil não encontrado');
  if (role.level >= 100 && data.level !== undefined && data.level < 100) {
    throw conflict('O perfil Administrador deve manter nível 100');
  }

  const permissionKeys = data.permissionKeys;
  const permissions =
    permissionKeys && permissionKeys.length
      ? await prisma.permission.findMany({ where: { key: { in: permissionKeys } } })
      : [];

  const updated = await prisma.$transaction(async (tx) => {
    await tx.role.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.level !== undefined && { level: data.level }),
        ...(data.canBeTechnician !== undefined && { canBeTechnician: data.canBeTechnician }),
      },
    });
    if (permissionKeys !== undefined) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: id, permissionId: p.id })),
        });
      }
    }
    return tx.role.findUnique({
      where: { id },
      include: rolePermissionsInclude,
    });
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'Role',
    entityId: id,
    metadata: {
      name: data.name,
      level: data.level,
      canBeTechnician: data.canBeTechnician,
      permissions: permissionKeys,
    },
    ip,
  });
  return serializeRole(updated);
}
