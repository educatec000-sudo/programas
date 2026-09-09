import { prisma } from '../lib/prisma.js';
import { notFound, conflict, HttpError } from '../lib/errors.js';
import { audit, AuditAction } from '../lib/audit.js';
import { parsePagination, buildPagination } from '../lib/pagination.js';
import { periodOrder } from '../lib/constants.js';
import { attainment } from './scoring.service.js';
import { resolveGoalFromList } from './goal.service.js';
import { PACTO_CATALOG_CODE } from '../programs/pacto/config.js';
import {
  permanentProgramCode,
  permanentProgramName,
  programCycleCode,
  selectCurrentProgramCycle,
  summarizeProgramDeletionCounts,
} from './program-catalog.js';

/** Conta escolas com algum dado oficial (resultado ou envio específico), considerando somente vínculos ativos. */
export function countSchoolsWithData(activeLinks, resultGroups) {
  const activeLinkSet = new Set(activeLinks.map((link) => `${link.programId}:${link.schoolId}`));
  const schoolsByProgram = new Map();
  for (const group of resultGroups) {
    if (!activeLinkSet.has(`${group.programId}:${group.schoolId}`)) continue;
    if (!schoolsByProgram.has(group.programId)) schoolsByProgram.set(group.programId, new Set());
    schoolsByProgram.get(group.programId).add(group.schoolId);
  }
  return new Map([...schoolsByProgram].map(([programId, schoolIds]) => [programId, schoolIds.size]));
}

let lastSyncTimestamp = 0;
export async function ensureCncaAndCleanLegacy() {
  const now = Date.now();
  if (now - lastSyncTimestamp < 15_000) return;
  lastSyncTimestamp = now;

  try {
    // 1. Remove qualquer resquício de PARC no banco
    const legacyCatalogs = await prisma.programCatalog.findMany({
      where: {
        OR: [
          { code: { in: ['PARC', 'PARC-2026', 'PARC_2026'] } },
          { code: { startsWith: 'PARC' } },
          { name: { contains: 'PARC' } },
          { name: { contains: 'Programa de Avaliação da Rede' } },
        ],
      },
      select: { id: true },
    });
    if (legacyCatalogs.length) {
      const legacyCatIds = legacyCatalogs.map((c) => c.id);
      const legacyPrograms = await prisma.program.findMany({
        where: { catalogId: { in: legacyCatIds } },
        select: { id: true },
      });
      const legacyProgIds = legacyPrograms.map((p) => p.id);
      if (legacyProgIds.length) {
        await prisma.programSchool.deleteMany({ where: { programId: { in: legacyProgIds } } });
        await prisma.programIndicator.deleteMany({ where: { programId: { in: legacyProgIds } } });
        await prisma.result.deleteMany({ where: { programId: { in: legacyProgIds } } });
        await prisma.goal.deleteMany({ where: { programId: { in: legacyProgIds } } });
        await prisma.program.deleteMany({ where: { id: { in: legacyProgIds } } });
      }
      await prisma.programCatalog.deleteMany({ where: { id: { in: legacyCatIds } } });
    }

    const directLegacyPrograms = await prisma.program.findMany({
      where: {
        OR: [
          { code: { startsWith: 'PARC' } },
          { name: { contains: 'PARC' } },
          { name: { contains: 'Programa de Avaliação da Rede' } },
        ],
      },
      select: { id: true },
    });
    if (directLegacyPrograms.length) {
      const ids = directLegacyPrograms.map((p) => p.id);
      await prisma.programSchool.deleteMany({ where: { programId: { in: ids } } });
      await prisma.programIndicator.deleteMany({ where: { programId: { in: ids } } });
      await prisma.result.deleteMany({ where: { programId: { in: ids } } });
      await prisma.goal.deleteMany({ where: { programId: { in: ids } } });
      await prisma.program.deleteMany({ where: { id: { in: ids } } });
    }

    // 2. Garante existência do catálogo e programa CNCA
    let catalog = await prisma.programCatalog.findFirst({
      where: { code: 'CNCA', deletedAt: null },
    });
    if (!catalog) {
      catalog = await prisma.programCatalog.create({
        data: {
          code: 'CNCA',
          name: 'Compromisso Nacional Criança Alfabetizada',
          objective: 'Garantir a alfabetização de todas as crianças na idade certa com avaliação por escola',
          organ: 'MEC / SEMED',
          description: 'Compromisso Nacional Criança Alfabetizada — avaliação censitária por escola (Escrita, Leitura, Matemática e Fluência).',
        },
      });
    }

    let program = await prisma.program.findFirst({
      where: { catalogId: catalog.id, year: 2026, deletedAt: null },
    });
    if (!program) {
      program = await prisma.program.create({
        data: {
          catalogId: catalog.id,
          code: 'CNCA-2026',
          name: 'Compromisso Nacional Criança Alfabetizada',
          year: 2026,
          status: 'EM_EXECUCAO',
          organ: 'MEC / SEMED',
          objective: 'Garantir a alfabetização de todas as crianças na idade certa com avaliação por escola',
          globalGoal: 85,
          periodLabel: 'Ciclo 2026',
          description: 'Compromisso Nacional Criança Alfabetizada — ciclo 2026.',
        },
      });
    }

    // Se o CNCA-2026 estiver com TODAS as escolas da rede vinculadas sem resultados gravados (resíduo anterior),
    // limpa os vínculos em massa para permitir o controle dinâmico correto de participantes.
    const totalSchoolsCount = await prisma.school.count({ where: { deletedAt: null } });
    if (totalSchoolsCount > 0) {
      const cncaLinksCount = await prisma.programSchool.count({ where: { programId: program.id } });
      const cncaResultsCount = await prisma.cncaSchoolResult.count({ where: { programId: program.id } });
      if (cncaLinksCount >= totalSchoolsCount && cncaResultsCount === 0) {
        await prisma.programSchool.deleteMany({ where: { programId: program.id } });
      }
    }
  } catch (err) {
    // Log não bloqueante
    // eslint-disable-next-line no-console
    console.warn('[ProgramService] Sincronização CNCA/PARC:', err?.message || err);
  }
}

