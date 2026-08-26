import { prisma } from '../lib/prisma.js';
import {
  computeRanking,
  evolutionSeries,
  classificationDistribution,
  comparePrograms,
  goalsStatus,
} from './scoring.service.js';

/** Dashboard inicial — KPIs + gráficos, tudo do PostgreSQL. */
export async function getDashboard({ year } = {}) {
  const latestYearRow = await prisma.result.findFirst({ orderBy: { year: 'desc' }, select: { year: true } });
  const targetYear = year ? Number(year) : latestYearRow?.year ?? new Date().getFullYear();

  const [
    programsActive,
    programsTotal,
    schoolsTotal,
    indicatorsActive,
    resultsTotal,
    resultsThisYear,
    participatingRows,
    goalsData,
    performance,
    evolution,
    distribution,
    topSchools,
  ] = await Promise.all([
    prisma.program.count({ where: { deletedAt: null, status: 'EM_EXECUCAO' } }),
    prisma.program.count({ where: { deletedAt: null } }),
    prisma.school.count({ where: { deletedAt: null } }),
    prisma.indicator.count({ where: { deletedAt: null, status: 'ATIVO' } }),
    prisma.result.count(),
    prisma.result.count({ where: { year: targetYear } }),
    prisma.programSchool.findMany({
      where: { active: true, program: { deletedAt: null } },
      distinct: ['schoolId'],
      select: { schoolId: true },
    }),
    goalsStatus({ year: targetYear }),
    comparePrograms({ year: targetYear }),
    evolutionSeries({ year: targetYear }),
    classificationDistribution({ year: targetYear }),
    computeRanking({ year: targetYear, limit: 5 }),
  ]);

  return {
    kpis: {
      programsActive,
      programsTotal,
      schoolsTotal,
      participatingSchools: participatingRows.length,
      indicatorsActive,
      resultsTotal,
      resultsThisYear,
      goalsMet: goalsData.totals.met,
      goalsNotMet: goalsData.totals.notMet,
    },
    year: targetYear,
    charts: {
      performanceByProgram: performance.programs.slice(0, 8).map((p) => ({
        name: p.code,
        fullName: p.programName,
        score: p.currentScore,
        schools: p.schoolsCount,
      })),
      evolution: evolution.map((e) => ({ label: e.label, score: e.avgScore, schools: e.schoolsCount })),
      distribution: Object.entries(distribution.distribution).map(([classification, count]) => ({
        classification,
        count,
      })),
      topSchools: topSchools.rows.map((r) => ({
        position: r.position,
        name: r.schoolName,
        municipality: r.municipality,
        score: r.score,
        classification: r.classification,
      })),
    },
  };
}
