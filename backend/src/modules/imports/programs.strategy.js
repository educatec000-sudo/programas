import { prisma } from '../../lib/prisma.js';
import { pickField, toNumber } from './parser.js';
import { str } from './base.js';
import { IMPORT_ROW_STATUS } from '../../lib/constants.js';
import {
  permanentProgramCode,
  permanentProgramName,
} from '../../services/program-catalog.js';

function catalogCycleKey(name, year) {
  return `${permanentProgramName(name, year).toLocaleLowerCase('pt-BR')}|${Number(year)}`;
}

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
    ['PRG-2026-01', 'Nome do programa', 'Descrição do programa', 'Objetivo cadastrado pelo órgão responsável', 'Órgão responsável', 2026, 'Anual', 'EM EXECUCAO', 90],
  ],

  async loadContext() {
    const [programs, catalogs] = await Promise.all([
      prisma.program.findMany({
        select: { id: true, catalogId: true, code: true, name: true, year: true, catalog: { select: { code: true, name: true } } },
      }),
      prisma.programCatalog.findMany({ select: { id: true, code: true, name: true } }),
    ]);
    return {
      byCode: new Map(programs.map((program) => [program.code.toLowerCase(), program])),
      byCycle: new Map(programs.map((program) => [
        catalogCycleKey(program.catalog.name, program.year),
        program,
      ])),
      catalogByCode: new Map(catalogs.map((catalog) => [catalog.code.toLowerCase(), catalog])),
      catalogByName: new Map(catalogs.map((catalog) => [catalog.name.toLowerCase(), catalog])),
    };
  },

  buildRow(row, ctx) {
    const errors = [];
    const code = str(pickField(row.raw, this.aliases.code)).toUpperCase();
    const name = str(pickField(row.raw, this.aliases.name));
    const year = toNumber(pickField(row.raw, this.aliases.year));

    if (!code || code.length < 2) errors.push({ field: 'codigo', message: 'Código é obrigatório' });
    if (!name || name.length < 3) errors.push({ field: 'nome', message: 'Nome é obrigatório (mín. 3 caracteres)' });
    if (!year || year < 2000 || year > 2100) errors.push({ field: 'ano', message: 'Ano inválido (2000-2100)' });
    const existingCode = code ? ctx.byCode.get(code.toLowerCase()) : null;
    if (existingCode && year && existingCode.year !== year) {
      errors.push({
        field: 'ano',
        message: `O código ${code} já identifica o ciclo ${existingCode.year}; use outro código para o novo ciclo`,
      });
    }

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
    const catalogCode = permanentProgramCode(rowData.data.code, rowData.data.year);
    const catalogName = permanentProgramName(rowData.data.name, rowData.data.year);
    const catalog = ctx.catalogByCode.get(catalogCode.toLowerCase())
      || ctx.catalogByName.get(catalogName.toLowerCase());
    const cycleKey = catalogCycleKey(catalog?.name || catalogName, rowData.data.year);
    if (seen.has(cycleKey)) return IMPORT_ROW_STATUS.DUPLICADO;
    seen.add(cycleKey);
    return ctx.byCode.has(rowData.key) || ctx.byCycle.has(cycleKey)
      ? IMPORT_ROW_STATUS.ATUALIZAR
      : IMPORT_ROW_STATUS.NOVO;
  },

  async apply(validRows, ctx) {
    let created = 0;
    let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        // Nunca mutar row.data: o staging é reutilizado na resposta/auditoria.
        const { code, name, ...fields } = row.data;
        const catalogCode = permanentProgramCode(code, fields.year);
        const catalogName = permanentProgramName(name, fields.year);
        let catalog = ctx.catalogByCode.get(catalogCode.toLowerCase())
          || ctx.catalogByName.get(catalogName.toLowerCase());
        const cycleKey = catalogCycleKey(catalog?.name || catalogName, fields.year);
        const existing = ctx.byCode.get(code.toLowerCase()) || ctx.byCycle.get(cycleKey);
        if (existing) {
          // Código, nome e catálogo são preservados em atualizações por planilha.
          await tx.program.update({ where: { id: existing.id }, data: fields });
          updated++;
        } else {
          if (!catalog) {
            catalog = await tx.programCatalog.create({
              data: {
                code: catalogCode,
                name: catalogName,
                description: fields.description,
                objective: fields.objective,
                organ: fields.organ,
              },
            });
            ctx.catalogByCode.set(catalogCode.toLowerCase(), catalog);
            ctx.catalogByName.set(catalogName.toLowerCase(), catalog);
          }
          const createdProgram = await tx.program.create({
            data: { catalogId: catalog.id, code, name, ...fields },
          });
          ctx.byCode.set(code.toLowerCase(), createdProgram);
          ctx.byCycle.set(cycleKey, createdProgram);
          created++;
        }
      }
    });
    return { created, updated };
  },
};
