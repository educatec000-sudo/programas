import { prisma } from '../../lib/prisma.js';
import { notFound, conflict } from '../../lib/errors.js';
import { audit, AuditAction } from '../../lib/audit.js';
import {
  PARC_CATALOG_CODE,
  PARC_DEFAULT_YEAR,
  PARC_DEFAULT_GRADE,
  PARC_ASSESSMENT_NAME,
  PARC_CYCLES,
  PARC_FLUENCY_LEVELS,
  PARC_RANKING_INDICATORS,
  PARC_EVOLUTION_INDICATORS,
  normalizeParcText,
} from './config.js';

function round1(val) {
  if (val == null || !Number.isFinite(val)) return null;
  return Math.round(val * 10) / 10;
}

/**
 * Retorna os filtros disponíveis e metadados estruturais do programa PARC.
 */
export async function getParcFilters(programId) {
  const [networkCount, participatingSchools, results, allSchools] = await Promise.all([
    prisma.school.count({ where: { deletedAt: null } }),
    prisma.programSchool.findMany({
      where: { programId, active: true, school: { deletedAt: null } },
      include: {
        school: {
          select: { id: true, inep: true, name: true, zone: true, district: true },
        },
      },
      orderBy: { school: { name: 'asc' } },
    }),
    prisma.parcSchoolResult.findMany({
      where: { programId },
      include: {
        school: {
          select: { id: true, inep: true, name: true, zone: true, district: true },
        },
      },
    }),
    prisma.school.findMany({
      where: { deletedAt: null },
      select: { zone: true, district: true },
    }),
  ]);

  const distinctZones = Array.from(
    new Set(
      [
        ...participatingSchools.map((ps) => ps.school?.zone),
        ...results.map((r) => r.school?.zone),
        ...allSchools.map((s) => s.zone),
      ]
        .filter(Boolean)
        .map((z) => String(z).trim())
    )
  ).sort();

  const distinctDistricts = Array.from(
    new Set(
      [
        ...participatingSchools.map((ps) => ps.school?.district),
        ...results.map((r) => r.school?.district),
        ...allSchools.map((s) => s.district),
      ]
        .filter(Boolean)
        .map((d) => String(d).trim())
        .filter((d) => d.length > 0)
    )
  ).sort();

  const years = Array.from(new Set([2026, ...results.map((r) => r.year).filter(Boolean)])).sort();
  const cyclesPresent = Array.from(new Set(results.map((r) => r.cycle)));
  const draftCount = results.filter((r) => r.source === 'RASCUNHO').length;

  return {
    totalNetworkSchools: networkCount,
    totalParticipatingSchools: participatingSchools.length,
    zones: distinctZones,
    districts: distinctDistricts,
    years,
    cycles: Object.values(PARC_CYCLES),
    cyclesPresent,
    draftCount,
    rankingIndicators: PARC_RANKING_INDICATORS,
    evolutionIndicators: PARC_EVOLUTION_INDICATORS,
    schools: participatingSchools.map((ps) => ps.school),
  };
}

/**
 * Calcula os KPIs do Dashboard e distribuições de Fluência Leitora do PARC.
 */
