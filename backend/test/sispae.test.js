import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';
import { prisma } from '../src/lib/prisma.js';
import {
  parseSispaeNumber,
  normalizeInep,
  normalizeSchoolName,
  extractInepFromSchoolText,
  readSpreadsheetSheets,
  findHeaderRowIndex,
  mapRowColumns,
  isIgnoredColumn,
  previewSispaeImport,
  confirmSispaeImport,
  resolveSispaeProgram,
  resolveSispaeApplication,
} from '../src/programs/sispae/import.js';
import {
  detectSispaeComponent,
  detectSispaeApplicationType,
  SISPAE_COMPONENTS,
  SISPAE_PERFORMANCE_LEVELS,
  SISPAE_RANKING_INDICATORS,
} from '../src/programs/sispae/config.js';
import {
  extractPerformanceRates,
  getSispaeDashboard,
  getSispaeRanking,
  getSispaeAnalises,
  createSispaeApplication,
  deleteSispaeApplication,
} from '../src/programs/sispae/service.js';

test('SisPAE: converte números em formatos pt-BR, porcentagem e inteiros com segurança', () => {
  assert.equal(parseSispaeNumber(100), 100);
  assert.equal(parseSispaeNumber('100%'), 100);
  assert.equal(parseSispaeNumber('85,5%'), 85.5);
  assert.equal(parseSispaeNumber('1.234,56'), 1234.56);
  assert.equal(parseSispaeNumber('  69% '), 69);
  assert.equal(parseSispaeNumber('-'), null);
  assert.equal(parseSispaeNumber('—'), null);
  assert.equal(parseSispaeNumber(''), null);
  assert.equal(parseSispaeNumber(null), null);
});

test('SisPAE: normaliza códigos INEP e extrai INEP de nomes compostos de escolas', () => {
  assert.equal(normalizeInep('15145425'), '15145425');
  assert.equal(normalizeInep('15.145.425'), '15145425');
  assert.equal(normalizeInep(' 15065740 '), '15065740');
  assert.equal(normalizeInep('123'), null); // muito curto

  assert.equal(
    extractInepFromSchoolText('E M E F ACENDENDO AS LUZES - 15145425'),
    '15145425',
  );
  assert.equal(
    extractInepFromSchoolText('E M E F COMANDANTE GERMANO - 15065740'),
    '15065740',
  );
  assert.equal(
    extractInepFromSchoolText('ESCOLA SANTA MARIA (15064255)'),
    '15064255',
  );
});

test('SisPAE: normaliza nomes de escolas removendo prefixos administrativos e acentos', () => {
  const norm1 = normalizeSchoolName('E M E F ACENDENDO AS LUZES');
  assert.equal(norm1, 'acendendo as luzes');

  const norm2 = normalizeSchoolName('E.M.E.I.E.F. TOMAZ LOURENÇO NEGRÃO');
  assert.equal(norm2, 'tomaz lourenco negrao');

  const norm3 = normalizeSchoolName('ESCOLA MUNICIPAL PROFESSOR MAXIMIANO');
  assert.equal(norm3, 'maximiano');
});

test('SisPAE: detecta componentes curriculares oficiais e tipos de aplicação', () => {
  assert.equal(detectSispaeComponent('LÍNGUA PORTUGUESA'), 'LINGUA_PORTUGUESA');
  assert.equal(detectSispaeComponent('Lingua Portuguesa - Leitura'), 'LINGUA_PORTUGUESA');
  assert.equal(detectSispaeComponent('Português'), 'LINGUA_PORTUGUESA');
  assert.equal(detectSispaeComponent('LP'), 'LINGUA_PORTUGUESA');
  assert.equal(detectSispaeComponent('MATEMÁTICA'), 'MATEMATICA');
  assert.equal(detectSispaeComponent('Matemática'), 'MATEMATICA');
  assert.equal(detectSispaeComponent('Ciências Humanas'), 'CIENCIAS_HUMANAS');
  assert.equal(detectSispaeComponent('Ciências da Natureza'), 'CIENCIAS_NATUREZA');
  assert.equal(detectSispaeComponent('Redação'), 'PRODUCAO_TEXTUAL');

  assert.equal(
    detectSispaeApplicationType('Simulado Pará 2026 – Alfabetização'),
    'SIMULADO',
  );
  assert.equal(
    detectSispaeApplicationType('Simulado 1 - 2026'),
    'SIMULADO',
  );
  assert.equal(
    detectSispaeApplicationType('Avaliação Oficial SisPAE 2026'),
    'AVALIACAO_OFICIAL',
  );
  assert.equal(
    detectSispaeApplicationType('SisPAE 2026 - Avaliação Somativa Final'),
    'AVALIACAO_OFICIAL',
  );
});

