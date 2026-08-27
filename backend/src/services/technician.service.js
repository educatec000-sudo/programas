import { prisma } from '../lib/prisma.js';
import { notFound, HttpError } from '../lib/errors.js';
import { audit, AuditAction } from '../lib/audit.js';
import { parsePagination, buildPagination } from '../lib/pagination.js';

/**
 * Técnicos por Escola — relação N:N entre User (técnico) e School.
 * Regra de elegibilidade: usuário ativo cujo perfil está marcado como
 * canBeTechnician (configurável em Perfis).
 */

const technicianSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: { select: { id: true, name: true, level: true } },
};

const linkTechnicianInclude = {
  technician: { select: technicianSelect },
};

/** Indicadores do topo da página de Técnicos por Escola. */
export async function getStats() {
  const [totalSchools, schoolsWithTechnicianRaw, techniciansWithSchoolsRaw, totalTechnicians] =
    await Promise.all([
      prisma.school.count({ where: { deletedAt: null } }),
      prisma.schoolTechnician.findMany({
        where: {
          school: { deletedAt: null },
          technician: { active: true, role: { canBeTechnician: true } },
        },
        distinct: ['schoolId'],
        select: { schoolId: true },
      }),
      prisma.schoolTechnician.findMany({
        where: {
          school: { deletedAt: null },
          technician: { active: true, role: { canBeTechnician: true } },
        },
        distinct: ['technicianId'],
        select: { technicianId: true },
      }),
      prisma.user.count({ where: { active: true, role: { canBeTechnician: true } } }),
    ]);

  const schoolsWithTechnician = schoolsWithTechnicianRaw.length;
  const techniciansWithSchools = techniciansWithSchoolsRaw.length;

  return {
    totalSchools,
    totalTechnicians,
    schoolsWithTechnician,
    schoolsWithoutTechnician: Math.max(0, totalSchools - schoolsWithTechnician),
    techniciansWithSchools,
    techniciansWithoutSchools: Math.max(0, totalTechnicians - techniciansWithSchools),
  };
}

/**
 * Visão Geral/Escola: escolas (paginadas, filtradas no banco) com todos os
 * técnicos responsáveis. Não duplica a escola — técnicos agregados na linha.
 */
export async function listGeral(query) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const { search, situation, zone, unassigned } = query;

  const where = {
    deletedAt: null,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { inep: { contains: search } },
        { address: { contains: search, mode: 'insensitive' } },
        {
          technicianLinks: {
            some: {
              technician: {
                active: true,
                role: { canBeTechnician: true },
                name: { contains: search, mode: 'insensitive' },
              },
            },
          },
        },
      ],
    }),
    ...(situation && { situation }),
    ...(zone && { zone }),
    ...(unassigned === 'true' && {
      technicianLinks: { none: { technician: { active: true, role: { canBeTechnician: true } } } },
    }),
  };

  const orderBy = { [SORTABLE[query.sort] || 'name']: query.dir === 'desc' ? 'desc' : 'asc' };

  const [total, schools] = await Promise.all([
    prisma.school.count({ where }),
    prisma.school.findMany({
      where,
      include: {
        technicianLinks: {
          where: { technician: { active: true, role: { canBeTechnician: true } } },
          include: linkTechnicianInclude,
          orderBy: { technician: { name: 'asc' } },
        },
      },
      orderBy,
      skip,
      take,
    }),
  ]);

  return {
    data: schools.map((s) => ({
      id: s.id,
      inep: s.inep,
      name: s.name,
      address: s.address,
      zone: s.zone,
      situation: s.situation,
      technicians: s.technicianLinks.map((l) => ({
        linkId: l.id,
        userId: l.technician.id,
        name: l.technician.name,
        email: l.technician.email,
        role: l.technician.role.name,
        notes: l.notes,
      })),
      techniciansCount: s.technicianLinks.length,
    })),
    pagination: buildPagination(total, page, pageSize),
  };
}

const SORTABLE = { name: 'name', inep: 'inep', createdAt: 'createdAt' };

/**
 * Visão Técnico: técnicos (elegíveis ou já vinculados) com suas escolas.
 * `unassigned=true` retorna somente técnicos sem nenhuma escola.
 * `eligible=true` retorna usuários elegíveis para seleção no formulário.
 */