export async function getParcDashboard(programId, query = {}) {
  const selectedCycle = query.cycle && query.cycle !== 'TODOS' && query.cycle !== 'COMPARATIVO' ? query.cycle : null;
  const isComparative = query.cycle === 'COMPARATIVO';
  const zoneFilter = query.zone && query.zone !== 'TODAS' ? query.zone : null;
  const districtFilter = query.district && query.district !== 'TODOS' ? query.district : null;
  const searchFilter = query.search ? normalizeParcText(query.search) : null;

  const schoolWhere = {
    deletedAt: null,
    ...(zoneFilter && { zone: { equals: zoneFilter, mode: 'insensitive' } }),
    ...(districtFilter && { district: { equals: districtFilter, mode: 'insensitive' } }),
  };

  const [networkCount, participatingSchools, allResults, program] = await Promise.all([
    prisma.school.count({ where: { deletedAt: null } }),
    prisma.programSchool.findMany({
      where: {
        programId,
        active: true,
        school: schoolWhere,
      },
      include: {
        school: {
          select: { id: true, inep: true, name: true, zone: true, district: true },
        },
      },
    }),
    prisma.parcSchoolResult.findMany({
      where: {
        programId,
        ...(selectedCycle && { cycle: selectedCycle }),
        school: schoolWhere,
      },
      include: {
        school: {
          select: { id: true, inep: true, name: true, zone: true, district: true },
        },
      },
      orderBy: { school: { name: 'asc' } },
    }),
    prisma.program.findFirst({
      where: { id: programId },
      select: { name: true, year: true },
    }),
  ]);

  // Filtra por busca caso fornecido
  const filteredResults = searchFilter
    ? allResults.filter((r) => {
        const sName = normalizeParcText(r.school?.name);
        const inep = String(r.school?.inep || '');
        return sName.includes(searchFilter) || inep.includes(searchFilter);
      })
    : allResults;

  // Separa resultados por ciclo
  const entradaResults = filteredResults.filter((r) => r.cycle === 'ENTRADA');
  const saidaResults = filteredResults.filter((r) => r.cycle === 'SAIDA');

  // Determina o conjunto principal para exibição (se ciclo específico foi escolhido, usa ele; senão Entrada ou Saída)
  const activeResultSet = selectedCycle === 'SAIDA' ? saidaResults : (selectedCycle === 'ENTRADA' ? entradaResults : (saidaResults.length > 0 ? saidaResults : entradaResults));

  // Cálculo de totais previstos e avaliados
  const totalEnrolled = activeResultSet.reduce((sum, r) => sum + (r.enrolled || 0), 0);
  const totalEvaluated = activeResultSet.reduce((sum, r) => sum + (r.evaluated || 0), 0);
  const avgParticipation = totalEnrolled > 0
    ? round1((totalEvaluated / totalEnrolled) * 100)
    : (activeResultSet.length > 0 ? round1(activeResultSet.reduce((s, r) => s + (r.participationRate || 0), 0) / activeResultSet.length) : 0);

  // Contagens agregadas de alunos por nível de fluência
  let countPreReaderLevel1 = 0;
  let countPreReaderLevel2 = 0;
  let countPreReaderLevel3 = 0;
  let countPreReaderLevel4 = 0;
  let countBeginnerReader = 0;
  let countFluentReader = 0;

  for (const r of activeResultSet) {
    const ev = r.evaluated || 0;
    if (ev > 0) {
      countPreReaderLevel1 += Math.round(ev * ((r.preReaderLevel1 || 0) / 100));
      countPreReaderLevel2 += Math.round(ev * ((r.preReaderLevel2 || 0) / 100));
      countPreReaderLevel3 += Math.round(ev * ((r.preReaderLevel3 || 0) / 100));
      countPreReaderLevel4 += Math.round(ev * ((r.preReaderLevel4 || 0) / 100));
      countBeginnerReader += Math.round(ev * ((r.beginnerReader || 0) / 100));
      countFluentReader += Math.round(ev * ((r.fluentReader || 0) / 100));
    }
  }

  const countPreReaderTotal = countPreReaderLevel1 + countPreReaderLevel2 + countPreReaderLevel3 + countPreReaderLevel4;
  const countBeginnerPlusFluent = countBeginnerReader + countFluentReader;

  // Percentuais agregados
  const pctPreReaderLevel1 = totalEvaluated > 0 ? round1((countPreReaderLevel1 / totalEvaluated) * 100) : 0;
  const pctPreReaderLevel2 = totalEvaluated > 0 ? round1((countPreReaderLevel2 / totalEvaluated) * 100) : 0;
  const pctPreReaderLevel3 = totalEvaluated > 0 ? round1((countPreReaderLevel3 / totalEvaluated) * 100) : 0;
  const pctPreReaderLevel4 = totalEvaluated > 0 ? round1((countPreReaderLevel4 / totalEvaluated) * 100) : 0;
  const pctBeginnerReader = totalEvaluated > 0 ? round1((countBeginnerReader / totalEvaluated) * 100) : 0;
  const pctFluentReader = totalEvaluated > 0 ? round1((countFluentReader / totalEvaluated) * 100) : 0;
  const pctPreReaderTotal = round1(pctPreReaderLevel1 + pctPreReaderLevel2 + pctPreReaderLevel3 + pctPreReaderLevel4);
  const pctBeginnerPlusFluent = round1(pctBeginnerReader + pctFluentReader);

  // Índice de Fluência Leitora (IFL) oficial na escala de 0 a 10
  const ifl = totalEvaluated > 0
    ? round1((0 * countPreReaderLevel1 + 1.0 * countPreReaderLevel2 + 2.0 * countPreReaderLevel3 + 3.5 * countPreReaderLevel4 + 7.0 * countBeginnerReader + 10.0 * countFluentReader) / totalEvaluated)
    : 0;

  // Fatias oficiais do gráfico de pizza
  const pieSlices = [
    { id: 'preReaderLevel1', label: 'Pré-leitor 1 (Não Leu)', count: countPreReaderLevel1, percentage: pctPreReaderLevel1, color: '#faecc5' },
    { id: 'preReaderLevel2', label: 'Pré-leitor 2 (Soletrou)', count: countPreReaderLevel2, percentage: pctPreReaderLevel2, color: '#fde09e' },
    { id: 'preReaderLevel3', label: 'Pré-leitor 3 (Silabou)', count: countPreReaderLevel3, percentage: pctPreReaderLevel3, color: '#fcc86e' },
    { id: 'preReaderLevel4', label: 'Pré-leitor 4 (Leu até 10 Palavras)', count: countPreReaderLevel4, percentage: pctPreReaderLevel4, color: '#f9a84d' },
    { id: 'beginnerReader', label: 'Leitor iniciante', count: countBeginnerReader, percentage: pctBeginnerReader, color: '#8cd04e' },
    { id: 'fluentReader', label: 'Leitor fluente', count: countFluentReader, percentage: pctFluentReader, color: '#00a650' },
  ];

  // Análise comparativa Entrada × Saída (se existirem escolas avaliadas em ambos os ciclos)
  const entradaBySchool = new Map(entradaResults.map((r) => [r.schoolId, r]));
  const saidaBySchool = new Map(saidaResults.map((r) => [r.schoolId, r]));

  const comparativeSchools = [];
  let totalDeltaFluent = 0;
  let totalDeltaPreReaderReduction = 0;
  let totalDeltaBeginnerPlusFluent = 0;

  for (const [schoolId, saidaRec] of saidaBySchool.entries()) {
    const entradaRec = entradaBySchool.get(schoolId);
    if (entradaRec) {
      const deltaFluent = (saidaRec.fluentReader != null && entradaRec.fluentReader != null)
        ? round1(saidaRec.fluentReader - entradaRec.fluentReader)
        : null;
      const deltaPreReaderReduction = (saidaRec.preReaderTotal != null && entradaRec.preReaderTotal != null)
        ? round1(entradaRec.preReaderTotal - saidaRec.preReaderTotal)
        : null;
      const entradaBegFlu = (entradaRec.beginnerReader || 0) + (entradaRec.fluentReader || 0);
      const saidaBegFlu = (saidaRec.beginnerReader || 0) + (saidaRec.fluentReader || 0);
      const deltaBeginnerPlusFluent = round1(saidaBegFlu - entradaBegFlu);

      if (deltaFluent != null) totalDeltaFluent += deltaFluent;
      if (deltaPreReaderReduction != null) totalDeltaPreReaderReduction += deltaPreReaderReduction;
      if (deltaBeginnerPlusFluent != null) totalDeltaBeginnerPlusFluent += deltaBeginnerPlusFluent;

      comparativeSchools.push({
        schoolId,
        school: saidaRec.school,
        entrada: entradaRec,
        saida: saidaRec,
        deltaFluent,
        deltaPreReaderReduction,
        deltaBeginnerPlusFluent,
      });
    }
  }

  const bothCyclesCount = comparativeSchools.length;
  const evolutionKpis = bothCyclesCount > 0 ? {
    evaluatedSchoolsBothCycles: bothCyclesCount,
    avgDeltaFluent: round1(totalDeltaFluent / bothCyclesCount),
    avgDeltaPreReaderReduction: round1(totalDeltaPreReaderReduction / bothCyclesCount),
    avgDeltaBeginnerPlusFluent: round1(totalDeltaBeginnerPlusFluent / bothCyclesCount),
  } : null;

  // Distribuição por Zona (Sede, Ilhas, Estradas / Urbana vs Rural)
  const zoneSummaryMap = new Map();
  for (const r of activeResultSet) {
    const z = r.school?.zone || 'NÃO INFORMADA';
    const entry = zoneSummaryMap.get(z) || {
      zone: z,
      schoolsCount: 0,
      enrolled: 0,
      evaluated: 0,
      preReaderCount: 0,
      beginnerCount: 0,
      fluentCount: 0,
    };
    const ev = r.evaluated || 0;
    entry.schoolsCount++;
    entry.enrolled += (r.enrolled || 0);
    entry.evaluated += ev;
    entry.preReaderCount += Math.round(ev * ((r.preReaderTotal || 0) / 100));
    entry.beginnerCount += Math.round(ev * ((r.beginnerReader || 0) / 100));
    entry.fluentCount += Math.round(ev * ((r.fluentReader || 0) / 100));
    zoneSummaryMap.set(z, entry);
  }

  const zoneBreakdown = Array.from(zoneSummaryMap.values()).map((item) => {
    const partRate = item.enrolled > 0 ? round1((item.evaluated / item.enrolled) * 100) : 0;
    const preRate = item.evaluated > 0 ? round1((item.preReaderCount / item.evaluated) * 100) : 0;
    const begRate = item.evaluated > 0 ? round1((item.beginnerCount / item.evaluated) * 100) : 0;
    const fluRate = item.evaluated > 0 ? round1((item.fluentCount / item.evaluated) * 100) : 0;

    return {
      zone: item.zone,
      schoolsCount: item.schoolsCount,
      enrolled: item.enrolled,
      evaluated: item.evaluated,
      participationRate: partRate,
      preReaderTotal: preRate,
      beginnerReader: begRate,
      fluentReader: fluRate,
    };
  }).sort((a, b) => b.evaluated - a.evaluated);

  const draftCount = allResults.filter((r) => r.source === 'RASCUNHO').length;

  return {
    kpis: {
      totalNetworkSchools: networkCount,
      totalParticipatingSchools: participatingSchools.length,
      totalEvaluatedSchools: activeResultSet.length,
      coverageRate: networkCount > 0 ? round1((activeResultSet.length / networkCount) * 100) : 0,
      totalEnrolled,
      totalEvaluated,
      participationRate: avgParticipation,
      beginnerPlusFluent: pctBeginnerPlusFluent,
      ifl,
      preReaderTotal: pctPreReaderTotal,
      preReaderLevel1: pctPreReaderLevel1,
      preReaderLevel2: pctPreReaderLevel2,
      preReaderLevel3: pctPreReaderLevel3,
      preReaderLevel4: pctPreReaderLevel4,
      beginnerReader: pctBeginnerReader,
      fluentReader: pctFluentReader,
      counts: {
        totalEnrolled,
        totalEvaluated,
        countPreReaderTotal,
        countPreReaderLevel1,
        countPreReaderLevel2,
        countPreReaderLevel3,
        countPreReaderLevel4,
        countBeginnerReader,
        countFluentReader,
        countBeginnerPlusFluent,
      },
      draftCount,
    },
    pieSlices,
    municipalityName: 'ABAETETUBA',
    cycle: selectedCycle || (isComparative ? 'COMPARATIVO' : (activeResultSet[0]?.cycle || 'ENTRADA')),
    hasEntrada: entradaResults.length > 0,
    hasSaida: saidaResults.length > 0,
    hasBothCycles: bothCyclesCount > 0,
    evolutionKpis,
    zoneBreakdown,
    comparativeSchools: comparativeSchools.slice(0, 50),
  };
}

