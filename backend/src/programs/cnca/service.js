import { prisma } from '../../lib/prisma.js';
import { notFound, conflict } from '../../lib/errors.js';
import { audit, AuditAction } from '../../lib/audit.js';
import { CNCA_COMPONENTS, CNCA_RANKING_INDICATORS } from './config.js';

/**
 * Retorna os filtros disponíveis (anos, componentes, etapas, avaliações e escolas participantes) no CNCA.
 * A listagem de escolas restringe-se estritamente às escolas participantes do ciclo.
 */
export async function getCncaFilters(programId) {
  const program = await prisma.program.findFirst({
    where: { id: programId, deletedAt: null },
    select: { id: true, year: true, name: true },
  });
  if (!program) throw notFound('Programa não encontrado');

  // Total da rede municipal geral
  const totalNetworkSchools = await prisma.school.count({ where: { deletedAt: null } });

  // Escolas participantes vinculadas a este ciclo específico
  const linkedSchools = await prisma.programSchool.findMany({
    where: { programId, active: true, school: { deletedAt: null } },
    include: { school: { select: { id: true, inep: true, name: true, zone: true, district: true } } },
    orderBy: { school: { name: 'asc' } },
  });

  const schoolMap = new Map();
  for (const ls of linkedSchools) {
    if (ls.school) {
      schoolMap.set(ls.school.id, {
        id: ls.school.id,
        inep: ls.school.inep,
        name: ls.school.name,
        zone: ls.school.zone,
        district: ls.school.district,
      });
    }
  }

  // Resultados existentes para capturar anos, componentes, etapas e avaliações disponíveis
  const results = await prisma.cncaSchoolResult.findMany({
    where: { programId },
    select: {
      year: true,
      component: true,
      grade: true,
      assessment: true,
      schoolId: true,
      source: true,
      school: { select: { id: true, inep: true, name: true, zone: true, district: true } },
    },
    distinct: ['year', 'component', 'grade', 'assessment', 'schoolId'],
  });

  // Garante que qualquer escola com resultado também conste no mapa
  for (const r of results) {
    if (r.school && !schoolMap.has(r.school.id)) {
      schoolMap.set(r.school.id, {
        id: r.school.id,
        inep: r.school.inep,
        name: r.school.name,
        zone: r.school.zone,
        district: r.school.district,
      });
    }
  }

  const years = [...new Set(results.map((r) => r.year))].sort((a, b) => b - a);
  if (!years.length) years.push(program.year || new Date().getFullYear());

  const components = [...new Set(results.map((r) => r.component))];
  const grades = [...new Set(results.map((r) => r.grade))].sort();
  const assessments = [...new Set(results.map((r) => r.assessment))];

  const schools = Array.from(schoolMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  return {
    years,
    components: Object.keys(CNCA_COMPONENTS).map((k) => ({
      code: k,
      label: CNCA_COMPONENTS[k].label,
      hasData: components.includes(k),
    })),
    grades: grades.length ? grades : ['1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano'],
    assessments: assessments.length ? assessments : ['Diagnóstica', 'Formativa 1', 'Formativa 2', 'Somativa'],
    schools,
    totalNetworkSchools,
    totalParticipatingSchools: schools.length,
    totalResultsCount: results.length,
  };
}

/**
 * Constrói o dashboard executivo do CNCA considerando estritamente as escolas participantes do ciclo.
 */
export async function getCncaDashboard(programId, filters = {}) {
  const program = await prisma.program.findFirst({
    where: { id: programId, deletedAt: null },
    select: { id: true, year: true, name: true },
  });
  if (!program) throw notFound('Programa não encontrado');

  // 1. Contagens de escopo (Rede Geral vs Participantes deste Ciclo)
  const totalNetworkSchools = await prisma.school.count({ where: { deletedAt: null } });

  const activeLinks = await prisma.programSchool.findMany({
    where: { programId, active: true, school: { deletedAt: null } },
    select: { schoolId: true },
  });
  const participatingSchoolIds = new Set(activeLinks.map((l) => l.schoolId));

  const where = { programId };
  if (filters.year) where.year = Number(filters.year);
  if (filters.component && filters.component !== 'TODOS') where.component = filters.component;
  if (filters.grade && filters.grade !== 'TODOS') where.grade = filters.grade;
  if (filters.assessment && filters.assessment !== 'TODOS') where.assessment = filters.assessment;
  if (filters.schoolId && filters.schoolId !== 'TODAS') where.schoolId = filters.schoolId;
  if (filters.status === 'OFICIAL') where.source = 'IMPORTACAO';
  if (filters.status === 'RASCUNHO') where.source = 'RASCUNHO';

  const results = await prisma.cncaSchoolResult.findMany({
    where,
    include: {
      school: { select: { id: true, inep: true, name: true, zone: true } },
    },
    orderBy: [{ school: { name: 'asc' } }, { component: 'asc' }],
  });

  // Também inclui no conjunto de participantes escolas que possuam resultados gravados
  for (const r of results) {
    if (r.schoolId) participatingSchoolIds.add(r.schoolId);
  }

  const distinctSchoolsWithResults = new Set(results.map((r) => r.schoolId));
  const totalParticipatingSchools = participatingSchoolIds.size;
  const totalEvaluatedSchools = distinctSchoolsWithResults.size;
  const pendingSchoolsCount = Math.max(0, totalParticipatingSchools - totalEvaluatedSchools);
  const dataCoveragePercent = totalParticipatingSchools > 0
    ? Math.round((totalEvaluatedSchools / totalParticipatingSchools) * 100)
    : 0;

  let totalEnrolled = 0;
  let totalEvaluated = 0;
  let sumAverageScore = 0;
  let countAverageScore = 0;
  let sumFluentRate = 0;
  let countFluentRate = 0;
  let sumPcpm = 0;
  let countPcpm = 0;
  let sumParticipation = 0;
  let countParticipation = 0;

  // Distribuição agregada de níveis
  const levelsCountMap = new Map();
  // Distribuição de níveis separada por componente
  const componentLevelsMap = {
    MATEMATICA: new Map(),
    LEITURA: new Map(),
    ESCRITA: new Map(),
    FLUENCIA: new Map(),
  };
  // Habilidades agregadas
  const skillsMap = new Map();

  for (const r of results) {
    if (r.enrolled != null) totalEnrolled += r.enrolled;
    if (r.evaluated != null) totalEvaluated += r.evaluated;

    if (r.participationRate != null) {
      sumParticipation += r.participationRate;
      countParticipation++;
    }
    if (r.averageScore != null) {
      sumAverageScore += r.averageScore;
      countAverageScore++;
    }
    if (r.fluentRate != null) {
      sumFluentRate += r.fluentRate;
      countFluentRate++;
    }
    if (r.pcpm != null) {
      sumPcpm += r.pcpm;
      countPcpm++;
    }

    // Processa níveis de desempenho
    if (Array.isArray(r.performanceLevels)) {
      for (const lvl of r.performanceLevels) {
        const name = lvl.level;
        if (!name) continue;
        const entry = levelsCountMap.get(name) || { name, component: r.component, count: 0, sumPct: 0, samples: 0 };
        if (lvl.count != null) entry.count += lvl.count;
        if (lvl.percentage != null) {
          entry.sumPct += lvl.percentage;
          entry.samples++;
        }
        levelsCountMap.set(name, entry);

        if (r.component && componentLevelsMap[r.component]) {
          const cMap = componentLevelsMap[r.component];
          const cEntry = cMap.get(name) || { name, component: r.component, count: 0, sumPct: 0, samples: 0 };
          if (lvl.count != null) cEntry.count += lvl.count;
          if (lvl.percentage != null) {
            cEntry.sumPct += lvl.percentage;
            cEntry.samples++;
          }
          cMap.set(name, cEntry);
        }
      }
    }

    // Processa habilidades
    if (Array.isArray(r.skills)) {
      for (const sk of r.skills) {
        if (!sk.code) continue;
        const entry = skillsMap.get(sk.code) || { code: sk.code, name: sk.name || sk.code, sumPct: 0, count: 0 };
        if (sk.percentage != null) {
          entry.sumPct += sk.percentage;
          entry.count++;
        }
        skillsMap.set(sk.code, entry);
      }
    }
  }

  const overallParticipation =
    totalEnrolled > 0
      ? Math.round((totalEvaluated / totalEnrolled) * 1000) / 10
      : countParticipation > 0
        ? Math.round((sumParticipation / countParticipation) * 10) / 10
        : null;

  const networkAverageScore = countAverageScore > 0 ? Math.round((sumAverageScore / countAverageScore) * 10) / 10 : null;
  const networkFluentRate = countFluentRate > 0 ? Math.round((sumFluentRate / countFluentRate) * 10) / 10 : null;
  const networkPcpm = countPcpm > 0 ? Math.round((sumPcpm / countPcpm) * 10) / 10 : null;

  // Resumo por componente
  const componentSummaries = Object.keys(CNCA_COMPONENTS).map((compKey) => {
    const compDef = CNCA_COMPONENTS[compKey];
    const compResults = results.filter((r) => r.component === compKey);
    const compDistinctSchools = new Set(compResults.map((r) => r.schoolId)).size;

    let cEnrolled = 0;
    let cEvaluated = 0;
    let cSumScore = 0;
    let cCountScore = 0;
    let cSumFluent = 0;
    let cCountFluent = 0;
    let cSumPcpm = 0;
    let cCountPcpm = 0;
    let cSumPart = 0;
    let cCountPart = 0;

    for (const r of compResults) {
      if (r.enrolled != null) cEnrolled += r.enrolled;
      if (r.evaluated != null) cEvaluated += r.evaluated;
      if (r.participationRate != null) {
        cSumPart += r.participationRate;
        cCountPart++;
      }
      if (r.averageScore != null) {
        cSumScore += r.averageScore;
        cCountScore++;
      }
      if (r.fluentRate != null) {
        cSumFluent += r.fluentRate;
        cCountFluent++;
      }
      if (r.pcpm != null) {
        cSumPcpm += r.pcpm;
        cCountPcpm++;
      }
    }

    const cParticipation =
      cEnrolled > 0
        ? Math.round((cEvaluated / cEnrolled) * 1000) / 10
        : cCountPart > 0
          ? Math.round((cSumPart / cCountPart) * 10) / 10
          : null;
    const cAvgScore = cCountScore > 0 ? Math.round((cSumScore / cCountScore) * 10) / 10 : null;
    const cAvgFluent = cCountFluent > 0 ? Math.round((cSumFluent / cCountFluent) * 10) / 10 : null;
    const cAvgPcpm = cCountPcpm > 0 ? Math.round((cSumPcpm / cCountPcpm) * 10) / 10 : null;

    return {
      component: compKey,
      label: compDef.label,
      icon: compDef.icon,
      color: compDef.color,
      schoolsCount: compDistinctSchools,
      enrolled: cEnrolled,
      evaluated: cEvaluated,
      participationRate: cParticipation,
      averageScore: cAvgScore,
      fluentRate: cAvgFluent,
      pcpm: cAvgPcpm,
      hasData: compResults.length > 0,
    };
  });

  // Formata níveis de desempenho da rede
  const levelsDistribution = Array.from(levelsCountMap.values()).map((l) => ({
    level: l.name,
    component: l.component,
    count: l.count,
    percentage: l.samples > 0 ? Math.round((l.sumPct / l.samples) * 10) / 10 : 0,
  }));

  // Formata níveis de desempenho separados por componente
  const levelsByComponent = {};
  for (const [compKey, cMap] of Object.entries(componentLevelsMap)) {
    levelsByComponent[compKey] = Array.from(cMap.values()).map((l) => ({
      level: l.name,
      component: compKey,
      count: l.count,
      percentage: l.samples > 0 ? Math.round((l.sumPct / l.samples) * 10) / 10 : 0,
    }));
  }

  // Formata habilidades da rede
  const skillsPerformance = Array.from(skillsMap.values())
    .map((s) => ({
      code: s.code,
      name: s.name,
      percentage: s.count > 0 ? Math.round((s.sumPct / s.count) * 10) / 10 : 0,
      evaluatedCount: s.count,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  // Habilidades críticas (< 50%)
  const criticalSkills = skillsPerformance.filter((s) => s.percentage < 50);

  // Nível adequado da rede
  let networkAdequateRate = null;
  const adequateLevel = levelsDistribution.find((l) => {
    const n = (l.level || '').toLowerCase();
    return n.includes('adequado') || n.includes('avançado') || n.includes('avancado');
  });
  if (adequateLevel) {
    networkAdequateRate = adequateLevel.percentage;
  }

  // Média geral de habilidades
  let skillsAverage = null;
  if (skillsPerformance.length > 0) {
    const sum = skillsPerformance.reduce((acc, s) => acc + (s.percentage || 0), 0);
    skillsAverage = Math.round((sum / skillsPerformance.length) * 10) / 10;
  }

  // Resumo de escolas para a tabela comparativa
  const schoolSummaryMap = new Map();
  for (const r of results) {
    if (r.school) {
      const existing = schoolSummaryMap.get(r.schoolId) || {
        id: r.school.id,
        inep: r.school.inep,
        name: r.school.name,
        zone: r.school.zone,
        results: [],
      };
      existing.results.push(r);
      schoolSummaryMap.set(r.schoolId, existing);
    }
  }

  const schoolSummaries = Array.from(schoolSummaryMap.values()).map((sc) => {
    const items = sc.results;
    const sumPart = items.filter((i) => i.participationRate != null).reduce((a, b) => a + b.participationRate, 0);
    const countPart = items.filter((i) => i.participationRate != null).length;

    const sumScore = items.filter((i) => i.averageScore != null).reduce((a, b) => a + b.averageScore, 0);
    const countScore = items.filter((i) => i.averageScore != null).length;

    const sumFluent = items.filter((i) => i.fluentRate != null).reduce((a, b) => a + b.fluentRate, 0);
    const countFluent = items.filter((i) => i.fluentRate != null).length;

    const enrolled = items.filter((i) => i.enrolled != null).reduce((a, b) => Math.max(a, b.enrolled), 0);
    const evaluated = items.filter((i) => i.evaluated != null).reduce((a, b) => Math.max(a, b.evaluated), 0);

    return {
      id: sc.id,
      inep: sc.inep,
      name: sc.name,
      zone: sc.zone,
      enrolled,
      evaluated,
      participationRate: countPart > 0 ? Math.round((sumPart / countPart) * 10) / 10 : null,
      averageScore: countScore > 0 ? Math.round((sumScore / countScore) * 10) / 10 : null,
      fluentRate: countFluent > 0 ? Math.round((sumFluent / countFluent) * 10) / 10 : null,
      componentsEvaluatedCount: items.length,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return {
    kpis: {
      totalNetworkSchools,
      totalParticipatingSchools,
      totalEvaluatedSchools,
      pendingSchoolsCount,
      dataCoveragePercent,
      totalEnrolled,
      totalEvaluated,
      overallParticipation,
      networkAverageScore,
      networkFluentRate,
      networkAdequateRate,
      skillsAverage,
      networkPcpm,
    },
    componentSummaries,
    levelsDistribution,
    levelsByComponent,
    skillsPerformance,
    criticalSkills,
    schoolSummaries,
    resultsCount: results.length,
  };
}

/**
 * Retorna lista de todos os resultados consolidados por escola com filtros e busca.
 */
export async function getCncaSchoolResults(programId, query = {}) {
  const where = { programId };
  if (query.year) where.year = Number(query.year);
  if (query.component && query.component !== 'TODOS') where.component = query.component;
  if (query.grade && query.grade !== 'TODOS') where.grade = query.grade;
  if (query.assessment && query.assessment !== 'TODOS') where.assessment = query.assessment;
  if (query.schoolId && query.schoolId !== 'TODAS') where.schoolId = query.schoolId;
  if (query.status === 'OFICIAL') where.source = 'IMPORTACAO';
  if (query.status === 'RASCUNHO') where.source = 'RASCUNHO';

  if (query.search) {
    const term = String(query.search).trim();
    where.school = {
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { inep: { contains: term } },
      ],
    };
  }

  const results = await prisma.cncaSchoolResult.findMany({
    where,
    include: {
      school: { select: { id: true, inep: true, name: true, zone: true, district: true } },
    },
    orderBy: [
      { school: { name: 'asc' } },
      { grade: 'asc' },
      { component: 'asc' },
      { assessment: 'asc' },
    ],
  });

  return results;
}

/**
 * Retorna os resultados e detalhes completos de uma escola específica dentro do programa CNCA.
 */
export async function getCncaSingleSchoolDetail(programId, schoolId, query = {}) {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
  });
  if (!school) throw notFound('Escola não encontrada');

  const where = { programId, schoolId };
  if (query.year) where.year = Number(query.year);

  const results = await prisma.cncaSchoolResult.findMany({
    where,
    orderBy: [{ grade: 'asc' }, { assessment: 'asc' }, { component: 'asc' }],
  });

  return {
    school,
    results,
  };
}

/**
 * Exclui um resultado específico de escola no CNCA.
 */
export async function deleteCncaSchoolResult(programId, resultId, actor, ip) {
  const existing = await prisma.cncaSchoolResult.findFirst({
    where: { id: resultId, programId },
    include: { school: { select: { name: true, inep: true } } },
  });
  if (!existing) throw notFound('Resultado não encontrado');

  await prisma.cncaSchoolResult.delete({
    where: { id: resultId },
  });

  await audit({
    userId: actor?.id,
    userName: actor?.name || 'técnico',
    action: AuditAction.DELETE,
    entity: 'CncaSchoolResult',
    entityId: resultId,
    metadata: {
      message: `Resultado excluído: Escola ${existing.school?.name} (${existing.component} - ${existing.grade} - ${existing.assessment})`,
      programId,
      schoolId: existing.schoolId,
      component: existing.component,
      grade: existing.grade,
      assessment: existing.assessment,
    },
    ip,
  });

  return {
    success: true,
    message: `Resultado de ${existing.component} da escola "${existing.school?.name}" excluído com sucesso.`,
  };
}

/**
 * Exclui múltiplos resultados de escola no CNCA em lote (por IDs ou por filtros).
 */
export async function bulkDeleteCncaSchoolResults(programId, payload = {}, actor, ip) {
  const { resultIds, component, grade, assessment, status, schoolId } = payload;

  const where = { programId };

  if (Array.isArray(resultIds) && resultIds.length > 0) {
    where.id = { in: resultIds };
  } else {
    if (component && component !== 'TODOS') where.component = component;
    if (grade && grade !== 'TODOS') where.grade = grade;
    if (assessment && assessment !== 'TODOS') where.assessment = assessment;
    if (schoolId && schoolId !== 'TODAS') where.schoolId = schoolId;
    if (status === 'OFICIAL') where.source = 'IMPORTACAO';
    if (status === 'RASCUNHO') where.source = 'RASCUNHO';
  }

  const countBefore = await prisma.cncaSchoolResult.count({ where });
  if (countBefore === 0) {
    return { success: true, deletedCount: 0, message: 'Nenhum resultado encontrado para exclusão.' };
  }

  const deleteResult = await prisma.cncaSchoolResult.deleteMany({ where });

  await audit({
    userId: actor?.id,
    userName: actor?.name || 'técnico',
    action: AuditAction.DELETE,
    entity: 'CncaSchoolResult',
    entityId: programId,
    metadata: {
      message: `${deleteResult.count} resultados do CNCA excluídos em lote`,
      programId,
      filters: payload,
    },
    ip,
  });

  return {
    success: true,
    deletedCount: deleteResult.count,
    message: `${deleteResult.count} resultado(s) excluído(s) com sucesso.`,
  };
}

/**
 * Converte rascunhos em resultados consolidados oficiais (Publicar Rascunhos).
 */
export async function publishCncaSchoolResults(programId, payload = {}, actor, ip) {
  const { resultIds, component, grade, assessment } = payload;

  const where = { programId, source: 'RASCUNHO' };
  if (Array.isArray(resultIds) && resultIds.length > 0) {
    where.id = { in: resultIds };
  } else {
    if (component && component !== 'TODOS') where.component = component;
    if (grade && grade !== 'TODOS') where.grade = grade;
    if (assessment && assessment !== 'TODOS') where.assessment = assessment;
  }

  const updateResult = await prisma.cncaSchoolResult.updateMany({
    where,
    data: { source: 'IMPORTACAO' },
  });

  await audit({
    userId: actor?.id,
    userName: actor?.name || 'técnico',
    action: AuditAction.UPDATE,
    entity: 'CncaSchoolResult',
    entityId: programId,
    metadata: {
      message: `${updateResult.count} resultados de rascunho do CNCA consolidados/publicados`,
      programId,
      filters: payload,
    },
    ip,
  });

  return {
    success: true,
    updatedCount: updateResult.count,
    message: `${updateResult.count} resultado(s) de rascunho publicado(s) como consolidado(s) com sucesso!`,
  };
}

/**
 * Retorna as escolas participantes do ciclo do CNCA.
 */
export async function getCncaParticipatingSchools(programId) {
  const program = await prisma.program.findFirst({
    where: { id: programId, deletedAt: null },
    select: { id: true, year: true, name: true },
  });
  if (!program) throw notFound('Programa não encontrado');

  const totalNetworkSchools = await prisma.school.count({ where: { deletedAt: null } });

  const links = await prisma.programSchool.findMany({
    where: { programId, active: true, school: { deletedAt: null } },
    include: {
      school: {
        select: {
          id: true,
          inep: true,
          name: true,
          zone: true,
          district: true,
          address: true,
          situation: true,
        },
      },
    },
    orderBy: { school: { name: 'asc' } },
  });

  const results = await prisma.cncaSchoolResult.findMany({
    where: { programId },
    select: {
      schoolId: true,
      component: true,
      grade: true,
      assessment: true,
      averageScore: true,
      fluentRate: true,
      pcpm: true,
      participationRate: true,
      source: true,
    },
  });

  const resultsBySchool = new Map();
  for (const r of results) {
    const list = resultsBySchool.get(r.schoolId) || [];
    list.push(r);
    resultsBySchool.set(r.schoolId, list);
  }

  const distinctZones = new Set();

  const schools = links.map((link) => {
    const s = link.school;
    if (s.zone) distinctZones.add(s.zone);
    const items = resultsBySchool.get(s.id) || [];
    const components = [...new Set(items.map((i) => i.component).filter(Boolean))];
    const grades = [...new Set(items.map((i) => i.grade).filter(Boolean))].sort();
    const assessments = [...new Set(items.map((i) => i.assessment).filter(Boolean))];

    const sumScore = items.filter((i) => i.averageScore != null).reduce((acc, i) => acc + i.averageScore, 0);
    const countScore = items.filter((i) => i.averageScore != null).length;

    const sumFluent = items.filter((i) => i.fluentRate != null).reduce((acc, i) => acc + i.fluentRate, 0);
    const countFluent = items.filter((i) => i.fluentRate != null).length;

    const sumPart = items.filter((i) => i.participationRate != null).reduce((acc, i) => acc + i.participationRate, 0);
    const countPart = items.filter((i) => i.participationRate != null).length;

    return {
      id: s.id,
      inep: s.inep,
      name: s.name,
      zone: s.zone,
      district: s.district,
      address: s.address,
      joinedAt: link.joinedAt,
      hasData: items.length > 0,
      resultsCount: items.length,
      componentsCount: components.length,
      components,
      componentsEvaluated: components,
      grades,
      gradesEvaluated: grades,
      assessments,
      averageScore: countScore > 0 ? Math.round((sumScore / countScore) * 10) / 10 : null,
      participationRate: countPart > 0 ? Math.round((sumPart / countPart) * 10) / 10 : null,
      fluentRate: countFluent > 0 ? Math.round((sumFluent / countFluent) * 10) / 10 : null,
    };
  });

  return {
    totalNetworkSchools,
    totalParticipatingSchools: schools.length,
    schoolsWithData: schools.filter((s) => s.hasData).length,
    schoolsWithoutData: schools.filter((s) => !s.hasData).length,
    distinctZones: Array.from(distinctZones).sort(),
    schools,
  };
}

/**
 * Retorna as escolas da rede geral municipal que ainda NÃO participam deste ciclo do CNCA,
 * permitindo ao técnico adicioná-las manualmente.
 */
export async function getAvailableSchoolsToAdd(programId) {
  const program = await prisma.program.findFirst({
    where: { id: programId, deletedAt: null },
    select: { id: true, year: true, name: true },
  });
  if (!program) throw notFound('Programa não encontrado');

  const existingLinks = await prisma.programSchool.findMany({
    where: { programId, active: true },
    select: { schoolId: true },
  });
  const linkedIds = new Set(existingLinks.map((l) => l.schoolId));

  const allSchools = await prisma.school.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      inep: true,
      name: true,
      zone: true,
      district: true,
      address: true,
      situation: true,
    },
    orderBy: { name: 'asc' },
  });

  const availableSchools = allSchools.filter((s) => !linkedIds.has(s.id));

  return {
    totalNetworkSchools: allSchools.length,
    totalParticipatingSchools: linkedIds.size,
    availableCount: availableSchools.length,
    availableSchools,
  };
}

/**
 * Adiciona manualmente uma escola existente da rede como participante deste ciclo do CNCA.
 */
export async function addCncaParticipatingSchool(programId, schoolId, actor, ip) {
  const program = await prisma.program.findFirst({
    where: { id: programId, deletedAt: null },
    select: { id: true, name: true, year: true },
  });
  if (!program) throw notFound('Programa não encontrado');

  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: { id: true, inep: true, name: true },
  });
  if (!school) throw notFound('Escola não encontrada no cadastro da rede municipal');

  const link = await prisma.programSchool.upsert({
    where: { programId_schoolId: { programId, schoolId } },
    create: { programId, schoolId, active: true },
    update: { active: true },
  });

  await audit({
    userId: actor?.id,
    userName: actor?.name || 'técnico',
    action: AuditAction.CREATE,
    entity: 'ProgramSchool',
    entityId: link.id,
    metadata: {
      message: `Escola ${school.name} (INEP: ${school.inep}) adicionada como participante do CNCA ${program.year}`,
      programId,
      schoolId,
    },
    ip,
  });

  return {
    success: true,
    message: `Escola "${school.name}" (INEP: ${school.inep}) adicionada com sucesso ao CNCA ${program.year}!`,
    school,
  };
}

