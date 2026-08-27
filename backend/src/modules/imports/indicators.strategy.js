import { prisma } from '../../lib/prisma.js';
import { pickField, toNumber } from './parser.js';
import { str } from './base.js';
import { IMPORT_ROW_STATUS } from '../../lib/constants.js';

const POLARITY_MAP = {
  maiormelhor: 'MAIOR_MELHOR', maior: 'MAIOR_MELHOR', maior_e_melhor: 'MAIOR_MELHOR', alto: 'MAIOR_MELHOR',
  menormelhor: 'MENOR_MELHOR', menor: 'MENOR_MELHOR', menor_e_melhor: 'MENOR_MELHOR', baixo: 'MENOR_MELHOR',
};
const STATUS_MAP = { ativo: 'ATIVO', inativo: 'INATIVO' };

export const indicatorsStrategy = {
  type: 'INDICADORES',
  label: 'Indicadores',
  aliases: {
    code: ['codigo', 'code', 'cod'],
    name: ['nome', 'indicador', 'nomeindicador', 'titulo'],
    description: ['descricao', 'desc'],
    category: ['categoria', 'categoriaindicador', 'eixo', 'tema'],
    unit: ['unidade', 'unidademedida', 'medida'],
    polarity: ['polaridade', 'tipo', 'sentido'],
    weight: ['peso', 'pesoindicador'],
    defaultGoal: ['meta', 'metapadrao', 'metaindicador'],
    minValue: ['minimo', 'valor_minimo', 'valorminimo'],
    maxValue: ['maximo', 'valor_maximo', 'valormaximo'],
    periodLabel: ['periodo', 'periodicidade'],
    status: ['status', 'situacao'],
  },
  headers: ['Código', 'Nome', 'Descrição', 'Categoria', 'Unidade', 'Polaridade', 'Peso', 'Meta', 'Mínimo', 'Máximo', 'Período', 'Status'],
  examples: [
    ['IND-099', 'Taxa de alfabetização', 'Percentual de crianças alfabetizadas', 'Alfabetização e Leitura', '%', 'MAIOR_MELHOR', 2, 90, 0, 100, 'Anual', 'ATIVO'],
  ],

  async loadContext() {
    const [indicators, categories] = await Promise.all([
      prisma.indicator.findMany({ select: { id: true, code: true, name: true } }),
      prisma.indicatorCategory.findMany({ select: { id: true, name: true } }),
    ]);
    return {
      byCode: new Map(indicators.map((i) => [i.code.toLowerCase(), i])),
      categoryByName: new Map(categories.map((c) => [c.name.toLowerCase(), c])),
    };
  },

  buildRow(row, ctx) {
    const errors = [];
    const code = str(pickField(row.raw, this.aliases.code)).toUpperCase();
    const name = str(pickField(row.raw, this.aliases.name));
    const category = str(pickField(row.raw, this.aliases.category));
    const weight = toNumber(pickField(row.raw, this.aliases.weight));
    const defaultGoal = toNumber(pickField(row.raw, this.aliases.defaultGoal));
    const polarityRaw = str(pickField(row.raw, this.aliases.polarity)).toLowerCase();
    const statusRaw = str(pickField(row.raw, this.aliases.status)).toLowerCase();

    if (!code || code.length < 2) errors.push({ field: 'codigo', message: 'Código é obrigatório' });
    if (!name || name.length < 3) errors.push({ field: 'nome', message: 'Nome é obrigatório' });
    if (polarityRaw && !POLARITY_MAP[polarityRaw]) {
      errors.push({ field: 'polaridade', message: `Polaridade inválida: "${polarityRaw}" (use MAIOR_MELHOR ou MENOR_MELHOR)` });
    }
    if (weight !== null && weight < 0) errors.push({ field: 'peso', message: 'Peso não pode ser negativo' });

    const data = {
      code,
      name,
      description: str(pickField(row.raw, this.aliases.description)) || null,
      categoryId: category ? ctx.categoryByName.get(category.toLowerCase())?.id ?? null : null,
      category, // usado para criar a categoria se não existir
      unit: str(pickField(row.raw, this.aliases.unit)) || null,
      polarity: POLARITY_MAP[polarityRaw] || 'MAIOR_MELHOR',
      weight: weight ?? 1,
      defaultGoal,
      minValue: toNumber(pickField(row.raw, this.aliases.minValue)),
      maxValue: toNumber(pickField(row.raw, this.aliases.maxValue)),
      periodLabel: str(pickField(row.raw, this.aliases.periodLabel)) || null,
      status: STATUS_MAP[statusRaw] || 'ATIVO',
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
      // cria categorias novas (uma vez)
      const wanted = [...new Set(validRows.map((r) => r.data.category).filter(Boolean))];
      for (const catName of wanted) {
        if (!ctx.categoryByName.has(catName.toLowerCase())) {
          const cat = await tx.indicatorCategory.create({ data: { name: catName } });
          ctx.categoryByName.set(catName.toLowerCase(), cat);
        }
      }

      for (const row of validRows) {
        const d = { ...row.data };
        const code = d.code;
        const name = d.name;
        const categoryName = d.category;
        delete d.code;
        delete d.name;
        delete d.category;
        d.categoryId = categoryName ? ctx.categoryByName.get(categoryName.toLowerCase())?.id ?? null : null;

        const existing = ctx.byCode.get(code.toLowerCase());
        if (existing) {
          await tx.indicator.update({ where: { id: existing.id }, data: d });
          updated++;
        } else {
          const createdIndicator = await tx.indicator.create({ data: { code, name, ...d } });
          ctx.byCode.set(code.toLowerCase(), createdIndicator);
          created++;
        }
      }
    });
    return { created, updated };
  },
};