/**
 * Consulta e lista os resultados detalhados por escola do PARC.
 */
export async function getParcSchoolResults(programId, query = {}) {
  const { cycle, zone, district, search, status } = query;

  const where = {
    programId,
    ...(cycle && cycle !== 'TODOS' && { cycle }),
    ...(status === 'RASCUNHO' && { source: 'RASCUNHO' }),
    ...(status === 'PUBLISHED' && { source: { not: 'RASCUNHO' } }),
    school: {
      deletedAt: null,
      ...(zone && zone !== 'TODAS' && { zone: { equals: zone, mode: 'insensitive' } }),
      ...(district && district !== 'TODOS' && { district: { equals: district, mode: 'insensitive' } }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { inep: { contains: search } },
        ],
      }),
    },
  };

  const results = await prisma.parcSchoolResult.findMany({
    where,
    include: {
      school: {
        select: { id: true, inep: true, name: true, zone: true, district: true },
      },
    },
    orderBy: [{ cycle: 'asc' }, { school: { name: 'asc' } }],
  });

  const formatted = results.map((r) => ({
    id: r.id,
    programId: r.programId,
    schoolId: r.schoolId,
    school: r.school,
    year: r.year,
    grade: r.grade,
    assessment: r.assessment,
    cycle: r.cycle,
    enrolled: r.enrolled,
    evaluated: r.evaluated,
    participationRate: r.participationRate,
    preReaderTotal: r.preReaderTotal,
    preReaderLevel1: r.preReaderLevel1,
    preReaderLevel2: r.preReaderLevel2,
    preReaderLevel3: r.preReaderLevel3,
    preReaderLevel4: r.preReaderLevel4,
    beginnerReader: r.beginnerReader,
    fluentReader: r.fluentReader,
    beginnerPlusFluent: (r.beginnerReader != null && r.fluentReader != null) ? round1(r.beginnerReader + r.fluentReader) : null,
    source: r.source,
    isDraft: r.source === 'RASCUNHO',
    rawDetails: r.rawDetails,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return {
    total: formatted.length,
    results: formatted,
  };
}

/**
 * Detalhe individual de uma escola com histórico dos dois ciclos (Entrada e Saída) e evolução calculada.
 */
export async function getParcSingleSchoolDetail(programId, schoolId) {
  const [school, results] = await Promise.all([
    prisma.school.findFirst({
      where: { id: schoolId, deletedAt: null },
      select: { id: true, inep: true, name: true, zone: true, district: true, schoolType: true },
    }),
    prisma.parcSchoolResult.findMany({
      where: { programId, schoolId },
      orderBy: { cycle: 'asc' },
    }),
  ]);

  if (!school) throw notFound('Escola não encontrada.');

  const entrada = results.find((r) => r.cycle === 'ENTRADA') || null;
  const saida = results.find((r) => r.cycle === 'SAIDA') || null;

  let evolution = null;
  if (entrada && saida) {
    evolution = {
      deltaFluent: (saida.fluentReader != null && entrada.fluentReader != null) ? round1(saida.fluentReader - entrada.fluentReader) : null,
      deltaBeginner: (saida.beginnerReader != null && entrada.beginnerReader != null) ? round1(saida.beginnerReader - entrada.beginnerReader) : null,
      deltaPreReader: (saida.preReaderTotal != null && entrada.preReaderTotal != null) ? round1(saida.preReaderTotal - entrada.preReaderTotal) : null,
      deltaPreReaderReduction: (saida.preReaderTotal != null && entrada.preReaderTotal != null) ? round1(entrada.preReaderTotal - saida.preReaderTotal) : null,
      deltaParticipation: (saida.participationRate != null && entrada.participationRate != null) ? round1(saida.participationRate - entrada.participationRate) : null,
    };
  }

  return {
    school,
    entrada,
    saida,
    evolution,
    results,
  };
}

/**
 * Calcula o Ranking oficial de Fluência do PARC (por ciclo ou por evolução).
 */
export async function getParcRanking(programId, query = {}) {
  const cycle = query.cycle || 'ENTRADA';
  const indicator = query.indicator || (cycle === 'EVOLUCAO' ? 'DELTA_FLUENTE' : 'FLUENTE');
  const zoneFilter = query.zone && query.zone !== 'TODAS' ? query.zone : null;
  const searchFilter = query.search ? normalizeParcText(query.search) : null;

  const allIndicators = [
    { id: 'FLUENTE', label: '🗣️ % Leitor Fluente', unit: '%' },
    { id: 'INICIANTE_MAIS_FLUENTE', label: '📖 % Leitor Iniciante + Fluente', unit: '%' },
    { id: 'MENOR_PRE_LEITOR', label: '📉 Menor % Pré-leitor (Total)', unit: '%' },
    { id: 'PARTICIPACAO', label: '👥 Taxa de Participação', unit: '%' },
    { id: 'DELTA_FLUENTE', label: '🚀 Ganho em Leitores Fluentes (Saída - Entrada)', unit: 'p.p.' },
    { id: 'DELTA_REDUCAO_PRE_LEITOR', label: '🎯 Redução de Pré-leitores (Entrada - Saída)', unit: 'p.p.' },
    { id: 'DELTA_INICIANTE_FLUENTE', label: '📈 Ganho de Leitores (Iniciante + Fluente)', unit: 'p.p.' },
  ];
  const indicatorMeta = allIndicators.find((i) => i.id === indicator) || { id: indicator, label: indicator, unit: '%' };

  if (cycle === 'EVOLUCAO') {
    // Ranking de Evolução (Entrada x Saída)
    const allResults = await prisma.parcSchoolResult.findMany({
      where: {
        programId,
        school: {
          deletedAt: null,
          ...(zoneFilter && { zone: { equals: zoneFilter, mode: 'insensitive' } }),
        },
      },
      include: {
        school: {
          select: { id: true, inep: true, name: true, zone: true, district: true },
        },
      },
    });

    const entradaMap = new Map();
    const saidaMap = new Map();

    for (const r of allResults) {
      if (r.cycle === 'ENTRADA') entradaMap.set(r.schoolId, r);
      if (r.cycle === 'SAIDA') saidaMap.set(r.schoolId, r);
    }

    const schoolsWithBoth = [];
    for (const [sId, saidaRec] of saidaMap.entries()) {
      const entradaRec = entradaMap.get(sId);
      if (entradaRec) {
        const deltaFluent = (saidaRec.fluentReader != null && entradaRec.fluentReader != null)
          ? round1(saidaRec.fluentReader - entradaRec.fluentReader)
          : null;
        const deltaPreReaderReduction = (saidaRec.preReaderTotal != null && entradaRec.preReaderTotal != null)
          ? round1(entradaRec.preReaderTotal - saidaRec.preReaderTotal)
          : null;
        const saidaBegFlu = (saidaRec.beginnerReader || 0) + (saidaRec.fluentReader || 0);
        const entradaBegFlu = (entradaRec.beginnerReader || 0) + (entradaRec.fluentReader || 0);
        const deltaBeginnerPlusFluent = round1(saidaBegFlu - entradaBegFlu);

        let rankValue = null;
        if (indicator === 'DELTA_FLUENTE') rankValue = deltaFluent;
        else if (indicator === 'DELTA_REDUCAO_PRE_LEITOR') rankValue = deltaPreReaderReduction;
        else if (indicator === 'DELTA_INICIANTE_FLUENTE') rankValue = deltaBeginnerPlusFluent;
        else rankValue = deltaFluent;

        if (rankValue != null) {
          schoolsWithBoth.push({
            id: sId,
            schoolId: sId,
            school: saidaRec.school,
            name: saidaRec.school?.name,
            inep: saidaRec.school?.inep,
            zone: saidaRec.school?.zone,
            district: saidaRec.school?.district,
            cycle: 'EVOLUCAO',
            rankValue,
            unit: indicatorMeta.unit,
            deltaFluent,
            deltaPreReaderReduction,
            deltaBeginnerPlusFluent,
            entradaFluent: entradaRec.fluentReader,
            saidaFluent: saidaRec.fluentReader,
            entradaPreReader: entradaRec.preReaderTotal,
            saidaPreReader: saidaRec.preReaderTotal,
            participationRate: saidaRec.participationRate,
            evaluated: saidaRec.evaluated,
            enrolled: saidaRec.enrolled,
          });
        }
      }
    }

    // Ordenação decrescente de evolução com desempate por participação
    schoolsWithBoth.sort((a, b) => {
      if (b.rankValue !== a.rankValue) return b.rankValue - a.rankValue;
      if ((b.participationRate || 0) !== (a.participationRate || 0)) return (b.participationRate || 0) - (a.participationRate || 0);
      return (a.name || '').localeCompare(b.name || '');
    });

    const ranking = schoolsWithBoth.map((item, idx) => ({
      position: idx + 1,
      badge: idx === 0 ? '🥇 1º' : idx === 1 ? '🥈 2º' : idx === 2 ? '🥉 3º' : `${idx + 1}º`,
      ...item,
    }));

    return {
      cycle: 'EVOLUCAO',
      indicator: indicatorMeta,
      total: ranking.length,
      podium: ranking.slice(0, 3),
      ranking,
    };
  }

  // Ranking padrão por ciclo selecionado (Entrada ou Saída)
  const results = await prisma.parcSchoolResult.findMany({
    where: {
      programId,
      cycle,
      school: {
        deletedAt: null,
        ...(zoneFilter && { zone: { equals: zoneFilter, mode: 'insensitive' } }),
      },
    },
    include: {
      school: {
        select: { id: true, inep: true, name: true, zone: true, district: true },
      },
    },
  });

  const validSchools = [];
  for (const r of results) {
    if (searchFilter) {
      const sName = normalizeParcText(r.school?.name);
      const inep = String(r.school?.inep || '');
      if (!sName.includes(searchFilter) && !inep.includes(searchFilter)) continue;
    }

    let rankValue = null;
    let polarity = 'MAIOR_MELHOR';

    if (indicator === 'FLUENTE') {
      rankValue = r.fluentReader;
    } else if (indicator === 'INICIANTE_MAIS_FLUENTE') {
      rankValue = (r.beginnerReader != null && r.fluentReader != null) ? round1(r.beginnerReader + r.fluentReader) : null;
    } else if (indicator === 'MENOR_PRE_LEITOR') {
      rankValue = r.preReaderTotal;
      polarity = 'MENOR_MELHOR';
    } else if (indicator === 'PARTICIPACAO') {
      rankValue = r.participationRate;
    } else {
      rankValue = r.fluentReader;
    }

    // Só pontua no ranking escolas com dados completos para o indicador
    if (rankValue != null) {
      validSchools.push({
        id: r.id,
        schoolId: r.schoolId,
        school: r.school,
        name: r.school?.name,
        inep: r.school?.inep,
        zone: r.school?.zone,
        district: r.school?.district,
        cycle: r.cycle,
        rankValue,
        unit: indicatorMeta.unit,
        polarity,
        fluentReader: r.fluentReader,
        beginnerReader: r.beginnerReader,
        preReaderTotal: r.preReaderTotal,
        participationRate: r.participationRate,
        evaluated: r.evaluated,
        enrolled: r.enrolled,
      });
    }
  }

  // Ordenação respeitando polaridade com critérios de desempate
  validSchools.sort((a, b) => {
    if (a.polarity === 'MENOR_MELHOR') {
      if (a.rankValue !== b.rankValue) return a.rankValue - b.rankValue;
    } else {
      if (a.rankValue !== b.rankValue) return b.rankValue - a.rankValue;
    }
    if ((b.participationRate || 0) !== (a.participationRate || 0)) {
      return (b.participationRate || 0) - (a.participationRate || 0);
    }
    if ((b.evaluated || 0) !== (a.evaluated || 0)) {
      return (b.evaluated || 0) - (a.evaluated || 0);
    }
    return (a.name || '').localeCompare(b.name || '');
  });

  const ranking = validSchools.map((item, idx) => ({
    position: idx + 1,
    badge: idx === 0 ? '🥇 1º' : idx === 1 ? '🥈 2º' : idx === 2 ? '🥉 3º' : `${idx + 1}º`,
    ...item,
  }));

  return {
    cycle,
    indicator: indicatorMeta,
    total: ranking.length,
    podium: ranking.slice(0, 3),
    ranking,
  };
}

/**
 * Escolas participantes vinculadas ao PARC.
 */
export async function getParcParticipatingSchools(programId) {
  const [networkCount, links, results] = await Promise.all([
    prisma.school.count({ where: { deletedAt: null } }),
    prisma.programSchool.findMany({
      where: { programId, active: true, school: { deletedAt: null } },
      include: {
        school: {
          select: { id: true, inep: true, name: true, zone: true, district: true, schoolType: true },
        },
      },
      orderBy: { school: { name: 'asc' } },
    }),
    prisma.parcSchoolResult.findMany({
      where: { programId },
      select: { schoolId: true, cycle: true },
    }),
  ]);

  const resultsBySchool = new Map();
  for (const r of results) {
    const set = resultsBySchool.get(r.schoolId) || new Set();
    set.add(r.cycle);
    resultsBySchool.set(r.schoolId, set);
  }

  const distinctZones = Array.from(new Set(links.map((l) => l.school?.zone).filter(Boolean))).sort();

  const schools = links.map((link) => {
    const cyclesSet = resultsBySchool.get(link.schoolId) || new Set();
    const hasData = cyclesSet.size > 0;
    return {
      id: link.schoolId,
      linkId: `${link.programId}_${link.schoolId}`,
      schoolId: link.schoolId,
      school: link.school,
      name: link.school?.name,
      inep: link.school?.inep,
      zone: link.school?.zone,
      district: link.school?.district,
      active: link.active,
      joinedAt: link.joinedAt,
      hasData,
      hasEntrada: cyclesSet.has('ENTRADA'),
      hasSaida: cyclesSet.has('SAIDA'),
      cyclesCount: cyclesSet.size,
      resultsSummary: {
        hasEntrada: cyclesSet.has('ENTRADA'),
        hasSaida: cyclesSet.has('SAIDA'),
      },
    };
  });

  const schoolsWithData = schools.filter((s) => s.hasData).length;

  return {
    totalNetworkSchools: networkCount,
    totalParticipatingSchools: schools.length,
    schoolsWithData,
    schoolsWithoutData: Math.max(0, schools.length - schoolsWithData),
    distinctZones,
    participatingSchools: schools,
    schools,
  };
}

/**
 * Retorna escolas do CPE disponíveis para adição como participante do PARC.
 */
export async function getAvailableSchoolsToAdd(programId) {
  const linked = await prisma.programSchool.findMany({
    where: { programId, active: true },
    select: { schoolId: true },
  });
  const linkedIds = new Set(linked.map((l) => l.schoolId));

  const available = await prisma.school.findMany({
    where: {
      deletedAt: null,
      id: { notIn: Array.from(linkedIds) },
    },
    select: { id: true, inep: true, name: true, zone: true, district: true, schoolType: true },
    orderBy: { name: 'asc' },
  });

  const allCount = await prisma.school.count({ where: { deletedAt: null } });

  return {
    totalNetworkSchools: allCount,
    totalParticipatingSchools: linkedIds.size,
    totalAvailable: available.length,
    availableCount: available.length,
    schools: available,
    availableSchools: available,
  };
}

export async function addParcParticipatingSchool(programId, payload, actor, ip) {
  let schoolId = typeof payload === 'string' ? payload : payload?.schoolId;

  // Se o usuário estiver cadastrando uma nova escola diretamente
  if (!schoolId && payload?.name) {
    const existing = await prisma.school.findFirst({
      where: {
        deletedAt: null,
        OR: [
          payload.inep ? { inep: String(payload.inep).trim() } : undefined,
          { name: { equals: payload.name.trim(), mode: 'insensitive' } },
        ].filter(Boolean),
      },
    });

    if (existing) {
      schoolId = existing.id;
    } else {
      const createdSchool = await prisma.school.create({
        data: {
          name: payload.name.trim(),
          inep: payload.inep ? String(payload.inep).trim() : null,
          zone: payload.zone || 'URBANA',
          district: payload.district ? payload.district.trim() : null,
          schoolType: payload.schoolType || 'E.M.E.F.',
          situation: 'ATIVA',
          adminDependency: 'MUNICIPAL',
        },
      });
      schoolId = createdSchool.id;
    }
  }

  if (!schoolId) {
    throw new Error('Identificador da escola ou dados da nova escola são obrigatórios.');
  }

  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: { id: true, inep: true, name: true, zone: true },
  });
  if (!school) throw notFound('Escola não encontrada no cadastro municipal.');

  const link = await prisma.programSchool.upsert({
    where: { programId_schoolId: { programId, schoolId } },
    create: { programId, schoolId, active: true },
    update: { active: true },
  });

  await audit({
    userId: actor?.id,
    userName: actor?.name,
    action: AuditAction.CREATE,
    entity: 'ProgramSchool',
    entityId: link.schoolId,
    metadata: { programId, schoolId, schoolName: school.name },
    ip,
  });

  return {
    success: true,
    message: `Escola "${school.name}" vinculada com sucesso ao PARC!`,
    link,
    school,
  };
}