/**
 * Remove a participação de uma escola neste ciclo do CNCA.
 */
export async function removeCncaParticipatingSchool(programId, schoolId, actor, ip) {
  const program = await prisma.program.findFirst({
    where: { id: programId, deletedAt: null },
    select: { id: true, name: true, year: true },
  });
  if (!program) throw notFound('Programa não encontrado');

  const link = await prisma.programSchool.findUnique({
    where: { programId_schoolId: { programId, schoolId } },
    include: { school: { select: { id: true, inep: true, name: true } } },
  });
  if (!link) throw notFound('Escola não está vinculada a este ciclo do CNCA');

  await prisma.programSchool.delete({
    where: { programId_schoolId: { programId, schoolId } },
  });

  await audit({
    userId: actor?.id,
    userName: actor?.name || 'técnico',
    action: AuditAction.DELETE,
    entity: 'ProgramSchool',
    entityId: link.id,
    metadata: {
      message: `Escola ${link.school.name} (INEP: ${link.school.inep}) desvinculada do CNCA ${program.year}`,
      programId,
      schoolId,
    },
    ip,
  });

  return {
    success: true,
    message: `Escola "${link.school.name}" removida dos participantes do CNCA ${program.year}.`,
  };
}

/**
 * Remove múltiplas escolas participantes deste ciclo do CNCA em lote.
 */
