import { prisma } from '../lib/prisma.js';
import { ATTAINMENT_CAP, classify, periodOrder } from '../lib/constants.js';

/**
 * Núcleo de cálculo do CPE:
 *   Resultado + Meta -> Atingimento (%) -> Pontuação ponderada -> Classificação -> Ranking
 */

export function attainment(value, goal, polarity = 'MAIOR_MELHOR') {
  if (goal === null || goal === undefined || Number.isNaN(Number(value))) return null;
  const v = Number(value);
  const g = Number(goal);
  if (g <= 0) return null;
  let pct;
  if (polarity === 'MENOR_MELHOR') {
    // Ex.: meta 10 e resultado 5 => 200%. Zero representa o melhor resultado
    // possível e recebe o teto; valores negativos não são comparáveis.
    if (v < 0) return null;
    pct = v === 0 ? ATTAINMENT_CAP : (g / v) * 100;
  } else {
    pct = (v / g) * 100;
  }
  return Math.max(0, Math.min(ATTAINMENT_CAP, Math.round(pct * 10) / 10));
}

/** Carrega tudo o que é preciso para calcular pontuações de um escopo. */
export async function loadScope({ programId, indicatorId, year, schoolId }) {
  const parsedYear = Number(year);
  const hasYear = Number.isInteger(parsedYear);
  const resultWhere = {
    ...(hasYear && { year: parsedYear }),
    ...(programId && { programId }),
    ...(indicatorId && { indicatorId }),
    ...(schoolId && { schoolId }),
    program: { deletedAt: null },
    school: { deletedAt: null },
    indicator: { deletedAt: null },
  };

  const [results, goals, programIndicators, programSchools, indicatorsRaw, schoolsRaw, programsRaw] = await Promise.all([
    prisma.result.findMany({
      where: resultWhere,
      select: {
        programId: true,
        schoolId: true,
        indicatorId: true,
        period: true,
        year: true,
        value: true,
        updatedAt: true,
      },
    }),
    prisma.goal.findMany({
      where: { ...(hasYear && { year: parsedYear }) },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        scope: true,
        year: true,
        programId: true,
        schoolId: true,
        indicatorId: true,
        period: true,
        value: true,
        description: true,
      },
    }),
    prisma.programIndicator.findMany({
      where: {
        active: true,
        program: { deletedAt: null, ...(programId ? { id: programId } : {}) },
        ...(indicatorId ? { indicatorId } : {}),
      },
      select: {
        programId: true,
        indicatorId: true,
        weight: true,
        goal: true,
        indicator: { select: { weight: true, defaultGoal: true, polarity: true } },
      },
    }),
    prisma.programSchool.findMany({
      where: {
        active: true,
        program: { deletedAt: null, ...(programId ? { id: programId } : {}) },
        school: { deletedAt: null, ...(schoolId ? { id: schoolId } : {}) },
      },
      select: { programId: true, schoolId: true },
    }),
    prisma.indicator.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, unit: true, polarity: true, weight: true, defaultGoal: true },
    }),
    prisma.school.findMany({
      where: { deletedAt: null },
      select: { id: true, inep: true, name: true },
    }),
    prisma.program.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, year: true, status: true },
    }),
  ]);

  const indicatorById = new Map(indicatorsRaw.map((i) => [i.id, i]));
  const schoolById = new Map(schoolsRaw.map((s) => [s.id, s]));
  const programById = new Map(programsRaw.map((p) => [p.id, p]));

  // peso/meta efetivos do indicador dentro de cada programa
  const programIndicatorMap = new Map();
  for (const pi of programIndicators) {
    programIndicatorMap.set(`${pi.programId}:${pi.indicatorId}`, {
      weight: pi.weight ?? pi.indicator.weight ?? 1,
      goal: pi.goal ?? pi.indicator.defaultGoal ?? null,
    });
  }

  const programSchoolSet = new Set(
    programSchools.map((link) => `${link.programId}:${link.schoolId}`),
  );

  return {
    results,
    goals,
    programIndicatorMap,
    programSchoolSet,
    indicatorById,
    schoolById,
    programById,
  };
}

function resolveGoal(goals, { programId, schoolId, indicatorId, year, period }) {
  const score = (g) =>
    (g.indicatorId === indicatorId && g.indicatorId ? 8 : 0) +
    (g.programId ? 4 : 0) +
    (g.schoolId ? 2 : 0) +
    (g.period ? 1 : 0);
  let best = null;
  let bestScore = -1;
  for (const g of goals) {
    if (g.year !== year) continue;
    if (g.programId && g.programId !== programId) continue;
    if (g.schoolId && g.schoolId !== schoolId) continue;
    if (g.indicatorId && g.indicatorId !== indicatorId) continue;
    if (g.period && g.period !== period) continue;
    const s = score(g);
    if (s > bestScore) {
      best = g;
      bestScore = s;
    }
  }
  return best;
}

