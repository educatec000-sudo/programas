import { prisma } from '../lib/prisma.js';
import { notFound, conflict } from '../lib/errors.js';
import { audit, AuditAction } from '../lib/audit.js';
import { parsePagination, buildPagination } from '../lib/pagination.js';

export async function listPrograms(query) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const { search, year, status } = query;

  const where = {
    deletedAt: null,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { organ: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(year && { year: Number(year) }),
    ...(status && { status }),
  };

  const orderBy = query.sort === 'code' ? { code: 'asc' } : { createdAt: query.dir === 'asc' ? 'asc' : 'desc' };

  const [total, programs] = await Promise.all([
    prisma.program.count({ where }),
    prisma.program.findMany({
      where,
      include: {
        _count: {
          select: { schools: { where: { active: true } }, indicators: { where: { active: true } }, results: true },
        },
      },
      orderBy,
      skip,
      take,
    }),
  ]);

  return {
    data: programs.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      organ: p.organ,
      year: p.year,
      periodLabel: p.periodLabel,
      status: p.status,
      globalGoal: p.globalGoal,
      schoolsCount: p._count.schools,
      indicatorsCount: p._count.indicators,
      resultsCount: p._count.results,
      createdAt: p.createdAt,
    })),
    pagination: buildPagination(total, page, pageSize),
  };
}

export async function getProgram(id) {
  const program = await prisma.program.findFirst({
    where: { id, deletedAt: null },
    include: {
      schools: {
        where: { school: { deletedAt: null } },
        include: {
          school: {
            select: {
              id: true,
              inep: true,
              name: true,
              zone: true,
              situation: true,
            },
          },
        },
        orderBy: { school: { name: 'asc' } },
      },
      indicators: {
        include: {
          indicator: {
            include: { category: { select: { name: true } } },
          },
        },
        orderBy: { indicator: { code: 'asc' } },
      },
      _count: { select: { results: true, goals: true } },
    },
  });
  if (!program) throw notFound('Programa não encontrado');

  return {
    id: program.id,
    code: program.code,
    name: program.name,
    description: program.description,
    objective: program.objective,
    organ: program.organ,
    year: program.year,
    periodLabel: program.periodLabel,
    status: program.status,
    globalGoal: program.globalGoal,
    createdAt: program.createdAt,
    updatedAt: program.updatedAt,
    schools: program.schools.map((ps) => ({ ...ps.school, linkActive: ps.active, joinedAt: ps.joinedAt })),
    indicators: program.indicators.map((pi) => ({
      id: pi.indicator.id,
      code: pi.indicator.code,
      name: pi.indicator.name,
      unit: pi.indicator.unit,
      polarity: pi.indicator.polarity,
      categoryName: pi.indicator.category?.name || null,
      baseWeight: pi.indicator.weight,
      baseGoal: pi.indicator.defaultGoal,
      weight: pi.weight ?? pi.indicator.weight,
      goal: pi.goal ?? pi.indicator.defaultGoal,
      active: pi.active,
    })),
    resultsCount: program._count.results,
    goalsCount: program._count.goals,
  };
}

export async function createProgram(data, actor, ip) {
  const exists = await prisma.program.findUnique({ where: { code: data.code } });
  if (exists && !exists.deletedAt) throw conflict('Já existe um programa com este código');

  const program = exists
    ? await prisma.program.update({ where: { id: exists.id }, data: { ...data, deletedAt: null } })
    : await prisma.program.create({ data });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'Program',
    entityId: program.id,
    metadata: { code: program.code, name: program.name },
    ip,
  });
  return program;
}

export async function updateProgram(id, data, actor, ip) {
  const program = await prisma.program.findFirst({ where: { id, deletedAt: null } });
  if (!program) throw notFound('Programa não encontrado');
  if (data.code && data.code !== program.code) {
    const exists = await prisma.program.findUnique({ where: { code: data.code } });
    if (exists && exists.id !== id) throw conflict('Já existe um programa com este código');
  }
  const updated = await prisma.program.update({ where: { id }, data });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'Program',
    entityId: id,
    metadata: data,
    ip,
  });
  return updated;
}

export async function deleteProgram(id, actor, ip) {
  const program = await prisma.program.findFirst({ where: { id, deletedAt: null } });
  if (!program) throw notFound('Programa não encontrado');
  await prisma.program.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.DELETE,
    entity: 'Program',
    entityId: id,
    metadata: { code: program.code, name: program.name },
    ip,
  });
}

// ---------------------- Escolas participantes ----------------------