export async function listProgramCatalogs(query) {
  await ensureCncaAndCleanLegacy();
  const { page, pageSize, skip, take } = parsePagination(query);
  const { search, status } = query;
  const where = {
    deletedAt: null,
    cycles: { some: { deletedAt: null, ...(status && { status }) } },
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { organ: { contains: search, mode: 'insensitive' } },
        { cycles: { some: { deletedAt: null, code: { contains: search, mode: 'insensitive' } } } },
      ],
    }),
  };

  const [total, catalogs] = await Promise.all([
    prisma.programCatalog.count({ where }),
    prisma.programCatalog.findMany({
      where,
      include: {
        cycles: {
          where: { deletedAt: null },
          include: {
            _count: {
              select: { schools: { where: { active: true } }, indicators: { where: { active: true } }, results: true },
            },
          },
          orderBy: { year: 'desc' },
        },
      },
      orderBy: { code: 'asc' },
      skip,
      take,
    }),
  ]);

  const includeCoverage = Boolean(query.includeCoverage);
  const cycles = catalogs.flatMap((catalog) => catalog.cycles);
  const cycleIds = cycles.map((cycle) => cycle.id);
  const [activeLinks, resultGroups, pactoSubmissions, cncaResults] = includeCoverage && cycleIds.length
    ? await Promise.all([
        prisma.programSchool.findMany({
          where: { programId: { in: cycleIds }, active: true, school: { deletedAt: null } },
          select: { programId: true, schoolId: true },
        }),
        prisma.result.groupBy({
          by: ['programId', 'schoolId'],
          where: { programId: { in: cycleIds }, school: { deletedAt: null } },
        }),
        prisma.pactoAssessment.findMany({
          where: { status: 'ENVIADO', class: { programId: { in: cycleIds }, active: true } },
          select: { class: { select: { programId: true, schoolId: true } } },
        }),
        prisma.cncaSchoolResult.findMany({
          where: { programId: { in: cycleIds }, school: { deletedAt: null } },
          select: { programId: true, schoolId: true },
        }),
      ])
    : [[], [], [], []];
  const schoolsWithData = countSchoolsWithData(activeLinks, [
    ...resultGroups,
    ...pactoSubmissions.map((item) => item.class),
    ...cncaResults,
  ]);

  const serialized = catalogs.map((catalog) => {
    const cycleRows = catalog.cycles.map((cycle) => {
      const schoolsWithDataCount = includeCoverage ? schoolsWithData.get(cycle.id) || 0 : null;
      const pendingSchoolsCount = includeCoverage
        ? Math.max(0, cycle._count.schools - schoolsWithDataCount)
        : null;
      return {
        id: cycle.id,
        code: cycle.code,
        year: cycle.year,
        periodLabel: cycle.periodLabel,
        status: cycle.status,
        schoolsCount: cycle._count.schools,
        schoolsWithDataCount,
        pendingSchoolsCount,
        dataCoveragePercent: includeCoverage && cycle._count.schools
          ? Math.round((schoolsWithDataCount / cycle._count.schools) * 100)
          : includeCoverage ? 0 : null,
        indicatorsCount: cycle._count.indicators,
        resultsCount: cycle._count.results,
        createdAt: cycle.createdAt,
      };
    });
    const current = selectCurrentProgramCycle(cycleRows, status);
    return {
      id: catalog.id,
      code: catalog.code,
      name: catalog.name,
      description: catalog.description,
      objective: catalog.objective,
      organ: catalog.organ,
      createdAt: catalog.createdAt,
      cycles: cycleRows,
      cyclesCount: cycleRows.length,
      availableYears: cycleRows.map((cycle) => cycle.year),
      currentCycleId: current?.id || null,
      currentCycle: current,
      year: current?.year || null,
      periodLabel: current?.periodLabel || null,
      status: current?.status || 'PLANEJAMENTO',
      schoolsCount: current?.schoolsCount || 0,
      schoolsWithDataCount: current?.schoolsWithDataCount || 0,
      pendingSchoolsCount: current?.pendingSchoolsCount || 0,
      dataCoveragePercent: current?.dataCoveragePercent || 0,
      indicatorsCount: current?.indicatorsCount || 0,
      resultsCount: current?.resultsCount || 0,
    };
  });

  return { data: serialized, pagination: buildPagination(total, page, pageSize) };
}

