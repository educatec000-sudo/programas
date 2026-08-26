import { prisma } from '../lib/prisma.js';
import { notFound, conflict } from '../lib/errors.js';
import { audit, AuditAction } from '../lib/audit.js';
import { parsePagination, buildPagination } from '../lib/pagination.js';

export async function listIndicators(query) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const { search, categoryId, status } = query;

  const where = {
    deletedAt: null,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(categoryId && { categoryId }),
    ...(status && { status }),
  };

  const [total, indicators] = await Promise.all([
    prisma.indicator.count({ where }),
    prisma.indicator.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        _count: { select: { programs: true, results: true } },
      },
      orderBy: { code: query.dir === 'desc' ? 'desc' : 'asc' },
      skip,
      take,
    }),
  ]);

  return {
    data: indicators.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      unit: i.unit,
      polarity: i.polarity,
      weight: i.weight,
      defaultGoal: i.defaultGoal,
      minValue: i.minValue,
      maxValue: i.maxValue,
      periodLabel: i.periodLabel,
      status: i.status,
      category: i.category,
      programsCount: i._count.programs,
      resultsCount: i._count.results,
    })),
    pagination: buildPagination(total, page, pageSize),
  };
}

export async function getIndicator(id) {
  const indicator = await prisma.indicator.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: true,
      programs: {
        include: { program: { select: { id: true, code: true, name: true, year: true, status: true } } },
      },
      _count: { select: { results: true, goals: true } },
    },
  });
  if (!indicator) throw notFound('Indicador não encontrado');

  const [avg] = await prisma.$queryRaw`
    SELECT ROUND(AVG(r.value)::numeric, 2)::float AS avg_value, COUNT(*)::int AS total
    FROM "Result" r WHERE r."indicatorId" = ${id}`;

  return {
    ...indicator,
    programs: indicator.programs.map((pi) => ({
      ...pi.program,
      weight: pi.weight,
      goal: pi.goal,
    })),
    resultsCount: indicator._count.results,
    goalsCount: indicator._count.goals,
    stats: avg || { avg_value: null, total: 0 },
  };
}

export async function createIndicator(data, actor, ip) {
  const exists = await prisma.indicator.findUnique({ where: { code: data.code } });
  if (exists && !exists.deletedAt) throw conflict('Já existe um indicador com este código');

  const indicator = exists
    ? await prisma.indicator.update({ where: { id: exists.id }, data: { ...data, deletedAt: null } })
    : await prisma.indicator.create({ data });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'Indicator',
    entityId: indicator.id,
    metadata: { code: indicator.code, name: indicator.name },
    ip,
  });
  return indicator;
}

export async function updateIndicator(id, data, actor, ip) {
  const indicator = await prisma.indicator.findFirst({ where: { id, deletedAt: null } });
  if (!indicator) throw notFound('Indicador não encontrado');
  if (data.code && data.code !== indicator.code) {
    const exists = await prisma.indicator.findUnique({ where: { code: data.code } });
    if (exists && exists.id !== id) throw conflict('Já existe um indicador com este código');
  }
  const updated = await prisma.indicator.update({ where: { id }, data });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'Indicator',
    entityId: id,
    metadata: data,
    ip,
  });
  return updated;
}

export async function deleteIndicator(id, actor, ip) {
  const indicator = await prisma.indicator.findFirst({ where: { id, deletedAt: null } });
  if (!indicator) throw notFound('Indicador não encontrado');
  const results = await prisma.result.count({ where: { indicatorId: id } });
  await prisma.indicator.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'INATIVO' },
  });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.DELETE,
    entity: 'Indicator',
    entityId: id,
    metadata: { code: indicator.code, name: indicator.name, linkedResults: results },
    ip,
  });
}

// ---------------------- Categorias ----------------------

export async function listCategories() {
  return prisma.indicatorCategory.findMany({
    include: { _count: { select: { indicators: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function createCategory(data, actor, ip) {
  const exists = await prisma.indicatorCategory.findUnique({ where: { name: data.name } });
  if (exists) throw conflict('Já existe uma categoria com este nome');
  const category = await prisma.indicatorCategory.create({ data });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'IndicatorCategory',
    entityId: category.id,
    metadata: { name: category.name },
    ip,
  });
  return category;
}

export async function updateCategory(id, data, actor, ip) {
  const category = await prisma.indicatorCategory.findUnique({ where: { id } });
  if (!category) throw notFound('Categoria não encontrada');
  const updated = await prisma.indicatorCategory.update({ where: { id }, data });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'IndicatorCategory',
    entityId: id,
    metadata: data,
    ip,
  });
  return updated;
}

export async function deleteCategory(id, actor, ip) {
  const category = await prisma.indicatorCategory.findUnique({
    where: { id },
    include: { _count: { select: { indicators: true } } },
  });
  if (!category) throw notFound('Categoria não encontrada');
  if (category._count.indicators > 0) {
    throw conflict('Não é possível excluir: existem indicadores nesta categoria');
  }
  await prisma.indicatorCategory.delete({ where: { id } });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.DELETE,
    entity: 'IndicatorCategory',
    entityId: id,
    ip,
  });
}
