import { prisma } from '../lib/prisma.js';
import { notFound, HttpError } from '../lib/errors.js';
import { audit, AuditAction } from '../lib/audit.js';
import { computeRanking } from './scoring.service.js';
import { notify } from './notification.service.js';

/**
 * Consolidação de avaliação: fotografa o ranking de um programa
 * (ano + período) na tabela Evaluation — usado para histórico oficial.
 */
export async function consolidate({ programId, year, period }, actor, ip) {
  const program = await prisma.program.findFirst({ where: { id: programId, deletedAt: null } });
  if (!program) throw notFound('Programa não encontrado');
  if (Number(year) !== program.year) {
    throw new HttpError(
      422,
      `A avaliação deve ser consolidada dentro do ciclo ${program.year}`,
      'PROGRAM_CYCLE_YEAR_MISMATCH',
    );
  }

  const ranking = await computeRanking({ programId, year: program.year, period });
  if (!ranking.rows.length) {
    throw notFound('Nenhum resultado/meta encontrado para consolidar neste período');
  }

  const results = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const row of ranking.rows) {
      const evaluation = await tx.evaluation.upsert({
        where: {
          programId_schoolId_year_period: {
            programId,
            schoolId: row.schoolId,
            year: ranking.year,
            period: ranking.period,
          },
        },
        create: {
          programId,
          schoolId: row.schoolId,
          year: ranking.year,
          period: ranking.period,
          score: row.score,
          classification: row.classification,
          position: row.position,
          details: {
            indicators: row.indicators.map((i) => ({
              indicatorCode: i.indicatorCode,
              value: i.value,
              goal: i.goal,
              pct: i.pct,
            })),
            previousScore: row.previousScore ?? null,
          },
          consolidatedById: actor.id,
        },
        update: {
          score: row.score,
          classification: row.classification,
          position: row.position,
          details: {
            indicators: row.indicators.map((i) => ({
              indicatorCode: i.indicatorCode,
              value: i.value,
              goal: i.goal,
              pct: i.pct,
            })),
            previousScore: row.previousScore ?? null,
          },
          consolidatedById: actor.id,
          consolidatedAt: new Date(),
        },
      });
      out.push(evaluation);
    }
    return out;
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.EVALUATION_CONSOLIDATE,
    entity: 'Program',
    entityId: programId,
    metadata: { year: ranking.year, period: ranking.period, evaluations: results.length },
    ip,
  });

  await notify(actor.id, {
    type: 'SUCESSO',
    title: 'Avaliação consolidada',
    message: `${results.length} escolas avaliadas em "${program.name}" — ${ranking.period}/${ranking.year}.`,
    link: `/programas/${programId}?tab=ranking`,
  });

  return { consolidated: results.length, year: ranking.year, period: ranking.period };
}

export async function listEvaluations(query) {
  const { programId, schoolId, year, period } = query;
  const where = {
    program: { deletedAt: null },
    school: { deletedAt: null },
    ...(programId && { programId }),
    ...(schoolId && { schoolId }),
    ...(year && { year: Number(year) }),
    ...(period && { period }),
  };
  const [total, evaluations] = await Promise.all([
    prisma.evaluation.count({ where }),
    prisma.evaluation.findMany({
      where,
      include: {
        school: { select: { id: true, inep: true, name: true } },
        program: { select: { id: true, code: true, name: true } },
        consolidatedBy: { select: { name: true } },
      },
      orderBy: [{ year: 'desc' }, { period: 'asc' }, { position: 'asc' }],
      take: 500,
    }),
  ]);
  return { data: evaluations, total };
}