/**
 * Lista de execuções mantida para telas operacionais e integrações existentes.
 * O catálogo público de entrada usa listProgramCatalogs e não aceita filtro anual.
 */
export async function listPrograms(query) {
  await ensureCncaAndCleanLegacy();
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
        catalog: { select: { id: true, code: true, name: true } },
        _count: {
          select: { schools: { where: { active: true } }, indicators: { where: { active: true } }, results: true },
        },
      },
      orderBy,
      skip,
      take,
    }),
  ]);

  const includeCoverage = Boolean(query.includeCoverage);
  const programIds = programs.map((program) => program.id);
  const [activeLinks, resultGroups, pactoSubmissions, cncaResults] = includeCoverage && programIds.length
    ? await Promise.all([
        prisma.programSchool.findMany({
          where: { programId: { in: programIds }, active: true, school: { deletedAt: null } },
          select: { programId: true, schoolId: true },
        }),
        prisma.result.groupBy({
          by: ['programId', 'schoolId'],
          where: { programId: { in: programIds }, school: { deletedAt: null } },
        }),
        prisma.pactoAssessment.findMany({
          where: { status: 'ENVIADO', class: { programId: { in: programIds }, active: true } },
          select: { class: { select: { programId: true, schoolId: true } } },
        }),
        prisma.cncaSchoolResult.findMany({
          where: { programId: { in: programIds }, school: { deletedAt: null } },
          select: { programId: true, schoolId: true },
        }),
      ])
    : [[], [], [], []];

  const coverageGroups = [
    ...resultGroups,
    ...pactoSubmissions.map((item) => item.class),
    ...cncaResults,
  ];
  const schoolsWithData = countSchoolsWithData(activeLinks, coverageGroups);

  return {
    data: programs.map((p) => {
      const schoolsWithDataCount = includeCoverage ? schoolsWithData.get(p.id) || 0 : null;
      const pendingSchoolsCount = includeCoverage
        ? Math.max(0, p._count.schools - schoolsWithDataCount)
        : null;
      const dataCoveragePercent = includeCoverage && p._count.schools
        ? Math.round((schoolsWithDataCount / p._count.schools) * 100)
        : includeCoverage ? 0 : null;
      return {
        id: p.id,
        catalog: p.catalog,
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
        schoolsWithDataCount,
        pendingSchoolsCount,
        dataCoveragePercent,
        indicatorsCount: p._count.indicators,
        resultsCount: p._count.results,
        createdAt: p.createdAt,
      };
    }),
    pagination: buildPagination(total, page, pageSize),
  };
}

