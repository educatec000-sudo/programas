import { prisma } from '../lib/prisma.js';
import { classificationLabel } from '../lib/constants.js';
import {
  computeRanking,
  evolutionSeries,
  goalsStatus,
} from './scoring.service.js';
import { resultsForExport } from './result.service.js';
import { listGoals, resolveGoalFromList } from './goal.service.js';
import { HttpError } from '../lib/errors.js';
import { PACTO_CATALOG_CODE } from '../programs/pacto/config.js';

/**
 * Relatórios — cada builder devolve um dataset tabular
 * { title, subtitle, columns, rows } que os exportadores convertem em CSV/XLSX/PDF.
 */

const statusLabels = {
  PLANEJAMENTO: 'Planejamento',
  EM_EXECUCAO: 'Em execução',
  CONCLUIDO: 'Concluído',
  SUSPENSO: 'Suspenso',
  CANCELADO: 'Cancelado',
};

function requireProgramId(query) {
  if (!query.programId) {
    throw new HttpError(
      422,
      'Selecione um programa. Relatórios avaliativos não combinam programas diferentes.',
      'PROGRAM_REQUIRED',
    );
  }
  return query.programId;
}

async function reportGeral(query) {
  const year = query.year ? Number(query.year) : null;
  const programs = await prisma.program.findMany({
    where: { deletedAt: null, ...(year && { year }) },
    include: { _count: { select: { schools: { where: { active: true } }, indicators: true, results: true } } },
    orderBy: { name: 'asc' },
  });
  const scoreEntries = await Promise.all(
    programs.map(async (program) => {
      try {
        const ranking = await computeRanking({ programId: program.id, year: year ?? program.year });
        const score = ranking.rows.length
          ? Math.round((ranking.rows.reduce((sum, row) => sum + row.score, 0) / ranking.rows.length) * 10) / 10
          : null;
        return [program.id, score];
      } catch (error) {
        if (error.code === 'PROGRAM_RANKING_UNAVAILABLE') return [program.id, null];
        throw error;
      }
    }),
  );
  const scoreByProgram = new Map(scoreEntries);

  return {
    title: 'Relatório Geral de Programas',
    subtitle: year ? `Ano de referência: ${year}` : 'Todos os anos',
    columns: [
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Programa' },
      { key: 'year', label: 'Ano', format: 'int' },
      { key: 'statusLabel', label: 'Status' },
      { key: 'organ', label: 'Órgão' },
      { key: 'schools', label: 'Escolas', format: 'int' },
      { key: 'indicators', label: 'Critérios', format: 'int' },
      { key: 'results', label: 'Resultados', format: 'int' },
      { key: 'score', label: 'Pontuação', format: 'score' },
    ],
    rows: programs.map((p) => ({
      code: p.code,
      name: p.name,
      year: p.year,
      statusLabel: statusLabels[p.status],
      organ: p.organ || '—',
      schools: p._count.schools,
      indicators: p._count.indicators,
      results: p._count.results,
      score: scoreByProgram.get(p.id) ?? null,
    })),
  };
}