export async function bulkRemoveCncaParticipatingSchools(programId, payload = {}, actor, ip) {
  const { schoolIds, onlyWithoutData } = payload;
  const program = await prisma.program.findFirst({
    where: { id: programId, deletedAt: null },
    select: { id: true, name: true, year: true },
  });
  if (!program) throw notFound('Programa não encontrado');

  let targetSchoolIds = [];

  if (onlyWithoutData) {
    const results = await prisma.cncaSchoolResult.findMany({
      where: { programId },
      select: { schoolId: true },
      distinct: ['schoolId'],
    });
    const schoolsWithData = new Set(results.map((r) => r.schoolId));

    const links = await prisma.programSchool.findMany({
      where: { programId, active: true },
      select: { schoolId: true },
    });

    targetSchoolIds = links.map((l) => l.schoolId).filter((id) => !schoolsWithData.has(id));
  } else if (Array.isArray(schoolIds) && schoolIds.length > 0) {
    targetSchoolIds = schoolIds;
  }

  if (!targetSchoolIds.length) {
    return { success: true, removedCount: 0, message: 'Nenhuma escola selecionada para desvinculação.' };
  }

  const deleteResult = await prisma.programSchool.deleteMany({
    where: {
      programId,
      schoolId: { in: targetSchoolIds },
    },
  });

  await audit({
    userId: actor?.id,
    userName: actor?.name || 'técnico',
    action: AuditAction.DELETE,
    entity: 'ProgramSchool',
    entityId: programId,
    metadata: {
      message: `${deleteResult.count} escolas desvinculadas em lote do CNCA ${program.year}`,
      programId,
      schoolIds: targetSchoolIds,
    },
    ip,
  });

  return {
    success: true,
    removedCount: deleteResult.count,
    message: `${deleteResult.count} escola(s) desvinculada(s) com sucesso do ciclo CNCA ${program.year}.`,
  };
}