export async function listTechnicians(query) {
  const { search, unassigned, eligible } = query;

  if (eligible === 'true') {
    const users = await prisma.user.findMany({
      where: {
        active: true,
        role: { canBeTechnician: true },
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      select: {
        ...technicianSelect,
        _count: { select: { technicianSchools: { where: { school: { deletedAt: null } } } } },
      },
      orderBy: { name: 'asc' },
      take: 200,
    });
    return {
      data: users.map((u) => ({ ...u, schoolsCount: u._count.technicianSchools, _count: undefined })),
    };
  }

  const { page, pageSize, skip, take } = parsePagination(query);

  // base: técnicos elegíveis (perfil marcado) ou que já possuem vínculos
  const base =
    unassigned === 'true'
      ? {
          role: { canBeTechnician: true },
          technicianSchools: { none: { school: { deletedAt: null } } },
        }
      : {
          OR: [
            { role: { canBeTechnician: true } },
            { technicianSchools: { some: { school: { deletedAt: null } } } },
          ],
        };

  // busca por nome do técnico, e-mail ou nome de escola atendida
  const searchWhere = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          ...(unassigned === 'true'
            ? []
            : [{
                technicianSchools: {
                  some: {
                    school: { deletedAt: null, name: { contains: search, mode: 'insensitive' } },
                  },
                },
              }]),
        ],
      }
    : null;

  const where = {
    active: true,
    AND: [base, ...(searchWhere ? [searchWhere] : [])],
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        ...technicianSelect,
        technicianSchools: {
          where: { school: { deletedAt: null } },
          include: {
            school: { select: { id: true, inep: true, name: true, situation: true } },
          },
          orderBy: { school: { name: 'asc' } },
        },
      },
      orderBy: query.dir === 'desc' ? { name: 'desc' } : { name: 'asc' },
      skip,
      take,
    }),
  ]);

  return {
    data: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      schools: u.technicianSchools.map((l) => ({
        linkId: l.id,
        ...l.school,
        notes: l.notes,
      })),
      schoolsCount: u.technicianSchools.length,
    })),
    pagination: buildPagination(total, page, pageSize),
  };
}

/** Escola → todos os técnicos responsáveis. */
export async function getBySchool(schoolId) {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    include: {
      technicianLinks: {
        where: { technician: { active: true, role: { canBeTechnician: true } } },
        include: linkTechnicianInclude,
        orderBy: { technician: { name: 'asc' } },
      },
    },
  });
  if (!school) throw notFound('Escola não encontrada');

  return {
    id: school.id,
    inep: school.inep,
    name: school.name,
    address: school.address,
    district: school.district,
    zone: school.zone,
    situation: school.situation,
    latitude: school.latitude,
    longitude: school.longitude,
    technicians: school.technicianLinks.map((l) => ({
      linkId: l.id,
      userId: l.technician.id,
      name: l.technician.name,
      email: l.technician.email,
      phone: l.technician.phone,
      role: l.technician.role.name,
      notes: l.notes,
      linkedAt: l.createdAt,
    })),
  };
}

/** Técnico → todas as escolas atendidas. */
export async function getByTechnician(technicianId) {
  const user = await prisma.user.findFirst({
    where: { id: technicianId, active: true, role: { canBeTechnician: true } },
    select: {
      ...technicianSelect,
      active: true,
      technicianSchools: {
        where: { school: { deletedAt: null } },
        include: {
          school: {
            select: {
              id: true, inep: true, name: true,
              zone: true, situation: true, latitude: true, longitude: true,
            },
          },
        },
        orderBy: { school: { name: 'asc' } },
      },
    },
  });
  if (!user) throw notFound('Técnico não encontrado');

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    schools: user.technicianSchools.map((l) => ({
      linkId: l.id,
      ...l.school,
      notes: l.notes,
      linkedAt: l.createdAt,
    })),
    total: user.technicianSchools.length,
  };
}

/**
 * Vincula um técnico a uma ou várias escolas de uma só vez.
 * Impede duplicidade (constraint UNIQUE + skipDuplicates) e valida a
 * elegibilidade do técnico e a existência de todas as escolas selecionadas.
 */