async function reportEscola(query) {
  const programId = requireProgramId(query);
  if (!query.schoolId) throw new HttpError(422, 'Informe a escola (schoolId)', 'VALIDATION_ERROR');
  const [school, program] = await Promise.all([
    prisma.school.findFirst({ where: { id: query.schoolId, deletedAt: null } }),
    prisma.program.findFirst({ where: { id: programId, deletedAt: null }, select: { name: true } }),
  ]);
  if (!school) throw new HttpError(404, 'Escola não encontrada', 'NOT_FOUND');
  if (!program) throw new HttpError(404, 'Programa não encontrado', 'NOT_FOUND');

  const year = query.year ? Number(query.year) : null;
  const results = await prisma.result.findMany({
    where: { programId, schoolId: school.id, ...(year && { year }) },
    include: {
      program: { select: { name: true } },
      indicator: {
        select: {
          name: true,
          unit: true,
          polarity: true,
          programs: { where: { programId }, select: { goal: true } },
        },
      },
    },
    orderBy: [{ year: 'desc' }, { program: { name: 'asc' } }],
  });

  const goals = await prisma.goal.findMany({
    where: { programId, year: year ?? undefined },
    select: { id: true, year: true, programId: true, schoolId: true, indicatorId: true, period: true, value: true },
  });

  const { attainment } = await import('./scoring.service.js');
  const rows = results.map((r) => {
    const candidates = goals.filter(
      (g) =>
        g.year === r.year &&
        g.programId === r.programId &&
        (!g.schoolId || g.schoolId === r.schoolId) &&
        (!g.indicatorId || g.indicatorId === r.indicatorId) &&
        (!g.period || g.period === r.period),
    );
    const goal =
      candidates.sort((a, b) => scoreOf(b, r) - scoreOf(a, r))[0]?.value ??
      r.indicator.programs[0]?.goal ??
      null;
    const pct = attainment(r.value, goal, r.indicator.polarity);
    return {
      year: r.year,
      period: r.period,
      program: r.program.name,
      indicator: r.indicator.name,
      value: r.value,
      unit: r.indicator.unit || '',
      goal,
      pct,
    };
  });

  return {
    title: `Relatório da Escola — ${school.name}`,
    subtitle: `${program.name} · INEP ${school.inep}${year ? ` · ${year}` : ''}`,
    columns: [
      { key: 'year', label: 'Ano', format: 'int' },
      { key: 'period', label: 'Período' },
      { key: 'program', label: 'Programa' },
      { key: 'indicator', label: 'Critério' },
      { key: 'value', label: 'Resultado', format: 'number' },
      { key: 'goal', label: 'Meta', format: 'number' },
      { key: 'pct', label: '% da Meta', format: 'percent' },
    ],
    rows,
  };
}

function scoreOf(goal, r) {
  return (
    (goal.indicatorId === r.indicatorId ? 8 : 0) +
    (goal.programId ? 4 : 0) +
    (goal.schoolId ? 2 : 0) +
    (goal.period ? 1 : 0)
  );
}

async function reportPrograma(query) {
  if (!query.programId) throw new HttpError(422, 'Informe o programa (programId)', 'VALIDATION_ERROR');
  const program = await prisma.program.findFirst({ where: { id: query.programId, deletedAt: null } });
  if (!program) throw new HttpError(404, 'Programa não encontrado', 'NOT_FOUND');

  const ranking = await computeRanking({
    programId: program.id,
    year: query.year ? Number(query.year) : program.year,
    period: query.period && query.period !== 'todos' ? query.period : undefined,
  });

  return {
    title: `Relatório do Programa — ${program.name}`,
    subtitle: `Código ${program.code} · ${ranking.period || '—'}/${ranking.year} · ${ranking.rows.length} escolas`,
    columns: [
      { key: 'position', label: 'Posição', format: 'int' },
      { key: 'schoolName', label: 'Escola' },
      { key: 'schoolInep', label: 'INEP' },
      { key: 'score', label: 'Pontuação', format: 'score' },
      { key: 'classification', label: 'Classificação' },
      { key: 'classificationLabel', label: 'Conceito' },
      { key: 'previousScore', label: 'Pont. Anterior', format: 'score' },
      { key: 'scoreDiff', label: 'Evolução', format: 'score' },
    ],
    rows: ranking.rows.map((r) => ({
      ...r,
      classificationLabel: classificationLabel(r.classification),
    })),
  };
}

