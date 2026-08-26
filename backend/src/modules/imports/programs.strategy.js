import { prisma } from '../../lib/prisma.js';
import { pickField, toNumber } from './parser.js';
import { str, classifyRow } from './base.js';
import { IMPORT_ROW_STATUS } from '../../lib/constants.js';

const STATUS_MAP = {
  planejamento: 'PLANEJAMENTO',
  'em execucao': 'EM_EXECUCAO', executando: 'EM_EXECUCAO', ativo: 'EM_EXECUCAO', 'em andamento': 'EM_EXECUCAO',
  concluido: 'CONCLUIDO', concluida: 'CONCLUIDO', finalizado: 'CONCLUIDO',
  suspenso: 'SUSPENSO', suspensa: 'SUSPENSO',
  cancelado: 'CANCELADO', cancelada: 'CANCELADO',
};

export const programsStrategy = {
  type: 'PROGRAMAS',
  label: 'Programas',
  aliases: {
    code: ['codigo', 'code', 'codigodoprograma', 'cod'],
    name: ['nome', 'programa', 'nomeprograma', 'nomedoprograma', 'titulo'],
    description: ['descricao', 'desc'],
    objective: ['objetivo'],
    organ: ['orgao', 'orgaoresponsavel', 'responsavel', 'secretaria'],
    year: ['ano', 'anobase', 'exercicio'],
    periodLabel: ['periodo', 'vigencia', 'periodovicencia'],
    status: ['status', 'situacao'],
    globalGoal: ['meta', 'metaglobal', 'metaprograma'],
  },
  headers: ['Código', 'Nome', 'Descrição', 'Objetivo', 'Órgão Responsável', 'Ano', 'Período', 'Status', 'Meta Global'],
  examples: [
    ['PRG-2026-01', 'Alfabetiza Pará', 'Programa de alfabetização', 'Alfabetizar todas as crianças até os 7 anos', 'SEDUC', 2026, 'Anual', 'EM EXECUCAO', 90],
  ],

  async loadContext() {
    const programs = await prisma.program.findMany({ select: { id: true, code: true, name: true } });
    return { byCode: new Map(programs.map((p) => [p.code.toLowerCase(), p])) };
  },

  buildRow(row) {
    const errors = [];
    const code = str(pickField(row.raw, this.aliases.code));
    const name = str(pickField(row.raw, this.aliases.name));
    const year = toNumber(pickField(row.raw, this.aliases.year));

    if (!code || code.length < 2) errors.push({ field: 'codigo', message: 'Código é obrigatório' });
    if (!name || name.length < 3) errors.push({ field: 'nome', message: 'Nome é obrigatório (mín. 3 caracteres)' });
    if (!year || year < 2000 || year > 2100) errors.push({ field: 'ano', message: 'Ano inválido (2000-2100)' });

    const statusRaw = str(pickField(row.raw, this.aliases.status)).toLowerCase();
    const globalGoal = toNumber(pickField(row.raw, this.aliases.globalGoal));
    if (globalGoal !== null && (globalGoal < 0 || globalGoal > 10000)) {
      errors.push({ field: 'meta', message: `Meta global inválida: ${globalGoal}` });
    }

    const data = {
      code,
      name,
      description: str(pickField(row.raw, this.aliases.description)) || null,
      objective: str(pickField(row.raw, this.aliases.objective)) || null,
      organ: str(pickField(row.raw, this.aliases.organ)) || null,
      year: year ?? new Date().getFullYear(),
      periodLabel: str(pickField(row.raw, this.aliases.periodLabel)) || null,
      status: STATUS_MAP[statusRaw] || 'EM_EXECUCAO',
      globalGoal,
    };

    return { data, errors, key: code.toLowerCase() };
  },

  classify(rowData, ctx, seen) {
    if (seen.has(rowData.key)) return IMPORT_ROW_STATUS.DUPLICADO;
    seen.add(rowData.key);
    return ctx.byCode.has(rowData.key) ? IMPORT_ROW_STATUS.ATUALIZAR : IMPORT_ROW_STATUS.NOVO;
  },

  async apply(validRows, ctx) {
    let created = 0;
    let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        const d = row.data;
        const code = d.code;
        delete d.code;
        delete d.name; // nome não é alterado em atualização via importação
        if (ctx.byCode.has(code.toLowerCase())) {
          await tx.program.update({ where: { code }, data: d });
          updated++;
        } else {
          await tx.program.create({ data: { code, name: row.data.name, ...d } });
          created++;
        }
      }
    });
    return { created, updated };
  },
};