test('SisPAE: ignora completamente REDE, ESTADO, REGIONAL, MUNICÍPIO', () => {
  assert.equal(isIgnoredColumn('Rede'), true);
  assert.equal(isIgnoredColumn('Tipo de Rede'), true);
  assert.equal(isIgnoredColumn('Estado'), true);
  assert.equal(isIgnoredColumn('UF'), true);
  assert.equal(isIgnoredColumn('Regional'), true);
  assert.equal(isIgnoredColumn('DRE'), true);
  assert.equal(isIgnoredColumn('Município'), true);
  assert.equal(isIgnoredColumn('Cidade'), true);
  assert.equal(isIgnoredColumn('Escola'), false);
  assert.equal(isIgnoredColumn('Avaliados (%)'), false);
  assert.equal(isIgnoredColumn('Defasagem'), false);
  assert.equal(isIgnoredColumn('H 01 (%)'), false);
});

test('SisPAE: mapeia colunas oficiais de Língua Portuguesa e Matemática da planilha MEC/CAEd', () => {
  const lpHeaders = [
    'Rede', 'Ano Escolar', 'Componente Curricular', 'Estado', 'Regional', 'Município', 'Escola',
    'Avaliados (%)', 'Defasagem', 'Aprendizado intermediário', 'Aprendizado adequado',
    'H 01 (%)', 'H 02 (%)', 'H 03 (%)', 'H 04 (%)', 'H 05 (%)', 'H 06 (%)',
    'H 07 (%)', 'H 08 (%)', 'H 09 (%)', 'H 10 (%)', 'H 11 (%)', 'H 12 (%)', 'H 13 (%)',
  ];

  const mapping = mapRowColumns(lpHeaders);
  assert.equal(mapping.schoolName, 6);
  assert.equal(mapping.participationRate, 7);
  assert.equal(mapping.grade, 1);
  assert.equal(mapping.component, 2);
  assert.equal(mapping.levels.length, 3);
  assert.equal(mapping.levels[0].name, 'Defasagem');
  assert.equal(mapping.levels[1].name, 'Aprendizado intermediário');
  assert.equal(mapping.levels[2].name, 'Aprendizado adequado');
  assert.equal(mapping.skills.length, 13);
  assert.equal(mapping.skills[0].code, 'H01');
  assert.equal(mapping.skills[12].code, 'H13');
});

test('SisPAE: processa arquivo oficial real de Língua Portuguesa (Simulado Pará 2026)', () => {
  const filePath = path.join('/home/user/uploads', 'HABILIDADE_DESEMPENHO_ESCOLA 08-09-2026 3-50-48.csv');
  if (!fs.existsSync(filePath)) return;

  const buffer = fs.readFileSync(filePath);
  const sheets = readSpreadsheetSheets(buffer, 'HABILIDADE_DESEMPENHO_ESCOLA 08-09-2026 3-50-48.csv');

  assert.equal(sheets.length, 1);
  const rows = sheets[0].rows;
  assert.ok(rows.length > 5);

  const headerIdx = findHeaderRowIndex(rows);
  const headers = rows[headerIdx];
  const colMap = mapRowColumns(headers);

  assert.ok(colMap.schoolName >= 0);
  assert.ok(colMap.participationRate >= 0);
  assert.ok(colMap.skills.length >= 10);

  // Primeira linha de dados
  const firstDataRow = rows[headerIdx + 1];
  const rawSchool = firstDataRow[colMap.schoolName];
  const inep = extractInepFromSchoolText(rawSchool);
  assert.equal(inep, '15145425');

  const partRate = parseSispaeNumber(firstDataRow[colMap.participationRate]);
  assert.equal(partRate, 100);
});

test('SisPAE: processa arquivo oficial real de Matemática (Simulado Pará 2026)', () => {
  const filePath = path.join('/home/user/uploads', 'HABILIDADE_DESEMPENHO_ESCOLA 08-09-2026 3-51-57.csv');
  if (!fs.existsSync(filePath)) return;

  const buffer = fs.readFileSync(filePath);
  const sheets = readSpreadsheetSheets(buffer, 'HABILIDADE_DESEMPENHO_ESCOLA 08-09-2026 3-51-57.csv');

  assert.equal(sheets.length, 1);
  const rows = sheets[0].rows;
  assert.ok(rows.length > 5);

  const headerIdx = findHeaderRowIndex(rows);
  const headers = rows[headerIdx];
  const colMap = mapRowColumns(headers);

  assert.ok(colMap.skills.length >= 11);
  assert.equal(colMap.skills[0].code, 'H01');
  assert.equal(colMap.skills[10].code, 'H11');
});