async function reportIndicador(query) {
  const programId = requireProgramId(query);
  if (!query.indicatorId) throw new HttpError(422, 'Informe o indicador (indicatorId)', 'VALIDATION_ERROR');
  const indicator = await prisma.indicator.findFirst({ where: { id: query.indicatorId, deletedAt: null } });
  if (!indicator) throw new HttpError(404, 'Indicador não encontrado', 'NOT_FOUND');

  const [results, goals, programIndicators] = await Promise.all([
    prisma.result.findMany({
      where: {
        indicatorId: indicator.id,
        programId,
        ...(query.year && { year: Number(query.year) }),
        program: { deletedAt: null },
        school: { deletedAt: null },
      },
      include: { program: { select: { id: true, name: true } } },
    }),
    prisma.goal.findMany({
      where: {
        programId,
        ...(query.year && { year: Number(query.year) }),
        schoolId: null,
        OR: [{ indicatorId: indicator.id }, { indicatorId: null }],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        year: true,
        programId: true,
        schoolId: true,
        indicatorId: true,
        period: true,
        value: true,
      },
    }),
    prisma.programIndicator.findMany({
      where: { programId, indicatorId: indicator.id, active: true },
      select: { programId: true, goal: true },
    }),
  ]);

  const grouped = new Map();
  for (const result of results) {
    const key = `${result.programId}|${result.year}|${result.period}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        programId: result.programId,
        program: result.program.name,
        year: result.year,
        period: result.period,
        values: [],
      });
    }
    grouped.get(key).values.push(result.value);
  }

  const programGoals = new Map(programIndicators.map((link) => [link.programId, link.goal]));
  const { attainment } = await import('./scoring.service.js');

  return {
    title: `Relatório do Critério — ${indicator.name}`,
    subtitle: `Código ${indicator.code} · Unidade: ${indicator.unit || '—'} · metas resolvidas por programa, ano e período`,
    columns: [
      { key: 'program', label: 'Programa' },
      { key: 'year', label: 'Ano', format: 'int' },
      { key: 'period', label: 'Período' },
      { key: 'schools', label: 'Escolas', format: 'int' },
      { key: 'avg', label: 'Média', format: 'number' },
      { key: 'min', label: 'Mínimo', format: 'number' },
      { key: 'max', label: 'Máximo', format: 'number' },
      { key: 'goal', label: 'Meta', format: 'number' },
      { key: 'pct', label: '% da Meta', format: 'percent' },
    ],
    rows: [...grouped.values()].map((group) => {
      const avg = group.values.reduce((sum, value) => sum + value, 0) / group.values.length;
      const goalRecord = resolveGoalFromList(
        goals.filter((goal) => goal.year === group.year),
        {
          programId: group.programId,
          indicatorId: indicator.id,
          period: group.period,
        },
      );
      const goal = goalRecord?.value ?? programGoals.get(group.programId) ?? null;
      return {
        program: group.program,
        year: group.year,
        period: group.period,
        schools: group.values.length,
        avg: Math.round(avg * 100) / 100,
        min: Math.min(...group.values),
        max: Math.max(...group.values),
        goal,
        pct: attainment(avg, goal, indicator.polarity),
      };
    }),
  };
}

async function reportResultados(query) {
  requireProgramId(query);
  const results = await resultsForExport(query);
  return {
    title: 'Relatório de Resultados',
    subtitle: `${results.length} lançamentos${query.year ? ` · ${query.year}` : ''}`,
    columns: [
      { key: 'year', label: 'Ano', format: 'int' },
      { key: 'period', label: 'Período' },
      { key: 'program', label: 'Programa' },
      { key: 'school', label: 'Escola' },
      { key: 'indicator', label: 'Critério' },
      { key: 'value', label: 'Resultado', format: 'number' },
      { key: 'unit', label: 'Unidade' },
    ],
    rows: results.map((r) => ({
      year: r.year,
      period: r.period,
      program: r.program.name,
      school: r.school.name,
      indicator: r.indicator.name,
      value: r.value,
      unit: r.indicator.unit || '',
    })),
  };
}

async function reportMetas(query) {
  requireProgramId(query);
  const data = await goalsStatus({
    programId: query.programId,
    year: query.year ? Number(query.year) : undefined,
    period: query.period && query.period !== 'todos' ? query.period : undefined,
    indicatorId: query.indicatorId,
  });

  const goalList = await listGoals({
    ...query,
    pageSize: 1,
    year: query.year,
    period: query.period && query.period !== 'todos' ? query.period : undefined,
  });

  return {
    title: 'Relatório de Metas x Resultados',
    subtitle: `${data.period || '—'} · ${data.totals.met} atingidas / ${data.totals.notMet} não atingidas`,
    columns: [
      { key: 'indicatorCode', label: 'Código' },
      { key: 'indicatorName', label: 'Critério' },
      { key: 'met', label: 'Atingidas', format: 'int' },
      { key: 'notMet', label: 'Não Atingidas', format: 'int' },
      { key: 'total', label: 'Total', format: 'int' },
      { key: 'pct', label: '% Atingimento', format: 'percent' },
    ],
    rows: data.byIndicator.map((i) => ({
      ...i,
      pct: i.total ? Math.round((i.met / i.total) * 1000) / 10 : null,
    })),
    extra: { goalsRegistered: goalList.pagination.total },
  };
}

async function reportRanking(query) {
  const programId = requireProgramId(query);
  const ranking = await computeRanking({
    programId,
    indicatorId: query.indicatorId || undefined,
    year: query.year ? Number(query.year) : undefined,
    period: query.period && query.period !== 'todos' ? query.period : undefined,
  });
  return {
    title: 'Relatório de Ranking por Programa',
    subtitle: `${ranking.period || '—'}/${ranking.year} · ${ranking.rows.length} escolas`,
    columns: [
      { key: 'position', label: 'Posição', format: 'int' },
      { key: 'schoolName', label: 'Escola' },
      { key: 'schoolInep', label: 'INEP' },
      { key: 'score', label: 'Pontuação', format: 'score' },
      { key: 'classification', label: 'Classif.' },
      { key: 'previousPosition', label: 'Pos. Anterior', format: 'int' },
      { key: 'positionDiff', label: 'Evolução', format: 'int' },
    ],
    rows: ranking.rows.map((r) => ({ ...r, classification: `${r.classification} (${classificationLabel(r.classification)})` })),
  };
}

async function reportEvolucao(query) {
  const programId = requireProgramId(query);
  const series = await evolutionSeries({
    programId,
    indicatorId: query.indicatorId || undefined,
    year: query.year ? Number(query.year) : undefined,
  });
  return {
    title: 'Relatório de Evolução Temporal',
    subtitle: 'Programa específico',
    columns: [
      { key: 'label', label: 'Período' },
      { key: 'schoolsCount', label: 'Escolas', format: 'int' },
      { key: 'avgScore', label: 'Pontuação Média', format: 'score' },
    ],
    rows: series,
  };
}

const BUILDERS = {
  geral: reportGeral,
  escola: reportEscola,
  programa: reportPrograma,
  indicador: reportIndicador,
  resultados: reportResultados,
  metas: reportMetas,
  ranking: reportRanking,
  evolucao: reportEvolucao,
};

export const REPORT_TYPES = Object.keys(BUILDERS).map((key) => ({
  key,
  label: {
    geral: 'Relatório Geral',
    escola: 'Relatório por Escola',
    programa: 'Relatório por Programa',
    indicador: 'Relatório por Critério',
    resultados: 'Relatório de Resultados',
    metas: 'Relatório de Metas',
    ranking: 'Relatório de Ranking',
    evolucao: 'Relatório de Evolução',
  }[key],
}));

export async function buildReport(type, query) {
  const builder = BUILDERS[type];
  if (!builder) throw new HttpError(400, `Tipo de relatório inválido: ${type}`, 'BAD_REQUEST');

  if (query.programId) {
    const pacto = await prisma.program.findFirst({
      where: { id: query.programId, deletedAt: null, catalog: { code: PACTO_CATALOG_CODE } },
      select: { id: true },
    });
    if (pacto) {
      throw new HttpError(
        422,
        'O Pacto possui relatório próprio na área específica do programa.',
        'PROGRAM_REPORT_UNAVAILABLE',
      );
    }
  }

  return builder(query);
}
