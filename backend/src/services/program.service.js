import { prisma } from '../lib/prisma.js';
import { notFound, conflict } from '../lib/errors.js';
import { audit, AuditAction } from '../lib/audit.js';
import { parsePagination, buildPagination } from '../lib/pagination.js';
import { periodOrder } from '../lib/constants.js';
import { attainment } from './scoring.service.js';
import { resolveGoalFromList } from './goal.service.js';

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
      description: p.description,
      objective: p.objective,
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
      _count: { select: { results: true, goals: true, evaluations: true } },
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
      weight: pi.weight ?? 1,
      goal: pi.goal ?? null,
      active: pi.active,
    })),
    resultsCount: program._count.results,
    goalsCount: program._count.goals,
    evaluationsCount: program._count.evaluations,
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

/** Histórico do programa sem exigir acesso à auditoria administrativa global. */
export async function listProgramHistory(id, query = {}) {
  const program = await prisma.program.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!program) throw notFound('Programa não encontrado');
  const { page, pageSize, skip, take } = parsePagination(query, { defaultPageSize: 25 });
  const where = { entity: 'Program', entityId: id };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { data: rows, pagination: buildPagination(total, page, pageSize) };
}

/**
 * Cria um critério pelo contexto do programa. O modelo Indicator continua sendo
 * o catálogo tecnológico compartilhado, mas o vínculo, a meta e o peso são
 * gravados exclusivamente em ProgramIndicator para este programa.
 */
export async function createProgramCriterion(programId, data, actor, ip) {
  const program = await prisma.program.findFirst({ where: { id: programId, deletedAt: null } });
  if (!program) throw notFound('Programa não encontrado');

  const existing = await prisma.indicator.findUnique({ where: { code: data.code } });
  if (existing) {
    throw conflict('Já existe um critério com este código. Vincule o critério existente ou informe outro código.');
  }

  const { target = null, ...indicatorData } = data;
  const result = await prisma.$transaction(async (tx) => {
    const indicator = await tx.indicator.create({
      data: {
        ...indicatorData,
        defaultGoal: null,
        status: 'ATIVO',
      },
    });
    const link = await tx.programIndicator.create({
      data: {
        programId,
        indicatorId: indicator.id,
        weight: indicatorData.weight,
        goal: target,
        active: true,
      },
    });
    return { indicator, link };
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'Program',
    entityId: programId,
    metadata: {
      operation: 'CREATE_CRITERION',
      indicatorId: result.indicator.id,
      code: result.indicator.code,
      name: result.indicator.name,
    },
    ip,
  });

  return {
    ...result.indicator,
    weight: result.link.weight,
    goal: result.link.goal,
    active: result.link.active,
  };
}

/** Avaliação de uma escola isolada dentro de um único programa. */
export async function getSchoolProgramEvaluation(programId, schoolId, query = {}) {
  const link = await prisma.programSchool.findUnique({
    where: { programId_schoolId: { programId, schoolId } },
    include: {
      program: { select: { id: true, code: true, name: true, year: true, deletedAt: true } },
      school: { select: { id: true, inep: true, name: true, deletedAt: true } },
    },
  });
  if (!link || link.program.deletedAt || link.school.deletedAt) {
    throw notFound('Escola ou programa não encontrado');
  }

  const year = Number(query.year || link.program.year);
  const periodRows = await prisma.result.findMany({
    where: { programId, schoolId, year },
    select: { period: true },
  });
  const periods = [...new Set(periodRows.map((row) => row.period))].sort(
    (a, b) => periodOrder(a) - periodOrder(b),
  );
  const period = query.period || periods.at(-1) || null;

  const [criteria, results, goals, evaluation] = await Promise.all([
    prisma.programIndicator.findMany({
      where: { programId, active: true, indicator: { deletedAt: null, status: 'ATIVO' } },
      include: {
        indicator: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            unit: true,
            polarity: true,
          },
        },
      },
      orderBy: { indicator: { code: 'asc' } },
    }),
    period
      ? prisma.result.findMany({
          where: { programId, schoolId, year, period },
          select: { id: true, indicatorId: true, value: true, notes: true, source: true, updatedAt: true },
        })
      : Promise.resolve([]),
    prisma.goal.findMany({
      where: { year, programId },
      select: {
        id: true,
        programId: true,
        schoolId: true,
        indicatorId: true,
        period: true,
        value: true,
        description: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    period
      ? prisma.evaluation.findUnique({
          where: { programId_schoolId_year_period: { programId, schoolId, year, period } },
          select: {
            id: true,
            score: true,
            classification: true,
            position: true,
            details: true,
            consolidatedAt: true,
            consolidatedBy: { select: { name: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  const resultByIndicator = new Map(results.map((row) => [row.indicatorId, row]));
  const rows = criteria.map((criterion) => {
    const result = resultByIndicator.get(criterion.indicatorId) || null;
    const goalRecord = resolveGoalFromList(goals, {
      programId,
      schoolId,
      indicatorId: criterion.indicatorId,
      period,
    });
    const target = goalRecord?.value ?? criterion.goal ?? null;
    const percentage = result ? attainment(result.value, target, criterion.indicator.polarity) : null;
    const situation = !result
      ? 'SEM_RESULTADO'
      : target === null
        ? 'SEM_META'
        : percentage >= 100
          ? 'META_ATINGIDA'
          : 'ABAIXO_DA_META';
    return {
      ...criterion.indicator,
      weight: criterion.weight ?? 1,
      target,
      result,
      percentage,
      situation,
    };
  });

  return {
    program: link.program,
    school: link.school,
    participationActive: link.active,
    joinedAt: link.joinedAt,
    year,
    period,
    periods,
    criteria: rows,
    evaluation,
  };
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
