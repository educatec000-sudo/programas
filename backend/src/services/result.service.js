import { prisma } from '../lib/prisma.js';
import { notFound, conflict, HttpError } from '../lib/errors.js';
import { audit, AuditAction } from '../lib/audit.js';
import { parsePagination, buildPagination } from '../lib/pagination.js';

const resultInclude = {
  program: { select: { id: true, code: true, name: true } },
  school: { select: { id: true, inep: true, name: true } },
  indicator: { select: { id: true, code: true, name: true, unit: true, polarity: true } },
  createdBy: { select: { name: true } },
};

function resultKey(item) {
  return `${item.programId}|${item.schoolId}|${item.indicatorId}|${item.year}|${item.period}`;
}

/**
 * Valida as dimensões e os vínculos N:N antes de gravar resultados.
 * Uma FK isolada não garante que a escola e o indicador participem do programa.
 */
async function dimensionErrors(items) {
  const programIds = [...new Set(items.map((item) => item.programId))];
  const schoolIds = [...new Set(items.map((item) => item.schoolId))];
  const indicatorIds = [...new Set(items.map((item) => item.indicatorId))];

  const [programs, schools, indicators, schoolLinks, indicatorLinks] = await Promise.all([
    prisma.program.findMany({
      where: { id: { in: programIds }, deletedAt: null },
      select: { id: true },
    }),
    prisma.school.findMany({
      where: { id: { in: schoolIds }, deletedAt: null },
      select: { id: true },
    }),
    prisma.indicator.findMany({
      where: { id: { in: indicatorIds }, deletedAt: null, status: 'ATIVO' },
      select: { id: true },
    }),
    prisma.programSchool.findMany({
      where: { programId: { in: programIds }, schoolId: { in: schoolIds }, active: true },
      select: { programId: true, schoolId: true },
    }),
    prisma.programIndicator.findMany({
      where: { programId: { in: programIds }, indicatorId: { in: indicatorIds }, active: true },
      select: { programId: true, indicatorId: true },
    }),
  ]);

  const validPrograms = new Set(programs.map((row) => row.id));
  const validSchools = new Set(schools.map((row) => row.id));
  const validIndicators = new Set(indicators.map((row) => row.id));
  const validSchoolLinks = new Set(schoolLinks.map((row) => `${row.programId}|${row.schoolId}`));
  const validIndicatorLinks = new Set(indicatorLinks.map((row) => `${row.programId}|${row.indicatorId}`));

  return items.map((item) => {
    if (!validPrograms.has(item.programId)) return 'Programa não encontrado ou excluído';
    if (!validSchools.has(item.schoolId)) return 'Escola não encontrada ou excluída';
    if (!validIndicators.has(item.indicatorId)) return 'Indicador não encontrado, excluído ou inativo';
    if (!validSchoolLinks.has(`${item.programId}|${item.schoolId}`)) {
      return 'A escola não está ativa neste programa';
    }
    if (!validIndicatorLinks.has(`${item.programId}|${item.indicatorId}`)) {
      return 'O indicador não está ativo neste programa';
    }
    return null;
  });
}