export async function removeParcParticipatingSchool(programId, schoolId, actor, ip) {
  const link = await prisma.programSchool.findUnique({
    where: { programId_schoolId: { programId, schoolId } },
  });
  if (!link) throw notFound('Vínculo da escola com o PARC não encontrado.');

  await prisma.programSchool.delete({
    where: { programId_schoolId: { programId, schoolId } },
  });

  await audit({
    userId: actor?.id,
    userName: actor?.name,
    action: AuditAction.DELETE,
    entity: 'ProgramSchool',
    entityId: schoolId,
    metadata: { programId, schoolId },
    ip,
  });

  return { success: true, removedSchoolId: schoolId };
}

export async function bulkRemoveParcParticipatingSchools(programId, { schoolIds }, actor, ip) {
  if (!Array.isArray(schoolIds) || !schoolIds.length) {
    throw new Error('Lista de escolas para desvinculação não fornecida.');
  }

  const result = await prisma.programSchool.deleteMany({
    where: { programId, schoolId: { in: schoolIds } },
  });

  await audit({
    userId: actor?.id,
    userName: actor?.name,
    action: AuditAction.DELETE,
    entity: 'ProgramSchool',
    entityId: programId,
    metadata: { programId, count: result.count, schoolIds },
    ip,
  });

  return { success: true, removedCount: result.count };
}

