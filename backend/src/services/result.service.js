import { prisma } from '../lib/prisma.js';
import { notFound, conflict } from '../lib/errors.js';
import { audit, AuditAction } from '../lib/audit.js';
import { parsePagination, buildPagination } from '../lib/pagination.js';

const resultInclude = {
  program: { select: { id: true, code: true, name: true } },
  school: { select: { id: true, inep: true, name: true, municipality: true } },
  indicator: { select: { id: true, code: true, name: true, unit: true, polarity: true } },
  createdBy: { select: { name: true } },
};

export async function listResults(query) {
  const { page, pageSize, skip, take } = parsePagination(query, { defaultPageSize: 15 });
  const { programId, schoolId, indicatorId, year, period } = query;

  const where = {
    ...(programId && { programId }),
    ...(schoolId && { schoolId }),
    ...(indicatorId && { indicatorId }),
    ...(year && { year: Number(year) }),
    ...(period && { period }),
  };

  const orderBy =
    query.sort === 'value'
      ? { value: query.dir === 'asc' ? 'asc' : 'desc' }
      : { updatedAt: 'desc' };

  const [total, results] = await Promise.all([
    prisma.result.count({ where }),
    prisma.result.findMany({ where, include: resultInclude, orderBy, skip, take }),
  ]);

  return { data: results, pagination: buildPagination(total, page, pageSize) };
}

export async function createResult(data, { overwrite = false }, actor, ip) {
  const dup = await prisma.result.findUnique({
    where: {
      programId_schoolId_indicatorId_year_period: {
        programId: data.programId,
        schoolId: data.schoolId,
        indicatorId: data.indicatorId,
        year: data.year,
        period: data.period,
      },
    },
  });

  const result = await prisma.result.upsert({
    where: {
      programId_schoolId_indicatorId_year_period: {
        programId: data.programId,
        schoolId: data.schoolId,
        indicatorId: data.indicatorId,
        year: data.year,
        period: data.period,
      },
    },
    create: { ...data, createdById: actor.id, updatedById: actor.id },
    update: { value: data.value, notes: data.notes, updatedById: actor.id, source: 'MANUAL' },
  });

  if (dup && !overwrite) {
    throw conflict(
      'Já existe resultado lançado para esta combinação (programa, escola, indicador, ano e período). Envie "overwrite" para atualizar.',
    );
  }

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: dup ? AuditAction.UPDATE : AuditAction.CREATE,
    entity: 'Result',
    entityId: result.id,
    metadata: { value: data.value, previous: dup?.value ?? null, overwrite },
    ip,
  });

  return prisma.result.findUnique({ where: { id: result.id }, include: resultInclude });
}

/** Lançamento em lote — transação única, com relatório por linha. */
export async function createResultsBatch(items, { overwrite = false }, actor, ip) {
  const summary = { created: 0, updated: 0, errors: [] };

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const where = {
          programId_schoolId_indicatorId_year_period: {
            programId: item.programId,
            schoolId: item.schoolId,
            indicatorId: item.indicatorId,
            year: item.year,
            period: item.period,
          },
        };
        const existing = await tx.result.findUnique({ where });
        if (existing && !overwrite) {
          summary.errors.push({ index: i, message: 'Resultado já lançado (use a opção de atualizar)' });
          continue;
        }
        await tx.result.upsert({
          where,
          create: { ...item, createdById: actor.id, updatedById: actor.id },
          update: { value: item.value, notes: item.notes, updatedById: actor.id },
        });
        existing ? summary.updated++ : summary.created++;
      } catch (err) {
        summary.errors.push({ index: i, message: err.message || 'Erro ao gravar' });
      }
    }
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: summary.created ? AuditAction.CREATE : AuditAction.UPDATE,
    entity: 'Result',
    metadata: { batch: items.length, ...summary },
    ip,
  });

  return summary;
}

export async function updateResult(id, data, actor, ip) {
  const existing = await prisma.result.findUnique({ where: { id } });
  if (!existing) throw notFound('Resultado não encontrado');

  const result = await prisma.result.update({
    where: { id },
    data: { value: data.value, notes: data.notes ?? null, updatedById: actor.id },
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'Result',
    entityId: id,
    metadata: { before: existing.value, after: data.value },
    ip,
  });
  return prisma.result.findUnique({ where: { id: result.id }, include: resultInclude });
}

export async function deleteResult(id, actor, ip) {
  const existing = await prisma.result.findUnique({ where: { id } });
  if (!existing) throw notFound('Resultado não encontrado');
  await prisma.result.delete({ where: { id } });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.DELETE,
    entity: 'Result',
    entityId: id,
    metadata: { value: existing.value },
    ip,
  });
}

export async function resultsForExport(query) {
  const { programId, schoolId, indicatorId, year, period } = query;
  const where = {
    ...(programId && { programId }),
    ...(schoolId && { schoolId }),
    ...(indicatorId && { indicatorId }),
    ...(year && { year: Number(year) }),
    ...(period && { period }),
  };
  return prisma.result.findMany({
    where,
    include: resultInclude,
    orderBy: [{ year: 'desc' }, { period: 'asc' }, { school: { name: 'asc' } }],
    take: 10000,
  });
}
