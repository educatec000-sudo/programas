import { prisma } from '../../lib/prisma.js';
import { notFound, conflict, HttpError } from '../../lib/errors.js';
import { audit, AuditAction } from '../../lib/audit.js';
import {
  SISPAE_CATALOG_CODE,
  SISPAE_DEFAULT_YEAR,
  SISPAE_COMPONENTS,
  SISPAE_PERFORMANCE_LEVELS,
  SISPAE_APPLICATION_TYPES,
  normalizeSispaeText,
} from './config.js';
import { resolveSispaeProgram, resolveSispaeApplication } from './import.js';

/**
 * Utilitário para arredondar casas decimais.
 */
function round(val, decimals = 1) {
  if (val == null || !Number.isFinite(val)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

/**
 * Extrai percentuais padronizados de níveis de desempenho do JSON.
 */
export function extractPerformanceRates(performanceLevels = []) {
  if (!Array.isArray(performanceLevels)) return { deficitRate: null, intermediateRate: null, adequateRate: null };

  let deficit = 0;
  let intermediate = 0;
  let adequate = 0;
  let hasDeficit = false;
  let hasIntermediate = false;
  let hasAdequate = false;

  for (const item of performanceLevels) {
    const lvlName = normalizeSispaeText(item.level || item.name || '');
    const pct = Number(item.percentage ?? item.percent ?? item.value ?? 0);

    if (
      lvlName.includes('defasagem') ||
      lvlName.includes('inadequado') ||
      lvlName.includes('muito critico') ||
      lvlName.includes('muito crítico') ||
      lvlName.includes('critico') ||
      lvlName.includes('crítico') ||
      lvlName.includes('muito baixo') ||
      lvlName.includes('abaixo')
    ) {
      deficit += pct;
      hasDeficit = true;
    } else if (
      lvlName.includes('intermediario') ||
      lvlName.includes('intermediário') ||
      lvlName.includes('insuficiente') ||
      lvlName.includes('insatisfatorio') ||
      lvlName.includes('insatisfatório') ||
      lvlName.includes('basico') ||
      lvlName.includes('básico') ||
      lvlName === 'medio' ||
      lvlName === 'médio'
    ) {
      intermediate += pct;
      hasIntermediate = true;
    } else if (
      lvlName.includes('adequado') ||
      lvlName.includes('satisfatorio') ||
      lvlName.includes('satisfatório') ||
      lvlName.includes('avancado') ||
      lvlName.includes('avançado') ||
      lvlName.includes('proficiente') ||
      lvlName.includes('alto')
    ) {
      adequate += pct;
      hasAdequate = true;
    }
  }

  return {
    deficitRate: hasDeficit ? round(deficit) : null,
    intermediateRate: hasIntermediate ? round(intermediate) : null,
    adequateRate: hasAdequate ? round(adequate) : null,
  };
}

/**
 * Lista todas as aplicações de um programa SisPAE.
 */
export async function getSispaeApplications(programId) {
  const program = await resolveSispaeProgram(programId);
  const applications = await prisma.sispaeApplication.findMany({
    where: { programId: program.id },
    include: {
      _count: {
        select: { results: true },
      },
    },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  return applications.map((app) => ({
    id: app.id,
    name: app.name,
    type: app.type,
    typeInfo: SISPAE_APPLICATION_TYPES[app.type] || SISPAE_APPLICATION_TYPES.SIMULADO,
    year: app.year,
    stage: app.stage,
    description: app.description,
    status: app.status,
    startDate: app.startDate,
    endDate: app.endDate,
    resultsCount: app._count.results,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  }));
}

/**
 * Cria uma nova aplicação (Simulado ou Avaliação Oficial).
 */
export async function createSispaeApplication(programId, data = {}, actor = null, ip = null) {
  const program = await resolveSispaeProgram(programId, data.year);
  const name = String(data.name || '').trim();
  if (!name) throw new HttpError(400, 'O nome da aplicação é obrigatório.');

  const type = data.type === 'AVALIACAO_OFICIAL' ? 'AVALIACAO_OFICIAL' : 'SIMULADO';
  const year = Number(data.year) || program.year || SISPAE_DEFAULT_YEAR;

  const existing = await prisma.sispaeApplication.findFirst({
    where: { programId: program.id, name, year },
  });
  if (existing) {
    throw conflict(`Já existe uma aplicação com o nome "${name}" para o ano ${year}.`);
  }

  const application = await prisma.sispaeApplication.create({
    data: {
      programId: program.id,
      name,
      type,
      year,
      stage: data.stage || 'Alfabetização',
      description: data.description || null,
      status: data.status || 'PUBLICADA',
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
    },
  });

  if (actor) {
    await audit({
      userId: actor.id,
      userName: actor.name,
      action: AuditAction.CREATE,
      entity: 'SispaeApplication',
      entityId: application.id,
      metadata: { name, type, year, programId: program.id },
      ip,
    });
  }

  return application;
}

/**
 * Atualiza metadados de uma aplicação.
 */
export async function updateSispaeApplication(programId, applicationId, data = {}, actor = null, ip = null) {
  const application = await prisma.sispaeApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) throw notFound('Aplicação não encontrada.');

  const updated = await prisma.sispaeApplication.update({
    where: { id: applicationId },
    data: {
      ...(data.name && { name: String(data.name).trim() }),
      ...(data.type && { type: data.type }),
      ...(data.stage && { stage: data.stage }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status && { status: data.status }),
      ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
      ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
    },
  });

  if (actor) {
    await audit({
      userId: actor.id,
      userName: actor.name,
      action: AuditAction.UPDATE,
      entity: 'SispaeApplication',
      entityId: applicationId,
      metadata: { changes: data },
      ip,
    });
  }

  return updated;
}

/**
 * Exclui uma aplicação e todos os seus resultados associados.
 */
export async function deleteSispaeApplication(programId, applicationId, actor = null, ip = null) {
  const application = await prisma.sispaeApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) throw notFound('Aplicação não encontrada.');

  const resultsCount = await prisma.sispaeSchoolResult.count({
    where: { applicationId },
  });

  await prisma.sispaeApplication.delete({
    where: { id: applicationId },
  });

  if (actor) {
    await audit({
      userId: actor.id,
      userName: actor.name,
      action: AuditAction.DELETE,
      entity: 'SispaeApplication',
      entityId: applicationId,
      metadata: { name: application.name, type: application.type, resultsDeleted: resultsCount },
      ip,
    });
  }

  return { success: true, deletedResults: resultsCount };
}

/**
 * Dashboard principal do SisPAE.
 * Garante que os dados sejam estritamente filtrados pela aplicação selecionada.
 */
export async function getSispaeDashboard(programId, query = {}) {
  const program = await resolveSispaeProgram(programId, query.year);
  const targetProgramId = program.id;

  // Busca todas as aplicações do programa para o seletor
  const allApplications = await prisma.sispaeApplication.findMany({
    where: { programId: targetProgramId },
    include: { _count: { select: { results: true } } },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  // Se não houver nenhuma aplicação cadastrada, cria a padrão
  let currentApp = null;
  if (!allApplications.length) {
    currentApp = await resolveSispaeApplication(targetProgramId, {
      name: 'Simulado Pará 2026 – Alfabetização',
      type: 'SIMULADO',
      year: program.year || SISPAE_DEFAULT_YEAR,
      stage: 'Alfabetização',
    });
    allApplications.push({
      ...currentApp,
      _count: { results: 0 },
    });
  } else if (query.applicationId) {
    currentApp = allApplications.find((a) => a.id === query.applicationId) || allApplications[0];
  } else {
    currentApp = allApplications[0];
  }

  // Filtros aplicados
  const componentFilter = query.component && query.component !== 'ALL' ? query.component : null;
  const gradeFilter = query.grade && query.grade !== 'ALL' ? query.grade : null;
  const search = String(query.search || '').trim().toLowerCase();

  // Busca resultados vinculados ESTRITAMENTE à aplicação atual
  const where = {
    programId: targetProgramId,
    applicationId: currentApp.id,
    ...(componentFilter && { component: componentFilter }),
    ...(gradeFilter && { grade: gradeFilter }),
    school: { deletedAt: null },
    ...(search && {
      school: {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { inep: { contains: search } },
        ],
      },
    }),
  };

  const results = await prisma.sispaeSchoolResult.findMany({
    where,
    include: {
      school: {
        select: {
          id: true,
          inep: true,
          name: true,
          zone: true,
          schoolType: true,
          latitude: true,
          longitude: true,
        },
      },
    },
    orderBy: [{ school: { name: 'asc' } }, { component: 'asc' }],
  });

  // Agregações Gerais
  const participatingSchoolsSet = new Set(results.map((r) => r.schoolId));
  const totalSchools = participatingSchoolsSet.size;

  let sumEnrolled = 0;
  let sumEvaluated = 0;
  let sumParticipation = 0;
  let countParticipation = 0;
  let sumScore = 0;
  let countScore = 0;
  let sumAdequate = 0;
  let countAdequate = 0;
  let sumIntermediate = 0;
  let countIntermediate = 0;
  let sumDeficit = 0;
  let countDeficit = 0;

  // Resumo por componente
  const componentStats = {
    LINGUA_PORTUGUESA: {
      code: 'LINGUA_PORTUGUESA',
      label: 'Língua Portuguesa',
      schoolsSet: new Set(),
      enrolled: 0,
      evaluated: 0,
      sumParticipation: 0,
      countParticipation: 0,
      sumScore: 0,
      countScore: 0,
      sumAdequate: 0,
      countAdequate: 0,
      sumIntermediate: 0,
      countIntermediate: 0,
      sumDeficit: 0,
      countDeficit: 0,
      resultsCount: 0,
    },
    MATEMATICA: {
      code: 'MATEMATICA',
      label: 'Matemática',
      schoolsSet: new Set(),
      enrolled: 0,
      evaluated: 0,
      sumParticipation: 0,
      countParticipation: 0,
      sumScore: 0,
      countScore: 0,
      sumAdequate: 0,
      countAdequate: 0,
      sumIntermediate: 0,
      countIntermediate: 0,
      sumDeficit: 0,
      countDeficit: 0,
      resultsCount: 0,
    },
  };

  // Mapa de habilidades agregadas da rede
  const skillsMap = new Map(); // code -> { code, label, sumPct, count, component }

  // Processa cada resultado individualmente
  const schoolRowsMap = new Map();

  for (const r of results) {
    const compKey = r.component || 'LINGUA_PORTUGUESA';
    if (!componentStats[compKey]) {
      componentStats[compKey] = {
        code: compKey,
        label: SISPAE_COMPONENTS[compKey]?.label || compKey,
        schoolsSet: new Set(),
        enrolled: 0,
        evaluated: 0,
        sumParticipation: 0,
        countParticipation: 0,
        sumScore: 0,
        countScore: 0,
        sumAdequate: 0,
        countAdequate: 0,
        sumIntermediate: 0,
        countIntermediate: 0,
        sumDeficit: 0,
        countDeficit: 0,
        resultsCount: 0,
      };
    }

    const cStat = componentStats[compKey];
    cStat.schoolsSet.add(r.schoolId);
    cStat.resultsCount++;
    if (r.enrolled) cStat.enrolled += r.enrolled;
    if (r.evaluated) cStat.evaluated += r.evaluated;

    if (r.participationRate != null) {
      cStat.sumParticipation += r.participationRate;
      cStat.countParticipation++;
      sumParticipation += r.participationRate;
      countParticipation++;
    }

    if (r.averageScore != null) {
      cStat.sumScore += r.averageScore;
      cStat.countScore++;
      sumScore += r.averageScore;
      countScore++;
    }

    // Extrai níveis
    const rates = extractPerformanceRates(r.performanceLevels);
    if (rates.adequateRate != null) {
      cStat.sumAdequate += rates.adequateRate;
      cStat.countAdequate++;
      sumAdequate += rates.adequateRate;
      countAdequate++;
    }
    if (rates.intermediateRate != null) {
      cStat.sumIntermediate += rates.intermediateRate;
      cStat.countIntermediate++;
      sumIntermediate += rates.intermediateRate;
      countIntermediate++;
    }
    if (rates.deficitRate != null) {
      cStat.sumDeficit += rates.deficitRate;
      cStat.countDeficit++;
      sumDeficit += rates.deficitRate;
      countDeficit++;
    }

    // Processa habilidades
    if (Array.isArray(r.skills)) {
      for (const sk of r.skills) {
        if (!sk || !sk.code) continue;
        const key = `${compKey}_${sk.code}`;
        if (!skillsMap.has(key)) {
          skillsMap.set(key, {
            code: sk.code,
            label: sk.label || sk.code,
            component: compKey,
            componentLabel: SISPAE_COMPONENTS[compKey]?.label || compKey,
            sumPct: 0,
            count: 0,
          });
        }
        const skItem = skillsMap.get(key);
        if (sk.percentage != null) {
          skItem.sumPct += Number(sk.percentage);
          skItem.count++;
        }
      }
    }

    // Consolidação por escola para o grid
    if (!schoolRowsMap.has(r.schoolId)) {
      schoolRowsMap.set(r.schoolId, {
        schoolId: r.schoolId,
        schoolName: r.school.name,
        inep: r.school.inep,
        zone: r.school.zone,
        schoolType: r.school.schoolType,
        latitude: r.school.latitude,
        longitude: r.school.longitude,
        components: {},
        overallAdequateRate: null,
        overallAverageScore: null,
        overallParticipation: null,
        overallDeficitRate: null,
      });
    }

    const schoolRow = schoolRowsMap.get(r.schoolId);
    schoolRow.components[compKey] = {
      resultId: r.id,
      grade: r.grade,
      enrolled: r.enrolled,
      evaluated: r.evaluated,
      participationRate: r.participationRate,
      averageScore: r.averageScore,
      performanceLevels: r.performanceLevels,
      skills: r.skills,
      ...rates,
    };
  }

  // Total de matriculados e avaliados (calculados de forma desacoplada por componente)
  sumEnrolled = Object.values(componentStats).reduce((acc, c) => acc + c.enrolled, 0);
  sumEvaluated = Object.values(componentStats).reduce((acc, c) => acc + c.evaluated, 0);

  // Médias Gerais
  const avgParticipation = countParticipation > 0 ? round(sumParticipation / countParticipation) : 0;
  const avgScore = countScore > 0 ? round(sumScore / countScore) : 0;
  const avgAdequate = countAdequate > 0 ? round(sumAdequate / countAdequate) : 0;
  const avgIntermediate = countIntermediate > 0 ? round(sumIntermediate / countIntermediate) : 0;
  const avgDeficit = countDeficit > 0 ? round(sumDeficit / countDeficit) : 0;

  // Formata resumo por componente
  const componentsSummary = Object.values(componentStats).map((c) => {
    const adeq = c.countAdequate > 0 ? round(c.sumAdequate / c.countAdequate) : 0;
    const interm = c.countIntermediate > 0 ? round(c.sumIntermediate / c.countIntermediate) : 0;
    const def = c.countDeficit > 0 ? round(c.sumDeficit / c.countDeficit) : 0;
    const part = c.countParticipation > 0 ? round(c.sumParticipation / c.countParticipation) : 0;
    const score = c.countScore > 0 ? round(c.sumScore / c.countScore) : 0;

    return {
      code: c.code,
      component: c.code,
      label: c.label,
      icon: SISPAE_COMPONENTS[c.code]?.icon || '📚',
      color: SISPAE_COMPONENTS[c.code]?.color || '#0284c7',
      schoolsCount: c.schoolsSet.size,
      enrolled: c.enrolled,
      evaluated: c.evaluated,
      assessedStudents: c.evaluated,
      participationRate: part,
      averageScore: score,
      averageProficiency: score,
      adequateRate: adeq,
      intermediateRate: interm,
      basicRate: interm,
      deficitRate: def,
      belowBasicRate: def,
    };
  });

  // Distribuição geral para gráficos de rosca/barra
  const performanceDistribution = [
    {
      id: 'DEFASAGEM',
      label: 'Defasagem',
      percentage: avgDeficit,
      color: '#ef4444',
    },
    {
      id: 'INTERMEDIARIO',
      label: 'Intermediário',
      percentage: avgIntermediate,
      color: '#f59e0b',
    },
    {
      id: 'ADEQUADO',
      label: 'Adequado',
      percentage: avgAdequate,
      color: '#10b981',
    },
  ];

  // Matriz de habilidades consolidada e ordenada por componente e código
  const skillsSummary = Array.from(skillsMap.values())
    .map((s) => {
      const avg = s.count > 0 ? round(s.sumPct / s.count) : 0;
      let status = 'ADEQUADO';
      let statusLabel = 'Consolidada';
      let statusColor = '#10b981';

      if (avg < 50) {
        status = 'CRITICO';
        statusLabel = 'Crítica (< 50%)';
        statusColor = '#ef4444';
      } else if (avg < 70) {
        status = 'ATENCAO';
        statusLabel = 'Em Alerta (50-70%)';
        statusColor = '#f59e0b';
      }

      return {
        code: s.code,
        label: s.label,
        component: s.component,
        componentLabel: s.componentLabel,
        averagePercentage: avg,
        schoolsEvaluated: s.count,
        status,
        statusLabel,
        statusColor,
      };
    })
    .sort((a, b) => a.component.localeCompare(b.component) || a.code.localeCompare(b.code, undefined, { numeric: true }));

  // Calcula médias consolidadas por escola
  const schoolRows = Array.from(schoolRowsMap.values()).map((row) => {
    const compVals = Object.values(row.components);
    const validScores = compVals.filter((c) => c.averageScore != null);
    const validAdequates = compVals.filter((c) => c.adequateRate != null);
    const validParticipations = compVals.filter((c) => c.participationRate != null);
    const validDeficits = compVals.filter((c) => c.deficitRate != null);

    const overallScore =
      validScores.length > 0
        ? round(validScores.reduce((acc, c) => acc + c.averageScore, 0) / validScores.length)
        : null;

    const overallAdequate =
      validAdequates.length > 0
        ? round(validAdequates.reduce((acc, c) => acc + c.adequateRate, 0) / validAdequates.length)
        : null;

    const overallPart =
      validParticipations.length > 0
        ? round(validParticipations.reduce((acc, c) => acc + c.participationRate, 0) / validParticipations.length)
        : null;

    const overallDeficit =
      validDeficits.length > 0
        ? round(validDeficits.reduce((acc, c) => acc + c.deficitRate, 0) / validDeficits.length)
        : null;

    return {
      ...row,
      overallAverageScore: overallScore,
      overallAdequateRate: overallAdequate,
      overallParticipation: overallPart,
      overallDeficitRate: overallDeficit,
    };
  });

  // Top 5 escolas com melhor aprendizado adequado
  const topSchools = [...schoolRows]
    .filter((s) => s.overallAdequateRate != null)
    .sort((a, b) => (b.overallAdequateRate ?? 0) - (a.overallAdequateRate ?? 0))
    .slice(0, 5);

  // Cálculo Objetivo das Escolas que Precisam de Atenção no SisPAE (Sem IA)
  const attentionSchools = calculateSispaeAttentionSchools(schoolRows, {
    avgAdequate,
    avgDeficit,
    avgParticipation,
    skillsSummary,
  });

  return {
    program: {
      id: program.id,
      code: program.code,
      name: program.name,
      year: program.year,
    },
    currentApplication: {
      id: currentApp.id,
      name: currentApp.name,
      type: currentApp.type,
      typeInfo: SISPAE_APPLICATION_TYPES[currentApp.type] || SISPAE_APPLICATION_TYPES.SIMULADO,
      year: currentApp.year,
      stage: currentApp.stage,
      status: currentApp.status,
      description: currentApp.description,
    },
    applications: allApplications.map((app) => ({
      id: app.id,
      name: app.name,
      type: app.type,
      typeInfo: SISPAE_APPLICATION_TYPES[app.type] || SISPAE_APPLICATION_TYPES.SIMULADO,
      year: app.year,
      stage: app.stage,
      status: app.status,
      resultsCount: app._count.results,
    })),
    kpis: {
      totalSchools,
      participatingSchools: totalSchools,
      enrolled: sumEnrolled,
      totalEnrolled: sumEnrolled,
      evaluated: sumEvaluated,
      totalAssessed: sumEvaluated,
      participationRate: avgParticipation,
      overallParticipation: avgParticipation,
      averageScore: avgScore,
      adequateRate: avgAdequate,
      overallAdequateRate: avgAdequate,
      intermediateRate: avgIntermediate,
      overallIntermediateRate: avgIntermediate,
      deficitRate: avgDeficit,
      overallDeficitRate: avgDeficit,
      bestPerformance: topSchools[0]?.overallAdequateRate || 0,
    },
    componentsSummary,
    performanceDistribution,
    skillsSummary,
    topSchools,
    schoolSummaries: schoolRows,
    attentionSchools,
    totalResults: results.length,
  };
}

/**
 * Motor de Regras Objetivo do SisPAE para Identificação de Escolas em Atenção.
 * Avalia taxa de defasagem na matriz, percentual de aprendizado adequado,
 * taxa de presença/participação, desempenho em LP/Matemática e habilidades críticas.
 */
export function calculateSispaeAttentionSchools(schoolRows = [], networkContext = {}) {
  const attentionList = [];

  for (const row of schoolRows) {
    const reasons = [];
    let priorityPoints = 0;

    // 1. Taxa de Defasagem Crítica
    if (row.overallDeficitRate != null) {
      if (row.overallDeficitRate > 35.0) {
        priorityPoints += 3;
        reasons.push({
          indicator: 'Taxa de Defasagem',
          component: 'Geral',
          currentValue: `${row.overallDeficitRate}% em defasagem`,
          referenceValue: '≤ 15.0%',
          diff: `+${round(row.overallDeficitRate - 15.0)} p.p.`,
          severity: 'HIGH',
          severityLabel: 'Crítico',
          severityColor: 'red',
          description: `${row.overallDeficitRate}% dos estudantes avaliados na escola encontram-se em situação de defasagem de aprendizagem.`,
          recommendation: 'Planejar plano emergencial de recuperação de aprendizagens com monitoramento quinzenal.',
        });
      } else if (row.overallDeficitRate >= 20.0) {
        priorityPoints += 2;
        reasons.push({
          indicator: 'Taxa de Defasagem',
          component: 'Geral',
          currentValue: `${row.overallDeficitRate}% em defasagem`,
          referenceValue: '≤ 15.0%',
          diff: `+${round(row.overallDeficitRate - 15.0)} p.p.`,
          severity: 'MEDIUM',
          severityLabel: 'Atenção',
          severityColor: 'orange',
          description: `Taxa de defasagem de ${row.overallDeficitRate}% acima do limite tolerável para a rede.`,
          recommendation: 'Reforçar intervenções pedagógicas no contraturno para os alunos nos níveis iniciais.',
        });
      }
    }

    // 2. Aprendizado Adequado
    if (row.overallAdequateRate != null) {
      if (row.overallAdequateRate < 35.0) {
        priorityPoints += 3;
        reasons.push({
          indicator: 'Aprendizado Adequado',
          component: 'Geral',
          currentValue: `${row.overallAdequateRate}% adequado`,
          referenceValue: '≥ 60.0%',
          diff: `${round(row.overallAdequateRate - 60.0)} p.p.`,
          severity: 'HIGH',
          severityLabel: 'Crítico',
          severityColor: 'red',
          description: `Apenas ${row.overallAdequateRate}% dos estudantes alcançaram o padrão de aprendizado adequado na avaliação oficial/simulado.`,
          recommendation: 'Revisar o alinhamento com a matriz de referência e metodologias ativas de ensino.',
        });
      } else if (row.overallAdequateRate < 50.0) {
        priorityPoints += 2;
        reasons.push({
          indicator: 'Aprendizado Adequado',
          component: 'Geral',
          currentValue: `${row.overallAdequateRate}% adequado`,
          referenceValue: '≥ 60.0%',
          diff: `${round(row.overallAdequateRate - 60.0)} p.p.`,
          severity: 'MEDIUM',
          severityLabel: 'Atenção',
          severityColor: 'orange',
          description: `Índice de aprendizado adequado de ${row.overallAdequateRate}% abaixo da meta estabelecida de 60%.`,
          recommendation: 'Intensificar simulados diagnósticos e acompanhamento dos descritores com menor acerto.',
        });
      }
    }

    // 3. Taxa de Participação
    if (row.overallParticipation != null && row.overallParticipation > 0) {
      if (row.overallParticipation < 75.0) {
        priorityPoints += 3;
        reasons.push({
          indicator: 'Taxa de Participação',
          component: 'Geral',
          currentValue: `${row.overallParticipation}%`,
          referenceValue: '≥ 85.0%',
          diff: `${round(row.overallParticipation - 85.0)} p.p.`,
          severity: 'HIGH',
          severityLabel: 'Crítico',
          severityColor: 'red',
          description: `Baixa presença discente (${row.overallParticipation}%) no dia da aplicação da avaliação.`,
          recommendation: 'Averiguar causas de infrequência e estabelecer estratégias de mobilização escolar.',
        });
      } else if (row.overallParticipation < 85.0) {
        priorityPoints += 2;
        reasons.push({
          indicator: 'Taxa de Participação',
          component: 'Geral',
          currentValue: `${row.overallParticipation}%`,
          referenceValue: '≥ 85.0%',
          diff: `${round(row.overallParticipation - 85.0)} p.p.`,
          severity: 'MEDIUM',
          severityLabel: 'Atenção',
          severityColor: 'orange',
          description: `Participação de ${row.overallParticipation}% abaixo da referência municipal.`,
          recommendation: 'Fortalecer a comunicação prévia com responsáveis e estudantes.',
        });
      }
    }

    // 4. Desempenho por Componente (Língua Portuguesa vs Matemática)
    const lpComp = row.components?.LINGUA_PORTUGUESA;
    const matComp = row.components?.MATEMATICA;

    if (lpComp) {
      if (lpComp.deficitRate != null && lpComp.deficitRate > 40.0) {
        priorityPoints += 3;
        reasons.push({
          indicator: 'Defasagem em Língua Portuguesa',
          component: 'Língua Portuguesa',
          currentValue: `${lpComp.deficitRate}% em defasagem`,
          referenceValue: '≤ 15.0%',
          diff: `+${round(lpComp.deficitRate - 15.0)} p.p.`,
          severity: 'HIGH',
          severityLabel: 'Crítico',
          severityColor: 'red',
          description: `Elevada taxa de defasagem em Língua Portuguesa (${lpComp.deficitRate}%), apontando dificuldades severas em leitura e interpretação.`,
          recommendation: 'Desenvolver oficina de leitura diária e estratégias de localização de informações e inferência.',
        });
      }
    }

    if (matComp) {
      if (matComp.deficitRate != null && matComp.deficitRate > 40.0) {
        priorityPoints += 3;
        reasons.push({
          indicator: 'Defasagem em Matemática',
          component: 'Matemática',
          currentValue: `${matComp.deficitRate}% em defasagem`,
          referenceValue: '≤ 15.0%',
          diff: `+${round(matComp.deficitRate - 15.0)} p.p.`,
          severity: 'HIGH',
          severityLabel: 'Crítico',
          severityColor: 'red',
          description: `Elevada taxa de defasagem em Matemática (${matComp.deficitRate}%), com defasagem em cálculo e resolução de problemas.`,
          recommendation: 'Adotar materiais concretos e resolução contextualizada de problemas matemáticos.',
        });
      }
    }

    // 5. Descompasso entre Língua Portuguesa e Matemática
    if (lpComp && matComp && lpComp.adequateRate != null && matComp.adequateRate != null) {
      const gap = Math.abs(lpComp.adequateRate - matComp.adequateRate);
      if (gap >= 22.0) {
        priorityPoints += 2;
        reasons.push({
          indicator: 'Descompasso entre Componentes',
          component: 'Comparativo',
          currentValue: `Diferença de ${round(gap)} p.p.`,
          referenceValue: '≤ 15.0 p.p.',
          diff: `+${round(gap - 15.0)} p.p.`,
          severity: 'MEDIUM',
          severityLabel: 'Atenção',
          severityColor: 'orange',
          description: `Descompasso expressivo entre o rendimento de Língua Portuguesa (${lpComp.adequateRate}%) e Matemática (${matComp.adequateRate}%).`,
          recommendation: 'Equilibrar a carga horária de intervenção pedagógica entre os dois componentes.',
        });
      }
    }

    if (reasons.length > 0) {
      let priority = 'LOW';
      let priorityLabel = 'Baixa';
      let priorityColor = 'yellow';

      const hasHighReason = reasons.some((r) => r.severity === 'HIGH');
      const mediumCount = reasons.filter((r) => r.severity === 'MEDIUM').length;

      if (hasHighReason || priorityPoints >= 3 || mediumCount >= 2) {
        priority = 'HIGH';
        priorityLabel = 'Alta';
        priorityColor = 'red';
      } else if (mediumCount === 1 || priorityPoints === 2) {
        priority = 'MEDIUM';
        priorityLabel = 'Média';
        priorityColor = 'orange';
      }

      const mainTitles = reasons.slice(0, 2).map((r) => {
        if (r.indicator === 'Taxa de Participação') return 'Baixa participação';
        if (r.indicator === 'Taxa de Defasagem') return 'Alta defasagem';
        if (r.indicator === 'Aprendizado Adequado') return 'Baixo aprendizado';
        if (r.indicator === 'Defasagem em Língua Portuguesa') return 'Dificuldade em Português';
        if (r.indicator === 'Defasagem em Matemática') return 'Dificuldade em Matemática';
        if (r.indicator === 'Descompasso entre Componentes') return 'Descompasso entre áreas';
        return r.indicator;
      });
      const reasonsSummary = mainTitles.join(' + ') + (reasons.length > 2 ? ` (+${reasons.length - 2})` : '');

      const keyMetrics = [];
      if (row.overallParticipation != null) {
        keyMetrics.push({
          label: 'Participação',
          value: `${row.overallParticipation}%`,
          tone: row.overallParticipation < 80 ? 'critical' : 'normal',
        });
      }
      if (row.overallDeficitRate != null) {
        keyMetrics.push({
          label: 'Defasagem',
          value: `${row.overallDeficitRate}%`,
          tone: row.overallDeficitRate > 30 ? 'critical' : 'normal',
        });
      }
      if (row.overallAdequateRate != null) {
        keyMetrics.push({
          label: 'Adequado',
          value: `${row.overallAdequateRate}%`,
          tone: row.overallAdequateRate < 40 ? 'critical' : 'normal',
        });
      }

      attentionList.push({
        schoolId: row.schoolId,
        schoolName: row.schoolName,
        inep: row.inep,
        zone: row.zone,
        priority,
        priorityLabel,
        priorityColor,
        priorityPoints,
        reasonsSummary,
        reasonsCount: reasons.length,
        keyMetrics,
        reasons,
      });
    }
  }

  const priorityOrder = { HIGH: 1, MEDIUM: 2, LOW: 3 };
  attentionList.sort((a, b) => (
    priorityOrder[a.priority] - priorityOrder[b.priority] ||
    b.priorityPoints - a.priorityPoints ||
    b.reasonsCount - a.reasonsCount ||
    a.schoolName.localeCompare(b.schoolName)
  ));

  const summary = {
    total: attentionList.length,
    high: attentionList.filter((s) => s.priority === 'HIGH').length,
    medium: attentionList.filter((s) => s.priority === 'MEDIUM').length,
    low: attentionList.filter((s) => s.priority === 'LOW').length,
  };

  attentionList.summary = summary;
  attentionList.schools = attentionList;
  return attentionList;
}

/**
 * Ranking oficial de escolas da aplicação SisPAE selecionada.
 */
export async function getSispaeRanking(programId, query = {}) {
  const program = await resolveSispaeProgram(programId, query.year);
  const targetProgramId = program.id;

  // Resolve aplicação
  const allApplications = await prisma.sispaeApplication.findMany({
    where: { programId: targetProgramId },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  if (!allApplications.length) {
    return { ranking: [], total: 0, currentApplication: null };
  }

  const currentApp = query.applicationId
    ? allApplications.find((a) => a.id === query.applicationId) || allApplications[0]
    : allApplications[0];

  const componentFilter = query.component && query.component !== 'ALL' ? query.component : null;
  const search = String(query.search || '').trim().toLowerCase();
  const indicator = query.indicator || 'ADEQUADO'; // ADEQUADO | PROFICIENCIA | PARTICIPACAO | MENOR_DEFASAGEM

  // Busca resultados da aplicação
  const where = {
    programId: targetProgramId,
    applicationId: currentApp.id,
    ...(componentFilter && { component: componentFilter }),
    school: { deletedAt: null },
    ...(search && {
      school: {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { inep: { contains: search } },
        ],
      },
    }),
  };

  const results = await prisma.sispaeSchoolResult.findMany({
    where,
    include: {
      school: {
        select: {
          id: true,
          inep: true,
          name: true,
          zone: true,
          schoolType: true,
        },
      },
    },
  });

  // Agrupa por escola
  const schoolMap = new Map();

  for (const r of results) {
    if (!schoolMap.has(r.schoolId)) {
      schoolMap.set(r.schoolId, {
        schoolId: r.schoolId,
        schoolName: r.school.name,
        inep: r.school.inep,
        zone: r.school.zone,
        schoolType: r.school.schoolType,
        components: {},
        resultsList: [],
      });
    }
    const sObj = schoolMap.get(r.schoolId);
    const rates = extractPerformanceRates(r.performanceLevels);
    sObj.components[r.component] = {
      grade: r.grade,
      enrolled: r.enrolled,
      evaluated: r.evaluated,
      participationRate: r.participationRate,
      averageScore: r.averageScore,
      ...rates,
    };
    sObj.resultsList.push({
      component: r.component,
      participationRate: r.participationRate,
      averageScore: r.averageScore,
      ...rates,
    });
  }

  // Calcula métricas para ordenação
  const rankingList = Array.from(schoolMap.values()).map((sc) => {
    const validScores = sc.resultsList.filter((r) => r.averageScore != null);
    const validAdequates = sc.resultsList.filter((r) => r.adequateRate != null);
    const validParts = sc.resultsList.filter((r) => r.participationRate != null);
    const validDeficits = sc.resultsList.filter((r) => r.deficitRate != null);

    const avgScore = validScores.length ? round(validScores.reduce((a, b) => a + b.averageScore, 0) / validScores.length) : 0;
    const avgAdequate = validAdequates.length ? round(validAdequates.reduce((a, b) => a + b.adequateRate, 0) / validAdequates.length) : 0;
    const avgPart = validParts.length ? round(validParts.reduce((a, b) => a + b.participationRate, 0) / validParts.length) : 0;
    const avgDeficit = validDeficits.length ? round(validDeficits.reduce((a, b) => a + b.deficitRate, 0) / validDeficits.length) : 0;

    let rankValue = avgAdequate;
    if (indicator === 'PROFICIENCIA') rankValue = avgScore;
    else if (indicator === 'PARTICIPACAO') rankValue = avgPart;
    else if (indicator === 'MENOR_DEFASAGEM') rankValue = 100 - avgDeficit;

    return {
      schoolId: sc.schoolId,
      schoolName: sc.schoolName,
      inep: sc.inep,
      zone: sc.zone,
      schoolType: sc.schoolType,
      components: sc.components,
      averageScore: avgScore,
      adequateRate: avgAdequate,
      participationRate: avgPart,
      deficitRate: avgDeficit,
      rankValue,
    };
  });

  // Ordena
  rankingList.sort((a, b) => b.rankValue - a.rankValue || a.schoolName.localeCompare(b.schoolName));

  // Atribui posições e medalhas
  const rankedWithPositions = rankingList.map((item, idx) => {
    const position = idx + 1;
    let badge = `${position}º`;
    if (position === 1) badge = '🥇 1º';
    else if (position === 2) badge = '🥈 2º';
    else if (position === 3) badge = '🥉 3º';

    return {
      ...item,
      position,
      badge,
    };
  });

  return {
    ranking: rankedWithPositions,
    total: rankedWithPositions.length,
    currentApplication: {
      id: currentApp.id,
      name: currentApp.name,
      type: currentApp.type,
      year: currentApp.year,
    },
    applications: allApplications.map((app) => ({
      id: app.id,
      name: app.name,
      type: app.type,
      year: app.year,
    })),
  };
}

/**
 * Análises pedagógicas aprofundadas e matriz de habilidades do SisPAE.
 */
export async function getSispaeAnalises(programId, query = {}) {
  const program = await resolveSispaeProgram(programId, query.year);
  const targetProgramId = program.id;

  const allApplications = await prisma.sispaeApplication.findMany({
    where: { programId: targetProgramId },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  if (!allApplications.length) {
    return { matrix: [], skills: [], currentApplication: null };
  }

  const currentApp = query.applicationId
    ? allApplications.find((a) => a.id === query.applicationId) || allApplications[0]
    : allApplications[0];

  const componentFilter = query.component && query.component !== 'ALL' ? query.component : null;
  const search = String(query.search || '').trim().toLowerCase();

  const results = await prisma.sispaeSchoolResult.findMany({
    where: {
      programId: targetProgramId,
      applicationId: currentApp.id,
      ...(componentFilter && { component: componentFilter }),
      school: { deletedAt: null },
      ...(search && {
        school: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { inep: { contains: search } },
          ],
        },
      }),
    },
    include: {
      school: {
        select: { id: true, inep: true, name: true, zone: true },
      },
    },
    orderBy: [{ school: { name: 'asc' } }, { component: 'asc' }],
  });

  // Coleta todas as habilidades únicas encontradas
  const allSkillCodesMap = new Map();
  const schoolSkillMatrix = new Map();

  for (const r of results) {
    if (!schoolSkillMatrix.has(r.schoolId)) {
      schoolSkillMatrix.set(r.schoolId, {
        schoolId: r.schoolId,
        schoolName: r.school.name,
        inep: r.school.inep,
        zone: r.school.zone,
        skillsByComponent: {},
      });
    }

    const sEntry = schoolSkillMatrix.get(r.schoolId);
    if (!sEntry.skillsByComponent[r.component]) {
      sEntry.skillsByComponent[r.component] = {};
    }

    if (Array.isArray(r.skills)) {
      for (const sk of r.skills) {
        if (!sk || !sk.code) continue;
        const compCode = r.component;
        const key = `${compCode}_${sk.code}`;
        if (!allSkillCodesMap.has(key)) {
          allSkillCodesMap.set(key, {
            code: sk.code,
            label: sk.label || sk.code,
            component: compCode,
            componentLabel: SISPAE_COMPONENTS[compCode]?.label || compCode,
            sum: 0,
            count: 0,
          });
        }
        const skInfo = allSkillCodesMap.get(key);
        if (sk.percentage != null) {
          skInfo.sum += Number(sk.percentage);
          skInfo.count++;
          sEntry.skillsByComponent[compCode][sk.code] = Number(sk.percentage);
        }
      }
    }
  }

  const skillsList = Array.from(allSkillCodesMap.values()).map((s) => ({
    code: s.code,
    label: s.label,
    component: s.component,
    componentLabel: s.componentLabel,
    average: s.count > 0 ? round(s.sum / s.count) : 0,
    count: s.count,
  })).sort((a, b) => a.component.localeCompare(b.component) || a.code.localeCompare(b.code, undefined, { numeric: true }));

  const matrix = Array.from(schoolSkillMatrix.values());

  return {
    currentApplication: {
      id: currentApp.id,
      name: currentApp.name,
      type: currentApp.type,
      year: currentApp.year,
    },
    applications: allApplications.map((app) => ({
      id: app.id,
      name: app.name,
      type: app.type,
      year: app.year,
    })),
    skills: skillsList,
    matrix,
    totalSchools: matrix.length,
  };
}

/**
 * Lista detalhada de resultados por escola com paginação e filtros.
 */
export async function getSispaeSchoolResults(programId, query = {}) {
  const program = await resolveSispaeProgram(programId, query.year);
  const targetProgramId = program.id;

  const allApplications = await prisma.sispaeApplication.findMany({
    where: { programId: targetProgramId },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  if (!allApplications.length) {
    return { data: [], total: 0, page: 1, pageSize: 20, currentApplication: null };
  }

  const currentApp = query.applicationId
    ? allApplications.find((a) => a.id === query.applicationId) || allApplications[0]
    : allApplications[0];

  const componentFilter = query.component && query.component !== 'ALL' ? query.component : null;
  const gradeFilter = query.grade && query.grade !== 'ALL' ? query.grade : null;
  const search = String(query.search || '').trim().toLowerCase();

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(query.pageSize, 10) || 20));
  const skip = (page - 1) * pageSize;

  const where = {
    programId: targetProgramId,
    applicationId: currentApp.id,
    ...(componentFilter && { component: componentFilter }),
    ...(gradeFilter && { grade: gradeFilter }),
    school: { deletedAt: null },
    ...(search && {
      school: {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { inep: { contains: search } },
        ],
      },
    }),
  };

  const [total, results] = await Promise.all([
    prisma.sispaeSchoolResult.count({ where }),
    prisma.sispaeSchoolResult.findMany({
      where,
      include: {
        school: {
          select: { id: true, inep: true, name: true, zone: true, schoolType: true },
        },
      },
      orderBy: [{ school: { name: 'asc' } }, { component: 'asc' }],
      skip,
      take: pageSize,
    }),
  ]);

  const serialized = results.map((r) => {
    const rates = extractPerformanceRates(r.performanceLevels);
    return {
      id: r.id,
      schoolId: r.schoolId,
      schoolName: r.school.name,
      inep: r.school.inep,
      zone: r.school.zone,
      schoolType: r.school.schoolType,
      year: r.year,
      grade: r.grade,
      component: r.component,
      componentInfo: SISPAE_COMPONENTS[r.component] || { label: r.component },
      enrolled: r.enrolled,
      evaluated: r.evaluated,
      participationRate: r.participationRate,
      averageScore: r.averageScore,
      performanceLevels: r.performanceLevels || [],
      skills: r.skills || [],
      rawDetails: r.rawDetails,
      source: r.source,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      ...rates,
    };
  });

  return {
    data: serialized,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    currentApplication: {
      id: currentApp.id,
      name: currentApp.name,
      type: currentApp.type,
      year: currentApp.year,
    },
    applications: allApplications.map((app) => ({
      id: app.id,
      name: app.name,
      type: app.type,
      year: app.year,
    })),
  };
}

/**
 * Lista de escolas participantes com status na aplicação selecionada.
 */
export async function getSispaeSchools(programId, query = {}) {
  const program = await resolveSispaeProgram(programId, query.year);
  const targetProgramId = program.id;

  const allApplications = await prisma.sispaeApplication.findMany({
    where: { programId: targetProgramId },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  });

  const currentApp = query.applicationId
    ? allApplications.find((a) => a.id === query.applicationId) || allApplications[0]
    : allApplications[0];

  const search = String(query.search || '').trim().toLowerCase();

  // Busca vínculos no ProgramSchool
  const programSchools = await prisma.programSchool.findMany({
    where: {
      programId: targetProgramId,
      school: {
        deletedAt: null,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { inep: { contains: search } },
          ],
        }),
      },
    },
    include: {
      school: {
        select: {
          id: true,
          inep: true,
          name: true,
          zone: true,
          schoolType: true,
          situation: true,
        },
      },
    },
    orderBy: { school: { name: 'asc' } },
  });

  // Busca resultados da aplicação ativa para essas escolas
  const schoolIds = programSchools.map((ps) => ps.schoolId);
  const appResults = currentApp
    ? await prisma.sispaeSchoolResult.findMany({
        where: {
          programId: targetProgramId,
          applicationId: currentApp.id,
          schoolId: { in: schoolIds },
        },
      })
    : [];

  const resultsBySchool = new Map();
  for (const r of appResults) {
    if (!resultsBySchool.has(r.schoolId)) resultsBySchool.set(r.schoolId, []);
    resultsBySchool.get(r.schoolId).push(r);
  }

  const list = programSchools.map((ps) => {
    const scResults = resultsBySchool.get(ps.schoolId) || [];
    const lpResult = scResults.find((r) => r.component === 'LINGUA_PORTUGUESA');
    const matResult = scResults.find((r) => r.component === 'MATEMATICA');

    return {
      schoolId: ps.school.id,
      schoolName: ps.school.name,
      inep: ps.school.inep,
      zone: ps.school.zone,
      schoolType: ps.school.schoolType,
      active: ps.active,
      hasResults: scResults.length > 0,
      resultsCount: scResults.length,
      linguaPortuguesa: lpResult
        ? {
            resultId: lpResult.id,
            enrolled: lpResult.enrolled,
            evaluated: lpResult.evaluated,
            participationRate: lpResult.participationRate,
            averageScore: lpResult.averageScore,
          }
        : null,
      matematica: matResult
        ? {
            resultId: matResult.id,
            enrolled: matResult.enrolled,
            evaluated: matResult.evaluated,
            participationRate: matResult.participationRate,
            averageScore: matResult.averageScore,
          }
        : null,
    };
  });

  return {
    schools: list,
    total: list.length,
    currentApplication: currentApp
      ? { id: currentApp.id, name: currentApp.name, type: currentApp.type, year: currentApp.year }
      : null,
    applications: allApplications.map((app) => ({
      id: app.id,
      name: app.name,
      type: app.type,
      year: app.year,
    })),
  };
}