function sortPeriods(a, b) {
  return a.year - b.year || periodOrder(a.period) - periodOrder(b.period);
}

/** Agrega por escola+programa: pontuação ponderada dos indicadores com meta. */
function aggregate(scope, { year, period, indicatorOnly }) {
  const bySchool = new Map();

  for (const r of scope.results) {
    if (year && r.year !== Number(year)) continue;
    if (period && r.period !== period) continue;
    const indicator = scope.indicatorById.get(r.indicatorId);
    if (!indicator) continue;
    if (!scope.programSchoolSet.has(`${r.programId}:${r.schoolId}`)) continue;

    const pi = scope.programIndicatorMap.get(`${r.programId}:${r.indicatorId}`);
    if (!pi) continue;
    const goalRecord = resolveGoal(scope.goals, {
      programId: r.programId,
      schoolId: r.schoolId,
      indicatorId: r.indicatorId,
      year: r.year,
      period: r.period,
    });

    const goalValue = goalRecord
      ? goalRecord.value
      : pi?.goal ?? indicator.defaultGoal ?? null;

    const pct = attainment(r.value, goalValue, indicator.polarity);
    if (pct === null) continue; // sem meta não pontua

    const weight = indicatorOnly ? 1 : pi?.weight ?? indicator.weight ?? 1;
    const key = `${r.schoolId}::${r.programId}`;
    if (!bySchool.has(key)) {
      bySchool.set(key, {
        schoolId: r.schoolId,
        programId: r.programId,
        weighted: 0,
        weights: 0,
        indicators: [],
        results: 0,
      });
    }
    const agg = bySchool.get(key);
    agg.weighted += pct * weight;
    agg.weights += weight;
    agg.results += 1;
    agg.indicators.push({
      indicatorId: r.indicatorId,
      indicatorCode: indicator.code,
      indicatorName: indicator.name,
      unit: indicator.unit,
      value: r.value,
      goal: goalValue,
      pct,
      weight,
    });
  }

  for (const agg of bySchool.values()) {
    agg.score = agg.weights > 0 ? Math.round((agg.weighted / agg.weights) * 10) / 10 : null;
    agg.classification = classify(agg.score);
  }
  return [...bySchool.values()].filter((a) => a.score !== null);
}

async function resolveRankingYear({ year, programId, indicatorId, schoolId }) {
  const parsed = Number(year);
  if (Number.isInteger(parsed)) return parsed;
  const latest = await prisma.result.findFirst({
    where: {
      ...(programId && { programId }),
      ...(indicatorId && { indicatorId }),
      ...(schoolId && { schoolId }),
      program: { deletedAt: null },
      school: { deletedAt: null },
      indicator: { deletedAt: null },
    },
    orderBy: { year: 'desc' },
    select: { year: true },
  });
  return latest?.year ?? new Date().getFullYear();
}

/**
 * Ranking completo com evolução (posição e pontuação no período anterior).
 * Escopos: por programa (programId), por indicador (indicatorId) ou geral.
 */