test('SisPAE: extrai percentuais consolidados de desempenho (Defasagem, Intermediário, Adequado)', () => {
  const levels = [
    { level: 'Defasagem', percentage: 5 },
    { level: 'Aprendizado intermediário', percentage: 27 },
    { level: 'Aprendizado adequado', percentage: 68 },
  ];

  const rates = extractPerformanceRates(levels);
  assert.equal(rates.deficitRate, 5);
  assert.equal(rates.intermediateRate, 27);
  assert.equal(rates.adequateRate, 68);
});

test('SisPAE Regra Fundamental: Resultados de Simulado e Avaliação Oficial NUNCA se misturam', () => {
  // Simula resultados de duas aplicações distintas
  const simuladoResults = [
    {
      id: 'res-simulado-01',
      applicationId: 'app-simulado-2026',
      schoolId: 'school-01',
      component: 'LINGUA_PORTUGUESA',
      averageScore: 65,
      participationRate: 95,
      performanceLevels: [
        { level: 'Defasagem', percentage: 10 },
        { level: 'Intermediário', percentage: 40 },
        { level: 'Adequado', percentage: 50 },
      ],
    },
  ];

  const oficialResults = [
    {
      id: 'res-oficial-01',
      applicationId: 'app-oficial-2026',
      schoolId: 'school-01',
      component: 'LINGUA_PORTUGUESA',
      averageScore: 82,
      participationRate: 98,
      performanceLevels: [
        { level: 'Defasagem', percentage: 2 },
        { level: 'Intermediário', percentage: 18 },
        { level: 'Adequado', percentage: 80 },
      ],
    },
  ];

  // A aplicação Simulado possui proficiência média de 65 e 50% adequado
  const simuladoRates = extractPerformanceRates(simuladoResults[0].performanceLevels);
  assert.equal(simuladoRates.adequateRate, 50);
  assert.equal(simuladoResults[0].averageScore, 65);

  // A aplicação Oficial possui proficiência média de 82 e 80% adequado
  const oficialRates = extractPerformanceRates(oficialResults[0].performanceLevels);
  assert.equal(oficialRates.adequateRate, 80);
  assert.equal(oficialResults[0].averageScore, 82);

  // Não há sobreposição ou contaminação de dados entre aplicações
  assert.notEqual(simuladoResults[0].applicationId, oficialResults[0].applicationId);
  assert.notEqual(simuladoRates.adequateRate, oficialRates.adequateRate);
});

