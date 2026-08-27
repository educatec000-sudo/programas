import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  DEMO_CATEGORY_NAMES,
  DEMO_INDICATOR_CODES,
  DEMO_PROGRAM_CODES,
  DEMO_SCHOOL_INEPS,
} from '../prisma/seed/demo.js';
import { DEMO_TECHNICIANS } from '../prisma/seed/permissions.js';

const prisma = new PrismaClient();

async function main() {
  if (process.env.CONFIRM_REMOVE_DEMO !== 'SIM') {
    throw new Error('Operação não executada. Defina CONFIRM_REMOVE_DEMO=SIM para confirmar.');
  }

  const [schools, programs, indicators, technicians] = await Promise.all([
    prisma.school.findMany({ where: { inep: { in: DEMO_SCHOOL_INEPS } }, select: { id: true } }),
    prisma.program.findMany({ where: { code: { in: DEMO_PROGRAM_CODES } }, select: { id: true } }),
    prisma.indicator.findMany({ where: { code: { in: DEMO_INDICATOR_CODES } }, select: { id: true } }),
    prisma.user.findMany({
      where: { email: { in: DEMO_TECHNICIANS.map((user) => user.email) } },
      select: { id: true },
    }),
  ]);
  const schoolIds = schools.map(({ id }) => id);
  const programIds = programs.map(({ id }) => id);
  const indicatorIds = indicators.map(({ id }) => id);
  const technicianIds = technicians.map(({ id }) => id);

  const removed = await prisma.$transaction(async (tx) => {
    const resultWhere = {
      OR: [
        ...(schoolIds.length ? [{ schoolId: { in: schoolIds } }] : []),
        ...(programIds.length ? [{ programId: { in: programIds } }] : []),
        ...(indicatorIds.length ? [{ indicatorId: { in: indicatorIds } }] : []),
      ],
    };
    const results = resultWhere.OR.length ? await tx.result.deleteMany({ where: resultWhere }) : { count: 0 };
    const evaluations = await tx.evaluation.deleteMany({
      where: {
        OR: [
          ...(schoolIds.length ? [{ schoolId: { in: schoolIds } }] : []),
          ...(programIds.length ? [{ programId: { in: programIds } }] : []),
        ],
      },
    });
    const goals = await tx.goal.deleteMany({
      where: {
        OR: [
          ...(schoolIds.length ? [{ schoolId: { in: schoolIds } }] : []),
          ...(programIds.length ? [{ programId: { in: programIds } }] : []),
          ...(indicatorIds.length ? [{ indicatorId: { in: indicatorIds } }] : []),
        ],
      },
    });
    const documents = await tx.document.deleteMany({
      where: {
        OR: [
          ...(schoolIds.length ? [{ entity: 'School', entityId: { in: schoolIds } }] : []),
          ...(programIds.length ? [{ entity: 'Program', entityId: { in: programIds } }] : []),
        ],
      },
    });
    const deletedPrograms = await tx.program.deleteMany({ where: { id: { in: programIds } } });
    const deletedSchools = await tx.school.deleteMany({ where: { id: { in: schoolIds } } });
    const deletedIndicators = await tx.indicator.deleteMany({ where: { id: { in: indicatorIds } } });
    const categories = await tx.indicatorCategory.deleteMany({
      where: { name: { in: DEMO_CATEGORY_NAMES }, indicators: { none: {} } },
    });
    const deletedTechnicians = await tx.user.deleteMany({ where: { id: { in: technicianIds } } });

    return {
      schools: deletedSchools.count,
      programs: deletedPrograms.count,
      indicators: deletedIndicators.count,
      categories: categories.count,
      results: results.count,
      goals: goals.count,
      evaluations: evaluations.count,
      documents: documents.count,
      technicians: deletedTechnicians.count,
    };
  });

  console.log('Dados de demonstração removidos com segurança:');
  console.table(removed);
  console.log('Permissões, perfis e os quatro usuários-base foram preservados.');
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