export async function deleteParcSchoolResult(programId, resultId, actor, ip) {
  const existing = await prisma.parcSchoolResult.findFirst({
    where: { id: resultId, programId },
    include: { school: { select: { name: true } } },
  });
  if (!existing) throw notFound('Resultado do PARC não encontrado.');

  await prisma.parcSchoolResult.delete({
    where: { id: resultId },
  });

  await audit({
    userId: actor?.id,
    userName: actor?.name,
    action: AuditAction.DELETE,
    entity: 'ParcSchoolResult',
    entityId: resultId,
    metadata: { programId, schoolName: existing.school?.name, cycle: existing.cycle },
    ip,
  });

  return { success: true, deletedId: resultId };
}

export async function bulkDeleteParcSchoolResults(programId, payload = {}, actor, ip) {
  const { resultIds, cycle, asDraftOnly, status, schoolId, zone } = payload;

  const where = { programId };

  if (Array.isArray(resultIds) && resultIds.length > 0) {
    where.id = { in: resultIds };
  } else {
    if (cycle && cycle !== 'TODOS') where.cycle = cycle;
    if (asDraftOnly || status === 'RASCUNHO') where.source = 'RASCUNHO';
    if (status === 'PUBLICADO') where.source = 'IMPORTACAO';
    if (schoolId && schoolId !== 'TODAS') where.schoolId = schoolId;
    if (zone && zone !== 'TODAS') where.school = { zone };
  }

  const countBefore = await prisma.parcSchoolResult.count({ where });
  if (countBefore === 0) {
    return { success: true, deletedCount: 0, message: 'Nenhum resultado correspondeu aos filtros fornecidos.' };
  }

  const deleteResult = await prisma.parcSchoolResult.deleteMany({ where });

  await audit({
    userId: actor?.id,
    userName: actor?.name,
    action: AuditAction.DELETE,
    entity: 'ParcSchoolResult',
    entityId: programId,
    metadata: {
      message: `${deleteResult.count} resultados do PARC excluídos em lote`,
      programId,
      deletedCount: deleteResult.count,
      payload,
    },
    ip,
  });

  return {
    success: true,
    deletedCount: deleteResult.count,
    message: `${deleteResult.count} resultado(s) do PARC excluído(s) com sucesso.`,
  };
}