/**
 * Exclusão individual de resultado do SisPAE.
 */
export async function deleteSispaeResult(programId, resultId, actor = null, ip = null) {
  const result = await prisma.sispaeSchoolResult.findUnique({
    where: { id: resultId },
    include: { school: { select: { name: true } }, application: { select: { name: true } } },
  });
  if (!result) throw notFound('Resultado não encontrado.');

  await prisma.sispaeSchoolResult.delete({
    where: { id: resultId },
  });

  if (actor) {
    await audit({
      userId: actor.id,
      userName: actor.name,
      action: AuditAction.DELETE,
      entity: 'SispaeSchoolResult',
      entityId: resultId,
      metadata: {
        schoolName: result.school.name,
        applicationName: result.application.name,
        component: result.component,
      },
      ip,
    });
  }

  return { success: true };
}

/**
 * Exclusão em lote de resultados do SisPAE.
 */
export async function batchDeleteSispaeResults(programId, resultIds = [], actor = null, ip = null) {
  if (!Array.isArray(resultIds) || !resultIds.length) {
    throw new HttpError(400, 'Nenhum identificador fornecido para exclusão.');
  }

  const { count } = await prisma.sispaeSchoolResult.deleteMany({
    where: { id: { in: resultIds } },
  });

  if (actor) {
    await audit({
      userId: actor.id,
      userName: actor.name,
      action: AuditAction.DELETE,
      entity: 'SispaeSchoolResult',
      metadata: { count, resultIds },
      ip,
    });
  }

  return { success: true, count };
}