/**
 * Calcula o Ranking Oficial das escolas no CNCA com base no indicador oficial selecionado.
 */
export async function getCncaRanking(programId, query = {}) {
  const program = await prisma.program.findFirst({
    where: { id: programId, deletedAt: null },
    select: { id: true, year: true, name: true },
  });
  if (!program) throw notFound('Programa não encontrado');

  const selectedIndicatorId = query.indicator || 'FLUENCIA_FLUENTES';
  const indicatorConfig =
    CNCA_RANKING_INDICATORS.find((i) => i.id === selectedIndicatorId) || CNCA_RANKING_INDICATORS[0];

  const where = { programId };
  if (query.year) where.year = Number(query.year);
  if (query.grade && query.grade !== 'TODOS') where.grade = query.grade;
  if (query.assessment && query.assessment !== 'TODOS') where.assessment = query.assessment;
  if (query.status === 'OFICIAL') where.source = 'IMPORTACAO';
  if (query.status === 'RASCUNHO') where.source = 'RASCUNHO';

  if (indicatorConfig.component !== 'GERAL') {
    where.component = indicatorConfig.component;
  }

  const results = await prisma.cncaSchoolResult.findMany({
    where,
    include: {
      school: { select: { id: true, inep: true, name: true, zone: true } },
    },
  });

  const schoolResultsMap = new Map();
  for (const r of results) {
    if (!r.school) continue;
    const list = schoolResultsMap.get(r.schoolId) || [];
    list.push(r);
    schoolResultsMap.set(r.schoolId, list);
  }

  const rankedSchools = [];

  for (const [schoolId, items] of schoolResultsMap.entries()) {
    const school = items[0].school;
    let rankValue = null;
    let enrolled = 0;
    let evaluated = 0;
    let sumPart = 0;
    let countPart = 0;

    for (const it of items) {
      if (it.enrolled != null) enrolled = Math.max(enrolled, it.enrolled);
      if (it.evaluated != null) evaluated = Math.max(evaluated, it.evaluated);
      if (it.participationRate != null) {
        sumPart += it.participationRate;
        countPart++;
      }
    }

    const participationRate =
      enrolled > 0
        ? Math.round((evaluated / enrolled) * 1000) / 10
        : countPart > 0
          ? Math.round((sumPart / countPart) * 10) / 10
          : null;

    if (indicatorConfig.id === 'FLUENCIA_FLUENTES') {
      const fluents = items.map((i) => i.fluentRate).filter((v) => v != null);
      if (fluents.length) rankValue = Math.round((fluents.reduce((a, b) => a + b, 0) / fluents.length) * 10) / 10;
    } else if (indicatorConfig.id === 'FLUENCIA_PCPM') {
      const pcpms = items.map((i) => i.pcpm).filter((v) => v != null);
      if (pcpms.length) rankValue = Math.round((pcpms.reduce((a, b) => a + b, 0) / pcpms.length) * 10) / 10;
    } else if (indicatorConfig.id === 'FLUENCIA_PRECISAO') {
      const precs = items.map((i) => i.accuracyRate).filter((v) => v != null);
      if (precs.length) rankValue = Math.round((precs.reduce((a, b) => a + b, 0) / precs.length) * 10) / 10;
    } else if (indicatorConfig.id === 'MATEMATICA_PROFICIENCIA' || indicatorConfig.id === 'LEITURA_PROFICIENCIA' || indicatorConfig.id === 'ESCRITA_PROFICIENCIA') {
      const scores = items.map((i) => i.averageScore).filter((v) => v != null);
      if (scores.length) rankValue = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    } else if (indicatorConfig.id === 'ESCRITA_ALFABETICO') {
      const alfas = items.map((i) => i.fluentRate).filter((v) => v != null);
      if (alfas.length) rankValue = Math.round((alfas.reduce((a, b) => a + b, 0) / alfas.length) * 10) / 10;
    } else if (indicatorConfig.id === 'MATEMATICA_ADEQUADO' || indicatorConfig.id === 'LEITURA_ADEQUADO') {
      let totalAdequate = 0;
      let count = 0;
      for (const it of items) {
        if (Array.isArray(it.performanceLevels)) {
          const adeq = it.performanceLevels
            .filter((l) => {
              const n = (l.level || '').toLowerCase();
              return n.includes('adequado') || n.includes('avançado') || n.includes('avancado');
            })
            .reduce((s, l) => s + (l.percentage || 0), 0);
          totalAdequate += adeq;
          count++;
        }
      }
      if (count) rankValue = Math.round((totalAdequate / count) * 10) / 10;
    } else if (indicatorConfig.id === 'PARTICIPACAO') {
      rankValue = participationRate;
    } else {
      const scores = items.map((i) => i.averageScore || i.fluentRate).filter((v) => v != null);
      if (scores.length) rankValue = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    }

    const mainItem = items[0];

    rankedSchools.push({
      schoolId,
      inep: school.inep,
      name: school.name,
      zone: school.zone,
      enrolled,
      evaluated,
      participationRate,
      rankValue,
      unit: indicatorConfig.unit,
      performanceLevels: mainItem?.performanceLevels || [],
      componentsCount: items.length,
    });
  }

  rankedSchools.sort((a, b) => {
    const valA = a.rankValue ?? -999;
    const valB = b.rankValue ?? -999;
    if (valB !== valA) return valB - valA;
    const partA = a.participationRate ?? 0;
    const partB = b.participationRate ?? 0;
    if (partB !== partA) return partB - partA;
    return a.name.localeCompare(b.name);
  });

  for (let i = 0; i < rankedSchools.length; i++) {
    if (i > 0) {
      const prev = rankedSchools[i - 1];
      const curr = rankedSchools[i];
      if (curr.rankValue === prev.rankValue && curr.participationRate === prev.participationRate) {
        curr.position = prev.position;
      } else {
        curr.position = i + 1;
      }
    } else {
      rankedSchools[i].position = 1;
    }
  }

  return {
    indicator: indicatorConfig,
    availableIndicators: CNCA_RANKING_INDICATORS,
    ranking: rankedSchools,
    podium: rankedSchools.slice(0, 3),
    totalSchools: rankedSchools.length,
  };
}