export async function getProgram(id) {
  const program = await prisma.program.findFirst({
    where: { id, deletedAt: null, catalog: { deletedAt: null } },
    include: {
      catalog: {
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          objective: true,
          organ: true,
          cycles: {
            where: { deletedAt: null },
            select: { id: true, code: true, year: true, periodLabel: true, status: true },
            orderBy: { year: 'desc' },
          },
        },
      },
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
    catalog: {
      id: program.catalog.id,
      code: program.catalog.code,
      name: program.catalog.name,
      description: program.catalog.description,
      objective: program.catalog.objective,
      organ: program.catalog.organ,
    },
    cycles: program.catalog.cycles,
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
  const existingCode = await prisma.program.findUnique({ where: { code: data.code } });
  if (existingCode && !existingCode.deletedAt) throw conflict('Já existe um ciclo com este código');

  const catalogCode = permanentProgramCode(data.code, data.year);
  const catalogName = permanentProgramName(data.name, data.year);
  const program = await prisma.$transaction(async (tx) => {
    let catalog = existingCode?.catalogId
      ? await tx.programCatalog.findUnique({ where: { id: existingCode.catalogId } })
      : await tx.programCatalog.findFirst({
          where: {
            OR: [
              { code: catalogCode },
              { name: { equals: catalogName, mode: 'insensitive' } },
            ],
          },
        });
    if (!catalog) {
      catalog = await tx.programCatalog.create({
        data: {
          code: catalogCode,
          name: catalogName,
          description: data.description,
          objective: data.objective,
          organ: data.organ,
        },
      });
    } else if (catalog.deletedAt) {
      catalog = await tx.programCatalog.update({
        where: { id: catalog.id },
        data: { deletedAt: null, name: catalogName },
      });
    }

    const sameCycle = await tx.program.findUnique({
      where: { catalogId_year: { catalogId: catalog.id, year: Number(data.year) } },
    });
    if (sameCycle && sameCycle.id !== existingCode?.id && !sameCycle.deletedAt) {
      throw conflict(`O programa já possui o ciclo ${data.year}`);
    }

    const reusable = existingCode || (sameCycle?.deletedAt ? sameCycle : null);
    return reusable
      ? tx.program.update({
          where: { id: reusable.id },
          data: { ...data, catalogId: catalog.id, deletedAt: null },
        })
      : tx.program.create({ data: { ...data, catalogId: catalog.id } });
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'Program',
    entityId: program.id,
    metadata: { code: program.code, name: program.name, catalogCode, year: program.year },
    ip,
  });
  return program;
}

export async function createProgramCycle(id, data, actor, ip) {
  const reference = await prisma.program.findFirst({
    where: { id, deletedAt: null, catalog: { deletedAt: null } },
    include: { catalog: true },
  });
  if (!reference) throw notFound('Programa não encontrado');
  const existing = await prisma.program.findUnique({
    where: { catalogId_year: { catalogId: reference.catalogId, year: Number(data.year) } },
  });
  if (existing && !existing.deletedAt) throw conflict(`O ciclo ${data.year} já existe neste programa`);

  const code = programCycleCode(reference.catalog.code, data.year);
  const codeOwner = await prisma.program.findUnique({ where: { code } });
  if (codeOwner && codeOwner.id !== existing?.id) throw conflict(`O código técnico ${code} já está em uso`);

  const cycle = existing
    ? await prisma.program.update({
        where: { id: existing.id },
        data: {
          code,
          name: `${reference.catalog.name} ${data.year}`,
          periodLabel: data.periodLabel,
          status: data.status,
          deletedAt: null,
        },
      })
    : await prisma.program.create({
        data: {
          catalogId: reference.catalogId,
          code,
          name: `${reference.catalog.name} ${data.year}`,
          description: reference.catalog.description,
          objective: reference.catalog.objective,
          organ: reference.catalog.organ,
          year: Number(data.year),
          periodLabel: data.periodLabel,
          status: data.status,
        },
      });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'Program',
    entityId: cycle.id,
    metadata: { catalogId: reference.catalogId, cycle: cycle.year, code: cycle.code },
    ip,
  });
  return cycle;
}

