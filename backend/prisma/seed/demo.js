/* eslint-disable no-console */
import bcrypt from 'bcryptjs';
import { permanentProgramCode, permanentProgramName } from '../../src/services/program-catalog.js';

/** RNG determinístico (mulberry32) — dados de demonstração reproduzíveis. */
function rng(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SCHOOL_NAMES = [
  ['E.M.E.F. Bela Vista', 'URBANA'],
  ['E.M.E.F. Cidade Nova', 'URBANA'],
  ['E.M.E.F. Marituba Norte', 'URBANA'],
  ['E.M.E.F. Benevides Centro', 'URBANA'],
  ['E.M.E.F. Santo Antônio', 'URBANA'],
  ['E.M.E.F. Castanhal Sul', 'URBANA'],
  ['E.M.E.F. Guamá', 'URBANA'],
  ['E.M.E.F. Terra Firme', 'URBANA'],
  ['E.M.E.F. Icoaraci', 'URBANA'],
  ['E.M.E.F. Santa Izabel Norte', 'URBANA'],
  ['E.M.E.F. Santo Antônio do Tauá', 'URBANA'],
  ['E.M.E.F. Barcarena Rio', 'URBANA'],
  ['E.M.E.F. Pedreira', 'URBANA'],
  ['E.M.E.F. Jurunas', 'URBANA'],
  ['E.M.E.F. Ananindeua Oeste', 'URBANA'],
  ['E.M.E.F. Marituba Sul', 'URBANA'],
  ['E.M.E.F. Castanhal Norte', 'URBANA'],
  ['E.M.E.F. Benevides Rural', 'RURAL'],
  ['E.M.E.F. Vigia', 'URBANA'],
  ['E.M.E.F. Castanhal Rural', 'RURAL'],
  ['E.M.E.F. São Francisco', 'URBANA'],
  ['E.M.E.F. Inhangapi', 'RURAL'],
  ['E.M.E.F. Curuçá', 'URBANA'],
  ['E.M.E.F. Primavera', 'RURAL'],
];

export const DEMO_SCHOOL_INEPS = SCHOOL_NAMES.map((_, index) =>
  String(15010000 + (index + 1) * 137),
);

const CATEGORIES = [
  ['Alfabetização e Leitura', 'Indicadores de alfabetização e proficiência leitora'],
  ['Fluxo Escolar', 'Evasão, aprovação e distorção idade-série'],
  ['Formação de Professores', 'Qualificação e formação continuada'],
  ['Infraestrutura e Tecnologia', 'Recursos físicos e tecnológicos'],
  ['Gestão e Participação', 'Gestão escolar e envolvimento das famílias'],
];

const INDICATORS = [
  // code, name, categoriaIdx, unidade, polaridade, peso, metaPadrão, min, max
  ['IND-001', 'Taxa de alfabetização aos 7 anos', 0, '%', 'MAIOR_MELHOR', 3, 90, 0, 100],
  ['IND-002', 'Percentual de alunos com proficiência em leitura', 0, '%', 'MAIOR_MELHOR', 2, 75, 0, 100],
  ['IND-003', 'Taxa de distorção idade-série', 1, '%', 'MENOR_MELHOR', 2, 15, 0, 100],
  ['IND-004', 'Taxa de evasão escolar', 1, '%', 'MENOR_MELHOR', 3, 5, 0, 100],
  ['IND-005', 'Taxa de aprovação', 1, '%', 'MAIOR_MELHOR', 2, 90, 0, 100],
  ['IND-006', 'Frequência escolar média', 1, '%', 'MAIOR_MELHOR', 1, 90, 0, 100],
  ['IND-007', 'Professores com formação continuada', 2, '%', 'MAIOR_MELHOR', 2, 80, 0, 100],
  ['IND-008', 'Escolas com laboratório de informática funcionando', 3, '%', 'MAIOR_MELHOR', 1, 60, 0, 100],
  ['IND-009', 'Alunos por computador', 3, 'alunos', 'MENOR_MELHOR', 1, 10, 0, 500],
  ['IND-010', 'Escolas com internet de qualidade', 3, '%', 'MAIOR_MELHOR', 2, 85, 0, 100],
  ['IND-011', 'Índice de participação das famílias', 4, '%', 'MAIOR_MELHOR', 1, 70, 0, 100],
  ['IND-012', 'Metas administrativas da escola atingidas', 4, '%', 'MAIOR_MELHOR', 1, 80, 0, 100],
  ['IND-013', 'Taxa de conclusão do ensino médio', 1, '%', 'MAIOR_MELHOR', 2, 85, 0, 100],
  ['IND-014', 'Média SAEB — matemática', 0, 'pontos', 'MAIOR_MELHOR', 2, 250, 0, 500],
];

const PROGRAMS = [
  // code, name, ano, status, órgão, metaGlobal, período, escolas [from,to], indicadores [code,peso,meta]
  {
    code: 'PRG-2024-01', name: 'Alfabetiza Pará', year: 2024, status: 'CONCLUIDO', organ: 'SEDUC',
    objective: 'Alfabetizar todas as crianças até o fim do 2º ano do ensino fundamental',
    globalGoal: 80, periodLabel: 'Anual', schools: [0, 17],
    indicators: [['IND-001', 3, 90], ['IND-002', 2, 75], ['IND-006', 1, 90]],
  },
  {
    code: 'PRG-2025-01', name: 'Alfabetiza Pará', year: 2025, status: 'EM_EXECUCAO', organ: 'SEDUC',
    objective: 'Alfabetizar todas as crianças até o fim do 2º ano do ensino fundamental',
    globalGoal: 85, periodLabel: 'Anual', schools: [0, 17],
    indicators: [['IND-001', 3, 92], ['IND-002', 2, 78], ['IND-006', 1, 90]],
  },
  {
    code: 'PRG-2025-02', name: 'Escola em Tempo Integral', year: 2025, status: 'EM_EXECUCAO', organ: 'SEMED',
    objective: 'Ampliar a jornada escolar com atividades integradas',
    globalGoal: 75, periodLabel: 'Anual', schools: [0, 11],
    indicators: [['IND-005', 2, 90], ['IND-003', 2, 15], ['IND-006', 1, 95], ['IND-011', 1, 70]],
  },
  {
    code: 'PRG-2025-03', name: 'Conectados — Tecnologia na Escola', year: 2025, status: 'EM_EXECUCAO', organ: 'SEDUC',
    objective: 'Universalizar acesso à tecnologia e conectividade nas escolas',
    globalGoal: 70, periodLabel: 'Anual', schools: [6, 23],
    indicators: [['IND-008', 1, 60], ['IND-009', 1, 10], ['IND-010', 2, 85], ['IND-007', 2, 80]],
  },
  {
    code: 'PRG-2025-04', name: 'Pacto pelo Ensino Médio', year: 2025, status: 'PLANEJAMENTO', organ: 'SEDUC',
    objective: 'Elevar as taxas de conclusão e proficiência no ensino médio',
    globalGoal: 75, periodLabel: 'Anual', schools: [12, 19],
    indicators: [['IND-013', 2, 85], ['IND-014', 2, 250], ['IND-003', 2, 15]],
  },
  {
    code: 'PRG-2024-02', name: 'Mais Gestão Escolar', year: 2024, status: 'CONCLUIDO', organ: 'SEMED',
    objective: 'Fortalecer a gestão e a participação das famílias',
    globalGoal: 70, periodLabel: 'Anual', schools: [0, 17],
    indicators: [['IND-012', 1, 80], ['IND-011', 1, 70], ['IND-005', 2, 90]],
  },
  {
    code: 'CNCA-2026', name: 'Compromisso Nacional Criança Alfabetizada', year: 2026, status: 'EM_EXECUCAO', organ: 'MEC / SEMED',
    objective: 'Garantir a alfabetização de todas as crianças na idade certa com avaliação por escola',
    globalGoal: 85, periodLabel: 'Ciclo 2026', schools: [0, 11],
    indicators: [],
  },
  {
    code: 'PARC-2026', name: 'Parceria pela Alfabetização em Regime de Colaboração', year: 2026, status: 'EM_EXECUCAO', organ: 'SEDUC / SEMED',
    objective: 'Acompanhamento do desenvolvimento da Fluência Leitora em Regime de Colaboração (2º Ano)',
    globalGoal: 80, periodLabel: 'Ciclo 2026', schools: [0, 11],
    indicators: [],
  },
];

export const DEMO_CATEGORY_NAMES = CATEGORIES.map(([name]) => name);
export const DEMO_INDICATOR_CODES = INDICATORS.map(([code]) => code);
export const DEMO_PROGRAM_CODES = PROGRAMS.map(({ code }) => code);

const PERIODS_PER_YEAR = ['1º Semestre', '2º Semestre'];

async function upsertDemoGoal(prisma, data) {
  const identity = {
    scope: data.scope,
    programId: data.programId ?? null,
    schoolId: data.schoolId ?? null,
    indicatorId: data.indicatorId ?? null,
    year: data.year,
    period: data.period ?? null,
  };
  const existing = await prisma.goal.findFirst({ where: identity, orderBy: { createdAt: 'asc' } });
  if (existing) {
    return prisma.goal.update({
      where: { id: existing.id },
      data: {
        value: data.value,
        description: data.description ?? null,
        createdById: data.createdById ?? null,
      },
    });
  }
  return prisma.goal.create({ data });
}

export async function seedDemoData(prisma) {
  const rand = rng(20250825);
  console.log('>> populando dados de demonstração...');

  // Escolas
  const schools = [];
  for (let i = 0; i < SCHOOL_NAMES.length; i++) {
    const [name, zone] = SCHOOL_NAMES[i];
    const inep = DEMO_SCHOOL_INEPS[i];
    const data = {
      name,
      district: zone === 'RURAL' ? 'Zona Rural' : ['Centro', 'Bairro Novo', 'Cidade Nova', 'Terra Firme'][i % 4],
      zone,
      adminDependency: 'MUNICIPAL',
      situation: i === 23 ? 'PARALISADA' : 'ATIVA',
      address: `Av. Principal, ${100 + i * 12}`,
      phone: `(91) 9${String(8000 + i * 37).slice(0, 4)}-${String(1000 + i * 111).slice(0, 4)}`,
      email: `emef${String(i + 1).padStart(2, '0')}@educa.pa.gov.br`,
      responsible: `Diretor(a) ${String.fromCharCode(65 + (i % 26))}. Silva`,
      deletedAt: null,
    };
    schools.push(
      await prisma.school.upsert({
        where: { inep },
        update: data,
        create: { inep, ...data },
      }),
    );
  }
  console.log(`   ${schools.length} escolas`);

  // Categorias e indicadores
  const categories = [];
  for (const [name, description] of CATEGORIES) {
    categories.push(
      await prisma.indicatorCategory.upsert({
        where: { name },
        update: { description },
        create: { name, description },
      }),
    );
  }
  const indicators = [];
  for (const [code, name, catIdx, unit, polarity, weight, defaultGoal, minValue, maxValue] of INDICATORS) {
    const data = {
      name,
      unit,
      polarity,
      weight,
      defaultGoal,
      minValue,
      maxValue,
      categoryId: categories[catIdx].id,
      description: `${name} — acompanha a evolução ao longo dos períodos letivos.`,
      status: 'ATIVO',
      deletedAt: null,
    };
    indicators.push(
      await prisma.indicator.upsert({
        where: { code },
        update: data,
        create: { code, ...data },
      }),
    );
  }
  const indicatorByCode = new Map(indicators.map((i) => [i.code, i]));
  console.log(`   ${categories.length} categorias / ${indicators.length} indicadores`);

  // Programas + vínculos
  const admin = await prisma.user.findUnique({ where: { email: 'admin@cpe.local' } });
  const programs = [];
  for (const def of PROGRAMS) {
    const programData = {
      name: def.name,
      year: def.year,
      status: def.status,
      organ: def.organ,
      objective: def.objective,
      globalGoal: def.globalGoal,
      periodLabel: def.periodLabel,
      description: `${def.name} — programa de educação sob responsabilidade do ${def.organ}, ciclo ${def.year}.`,
      deletedAt: null,
    };
    const catalogCode = permanentProgramCode(def.code, def.year);
    const catalog = await prisma.programCatalog.upsert({
      where: { code: catalogCode },
      update: { deletedAt: null },
      create: {
        code: catalogCode,
        name: permanentProgramName(def.name, def.year),
        description: programData.description,
        objective: def.objective,
        organ: def.organ,
      },
    });
    const program = await prisma.program.upsert({
      where: { code: def.code },
      update: { ...programData, catalogId: catalog.id },
      create: { catalogId: catalog.id, code: def.code, ...programData },
    });
    programs.push(program);

    for (const school of schools.slice(def.schools[0], def.schools[1] + 1)) {
      await prisma.programSchool.upsert({
        where: {
          programId_schoolId: { programId: program.id, schoolId: school.id },
        },
        update: { active: true },
        create: { programId: program.id, schoolId: school.id },
      });
    }

    for (const [code, weight, goal] of def.indicators) {
      const indicator = indicatorByCode.get(code);
      await prisma.programIndicator.upsert({
        where: {
          programId_indicatorId: { programId: program.id, indicatorId: indicator.id },
        },
        update: { weight, goal, active: true },
        create: {
          programId: program.id,
          indicatorId: indicator.id,
          weight,
          goal,
        },
      });
      await upsertDemoGoal(prisma, {
        scope: 'PROGRAMA',
        programId: program.id,
        indicatorId: indicator.id,
        year: def.year,
        value: goal,
        description: `Meta do indicador ${code} no programa ${def.code}`,
        createdById: admin?.id,
      });
    }
  }
  console.log(`   ${programs.length} programas com escolas, indicadores e metas`);

  // Metas específicas de algumas escolas (demonstram resolução por especificidade)
  for (const goal of [
    {
      scope: 'ESCOLA', schoolId: schools[0].id, programId: programs[1].id,
      indicatorId: indicatorByCode.get('IND-001').id, year: 2025, value: 95,
      description: 'Meta diferenciada — escola de referência em alfabetização', createdById: admin?.id,
    },
    {
      scope: 'ESCOLA', schoolId: schools[3].id, programId: programs[3].id,
      indicatorId: indicatorByCode.get('IND-010').id, year: 2025, value: 95,
      description: 'Meta diferenciada de conectividade', createdById: admin?.id,
    },
  ]) {
    await upsertDemoGoal(prisma, goal);
  }

  // Resultados — 2 períodos por ano, com evolução realista
  const quality = schools.map(() => 0.72 + rand() * 0.4); // 0.72..1.12
  const results = [];
  for (const def of PROGRAMS) {
    const program = programs.find((p) => p.code === def.code);
    if (def.status === 'PLANEJAMENTO') continue; // sem resultados ainda
    for (const [code] of def.indicators) {
      const indicator = indicatorByCode.get(code);
      const pi = def.indicators.find((d) => d[0] === code);
      const goal = pi[2];
      for (let pIdx = 0; pIdx < PERIODS_PER_YEAR.length; pIdx++) {
        const period = PERIODS_PER_YEAR[pIdx];
        for (let sIdx = def.schools[0]; sIdx <= def.schools[1]; sIdx++) {
          const school = schools[sIdx];
          const trend = 0.94 + pIdx * 0.06 + (def.year - 2024) * 0.03;
          let value;
          if (indicator.polarity === 'MENOR_MELHOR') {
            const noise = 0.55 + rand() * 0.9;
            value = goal * noise * (2 - trend);
            value = Math.max(goal * 0.4, value);
          } else {
            const noise = 0.75 + rand() * 0.35;
            value = goal * noise * trend * quality[sIdx];
            value = Math.min(indicator.maxValue ?? value, Math.max(indicator.minValue ?? 0, value));
          }
          results.push({
            programId: program.id,
            schoolId: school.id,
            indicatorId: indicator.id,
            year: def.year,
            period,
            value: Math.round(value * 10) / 10,
            source: 'MANUAL',
            createdById: admin?.id,
          });
        }
      }
    }
  }
  await prisma.result.createMany({ data: results, skipDuplicates: true });
  console.log(`   ${results.length} resultados lançados (2024-2025, 1º/2º semestre)`);

  // Resultados consolidados do CNCA (Compromisso Nacional Criança Alfabetizada)
  const cncaProgram = programs.find((p) => p.code === 'CNCA-2026');
  if (cncaProgram) {
    const cncaResults = [];
    for (let sIdx = 0; sIdx <= 11; sIdx++) {
      const school = schools[sIdx];
      const enrolled = Math.round(45 + rand() * 40);
      const evaluated = Math.round(enrolled * (0.88 + rand() * 0.11));
      const partRate = Math.round((evaluated / enrolled) * 1000) / 10;
      const q = quality[sIdx];

      // 1. Fluência
      const pcpm = Math.round((50 + q * 25 + rand() * 10) * 10) / 10;
      const ppcpm = Math.round((20 + q * 15 + rand() * 5) * 10) / 10;
      const accuracy = Math.round((88 + q * 9 + rand() * 2) * 10) / 10;
      const fluentRate = Math.round((55 + q * 35 + rand() * 8) * 10) / 10;
      const preLeitorPct = Math.max(2, Math.round((100 - fluentRate) * 0.35 * 10) / 10);
      const iniciantePct = Math.round((100 - fluentRate - preLeitorPct) * 10) / 10;

      cncaResults.push({
        programId: cncaProgram.id,
        schoolId: school.id,
        year: 2026,
        grade: '2º Ano',
        assessment: 'Diagnóstica',
        component: 'FLUENCIA',
        enrolled,
        evaluated,
        participationRate: partRate,
        averageScore: Math.round((210 + q * 40) * 10) / 10,
        pcpm,
        ppcpm,
        accuracyRate: accuracy,
        fluentRate,
        performanceLevels: [
          { level: 'Pré-leitor', percentage: preLeitorPct, count: Math.round((preLeitorPct * evaluated) / 100) },
          { level: 'Leitor Iniciante', percentage: iniciantePct, count: Math.round((iniciantePct * evaluated) / 100) },
          { level: 'Leitor Fluente', percentage: fluentRate, count: Math.round((fluentRate * evaluated) / 100) },
        ],
        skills: [
          { code: 'H01', name: 'Leitura de Palavras', percentage: Math.round(65 + q * 25) },
          { code: 'H02', name: 'Leitura de Pseudopalavras', percentage: Math.round(58 + q * 28) },
          { code: 'H03', name: 'Leitura de Texto Fluente', percentage: Math.round(52 + q * 35) },
        ],
        rawDetails: {},
        source: 'IMPORTACAO',
      });

      // 2. Matemática
      const matScore = Math.round((200 + q * 55 + rand() * 15) * 10) / 10;
      const matAdeq = Math.round((50 + q * 38) * 10) / 10;
      cncaResults.push({
        programId: cncaProgram.id,
        schoolId: school.id,
        year: 2026,
        grade: '2º Ano',
        assessment: 'Diagnóstica',
        component: 'MATEMATICA',
        enrolled,
        evaluated,
        participationRate: partRate,
        averageScore: matScore,
        pcpm: null,
        ppcpm: null,
        accuracyRate: null,
        fluentRate: null,
        performanceLevels: [
          { level: 'Abaixo do Básico', percentage: Math.round((100 - matAdeq) * 0.4 * 10) / 10, count: Math.round(((100 - matAdeq) * 0.4 * evaluated) / 100) },
          { level: 'Básico', percentage: Math.round((100 - matAdeq) * 0.6 * 10) / 10, count: Math.round(((100 - matAdeq) * 0.6 * evaluated) / 100) },
          { level: 'Adequado', percentage: Math.round(matAdeq * 0.7 * 10) / 10, count: Math.round((matAdeq * 0.7 * evaluated) / 100) },
          { level: 'Avançado', percentage: Math.round(matAdeq * 0.3 * 10) / 10, count: Math.round((matAdeq * 0.3 * evaluated) / 100) },
        ],
        skills: [
          { code: 'H01', name: 'Leitura e Escrita de Números', percentage: Math.round(60 + q * 30) },
          { code: 'H02', name: 'Operações de Adição', percentage: Math.round(68 + q * 25) },
          { code: 'H03', name: 'Operações de Subtração', percentage: Math.round(55 + q * 30) },
          { code: 'H04', name: 'Resolução de Problemas', percentage: Math.round(48 + q * 35) },
          { code: 'H05', name: 'Espaço e Formas Geométricas', percentage: Math.round(62 + q * 28) },
        ],
        rawDetails: {},
        source: 'IMPORTACAO',
      });

      // 3. Leitura
      const leitScore = Math.round((195 + q * 58 + rand() * 12) * 10) / 10;
      const leitAdeq = Math.round((48 + q * 40) * 10) / 10;
      cncaResults.push({
        programId: cncaProgram.id,
        schoolId: school.id,
        year: 2026,
        grade: '2º Ano',
        assessment: 'Diagnóstica',
        component: 'LEITURA',
        enrolled,
        evaluated,
        participationRate: partRate,
        averageScore: leitScore,
        pcpm: null,
        ppcpm: null,
        accuracyRate: null,
        fluentRate: null,
        performanceLevels: [
          { level: 'Abaixo do Básico', percentage: Math.round((100 - leitAdeq) * 0.45 * 10) / 10, count: Math.round(((100 - leitAdeq) * 0.45 * evaluated) / 100) },
          { level: 'Básico', percentage: Math.round((100 - leitAdeq) * 0.55 * 10) / 10, count: Math.round(((100 - leitAdeq) * 0.55 * evaluated) / 100) },
          { level: 'Adequado', percentage: Math.round(leitAdeq * 0.65 * 10) / 10, count: Math.round((leitAdeq * 0.65 * evaluated) / 100) },
          { level: 'Avançado', percentage: Math.round(leitAdeq * 0.35 * 10) / 10, count: Math.round((leitAdeq * 0.35 * evaluated) / 100) },
        ],
        skills: [
          { code: 'H01', name: 'Localização de Informação Explícita', percentage: Math.round(64 + q * 28) },
          { code: 'H02', name: 'Inferência do Sentido Global', percentage: Math.round(50 + q * 32) },
          { code: 'H03', name: 'Identificação da Finalidade do Texto', percentage: Math.round(58 + q * 30) },
        ],
        rawDetails: {},
        source: 'IMPORTACAO',
      });

      // 4. Escrita
      const escScore = Math.round((205 + q * 50 + rand() * 10) * 10) / 10;
      const escAlfa = Math.round((58 + q * 36) * 10) / 10;
      cncaResults.push({
        programId: cncaProgram.id,
        schoolId: school.id,
        year: 2026,
        grade: '2º Ano',
        assessment: 'Diagnóstica',
        component: 'ESCRITA',
        enrolled,
        evaluated,
        participationRate: partRate,
        averageScore: escScore,
        pcpm: null,
        ppcpm: null,
        accuracyRate: null,
        fluentRate: escAlfa,
        performanceLevels: [
          { level: 'Pré-silábico', percentage: Math.round((100 - escAlfa) * 0.25 * 10) / 10, count: Math.round(((100 - escAlfa) * 0.25 * evaluated) / 100) },
          { level: 'Silábico', percentage: Math.round((100 - escAlfa) * 0.40 * 10) / 10, count: Math.round(((100 - escAlfa) * 0.40 * evaluated) / 100) },
          { level: 'Silábico-Alfabético', percentage: Math.round((100 - escAlfa) * 0.35 * 10) / 10, count: Math.round(((100 - escAlfa) * 0.35 * evaluated) / 100) },
          { level: 'Alfabético', percentage: escAlfa, count: Math.round((escAlfa * evaluated) / 100) },
        ],
        skills: [
          { code: 'H01', name: 'Escrita de Palavras com Correspondência Grafofonêmica', percentage: Math.round(66 + q * 26) },
          { code: 'H02', name: 'Produção de Frases e Pequenos Textos', percentage: Math.round(54 + q * 34) },
        ],
        rawDetails: {},
        source: 'IMPORTACAO',
      });
    }

    for (const item of cncaResults) {
      await prisma.cncaSchoolResult.upsert({
        where: {
          programId_schoolId_year_assessment_grade_component: {
            programId: item.programId,
            schoolId: item.schoolId,
            year: item.year,
            assessment: item.assessment,
            grade: item.grade,
            component: item.component,
          },
        },
        create: item,
        update: item,
      });
    }
    console.log(`   ${cncaResults.length} resultados do CNCA garantidos (Escrita, Leitura, Matemática e Fluência)`);
  }

  // Notificações de boas-vindas (sem duplicar em novas execuções do seed)
  if (admin) {
    for (const notification of [
      {
        type: 'INFO',
        title: 'Bem-vindo ao CPE',
        message: 'O sistema foi inicializado com dados de demonstração. Explore o dashboard, rankings e relatórios.',
      },
      {
        type: 'SUCESSO',
        title: 'Seed concluído',
        message: 'Permissões, perfis, usuários, escolas, programas, indicadores, metas e resultados criados.',
      },
    ]) {
      const existing = await prisma.notification.findFirst({
        where: { userId: admin.id, title: notification.title },
      });
      if (!existing) {
        await prisma.notification.create({ data: { userId: admin.id, ...notification } });
      }
    }
  }
  console.log('>> dados de demonstração prontos');
}
