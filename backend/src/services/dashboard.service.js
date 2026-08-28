import { prisma } from '../lib/prisma.js';
import {
  computeRanking,
  evolutionSeries,
  classificationDistribution,
  comparePrograms,
  goalsStatus,
} from './scoring.service.js';

/**
 * Dashboard estatístico. Contagens gerais podem abranger a plataforma, mas
 * pontuação, classificação, evolução e ranking sempre exigem um único programa.
 */
export async function getDashboard({ year, programId } = {}) {
  const latestYearRow = await prisma.result.findFirst({
    where: programId ? { programId } : undefined,
    orderBy: { year: 'desc' },
    select: { year: true },
  });
  const targetYear = year ? Number(year) : latestYearRow?.year ?? new Date().getFullYear();
  const emptyGoals = { totals: { met: 0, notMet: 0, schools: 0 } };
  const emptyRanking = { rows: [] };
  const emptyDistribution = { distribution: {} };

  const [
    selectedProgram,
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
    mapSchools,
  ] = await Promise.all([
    programId
      ? prisma.program.findFirst({
          where: { id: programId, deletedAt: null },
          select: { id: true, code: true, name: true, year: true },
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
    programId ? goalsStatus({ programId, year: targetYear }) : Promise.resolve(emptyGoals),
    comparePrograms({ year: targetYear }),
    programId ? evolutionSeries({ programId, year: targetYear }) : Promise.resolve([]),
    programId
      ? classificationDistribution({ programId, year: targetYear })
      : Promise.resolve(emptyDistribution),
    programId
      ? computeRanking({ programId, year: targetYear, limit: 5 })
      : Promise.resolve(emptyRanking),
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

  return {
    selectedProgram,
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
    map: {
      schools: mapSchools,
      total: mapSchools.length,
    },
    charts: {
      performanceByProgram: performance.programs.slice(0, 8).map((program) => ({
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
      distribution: Object.entries(distribution.distribution).map(([classification, count]) => ({
        classification,
        count,
      })),
      topSchools: topSchools.rows.map((row) => ({
        schoolId: row.schoolId,
        position: row.position,
        name: row.schoolName,
        score: row.score,
        classification: row.classification,
      })),
    },
  };
}