export async function updateProgram(id, data, actor, ip) {
  const program = await prisma.program.findFirst({
    where: { id, deletedAt: null },
    include: { catalog: true },
  });
  if (!program) throw notFound('Programa não encontrado');
  if (data.code && data.code !== program.code) {
    const exists = await prisma.program.findUnique({ where: { code: data.code } });
    if (exists && exists.id !== id) throw conflict('Já existe um ciclo com este código');
  }
  if (data.year && Number(data.year) !== program.year) {
    throw new HttpError(
      422,
      'O ano de um ciclo existente não pode ser alterado. Adicione outro ciclo ao programa.',
      'PROGRAM_CYCLE_YEAR_IMMUTABLE',
    );
  }

  const catalogUpdate = {
    ...(data.name !== undefined && { name: permanentProgramName(data.name, data.year || program.year) }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.objective !== undefined && { objective: data.objective }),
    ...(data.organ !== undefined && { organ: data.organ }),
  };
  const [updated] = await prisma.$transaction([
    prisma.program.update({ where: { id }, data }),
    ...(Object.keys(catalogUpdate).length
      ? [prisma.programCatalog.update({ where: { id: program.catalogId }, data: catalogUpdate })]
      : []),
  ]);
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

async function buildProgramDeletionImpact(id, db = prisma) {
  const program = await db.program.findFirst({
    where: { id, deletedAt: null, catalog: { deletedAt: null } },
    select: { catalogId: true, catalog: { select: { code: true, name: true } } },
  });
  if (!program) throw notFound('Programa não encontrado');
  const cycles = await db.program.findMany({
    where: { catalogId: program.catalogId, deletedAt: null },
    select: { id: true, year: true },
    orderBy: { year: 'asc' },
  });
  const cycleIds = cycles.map((cycle) => cycle.id);
  const [
    schools,
    indicators,
    results,
    goals,
    evaluations,
    collectionLinks,
    pactoClasses,
    pactoAssessments,
    pactoComponents,
    pactoSkillResults,
    cncaResults,
    documents,
  ] = await Promise.all([
    db.programSchool.count({ where: { programId: { in: cycleIds } } }),
    db.programIndicator.count({ where: { programId: { in: cycleIds } } }),
    db.result.count({ where: { programId: { in: cycleIds } } }),
    db.goal.count({ where: { programId: { in: cycleIds } } }),
    db.evaluation.count({ where: { programId: { in: cycleIds } } }),
    db.programCollectionLink.count({ where: { programId: { in: cycleIds } } }),
    db.pactoClass.count({ where: { programId: { in: cycleIds } } }),
    db.pactoAssessment.count({ where: { class: { programId: { in: cycleIds } } } }),
    db.pactoAssessmentComponent.count({ where: { assessment: { class: { programId: { in: cycleIds } } } } }),
    db.pactoSkillResult.count({ where: { component: { assessment: { class: { programId: { in: cycleIds } } } } } }),
    db.cncaSchoolResult.count({ where: { programId: { in: cycleIds } } }),
    db.document.count({
      where: {
        deletedAt: null,
        OR: [
          { entity: 'Program', entityId: { in: cycleIds } },
          { entity: 'ProgramCatalog', entityId: program.catalogId },
        ],
      },
    }),
  ]);
  const counts = {
    schools,
    indicators,
    results,
    goals,
    evaluations,
    collectionLinks,
    pactoClasses,
    pactoAssessments,
    pactoComponents,
    pactoSkillResults,
    cncaResults,
    documents,
  };
  return {
    catalogId: program.catalogId,
    code: program.catalog.code,
    name: program.catalog.name,
    cycles,
    ...summarizeProgramDeletionCounts(counts),
  };
}

export async function getProgramDeletionImpact(id) {
  return buildProgramDeletionImpact(id);
}

export async function deleteProgram(id, actor, ip) {
  const impact = await buildProgramDeletionImpact(id);
  if (!impact.canDelete) {
    throw new HttpError(
      409,
      'O programa possui dados vinculados e não pode ser excluído. Remova ou arquive os vínculos de forma explícita antes de continuar.',
      'PROGRAM_HAS_RELATED_DATA',
      impact,
    );
  }
  const deletedAt = new Date();
  await prisma.$transaction([
    prisma.program.updateMany({
      where: { catalogId: impact.catalogId, deletedAt: null },
      data: { deletedAt },
    }),
    prisma.programCatalog.update({
      where: { id: impact.catalogId },
      data: { deletedAt },
    }),
  ]);
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.DELETE,
    entity: 'ProgramCatalog',
    entityId: impact.catalogId,
    metadata: { code: impact.code, name: impact.name, cycles: impact.cycles.map((cycle) => cycle.year) },
    ip,
  });
}