/**
 * Lançamento manual individual de resultado para uma escola no SisPAE.
 */
export async function manualSispaeEntry(programId, payload = {}, actor = null, ip = null) {
  const { schoolId, inep, schoolName, applicationId, component, grade, enrolled, evaluated, participationRate, averageScore, performanceLevels, skills } = payload;

  const program = await resolveSispaeProgram(programId);
  let targetSchoolId = schoolId;

  if (!targetSchoolId && (inep || schoolName)) {
    let sc = null;
    if (inep) {
      sc = await prisma.school.findUnique({ where: { inep: String(inep).trim() } });
    }
    if (!sc && schoolName) {
      sc = await prisma.school.findFirst({
        where: { name: { equals: String(schoolName).trim(), mode: 'insensitive' }, deletedAt: null },
      });
    }
    if (!sc && schoolName) {
      // Cria a escola se não existir
      sc = await prisma.school.create({
        data: {
          name: String(schoolName).trim(),
          inep: inep ? String(inep).trim() : null,
          situation: 'ATIVA',
        },
      });
    }
    if (sc) targetSchoolId = sc.id;
  }

  if (!targetSchoolId) {
    throw new HttpError(400, 'Identificação da escola é obrigatória.');
  }

  // Resolve aplicação
  const targetApplication = await resolveSispaeApplication(program.id, {
    applicationId,
    name: payload.applicationName || 'Simulado Pará 2026 – Alfabetização',
    type: payload.applicationType || 'SIMULADO',
  });

  // Vincula no ProgramSchool
  await prisma.programSchool.upsert({
    where: { programId_schoolId: { programId: program.id, schoolId: targetSchoolId } },
    create: { programId: program.id, schoolId: targetSchoolId, active: true },
    update: { active: true },
  });

  const comp = component || 'LINGUA_PORTUGUESA';
  const gr = grade || '2º Ano';

  let partRate = participationRate;
  if (partRate == null && enrolled && evaluated && enrolled > 0) {
    partRate = round((evaluated / enrolled) * 100);
  }

  const result = await prisma.sispaeSchoolResult.upsert({
    where: {
      programId_applicationId_schoolId_grade_component: {
        programId: program.id,
        applicationId: targetApplication.id,
        schoolId: targetSchoolId,
        grade: gr,
        component: comp,
      },
    },
    create: {
      programId: program.id,
      applicationId: targetApplication.id,
      schoolId: targetSchoolId,
      year: targetApplication.year,
      grade: gr,
      component: comp,
      enrolled: enrolled != null ? Number(enrolled) : null,
      evaluated: evaluated != null ? Number(evaluated) : null,
      participationRate: partRate != null ? Number(partRate) : null,
      averageScore: averageScore != null ? Number(averageScore) : null,
      performanceLevels: performanceLevels || [],
      skills: skills || [],
      source: 'MANUAL',
    },
    update: {
      enrolled: enrolled != null ? Number(enrolled) : null,
      evaluated: evaluated != null ? Number(evaluated) : null,
      participationRate: partRate != null ? Number(partRate) : null,
      averageScore: averageScore != null ? Number(averageScore) : null,
      performanceLevels: performanceLevels || [],
      skills: skills || [],
      source: 'MANUAL',
    },
    include: { school: true, application: true },
  });

  if (actor) {
    await audit({
      userId: actor.id,
      userName: actor.name,
      action: AuditAction.CREATE,
      entity: 'SispaeSchoolResult',
      entityId: result.id,
      metadata: { schoolName: result.school.name, component: comp, applicationId: targetApplication.id },
      ip,
    });
  }

  return result;
}