async function createTechnicianSchoolLinks({ technicianId, schoolIds, notes }, actor, ip) {
  const technician = await prisma.user.findUnique({
    where: { id: technicianId },
    include: { role: { select: { name: true, canBeTechnician: true } } },
  });
  if (!technician) throw notFound('Técnico não encontrado');
  if (!technician.active || !technician.role.canBeTechnician) {
    throw new HttpError(
      422,
      `Usuário não elegível como técnico: ${technician.name} (perfil ${technician.role.name}). Habilite "pode ser técnico" no perfil.`,
      'VALIDATION_ERROR',
    );
  }

  const uniqueSchoolIds = [...new Set(schoolIds)];
  const schools = await prisma.school.findMany({
    where: { id: { in: uniqueSchoolIds }, deletedAt: null },
    select: { id: true, inep: true, name: true },
    orderBy: { name: 'asc' },
  });
  if (schools.length !== uniqueSchoolIds.length) {
    throw new HttpError(422, 'Uma ou mais escolas selecionadas não existem ou foram excluídas', 'VALIDATION_ERROR');
  }

  const result = await prisma.schoolTechnician.createMany({
    data: uniqueSchoolIds.map((schoolId) => ({ schoolId, technicianId, notes: notes ?? null })),
    skipDuplicates: true,
  });
  const duplicates = uniqueSchoolIds.length - result.count;

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'SchoolTechnician',
    entityId: technicianId,
    metadata: {
      technician: { id: technician.id, name: technician.name },
      schools: schools.slice(0, 200),
      requested: uniqueSchoolIds.length,
      created: result.count,
      duplicatesSkipped: duplicates,
    },
    ip,
  });

  return {
    created: result.count,
    duplicates,
    technician: { id: technician.id, name: technician.name },
    schools: schools.length,
  };
}

async function createSchoolTechnicianLinks({ schoolId, technicianIds, notes }, actor, ip) {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: { id: true, inep: true, name: true },
  });
  if (!school) throw notFound('Escola não encontrada');

  const users = await prisma.user.findMany({
    where: { id: { in: technicianIds } },
    include: { role: { select: { name: true, canBeTechnician: true } } },
  });
  const invalid = users.filter((user) => !user.active || !user.role.canBeTechnician);
  if (users.length !== technicianIds.length || invalid.length) {
    throw new HttpError(422, 'Um ou mais usuários não existem ou não são elegíveis como técnico', 'VALIDATION_ERROR');
  }

  const result = await prisma.schoolTechnician.createMany({
    data: technicianIds.map((technicianId) => ({ schoolId, technicianId, notes: notes ?? null })),
    skipDuplicates: true,
  });
  const duplicates = technicianIds.length - result.count;

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'SchoolTechnician',
    entityId: schoolId,
    metadata: {
      school,
      technicians: users.map((user) => ({ id: user.id, name: user.name })),
      requested: technicianIds.length,
      created: result.count,
      duplicatesSkipped: duplicates,
    },
    ip,
  });

  return { created: result.count, duplicates, school };
}

export async function createLinks(payload, actor, ip) {
  if ('technicianId' in payload) {
    return createTechnicianSchoolLinks(payload, actor, ip);
  }
  return createSchoolTechnicianLinks(payload, actor, ip);
}

/** Atualiza observações do vínculo. */
export async function updateLink(id, { notes }, actor, ip) {
  const link = await prisma.schoolTechnician.findUnique({
    where: { id },
    include: {
      school: { select: { id: true, name: true, inep: true } },
      technician: { select: { id: true, name: true } },
    },
  });
  if (!link) throw notFound('Vínculo não encontrado');

  const updated = await prisma.schoolTechnician.update({
    where: { id },
    data: { notes: notes ?? null },
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'SchoolTechnician',
    entityId: id,
    metadata: {
      school: link.school.name,
      technician: link.technician.name,
      before: link.notes,
      after: notes ?? null,
    },
    ip,
  });
  return updated;
}

/** Remove um vínculo (auditoria registra escola e técnico). */
export async function deleteLink(id, actor, ip) {
  const link = await prisma.schoolTechnician.findUnique({
    where: { id },
    include: {
      school: { select: { id: true, name: true, inep: true } },
      technician: { select: { id: true, name: true } },
    },
  });
  if (!link) throw notFound('Vínculo não encontrado');

  await prisma.schoolTechnician.delete({ where: { id } });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.DELETE,
    entity: 'SchoolTechnician',
    entityId: id,
    metadata: {
      school: { id: link.school.id, inep: link.school.inep, name: link.school.name },
      technician: { id: link.technician.id, name: link.technician.name },
    },
    ip,
  });
}

/** Dataset para exportação (visão geral com filtros aplicados). */
export async function geralForExport(query) {
  const { data } = await listGeral({ ...query, page: 1, pageSize: 10000 });
  return data.map((s) => ({
    inep: s.inep,
    name: s.name,
    zone: s.zone || '',
    situation: s.situation,
    technicians: s.technicians.map((t) => t.name).join(', '),
    count: s.techniciansCount,
  }));
}