export async function publishParcSchoolResults(programId, filters = {}, actor, ip) {
  const { cycle } = filters;

  const where = {
    programId,
    source: 'RASCUNHO',
    ...(cycle && cycle !== 'TODOS' && { cycle }),
  };

  const updateResult = await prisma.parcSchoolResult.updateMany({
    where,
    data: { source: 'IMPORTACAO' },
  });

  await audit({
    userId: actor?.id,
    userName: actor?.name,
    action: AuditAction.UPDATE,
    entity: 'ParcSchoolResult',
    entityId: programId,
    metadata: { programId, publishedCount: updateResult.count, filters },
    ip,
  });

  return {
    updatedCount: updateResult.count,
    message: `${updateResult.count} resultados do PARC foram consolidados e publicados com sucesso!`,
  };
}

/**
 * Cadastra ou atualiza manualmente um resultado de Fluência do PARC para uma escola existente ou nova.
 */
export async function saveParcManualResult(programId, payload, actor, ip) {
  const {
    schoolId: rawSchoolId,
    newSchool,
    cycle = 'ENTRADA',
    year = PARC_DEFAULT_YEAR,
    enrolled,
    evaluated,
    participationRate: rawPartRate,
    preReaderTotal: rawPreTotal,
    preReaderLevel1,
    preReaderLevel2,
    preReaderLevel3,
    preReaderLevel4,
    beginnerReader,
    fluentReader,
    asDraft = false,
  } = payload || {};

  let targetSchoolId = rawSchoolId || null;
  let targetSchool = null;

  // 1. Criação ou busca de nova escola caso fornecida
  if (!targetSchoolId && newSchool?.name) {
    const existing = await prisma.school.findFirst({
      where: {
        deletedAt: null,
        OR: [
          newSchool.inep ? { inep: String(newSchool.inep).trim() } : undefined,
          { name: { equals: newSchool.name.trim(), mode: 'insensitive' } },
        ].filter(Boolean),
      },
    });

    if (existing) {
      targetSchool = existing;
      targetSchoolId = existing.id;
    } else {
      targetSchool = await prisma.school.create({
        data: {
          name: newSchool.name.trim(),
          inep: newSchool.inep ? String(newSchool.inep).trim() : null,
          zone: newSchool.zone || 'URBANA',
          district: newSchool.district ? newSchool.district.trim() : null,
          schoolType: newSchool.schoolType || 'E.M.E.F.',
          situation: 'ATIVA',
          adminDependency: 'MUNICIPAL',
        },
      });
      targetSchoolId = targetSchool.id;
    }
  } else if (targetSchoolId) {
    targetSchool = await prisma.school.findFirst({
      where: { id: targetSchoolId, deletedAt: null },
    });
  }

  if (!targetSchoolId || !targetSchool) {
    throw new Error('Selecione uma escola existente ou informe os dados para cadastrar uma nova escola.');
  }

  // 2. Garante o vínculo da escola ao PARC (ProgramSchool)
  await prisma.programSchool.upsert({
    where: { programId_schoolId: { programId, schoolId: targetSchoolId } },
    create: { programId, schoolId: targetSchoolId, active: true },
    update: { active: true },
  });

  // 3. Cálculos e validações
  const numEnrolled = enrolled != null && enrolled !== '' ? Number(enrolled) : null;
  const numEvaluated = evaluated != null && evaluated !== '' ? Number(evaluated) : null;

  let partRate = rawPartRate != null && rawPartRate !== '' ? Number(rawPartRate) : null;
  if (partRate == null && numEnrolled != null && numEvaluated != null && numEnrolled > 0) {
    partRate = Math.round((numEvaluated / numEnrolled) * 1000) / 10;
  }

  const p1 = preReaderLevel1 != null && preReaderLevel1 !== '' ? Number(preReaderLevel1) : null;
  const p2 = preReaderLevel2 != null && preReaderLevel2 !== '' ? Number(preReaderLevel2) : null;
  const p3 = preReaderLevel3 != null && preReaderLevel3 !== '' ? Number(preReaderLevel3) : null;
  const p4 = preReaderLevel4 != null && preReaderLevel4 !== '' ? Number(preReaderLevel4) : null;

  let preTotal = rawPreTotal != null && rawPreTotal !== '' ? Number(rawPreTotal) : null;
  if (preTotal == null && (p1 != null || p2 != null || p3 != null || p4 != null)) {
    preTotal = (p1 || 0) + (p2 || 0) + (p3 || 0) + (p4 || 0);
  }

  const beg = beginnerReader != null && beginnerReader !== '' ? Number(beginnerReader) : null;
  const flu = fluentReader != null && fluentReader !== '' ? Number(fluentReader) : null;

  const numericYear = Number(year) || PARC_DEFAULT_YEAR;
  const targetCycle = cycle === 'SAIDA' ? 'SAIDA' : 'ENTRADA';
  const source = asDraft ? 'RASCUNHO' : 'MANUAL';

  // 4. Gravação do Resultado
  const existingResult = await prisma.parcSchoolResult.findFirst({
    where: { programId, schoolId: targetSchoolId, cycle: targetCycle },
  });

  let savedResult;
  if (existingResult) {
    savedResult = await prisma.parcSchoolResult.update({
      where: { id: existingResult.id },
      data: {
        year: numericYear,
        grade: PARC_DEFAULT_GRADE,
        assessment: PARC_ASSESSMENT_NAME,
        enrolled: numEnrolled,
        evaluated: numEvaluated,
        participationRate: partRate,
        preReaderTotal: preTotal,
        preReaderLevel1: p1,
        preReaderLevel2: p2,
        preReaderLevel3: p3,
        preReaderLevel4: p4,
        beginnerReader: beg,
        fluentReader: flu,
        source,
      },
      include: {
        school: { select: { id: true, name: true, inep: true, zone: true, district: true } },
      },
    });
  } else {
    savedResult = await prisma.parcSchoolResult.create({
      data: {
        programId,
        schoolId: targetSchoolId,
        year: numericYear,
        grade: PARC_DEFAULT_GRADE,
        assessment: PARC_ASSESSMENT_NAME,
        cycle: targetCycle,
        enrolled: numEnrolled,
        evaluated: numEvaluated,
        participationRate: partRate,
        preReaderTotal: preTotal,
        preReaderLevel1: p1,
        preReaderLevel2: p2,
        preReaderLevel3: p3,
        preReaderLevel4: p4,
        beginnerReader: beg,
        fluentReader: flu,
        source,
      },
      include: {
        school: { select: { id: true, name: true, inep: true, zone: true, district: true } },
      },
    });
  }

  await audit({
    userId: actor?.id,
    userName: actor?.name,
    action: existingResult ? AuditAction.UPDATE : AuditAction.CREATE,
    entity: 'ParcSchoolResult',
    entityId: savedResult.id,
    metadata: {
      programId,
      schoolId: targetSchoolId,
      schoolName: targetSchool.name,
      cycle: targetCycle,
      year: numericYear,
      isManual: true,
      asDraft,
    },
    ip,
  });

  return {
    success: true,
    action: existingResult ? 'ATUALIZADO' : 'CRIADO',
    message: `Resultado de Fluência Leitora (${targetCycle === 'SAIDA' ? 'Saída' : 'Entrada'}) da escola "${targetSchool.name}" salvo com sucesso!`,
    result: savedResult,
    school: targetSchool,
  };
}