export async function addSchools(id, schoolIds, actor, ip) {
  const program = await prisma.program.findFirst({ where: { id, deletedAt: null } });
  if (!program) throw notFound('Programa não encontrado');

  const schools = await prisma.school.findMany({
    where: { id: { in: schoolIds }, deletedAt: null },
    select: { id: true },
  });
  if (schools.length !== new Set(schoolIds).size) {
    throw conflict('Uma ou mais escolas não existem ou foram excluídas');
  }

  const existing = await prisma.programSchool.findMany({
    where: { programId: id, schoolId: { in: schoolIds }, active: true },
    select: { schoolId: true },
  });
  const alreadyActive = new Set(existing.map((link) => link.schoolId));
  await prisma.$transaction(
    [...new Set(schoolIds)].map((schoolId) =>
      prisma.programSchool.upsert({
        where: { programId_schoolId: { programId: id, schoolId } },
        create: { programId: id, schoolId, active: true },
        update: { active: true },
      }),
    ),
  );
  const added = [...new Set(schoolIds)].filter((schoolId) => !alreadyActive.has(schoolId)).length;

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'Program',
    entityId: id,
    metadata: { requestedSchools: schoolIds.length, activated: added },
    ip,
  });
  return { added };
}

export async function updateSchoolLink(id, schoolId, active, actor, ip) {
  const link = await prisma.programSchool.findUnique({
    where: { programId_schoolId: { programId: id, schoolId } },
  });
  if (!link) throw notFound('Escola não participa deste programa');
  await prisma.programSchool.update({
    where: { programId_schoolId: { programId: id, schoolId } },
    data: { active },
  });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'Program',
    entityId: id,
    metadata: { schoolId, active },
    ip,
  });
}

export async function removeSchool(id, schoolId, actor, ip) {
  const link = await prisma.programSchool.findUnique({
    where: { programId_schoolId: { programId: id, schoolId } },
  });
  if (!link) throw notFound('Escola não participa deste programa');
  const linkedResults = await prisma.result.count({ where: { programId: id, schoolId } });
  if (linkedResults > 0) {
    throw conflict(
      'Este vínculo possui resultados. Desative a participação em vez de removê-la para preservar a integridade histórica.',
    );
  }
  await prisma.programSchool.delete({ where: { programId_schoolId: { programId: id, schoolId } } });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'Program',
    entityId: id,
    metadata: { removedSchool: schoolId },
    ip,
  });
}

// ---------------------- Indicadores do programa ----------------------

export async function addIndicators(id, items, actor, ip) {
  const program = await prisma.program.findFirst({ where: { id, deletedAt: null } });
  if (!program) throw notFound('Programa não encontrado');

  const uniqueIds = [...new Set(items.map((item) => item.indicatorId))];
  const indicators = await prisma.indicator.findMany({
    where: { id: { in: uniqueIds }, deletedAt: null },
    select: { id: true },
  });
  if (indicators.length !== uniqueIds.length) {
    throw conflict('Um ou mais indicadores não existem ou foram excluídos');
  }

  const existing = await prisma.programIndicator.findMany({
    where: { programId: id, indicatorId: { in: uniqueIds }, active: true },
    select: { indicatorId: true },
  });
  const alreadyActive = new Set(existing.map((link) => link.indicatorId));
  const byId = new Map(items.map((item) => [item.indicatorId, item]));
  await prisma.$transaction(
    uniqueIds.map((indicatorId) => {
      const item = byId.get(indicatorId);
      return prisma.programIndicator.upsert({
        where: { programId_indicatorId: { programId: id, indicatorId } },
        create: {
          programId: id,
          indicatorId,
          weight: item.weight ?? null,
          goal: item.goal ?? null,
          active: true,
        },
        update: {
          weight: item.weight ?? null,
          goal: item.goal ?? null,
          active: true,
        },
      });
    }),
  );
  const added = uniqueIds.filter((indicatorId) => !alreadyActive.has(indicatorId)).length;

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'Program',
    entityId: id,
    metadata: { indicators: items, activated: added },
    ip,
  });
  return { added };
}

export async function updateProgramIndicator(id, indicatorId, data, actor, ip) {
  const link = await prisma.programIndicator.findUnique({
    where: { programId_indicatorId: { programId: id, indicatorId } },
  });
  if (!link) throw notFound('Indicador não vinculado a este programa');
  await prisma.programIndicator.update({
    where: { programId_indicatorId: { programId: id, indicatorId } },
    data: {
      ...(data.weight !== undefined && { weight: data.weight }),
      ...(data.goal !== undefined && { goal: data.goal }),
      ...(data.active !== undefined && { active: data.active }),
    },
  });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'Program',
    entityId: id,
    metadata: { indicatorId, ...data },
    ip,
  });
}

export async function removeIndicator(id, indicatorId, actor, ip) {
  const link = await prisma.programIndicator.findUnique({
    where: { programId_indicatorId: { programId: id, indicatorId } },
  });
  if (!link) throw notFound('Indicador não vinculado a este programa');
  const linkedResults = await prisma.result.count({ where: { programId: id, indicatorId } });
  if (linkedResults > 0) {
    throw conflict(
      'Este vínculo possui resultados. Desative o indicador no programa em vez de removê-lo para preservar o histórico.',
    );
  }
  await prisma.programIndicator.delete({
    where: { programId_indicatorId: { programId: id, indicatorId } },
  });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'Program',
    entityId: id,
    metadata: { removedIndicator: indicatorId },
    ip,
  });
}