/** Histórico do programa sem exigir acesso à auditoria administrativa global. */
export async function listProgramHistory(id, query = {}) {
  const program = await prisma.program.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, catalogId: true },
  });
  if (!program) throw notFound('Programa não encontrado');
  const cycles = await prisma.program.findMany({
    where: { catalogId: program.catalogId },
    select: { id: true },
  });
  const { page, pageSize, skip, take } = parsePagination(query, { defaultPageSize: 25 });
  const where = {
    OR: [
      { entity: 'Program', entityId: { in: cycles.map((cycle) => cycle.id) } },
      { entity: 'ProgramCatalog', entityId: program.catalogId },
    ],
  };
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
      program: {
        select: {
          id: true,
          code: true,
          name: true,
          year: true,
          deletedAt: true,
          catalog: { select: { code: true } },
        },
      },
      school: { select: { id: true, inep: true, name: true, deletedAt: true } },
    },
  });
  if (!link || link.program.deletedAt || link.school.deletedAt) {
    throw notFound('Escola ou programa não encontrado');
  }
  if (link.program.catalog.code === PACTO_CATALOG_CODE) {
    throw new HttpError(
      422,
      'O Pacto usa a revisão de envios na área específica do programa.',
      'PROGRAM_EVALUATION_UNAVAILABLE',
    );
  }

  if (query.year && Number(query.year) !== link.program.year) {
    throw new HttpError(
      422,
      `A avaliação desta escola pertence ao ciclo ${link.program.year}`,
      'PROGRAM_CYCLE_YEAR_MISMATCH',
    );
  }
  const year = link.program.year;
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