export async function computeRanking(params) {
  const { programId, indicatorId, period, schoolId, limit } = params;
  const year = await resolveRankingYear(params);
  const scope = await loadScope({ programId, indicatorId, year, schoolId });

  // períodos disponíveis no escopo (p/ evolução)
  const periodSet = new Set(scope.results.map((r) => `${r.year}|${r.period}`));
  const periods = [...periodSet]
    .map((s) => {
      const [y, p] = s.split('|');
      return { year: Number(y), period: p };
    })
    .sort(sortPeriods);

  const current = period
    ? { year: Number(year), period }
    : periods.length
      ? periods[periods.length - 1]
      : null;

  if (!current) {
    return { year: Number(year), period: null, previousPeriod: null, rows: [], periods };
  }

  const idx = periods.findIndex((p) => p.year === current.year && p.period === current.period);
  const previous = idx > 0 ? periods[idx - 1] : null;

  const currentAggs = aggregate(scope, {
    year: current.year,
    period: current.period,
    indicatorOnly: Boolean(indicatorId),
  });

  // agrupa por escola (quando ranking geral soma todos os programas)
  const bySchool = new Map();
  for (const agg of currentAggs) {
    if (!bySchool.has(agg.schoolId)) {
      bySchool.set(agg.schoolId, {
        schoolId: agg.schoolId,
        weighted: 0,
        weights: 0,
        indicators: [],
        programIds: [],
        results: 0,
      });
    }
    const s = bySchool.get(agg.schoolId);
    s.weighted += agg.score * agg.weights;
    s.weights += agg.weights;
    s.results += agg.results;
    s.indicators.push(...agg.indicators);
    s.programIds.push(agg.programId);
  }

  let rows = [...bySchool.values()].map((s) => {
    const school = scope.schoolById.get(s.schoolId);
    const score = Math.round((s.weighted / s.weights) * 10) / 10;
    return {
      schoolId: s.schoolId,
      schoolName: school?.name || '—',
      schoolInep: school?.inep || '—',
      programsCount: s.programIds.length,
      score,
      classification: classify(score),
      resultsCount: s.results,
      indicators: s.indicators,
    };
  });

  rows.sort((a, b) => b.score - a.score || a.schoolName.localeCompare(b.schoolName, 'pt-BR'));
  rows.forEach((r, i) => (r.position = i + 1));

  // evolução vs período anterior
  if (previous) {
    const prevAggs = aggregate(scope, {
      year: previous.year,
      period: previous.period,
      indicatorOnly: Boolean(indicatorId),
    });
    const prevBySchool = new Map();
    for (const agg of prevAggs) {
      if (!prevBySchool.has(agg.schoolId)) prevBySchool.set(agg.schoolId, { weighted: 0, weights: 0 });
      const p = prevBySchool.get(agg.schoolId);
      p.weighted += agg.score * agg.weights;
      p.weights += agg.weights;
    }
    const prevScores = [...prevBySchool.entries()].map(([sid, p]) => ({
      schoolId: sid,
      score: p.weights ? Math.round((p.weighted / p.weights) * 10) / 10 : null,
    }));
    prevScores.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    const prevPositions = new Map(prevScores.map((p, i) => [p.schoolId, i + 1]));
    const prevScoreMap = new Map(prevScores.map((p) => [p.schoolId, p.score]));

    for (const row of rows) {
      const ps = prevScoreMap.get(row.schoolId);
      const pp = prevPositions.get(row.schoolId);
      row.previousScore = ps ?? null;
      row.scoreDiff = ps !== undefined && ps !== null ? Math.round((row.score - ps) * 10) / 10 : null;
      row.previousPosition = pp ?? null;
      row.positionDiff = pp ? pp - row.position : null; // positivo = subiu
    }
  }

  if (limit) rows = rows.slice(0, limit);

  return {
    year: current.year,
    period: current.period,
    previousPeriod: previous,
    periods,
    rows,
  };
}

/** Série de evolução temporal (pontuação média por período). */
export async function evolutionSeries({ programId, indicatorId, year, schoolId }) {
  const scope = await loadScope({ programId, indicatorId, year, schoolId });
  const periodSet = new Set(scope.results.map((r) => `${r.year}|${r.period}`));
  const periods = [...periodSet]
    .map((s) => {
      const [y, p] = s.split('|');
      return { year: Number(y), period: p };
    })
    .sort(sortPeriods);

  const series = [];
  for (const p of periods) {
    const aggs = aggregate(scope, { year: p.year, period: p.period, indicatorOnly: Boolean(indicatorId) });
    if (!aggs.length) continue;
    const bySchool = new Map();
    for (const a of aggs) {
      if (!bySchool.has(a.schoolId)) bySchool.set(a.schoolId, { w: 0, t: 0 });
      const s = bySchool.get(a.schoolId);
      s.w += a.score * a.weights;
      s.t += a.weights;
    }
    const avg = [...bySchool.values()].reduce((acc, s, _, arr) => acc + s.w / s.t / arr.length, 0);
    series.push({
      label: `${p.period}/${p.year}`,
      year: p.year,
      period: p.period,
      avgScore: Math.round(avg * 10) / 10,
      schoolsCount: bySchool.size,
    });
  }
  return series;
}

/** Distribuição de classificações A-E das escolas. */
export async function classificationDistribution(params) {
  const ranking = await computeRanking(params);
  const dist = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const row of ranking.rows) dist[row.classification] = (dist[row.classification] || 0) + 1;
  return { period: ranking.period, year: ranking.year, total: ranking.rows.length, distribution: dist, rows: ranking.rows };
}