export async function listResults(query) {
  const { page, pageSize, skip, take } = parsePagination(query, { defaultPageSize: 15 });
  const { programId, schoolId, indicatorId, year, period } = query;

  const where = {
    program: { deletedAt: null },
    school: { deletedAt: null },
    indicator: { deletedAt: null },
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
  const [dimensionError] = await dimensionErrors([data]);
  if (dimensionError) throw new HttpError(422, dimensionError, 'VALIDATION_ERROR');

  const unique = {
    programId: data.programId,
    schoolId: data.schoolId,
    indicatorId: data.indicatorId,
    year: data.year,
    period: data.period,
  };
  const where = { programId_schoolId_indicatorId_year_period: unique };
  const existing = await prisma.result.findUnique({ where });

  // Importante: o conflito precisa ser verificado ANTES do upsert. A versão
  // anterior atualizava o banco e só depois respondia 409 ao cliente.
  if (existing && !overwrite) {
    throw conflict(
      'Já existe resultado lançado para esta combinação (programa, escola, indicador, ano e período). Envie "overwrite=true" para atualizar.',
    );
  }

  let result;
  let auditAction = existing ? AuditAction.UPDATE : AuditAction.CREATE;
  if (existing) {
    result = await prisma.result.update({
      where: { id: existing.id },
      data: { value: data.value, notes: data.notes ?? null, updatedById: actor.id, source: 'MANUAL' },
    });
  } else {
    try {
      // create (em vez de upsert) preserva overwrite=false mesmo se outra
      // requisição concorrente inserir a mesma combinação neste intervalo.
      result = await prisma.result.create({
        data: { ...data, source: 'MANUAL', createdById: actor.id, updatedById: actor.id },
      });
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
      if (!overwrite) {
        throw conflict(
          'Já existe resultado lançado para esta combinação (programa, escola, indicador, ano e período).',
        );
      }
      result = await prisma.result.update({
        where,
        data: { value: data.value, notes: data.notes ?? null, updatedById: actor.id, source: 'MANUAL' },
      });
      auditAction = AuditAction.UPDATE;
    }
  }

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: auditAction,
    entity: 'Result',
    entityId: result.id,
    metadata: { value: data.value, previous: existing?.value ?? null, overwrite },
    ip,
  });

  return prisma.result.findUnique({ where: { id: result.id }, include: resultInclude });
}

/** Lançamento em lote atômico depois de validar todas as linhas. */
export async function createResultsBatch(items, { overwrite = false }, actor, ip) {
  const summary = { created: 0, updated: 0, errors: [] };
  const errors = await dimensionErrors(items);
  const seen = new Set();

  const uniqueCandidates = [];
  const validIndexes = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const key = resultKey(item);
    if (errors[index]) {
      summary.errors.push({ index, message: errors[index] });
      continue;
    }
    if (seen.has(key)) {
      summary.errors.push({ index, message: 'Combinação duplicada dentro do próprio lote' });
      continue;
    }
    seen.add(key);
    validIndexes.push(index);
    uniqueCandidates.push({
      programId: item.programId,
      schoolId: item.schoolId,
      indicatorId: item.indicatorId,
      year: item.year,
      period: item.period,
    });
  }

  const existingRows = uniqueCandidates.length
    ? await prisma.result.findMany({
        where: { OR: uniqueCandidates },
        select: { id: true, programId: true, schoolId: true, indicatorId: true, year: true, period: true },
      })
    : [];
  const existingKeys = new Set(existingRows.map(resultKey));
  const operations = [];

  for (const index of validIndexes) {
    const item = items[index];
    const key = resultKey(item);
    const exists = existingKeys.has(key);
    if (exists && !overwrite) {
      summary.errors.push({ index, message: 'Resultado já lançado (use a opção de atualizar)' });
      continue;
    }

    const uniqueWhere = {
      programId_schoolId_indicatorId_year_period: {
        programId: item.programId,
        schoolId: item.schoolId,
        indicatorId: item.indicatorId,
        year: item.year,
        period: item.period,
      },
    };
    operations.push(
      exists || overwrite
        ? prisma.result.upsert({
            where: uniqueWhere,
            create: { ...item, source: 'MANUAL', createdById: actor.id, updatedById: actor.id },
            update: { value: item.value, notes: item.notes ?? null, source: 'MANUAL', updatedById: actor.id },
          })
        : prisma.result.create({
            data: { ...item, source: 'MANUAL', createdById: actor.id, updatedById: actor.id },
          }),
    );
    if (exists) summary.updated++;
    else summary.created++;
  }

  if (operations.length) await prisma.$transaction(operations);

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
  const [dimensionError] = await dimensionErrors([existing]);
  if (dimensionError) throw new HttpError(422, dimensionError, 'VALIDATION_ERROR');

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
    program: { deletedAt: null },
    school: { deletedAt: null },
    indicator: { deletedAt: null },
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