export async function getSchoolProgramDeletionImpact(programId, schoolId) {
  const link = await prisma.programSchool.findUnique({
    where: { programId_schoolId: { programId, schoolId } },
    include: {
      program: { select: { id: true, code: true, name: true, year: true } },
      school: { select: { id: true, inep: true, name: true } },
    },
  });
  if (!link) throw notFound('Escola não participa deste programa');

  const [
    results,
    goals,
    evaluations,
    collectionLinks,
    pactoClasses,
    pactoAssessments,
    cncaResults,
  ] = await Promise.all([
    prisma.result.count({ where: { programId, schoolId } }),
    prisma.goal.count({ where: { programId, schoolId } }),
    prisma.evaluation.count({ where: { programId, schoolId } }),
    prisma.programCollectionLink.count({ where: { programId, schoolId } }),
    prisma.pactoClass.count({ where: { programId, schoolId } }),
    prisma.pactoAssessment.count({ where: { class: { programId, schoolId } } }),
    prisma.cncaSchoolResult.count({ where: { programId, schoolId } }),
  ]);

  const counts = {
    results,
    goals,
    evaluations,
    collectionLinks,
    pactoClasses,
    pactoAssessments,
    cncaResults,
  };

  const totalRelated = Object.values(counts).reduce((sum, val) => sum + val, 0);

  return {
    programId,
    schoolId,
    schoolName: link.school.name,
    schoolInep: link.school.inep,
    hasData: totalRelated > 0,
    totalRelated,
    counts,
  };
}

export async function removeSchool(id, schoolId, options = {}, actor, ip) {
  const link = await prisma.programSchool.findUnique({
    where: { programId_schoolId: { programId: id, schoolId } },
    include: { school: { select: { name: true } } },
  });
  if (!link) throw notFound('Escola não participa deste programa');

  const impact = await getSchoolProgramDeletionImpact(id, schoolId);
  const purgeData = options.purgeData === true || options.purgeData === 'true';

  if (impact.hasData && !purgeData) {
    throw new HttpError(
      409,
      `A escola "${link.school.name}" possui dados cadastrados neste programa (${impact.totalRelated} registros). Para excluir a escola junto com todos os seus dados, confirme a exclusão completa, ou apenas desative sua participação.`,
      'SCHOOL_HAS_PROGRAM_DATA',
      impact,
    );
  }

  await prisma.$transaction(async (tx) => {
    if (purgeData) {
      const classes = await tx.pactoClass.findMany({
        where: { programId: id, schoolId },
        select: { id: true },
      });
      if (classes.length > 0) {
        await tx.pactoClass.deleteMany({
          where: { programId: id, schoolId },
        });
      }
      await tx.programCollectionLink.deleteMany({
        where: { programId: id, schoolId },
      });
      await tx.cncaSchoolResult.deleteMany({
        where: { programId: id, schoolId },
      });
      await tx.evaluation.deleteMany({
        where: { programId: id, schoolId },
      });
      await tx.goal.deleteMany({
        where: { programId: id, schoolId },
      });
      await tx.result.deleteMany({
        where: { programId: id, schoolId },
      });
    }

    await tx.programSchool.delete({
      where: { programId_schoolId: { programId: id, schoolId } },
    });
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.UPDATE,
    entity: 'Program',
    entityId: id,
    metadata: {
      operation: purgeData ? 'PURGE_SCHOOL_AND_DATA' : 'REMOVE_EMPTY_SCHOOL',
      removedSchool: schoolId,
      schoolName: link.school.name,
      purgedRecords: purgeData ? impact.counts : undefined,
    },
    ip,
  });

  return { success: true, purged: purgeData, impact };
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
