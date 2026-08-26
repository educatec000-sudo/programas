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
              municipality: true,
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

  const result = await prisma.programSchool.createMany({
    data: schoolIds.map((schoolId) => ({ programId: id, schoolId })),
    skipDuplicates: true,
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'Program',
    entityId: id,
    metadata: { addedSchools: schoolIds.length, inserted: result.count },
    ip,
  });
  return { added: result.count };
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

  const result = await prisma.programIndicator.createMany({
    data: items.map((it) => ({
      programId: id,
      indicatorId: it.indicatorId,
      weight: it.weight ?? null,
      goal: it.goal ?? null,
    })),
    skipDuplicates: true,
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'Program',
    entityId: id,
    metadata: { addedIndicators: items },
    ip,
  });
  return { added: result.count };
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
