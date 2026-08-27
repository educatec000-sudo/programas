import { prisma } from '../lib/prisma.js';
import { notFound, conflict, HttpError } from '../lib/errors.js';
import { audit, AuditAction } from '../lib/audit.js';
import { parsePagination, buildPagination } from '../lib/pagination.js';

const goalInclude = {
  program: { select: { id: true, code: true, name: true } },
  school: { select: { id: true, inep: true, name: true } },
  indicator: { select: { id: true, code: true, name: true, unit: true } },
  createdBy: { select: { name: true } },
};

export async function listGoals(query) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const { scope, programId, schoolId, indicatorId, year, period } = query;

  const where = {
    ...(scope && { scope }),
    ...(programId && { programId }),
    ...(schoolId && { schoolId }),
    ...(indicatorId && { indicatorId }),
    ...(year && { year: Number(year) }),
    ...(period === 'todos' ? {} : period ? { period } : {}),
  };

  const [total, goals] = await Promise.all([
    prisma.goal.count({ where }),
    prisma.goal.findMany({
      where,
      include: goalInclude,
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);

  return { data: goals, pagination: buildPagination(total, page, pageSize) };
}

async function assertDimensions(data) {
  if (data.programId) {
    const p = await prisma.program.findFirst({ where: { id: data.programId, deletedAt: null } });
    if (!p) throw new HttpError(422, 'Programa informado não existe', 'VALIDATION_ERROR');
  }
  if (data.schoolId) {
    const s = await prisma.school.findFirst({ where: { id: data.schoolId, deletedAt: null } });
    if (!s) throw new HttpError(422, 'Escola informada não existe', 'VALIDATION_ERROR');
  }
  if (data.indicatorId) {
    const i = await prisma.indicator.findFirst({ where: { id: data.indicatorId, deletedAt: null } });
    if (!i) throw new HttpError(422, 'Indicador informado não existe', 'VALIDATION_ERROR');
  }
  if (data.programId && data.schoolId) {
    const link = await prisma.programSchool.findUnique({
      where: { programId_schoolId: { programId: data.programId, schoolId: data.schoolId } },
    });
    if (!link?.active) {
      throw new HttpError(422, 'A escola não está ativa no programa informado', 'VALIDATION_ERROR');
    }
  }
  if (data.programId && data.indicatorId) {
    const link = await prisma.programIndicator.findUnique({
      where: { programId_indicatorId: { programId: data.programId, indicatorId: data.indicatorId } },
    });
    if (!link?.active) {
      throw new HttpError(422, 'O indicador não está ativo no programa informado', 'VALIDATION_ERROR');
    }
  }
}

function goalIdentity(data) {
  return {
    scope: data.scope,
    programId: data.programId ?? null,
    schoolId: data.schoolId ?? null,
    indicatorId: data.indicatorId ?? null,
    year: Number(data.year),
    period: data.period ?? null,
  };
}

export async function createGoal(data, actor, ip) {
  await assertDimensions(data);
  const duplicate = await prisma.goal.findFirst({ where: goalIdentity(data) });
  if (duplicate) {
    throw conflict('Já existe uma meta para o mesmo escopo, dimensões, ano e período');
  }
  const goal = await prisma.goal.create({
    data: { ...data, createdById: actor.id },
    include: goalInclude,
  });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'Goal',
    entityId: goal.id,
    metadata: { scope: data.scope, value: data.value, year: data.year },
    ip,
  });
  return goal;
}

export async function updateGoal(id, data, actor, ip) {
  const existing = await prisma.goal.findUnique({ where: { id } });
  if (!existing) throw notFound('Meta não encontrada');
  if (data.period !== undefined && data.period !== existing.period) {
    const duplicate = await prisma.goal.findFirst({
      where: {
        ...goalIdentity({ ...existing, period: data.period }),
        id: { not: id },
      },
    });
    if (duplicate) {
      throw conflict('Já existe uma meta para o mesmo escopo, dimensões, ano e período');
    }
  }
  const goal = await prisma.goal.update({
    where: { id },
    data: {
      ...(data.value !== undefined && { value: data.value }),
      ...(data.period !== undefined && { period: data.period }),
      ...(data.description !== undefined && { description: data.description }),
    },
    include: goalInclude,
  });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'Goal',
    entityId: id,
    metadata: { before: { value: existing.value, period: existing.period }, after: data },
    ip,
  });
  return goal;
}

export async function deleteGoal(id, actor, ip) {
  const existing = await prisma.goal.findUnique({ where: { id } });
  if (!existing) throw notFound('Meta não encontrada');
  await prisma.goal.delete({ where: { id } });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.DELETE,
    entity: 'Goal',
    entityId: id,
    metadata: { value: existing.value },
    ip,
  });
}

/**
 * Resolução de meta para uma combinação (programa, escola, indicador, ano, período).
 * Prioriza a meta mais específica: indicador+escola+programa > indicador+programa >
 * indicador+escola > indicador > escola+programa > programa.
 */
export function resolveGoalFromList(goals, { programId, schoolId, indicatorId, period }) {
  const candidates = goals.filter(
    (g) =>
      (!g.programId || g.programId === programId) &&
      (!g.schoolId || g.schoolId === schoolId) &&
      (!g.indicatorId || g.indicatorId === indicatorId) &&
      (!g.period || g.period === period),
  );
  if (!candidates.length) return null;

  const score = (g) =>
    (g.indicatorId ? 8 : 0) + (g.programId ? 4 : 0) + (g.schoolId ? 2 : 0) + (g.period ? 1 : 0);

  return candidates.reduce((best, g) => (score(g) > score(best) ? g : best), candidates[0]);
}

/** Endpoint de consulta: qual meta se aplica a uma combinação? */
export async function lookupGoal(params) {
  const { programId, schoolId, indicatorId, year, period } = params;
  const goals = await prisma.goal.findMany({
    where: { year: Number(year) },
    include: goalInclude,
    orderBy: { createdAt: 'desc' },
  });
  const filtered = goals.filter((g) => {
    if (g.programId && g.programId !== programId) return false;
    if (g.schoolId && g.schoolId !== schoolId) return false;
    if (g.indicatorId && g.indicatorId !== indicatorId) return false;
    return true;
  });
  const resolved = resolveGoalFromList(filtered, { programId, schoolId, indicatorId, period });
  return resolved;
}