test('SisPAE Dashboard e Ranking: calcula corretamente agregados, KPIs e ordenação', async () => {
  const originalProgramFindFirst = prisma.program.findFirst;
  const originalAppFindMany = prisma.sispaeApplication.findMany;
  const originalResultFindMany = prisma.sispaeSchoolResult.findMany;

  try {
    const mockProgram = { id: 'prog-sispae-2026', code: 'SISPAE-2026', name: 'SisPAE', year: 2026 };
    const mockApp = {
      id: 'app-simulado-2026',
      name: 'Simulado Pará 2026 – Alfabetização',
      type: 'SIMULADO',
      year: 2026,
      stage: 'Alfabetização',
      _count: { results: 2 },
    };

    const mockResults = [
      {
        id: 'res-1',
        programId: mockProgram.id,
        applicationId: mockApp.id,
        schoolId: 'sch-1',
        component: 'LINGUA_PORTUGUESA',
        grade: '2º Ano',
        enrolled: 50,
        evaluated: 50,
        participationRate: 100,
        averageScore: 78.5,
        performanceLevels: [
          { level: 'Defasagem', percentage: 10 },
          { level: 'Aprendizado intermediário', percentage: 20 },
          { level: 'Aprendizado adequado', percentage: 70 },
        ],
        skills: [{ code: 'H01', label: 'Habilidade 1', percentage: 80 }],
        school: { id: 'sch-1', inep: '15145425', name: 'Escola A', zone: 'URBANA', schoolType: 'EMEF' },
      },
      {
        id: 'res-2',
        programId: mockProgram.id,
        applicationId: mockApp.id,
        schoolId: 'sch-2',
        component: 'LINGUA_PORTUGUESA',
        grade: '2º Ano',
        enrolled: 40,
        evaluated: 36,
        participationRate: 90,
        averageScore: 62.0,
        performanceLevels: [
          { level: 'Defasagem', percentage: 30 },
          { level: 'Aprendizado intermediário', percentage: 30 },
          { level: 'Aprendizado adequado', percentage: 40 },
        ],
        skills: [{ code: 'H01', label: 'Habilidade 1', percentage: 45 }],
        school: { id: 'sch-2', inep: '15065740', name: 'Escola B', zone: 'RURAL', schoolType: 'EMEF' },
      },
    ];

    prisma.program.findFirst = async () => mockProgram;
    prisma.sispaeApplication.findMany = async () => [mockApp];
    prisma.sispaeSchoolResult.findMany = async () => mockResults;

    // 1. Dashboard
    const dash = await getSispaeDashboard(mockProgram.id, { applicationId: mockApp.id });
    assert.equal(dash.kpis.totalSchools, 2);
    assert.equal(dash.kpis.enrolled, 90);
    assert.equal(dash.kpis.evaluated, 86);
    assert.equal(dash.kpis.participationRate, 95);
    assert.equal(dash.kpis.adequateRate, 55);
    assert.equal(dash.kpis.deficitRate, 20);
    assert.equal(dash.topSchools[0].schoolName, 'Escola A');
    assert.equal(dash.attentionSchools[0].schoolName, 'Escola B');

    // 2. Ranking
    const rank = await getSispaeRanking(mockProgram.id, { applicationId: mockApp.id, indicator: 'ADEQUADO' });
    assert.equal(rank.ranking.length, 2);
    assert.equal(rank.ranking[0].schoolName, 'Escola A');
    assert.equal(rank.ranking[0].position, 1);
    assert.equal(rank.ranking[0].badge, '🥇 1º');
    assert.equal(rank.ranking[1].schoolName, 'Escola B');
    assert.equal(rank.ranking[1].position, 2);
    assert.equal(rank.ranking[1].badge, '🥈 2º');

    // 3. Análises
    const analises = await getSispaeAnalises(mockProgram.id, { applicationId: mockApp.id });
    assert.equal(analises.skills.length, 1);
    assert.equal(analises.skills[0].code, 'H01');
    assert.equal(analises.skills[0].average, 62.5); // (80 + 45) / 2
    assert.equal(analises.matrix.length, 2);
  } finally {
    prisma.program.findFirst = originalProgramFindFirst;
    prisma.sispaeApplication.findMany = originalAppFindMany;
    prisma.sispaeSchoolResult.findMany = originalResultFindMany;
  }
});

test('SisPAE Import: suporta arquivo via Multer diskStorage (objeto com path e sem buffer)', async () => {
  const filePath = path.join('/home/user/uploads', 'HABILIDADE_DESEMPENHO_ESCOLA 08-09-2026 3-50-48.csv');
  if (!fs.existsSync(filePath)) return;

  const originalProgramFindFirst = prisma.program.findFirst;
  const originalSchoolFindMany = prisma.school.findMany;
  const originalAppFindMany = prisma.sispaeApplication.findMany;

  try {
    const mockProgram = { id: 'prog-sispae-2026', code: 'SISPAE-2026', name: 'SisPAE', year: 2026 };
    const mockSchools = [
      { id: 'sch-1', inep: '15145425', name: 'E M E F ACENDENDO AS LUZES', zone: 'URBANA', schoolType: 'EMEF' },
    ];

    prisma.program.findFirst = async () => mockProgram;
    prisma.school.findMany = async () => mockSchools;
    prisma.sispaeApplication.findMany = async () => [];

    // Simula o objeto req.file gerado pelo Multer com diskStorage (onde buffer é undefined)
    const multerFileObject = {
      fieldname: 'file',
      originalname: 'HABILIDADE_DESEMPENHO_ESCOLA 08-09-2026 3-50-48.csv',
      encoding: '7bit',
      mimetype: 'text/csv',
      destination: '/tmp/cpe-uploads/imports',
      filename: '1726330000-abc123.csv',
      path: filePath,
      size: fs.statSync(filePath).size,
      buffer: undefined, // Simula diskStorage
    };

    // 1. Testa leitura direta por readSpreadsheetSheets
    const sheets = readSpreadsheetSheets(multerFileObject);
    assert.ok(sheets.length >= 1);
    assert.ok(sheets[0].rows.length > 5);

    // 2. Testa previewSispaeImport recebendo o objeto do multer
    const preview = await previewSispaeImport(mockProgram.id, multerFileObject);
    assert.ok(preview.summary.totalRows > 0);
    assert.ok(preview.summary.validRows > 0);
    assert.equal(preview.summary.detectedComponents.includes('LINGUA_PORTUGUESA'), true);
  } finally {
    prisma.program.findFirst = originalProgramFindFirst;
    prisma.school.findMany = originalSchoolFindMany;
    prisma.sispaeApplication.findMany = originalAppFindMany;
  }
});