/** Comparação entre escolas (série por período). */
export async function compareSchools({ schoolIds, programId, year }) {
  if (!schoolIds?.length) return [];
  const scope = await loadScope({ programId, year });
  const periodSet = new Set(scope.results.filter((r) => schoolIds.includes(r.schoolId)).map((r) => `${r.year}|${r.period}`));
  const periods = [...periodSet]
    .map((s) => {
      const [y, p] = s.split('|');
      return { year: Number(y), period: p };
    })
    .sort(sortPeriods);

  return schoolIds.map((id) => {
    const school = scope.schoolById.get(id) || { name: '—', inep: '—' };
    const subScope = { ...scope, results: scope.results.filter((r) => r.schoolId === id) };
    const data = periods.map((p) => {
      const aggs = aggregate(subScope, { year: p.year, period: p.period, indicatorOnly: false });
      if (!aggs.length) return { label: `${p.period}/${p.year}`, score: null, classification: null };
      const avg = aggs.reduce((acc, a) => acc + a.score * a.weights, 0) / aggs.reduce((acc, a) => acc + a.weights, 0);
      const score = Math.round(avg * 10) / 10;
      return { label: `${p.period}/${p.year}`, score, classification: classify(score) };
    });
    return { schoolId: id, schoolName: school.name, inep: school.inep, data };
  });
}

/** Comparação entre programas em um ano/período. */
export async function comparePrograms({ year, period }) {
  const scope = await loadScope({ year });
  const periodSet = new Set(scope.results.map((r) => `${r.year}|${r.period}`));
  const periods = [...periodSet]
    .map((s) => {
      const [y, p] = s.split('|');
      return { year: Number(y), period: p };
    })
    .sort(sortPeriods);
  const current = period || (periods.length ? periods[periods.length - 1].period : null);

  const out = [];
  for (const program of scope.programById.values()) {
    const subScope = { ...scope, results: scope.results.filter((r) => r.programId === program.id) };
    if (!subScope.results.length) continue;
    const series = periods
      .filter((p) => subScope.results.some((r) => r.period === p.period))
      .map((p) => {
        const aggs = aggregate(subScope, { year: p.year, period: p.period, indicatorOnly: false });
        if (!aggs.length) return { label: `${p.period}/${p.year}`, score: null };
        const avg = aggs.reduce((acc, a) => acc + a.score * a.weights, 0) / aggs.reduce((acc, a) => acc + a.weights, 0);
        return { label: `${p.period}/${p.year}`, score: Math.round(avg * 10) / 10 };
      });
    const currentPoint = series.find((s) => s.label.startsWith(current || '##'));
    const schools = new Set(subScope.results.map((r) => r.schoolId)).size;
    out.push({
      programId: program.id,
      code: program.code,
      programName: program.name,
      year: program.year,
      status: program.status,
      schoolsCount: schools,
      currentScore: currentPoint?.score ?? null,
      series,
    });
  }
  out.sort((a, b) => (b.currentScore ?? -1) - (a.currentScore ?? -1));
  return { period: current, programs: out };
}

/** Metas x Resultados: por escola/indicador, acima ou abaixo da meta. */
export async function goalsStatus({ programId, year, period, indicatorId }) {
  const ranking = await computeRanking({ programId, year, period, indicatorId });
  const perIndicator = [];
  const indicatorMap = new Map();

  for (const row of ranking.rows) {
    for (const ind of row.indicators) {
      if (!indicatorMap.has(ind.indicatorId)) {
        indicatorMap.set(ind.indicatorId, {
          indicatorId: ind.indicatorId,
          indicatorCode: ind.indicatorCode,
          indicatorName: ind.indicatorName,
          unit: ind.unit,
          met: 0,
          notMet: 0,
          total: 0,
        });
      }
      const entry = indicatorMap.get(ind.indicatorId);
      entry.total += 1;
      ind.pct >= 100 ? (entry.met += 1) : (entry.notMet += 1);
      perIndicator.push({
        schoolId: row.schoolId,
        schoolName: row.schoolName,
        position: row.position,
        ...ind,
        status: ind.pct >= 100 ? 'ATINGIDA' : 'NAO_ATINGIDA',
      });
    }
  }

  const met = ranking.rows.filter((r) => r.classification === 'A').length;
  return {
    period: ranking.period,
    year: ranking.year,
    totals: {
      schools: ranking.rows.length,
      met,
      notMet: ranking.rows.length - met,
    },
    byIndicator: [...indicatorMap.values()],
    rows: perIndicator,
  };
}
