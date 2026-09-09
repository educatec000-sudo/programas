import { prisma } from '../lib/prisma.js';
import {
  loadScope,
  computeRanking,
  evolutionSeries,
  classificationDistribution,
  comparePrograms,
  goalsStatus,
} from './scoring.service.js';
import { PACTO_CATALOG_CODE } from '../programs/pacto/config.js';

const ASSESSMENT_ORDER = { A0: 0, A1: 1, A2: 2, A3: 3 };

async function calculatePactoDashboardData(programId) {
  const program = await prisma.program.findFirst({
    where: { id: programId, deletedAt: null },
    select: { id: true, code: true, name: true, year: true, status: true },
  });
  if (!program) return null;

  const classes = await prisma.pactoClass.findMany({
    where: { programId, active: true, school: { deletedAt: null } },
    include: {
      school: { select: { id: true, inep: true, name: true } },
      assessments: {
        include: {
          components: {
            include: { results: true },
          },
        },
      },
    },
    orderBy: [{ grade: 'asc' }, { shift: 'asc' }, { name: 'asc' }],
  });

  const schoolAggregates = new Map();
  let greenCount = 0;
  let yellowCount = 0;
  let redCount = 0;

  // Initialize schools
  for (const c of classes) {
    const school = c.school;
    if (!schoolAggregates.has(school.id)) {
      schoolAggregates.set(school.id, {
        schoolId: school.id,
        name: school.name,
        inep: school.inep,
        enrolled: 0,
        evaluated: 0,
        classesCount: 0,
        completedCodes: new Set(),
        expectedCodes: new Set(),
        green: 0,
        yellow: 0,
        red: 0,
      });
    }
    const schoolAgg = schoolAggregates.get(school.id);
    schoolAgg.classesCount += 1;

    const isPii = Number(c.grade) === 0;
    const defaultAssessments = isPii ? ['A1', 'A2'] : ['A0', 'A1', 'A2', 'A3'];
    const enabled = c.enabledAssessments && c.enabledAssessments.length > 0 ? c.enabledAssessments : defaultAssessments;
    enabled.forEach((code) => {
      if (isPii ? ['A1', 'A2'].includes(code) : ['A0', 'A1', 'A2', 'A3'].includes(code)) {
        schoolAgg.expectedCodes.add(code);
      }
    });

    // Mark completed codes across all assessments of this class
    for (const a of c.assessments) {
      if (a.status === 'ENVIADO' || (a.components && a.components.some((comp) => (comp.evaluated || 0) > 0))) {
        schoolAgg.completedCodes.add(a.code);
      }
    }

    // Determine the latest assessment for this class
    const availableWithData = (c.assessments || []).filter((a) => (
      a.status === 'ENVIADO'
      || a.status === 'RASCUNHO'
      || a.status === 'REABERTO'
      || (a.components && a.components.some((comp) => (comp.evaluated || 0) > 0 || (comp.results && comp.results.length > 0)))
    ));

    const sortedAssessments = [...availableWithData].sort((a, b) => (
      (ASSESSMENT_ORDER[b.code] ?? 0) - (ASSESSMENT_ORDER[a.code] ?? 0)
    ));
    const latestAssessment = sortedAssessments[0] || null;

    if (latestAssessment && latestAssessment.components && latestAssessment.components.length > 0) {
      // Deduplicate students across subject components (Português and Matemática in same assessment)
      const classEnrolled = Math.max(...latestAssessment.components.map((comp) => comp.enrolled || 0), 0);
      const classEvaluated = Math.max(...latestAssessment.components.map((comp) => comp.evaluated || 0), 0);

      schoolAgg.enrolled += classEnrolled;
      schoolAgg.evaluated += classEvaluated;

      // Extract skills for the latest assessment
      for (const comp of latestAssessment.components) {
        for (const r of comp.results) {
          if (['DESENVOLVIDO', 'LEITOR_FLUENTE', 'COMPREENDE_AUTONOMAMENTE', 'ALFABETICO_COMPLETO', 'PROFICIENTE'].includes(r.level)) {
            greenCount += r.count;
            schoolAgg.green += r.count;
          } else if (['EM_DESENVOLVIMENTO', 'LEITOR_INICIAL', 'COMPREENDE_ORALIDADE', 'ALFABETICO_INICIAL', 'PROFICIENTE_INICIAL'].includes(r.level)) {
            yellowCount += r.count;
            schoolAgg.yellow += r.count;
          } else {
            redCount += r.count;
            schoolAgg.red += r.count;
          }
        }
      }
    }
  }

  const totalResponses = greenCount + yellowCount + redCount;
  const overallScore = totalResponses > 0
    ? Math.round(((greenCount * 1.0 + yellowCount * 0.5) / totalResponses) * 100)
    : null;

  // Municipality-wide enrolled and evaluated (sum of schools based on latest assessment)
  const totalEnrolled = [...schoolAggregates.values()].reduce((sum, s) => sum + s.enrolled, 0);
  const totalEvaluated = [...schoolAggregates.values()].reduce((sum, s) => sum + s.evaluated, 0);

  const participationPercentage = totalEnrolled > 0
    ? Math.round((totalEvaluated / totalEnrolled) * 100)
    : 0;

  const rankedSchools = [...schoolAggregates.values()].map((s) => {
    const sTotal = s.green + s.yellow + s.red;
    const score = sTotal > 0 ? Math.round(((s.green * 1.0 + s.yellow * 0.5) / sTotal) * 100) : null;
    const partPct = s.enrolled > 0 ? Math.round((s.evaluated / s.enrolled) * 100) : 0;
    const expectedList = Array.from(s.expectedCodes).sort();
    const completedList = Array.from(s.completedCodes).sort();
    const missing = expectedList.filter((code) => !completedList.includes(code));
    const expectedCount = expectedList.length;
    const completedCount = completedList.length;
    const isComplete = missing.length === 0 && (expectedCount === 0 || completedCount >= expectedCount);
    const completenessPercentage = expectedCount > 0 ? Math.min(100, Math.round((completedCount / expectedCount) * 100)) : 100;
    const rankingScore = score !== null
      ? Math.round(((score * 0.50) + (partPct * 0.20) + (completenessPercentage * 0.30)) * 10) / 10
      : null;

    let situationLabel = 'Sem dados';
    let situationCls = 'badge-gray';
    let classificationLetter = 'E';
    if (score !== null) {
      if (score >= 80) { situationLabel = 'Excelente'; situationCls = 'badge-green'; classificationLetter = 'A'; }
      else if (score >= 60) { situationLabel = 'Bom desempenho'; situationCls = 'badge-green'; classificationLetter = 'B'; }
      else if (score >= 40) { situationLabel = 'Atenção'; situationCls = 'badge-yellow'; classificationLetter = 'C'; }
      else { situationLabel = 'Crítico'; situationCls = 'badge-red'; classificationLetter = 'D'; }
    }

    return {
      schoolId: s.schoolId,
      name: s.name,
      inep: s.inep,
      enrolled: s.enrolled,
      evaluated: s.evaluated,
      participationPercentage: partPct,
      score,
      rankingScore,
      isComplete,
      missingAssessments: missing,
      completenessPercentage,
      completenessLabel: `${completedCount}/${expectedCount}`,
      classification: classificationLetter,
      situation: { label: situationLabel, cls: situationCls },
    };
  }).filter((s) => s.score !== null && s.evaluated > 0)
    .sort((a, b) => (
      (b.rankingScore ?? 0) - (a.rankingScore ?? 0)
      || (b.completenessPercentage ?? 0) - (a.completenessPercentage ?? 0)
      || (b.score ?? 0) - (a.score ?? 0)
      || (b.participationPercentage ?? 0) - (a.participationPercentage ?? 0)
      || b.evaluated - a.evaluated
      || (a.name || '').localeCompare(b.name || '')
    ));

  rankedSchools.forEach((s, idx) => {
    s.position = idx + 1;
  });

  return {
    score: overallScore,
    participationPercentage,
    enrolled: totalEnrolled,
    evaluated: totalEvaluated,
    classesCount: classes.length,
    participatingSchools: schoolAggregates.size,
    levelDistribution: [
      { classification: 'Desenvolvido', count: greenCount, percentage: totalResponses ? Math.round((greenCount / totalResponses) * 100) : 0 },
      { classification: 'Em Desenvolvimento', count: yellowCount, percentage: totalResponses ? Math.round((yellowCount / totalResponses) * 100) : 0 },
      { classification: 'Por Desenvolver', count: redCount, percentage: totalResponses ? Math.round((redCount / totalResponses) * 100) : 0 },
    ],
    topSchools: rankedSchools.slice(0, 5),
    totalResponses,
  };
}

