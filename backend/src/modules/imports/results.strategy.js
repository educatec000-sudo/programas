import { prisma } from '../../lib/prisma.js';
import { pickField, toNumber } from './parser.js';
import { str } from './base.js';
import { IMPORT_ROW_STATUS, PERIODS } from '../../lib/constants.js';

const PERIOD_ALIASES = (() => {
  const map = new Map();
  for (const p of PERIODS) map.set(p.toLowerCase(), p);
  map.set('1b', '1º Bimestre'); map.set('2b', '2º Bimestre');
  map.set('3b', '3º Bimestre'); map.set('4b', '4º Bimestre');
  map.set('1s', '1º Semestre'); map.set('2s', '2º Semestre');
  map.set('semestre1', '1º Semestre'); map.set('semestre2', '2º Semestre');
  map.set('anual', 'Anual');
  return map;
})();

function normalizePeriod(value) {
  const raw = str(value).toLowerCase();
  return PERIOD_ALIASES.get(raw) || null;
}

export const resultsStrategy = {
  type: 'RESULTADOS',
  label: 'Resultados por programa',
  aliases: {
    program: ['programa', 'codigoprograma', 'programacodigo', 'codprograma'],
    school: ['inep', 'escola', 'codigoinep', 'codigoescola', 'inepescola'],
    indicator: ['criterio', 'codigocriterio', 'indicador', 'codigoindicador', 'indicadorcodigo', 'codindicador'],
    year: ['ano', 'anobase'],
    period: ['periodo'],
    value: ['resultado', 'valor', 'valorresultado', 'resultadovalor'],
    notes: ['observacao', 'obs', 'notas'],
  },
  headers: ['Programa (código)', 'INEP Escola', 'Critério (código)', 'Ano', 'Período', 'Resultado', 'Observação'],
  examples: [
    ['PRG-2025-01', '15012345', 'IND-001', 2025, '1º Semestre', 87.5, ''],
  ],

  async loadContext() {
    const [programs, schools, indicators, results, schoolLinks, indicatorLinks] = await Promise.all([
      prisma.program.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true } }),
      prisma.school.findMany({ where: { deletedAt: null }, select: { id: true, inep: true, name: true } }),
      prisma.indicator.findMany({
        where: { deletedAt: null, status: 'ATIVO' },
        select: { id: true, code: true, name: true },
      }),
      prisma.result.findMany({
        select: { programId: true, schoolId: true, indicatorId: true, year: true, period: true, value: true },
      }),
      prisma.programSchool.findMany({
        where: { active: true },
        select: { programId: true, schoolId: true },
      }),
      prisma.programIndicator.findMany({
        where: { active: true },
        select: { programId: true, indicatorId: true },
      }),
    ]);
    const programByCode = new Map();
    for (const p of programs) {
      programByCode.set(p.code.toLowerCase(), p);
      programByCode.set(p.name.toLowerCase(), p);
    }
    const indicatorByCode = new Map();
    for (const i of indicators) {
      indicatorByCode.set(i.code.toLowerCase(), i);
      indicatorByCode.set(i.name.toLowerCase(), i);
    }
    const existing = new Set(
      results.map((r) => `${r.programId}|${r.schoolId}|${r.indicatorId}|${r.year}|${r.period}`),
    );
    const existingValues = new Map(
      results.map((r) => [`${r.programId}|${r.schoolId}|${r.indicatorId}|${r.year}|${r.period}`, r.value]),
    );
    return {
      programByCode,
      schoolByInep: new Map(schools.filter((s) => s.inep).map((s) => [s.inep, s])),
      indicatorByCode,
      existing,
      existingValues,
      schoolLinks: new Set(schoolLinks.map((link) => `${link.programId}|${link.schoolId}`)),
      indicatorLinks: new Set(indicatorLinks.map((link) => `${link.programId}|${link.indicatorId}`)),
    };
  },

  buildRow(row, ctx) {
    const errors = [];
    const programKey = str(pickField(row.raw, this.aliases.program)).toLowerCase();
    const inep = str(pickField(row.raw, this.aliases.school)).replace(/\D/g, '');
    const indicatorKey = str(pickField(row.raw, this.aliases.indicator)).toLowerCase();
    const year = toNumber(pickField(row.raw, this.aliases.year));
    const period = normalizePeriod(pickField(row.raw, this.aliases.period));
    const value = toNumber(pickField(row.raw, this.aliases.value));

    const program = programKey ? ctx.programByCode.get(programKey) : undefined;
    if (!programKey) errors.push({ field: 'programa', message: 'Programa é obrigatório' });
    else if (!program) errors.push({ field: 'programa', message: `Programa não encontrado: "${programKey}"` });

    const school = inep ? ctx.schoolByInep.get(inep) : undefined;
    if (!inep) errors.push({ field: 'inep', message: 'INEP da escola é obrigatório' });
    else if (!school) errors.push({ field: 'inep', message: `Escola com INEP ${inep} não encontrada` });

    const indicator = indicatorKey ? ctx.indicatorByCode.get(indicatorKey) : undefined;
    if (!indicatorKey) errors.push({ field: 'criterio', message: 'Critério é obrigatório' });
    else if (!indicator) errors.push({ field: 'criterio', message: `Critério ativo não encontrado: "${indicatorKey}"` });

    if (program && school && !ctx.schoolLinks.has(`${program.id}|${school.id}`)) {
      errors.push({ field: 'inep', message: `A escola ${school.name} não está ativa no programa ${program.code}` });
    }
    if (program && indicator && !ctx.indicatorLinks.has(`${program.id}|${indicator.id}`)) {
      errors.push({ field: 'criterio', message: `O critério ${indicator.code} não está ativo no programa ${program.code}` });
    }

    if (!year || year < 2000 || year > 2100) errors.push({ field: 'ano', message: 'Ano inválido' });
    if (!period) {
      errors.push({
        field: 'periodo',
        message: `Período inválido. Use: ${PERIODS.slice(-3).join(', ')}`,
      });
    }
    if (value === null) errors.push({ field: 'resultado', message: 'Resultado (valor) é obrigatório' });

    const data = program && school && indicator && year && period && value !== null
      ? {
          programId: program.id,
          schoolId: school.id,
          indicatorId: indicator.id,
          year,
          period,
          value,
          notes: str(pickField(row.raw, this.aliases.notes)) || null,
          _labels: {
            program: program.code,
            school: `${school.name} (${school.inep})`,
            indicator: indicator.code,
          },
        }
      : null;

    const key = program && school && indicator ? `${program.id}|${school.id}|${indicator.id}|${year}|${period}` : null;
    return { data, errors, key };
  },

  classify(rowData, ctx, seen) {
    if (rowData.key && seen.has(rowData.key)) return IMPORT_ROW_STATUS.DUPLICADO;
    if (rowData.key) seen.add(rowData.key);
    return rowData.key && ctx.existing.has(rowData.key) ? IMPORT_ROW_STATUS.ATUALIZAR : IMPORT_ROW_STATUS.NOVO;
  },

  async apply(validRows, ctx, { actor } = {}) {
    let created = 0;
    let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        const { _labels, ...d } = row.data;
        const where = {
          programId_schoolId_indicatorId_year_period: {
            programId: d.programId,
            schoolId: d.schoolId,
            indicatorId: d.indicatorId,
            year: d.year,
            period: d.period,
          },
        };
        await tx.result.upsert({
          where,
          create: {
            ...d,
            source: 'IMPORTACAO',
            ...(actor?.id && { createdById: actor.id, updatedById: actor.id }),
          },
          update: {
            value: d.value,
            notes: d.notes,
            source: 'IMPORTACAO',
            ...(actor?.id && { updatedById: actor.id }),
          },
        });
        ctx.existing.has(row.key) ? updated++ : created++;
      }
    });
    return { created, updated };
  },
};