/**
 * Dashboard estatístico. Consolida informações reais de todos os programas
 * (tanto genéricos quanto especializados como o Pacto).
 */
export async function getDashboard({ year, programId } = {}) {
  const latestYearRow = await prisma.result.findFirst({
    where: programId ? { programId } : undefined,
    orderBy: { year: 'desc' },
    select: { year: true },
  });
  const targetYear = year ? Number(year) : latestYearRow?.year ?? new Date().getFullYear();

  // 1. Dados básicos e contagens consolidadas da plataforma
  const [
    selectedProgram,
    programsActive,
    programsTotal,
    schoolsTotal,
    genericIndicatorsActive,
    genericResultsTotal,
    genericResultsThisYear,
    genericParticipatingRows,
    pactoClasses,
    pactoSkillCount,
    mapSchools,
  ] = await Promise.all([
    programId
      ? prisma.program.findFirst({
          where: { id: programId, deletedAt: null },
          select: { id: true, code: true, name: true, year: true, status: true, catalog: { select: { code: true } } },
        })
      : Promise.resolve(null),
    prisma.program.count({ where: { deletedAt: null, status: 'EM_EXECUCAO' } }),
    prisma.program.count({ where: { deletedAt: null } }),
    prisma.school.count({ where: { deletedAt: null } }),
    programId
      ? prisma.programIndicator.count({
          where: { programId, active: true, indicator: { deletedAt: null, status: 'ATIVO' } },
        })
      : prisma.indicator.count({ where: { deletedAt: null, status: 'ATIVO' } }),
    prisma.result.count({ where: programId ? { programId } : undefined }),
    prisma.result.count({ where: { year: targetYear, ...(programId && { programId }) } }),
    prisma.programSchool.findMany({
      where: {
        active: true,
        program: { deletedAt: null },
        ...(programId && { programId }),
      },
      distinct: ['schoolId'],
      select: { schoolId: true },
    }),
    prisma.pactoClass.findMany({
      where: {
        active: true,
        program: { deletedAt: null },
        ...(programId && { programId }),
      },
      select: { schoolId: true, programId: true },
    }),
    prisma.pactoSkillResult.count({
      where: {
        component: {
          assessment: {
            class: {
              active: true,
              program: { deletedAt: null },
              ...(programId && { programId }),
            },
          },
        },
      },
    }),
    prisma.school.findMany({
      where: {
        deletedAt: null,
        latitude: { not: null },
        longitude: { not: null },
        ...(programId && { programs: { some: { programId, active: true } } }),
      },
      select: {
        id: true,
        inep: true,
        name: true,
        address: true,
        responsible: true,
        zone: true,
        latitude: true,
        longitude: true,
      },
      orderBy: { name: 'asc' },
      take: 1000,
    }),
  ]);

  // Consolidar escolas participantes únicas (vínculos genéricos + turmas do Pacto)
  const participatingSchoolIds = new Set([
    ...genericParticipatingRows.map((r) => r.schoolId),
    ...pactoClasses.map((c) => c.schoolId),
  ]);

  const isPactoProgram = selectedProgram?.catalog?.code === PACTO_CATALOG_CODE;
  const resultsTotal = isPactoProgram
    ? pactoSkillCount
    : selectedProgram
      ? genericResultsTotal
      : genericResultsTotal + pactoSkillCount;
  const resultsThisYear = isPactoProgram
    ? pactoSkillCount
    : selectedProgram
      ? genericResultsThisYear
      : genericResultsThisYear + pactoSkillCount;
  const indicatorsActive = isPactoProgram
    ? 3 // Habilidades centrais do Pacto
    : genericIndicatorsActive;

  // 2. Gráficos e métricas de desempenho específicos
  let goalsData = { totals: { met: 0, notMet: 0, schools: 0 } };
  let performance = { programs: [] };
  let evolution = [];
  let distribution = { distribution: {} };
  let topSchools = { rows: [] };
  let pactoData = null;

  if (isPactoProgram) {
    pactoData = await calculatePactoDashboardData(programId);
    if (pactoData) {
      topSchools = { rows: pactoData.topSchools };
      distribution = {
        distribution: Object.fromEntries(
          pactoData.levelDistribution.map((l) => [l.classification, l.count]),
        ),
      };
    }
  } else if (programId) {
    try {
      const scope = await loadScope({ programId, year: targetYear });
      const [ranking, evo] = await Promise.all([
        computeRanking({ programId, year: targetYear, scope }),
        evolutionSeries({ programId, year: targetYear, scope }),
      ]);
      evolution = evo;
      distribution = await classificationDistribution({ ranking });
      goalsData = await goalsStatus({ ranking });
      topSchools = { rows: ranking.rows.slice(0, 5) };
    } catch {
      // Continua sem quebrar se o programa não tiver pontuação consolidada
    }
  } else {
    try {
      performance = await comparePrograms({ year: targetYear });
    } catch {
      // Continua sem quebrar
    }
  }

  // Se não foi selecionado programa específico, calcular dados do Pacto para somar alunos da rede
  let municipalityPactoData = pactoData;
  if (!programId && pactoClasses.length > 0) {
    const pactoProg = await prisma.program.findFirst({
      where: { catalog: { code: PACTO_CATALOG_CODE }, deletedAt: null },
      select: { id: true },
    });
    if (pactoProg) {
      municipalityPactoData = await calculatePactoDashboardData(pactoProg.id);
    }
  }

  const enrolledStudents = municipalityPactoData?.enrolled ?? 0;
  const evaluatedStudents = municipalityPactoData?.evaluated ?? 0;

  // Lista consolidada de programas com cobertura real para tabela executiva
  const allProgramsList = await prisma.program.findMany({
    where: { deletedAt: null },
    include: {
      catalog: { select: { code: true } },
      _count: { select: { schools: { where: { active: true } }, results: true } },
    },
    orderBy: [{ year: 'desc' }, { name: 'asc' }],
    take: 20,
  });

  const programsSummary = allProgramsList.map((p) => {
    const isPacto = p.catalog?.code === PACTO_CATALOG_CODE;
    const pSchools = isPacto
      ? new Set(pactoClasses.filter((c) => c.programId === p.id).map((c) => c.schoolId)).size || p._count.schools
      : p._count.schools;
    const pResults = isPacto ? pactoSkillCount : p._count.results;
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      year: p.year,
      status: p.status,
      isPacto,
      schoolsCount: pSchools,
      resultsCount: pResults,
      studentsEvaluated: isPacto ? (municipalityPactoData?.evaluated ?? null) : null,
    };
  });

  return {
    selectedProgram: selectedProgram ? { ...selectedProgram, isPacto: isPactoProgram } : null,
    kpis: {
      programsActive,
      programsTotal,
      schoolsTotal,
      participatingSchools: participatingSchoolIds.size,
      studentsEnrolled: enrolledStudents,
      studentsEvaluated: evaluatedStudents,
      indicatorsActive,
      resultsTotal,
      resultsThisYear,
      goalsMet: goalsData.totals.met,
      goalsNotMet: goalsData.totals.notMet,
      pactoScore: pactoData?.score ?? null,
      pactoParticipation: pactoData?.participationPercentage ?? null,
    },
    year: targetYear,
    map: {
      schools: mapSchools,
      total: mapSchools.length,
    },
    pacto: pactoData,
    programsSummary,
    charts: {
      performanceByProgram: (performance.programs || []).slice(0, 10).map((program) => ({
        id: program.programId,
        name: program.code,
        fullName: program.programName,
        score: program.currentScore,
        schools: program.schoolsCount,
      })),
      evolution: evolution.map((entry) => ({
        label: entry.label,
        score: entry.avgScore,
        schools: entry.schoolsCount,
      })),
      distribution: Object.entries(distribution.distribution || {}).map(([classification, count]) => ({
        classification,
        count,
      })),
      topSchools: topSchools.rows.map((row) => ({
        schoolId: row.schoolId,
        position: row.position,
        name: row.name || row.schoolName,
        inep: row.inep || row.schoolInep,
        score: row.score,
        rankingScore: row.rankingScore,
        isComplete: row.isComplete,
        missingAssessments: row.missingAssessments,
        completenessLabel: row.completenessLabel,
        classification: row.classification,
        situation: row.situation,
        enrolled: row.enrolled,
        evaluated: row.evaluated,
        participationPercentage: row.participationPercentage,
      })),
    },
  };
}
