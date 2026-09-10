import test from 'node:test';
import assert from 'node:assert/strict';
import xlsx from 'xlsx';
import { prisma } from '../src/lib/prisma.js';
import {
  parseCncaNumber,
  normalizeInep,
  normalizeSchoolName,
  findHeaderRowIndex,
  mapRowColumns,
  readSpreadsheetSheets,
  parseCncaSpreadsheet,
  confirmCncaImport,
} from '../src/programs/cnca/import.js';
import {
  getCncaDashboard,
  getCncaSchoolResults,
  getCncaSingleSchoolDetail,
  getCncaRanking,
  getCncaFilters,
  getCncaParticipatingSchools,
  getAvailableSchoolsToAdd,
  addCncaParticipatingSchool,
  removeCncaParticipatingSchool,
} from '../src/programs/cnca/service.js';
import { CNCA_COMPONENTS, CNCA_RANKING_INDICATORS, detectComponent } from '../src/programs/cnca/config.js';

test('CNCA: converte números em formatos pt-BR, porcentagem e inteiros', () => {
  assert.equal(parseCncaNumber('1.234,56'), 1234.56);
  assert.equal(parseCncaNumber('78,5%'), 78.5);
  assert.equal(parseCncaNumber('120'), 120);
  assert.equal(parseCncaNumber('—'), null);
  assert.equal(parseCncaNumber(''), null);
  assert.equal(parseCncaNumber(null), null);
});

test('CNCA: normaliza códigos INEP removendo pontuações', () => {
  assert.equal(normalizeInep('15.065.359'), '15065359');
  assert.equal(normalizeInep('15065359'), '15065359');
  assert.equal(normalizeInep('123'), null); // menos de 6 dígitos
});

test('CNCA: normaliza nomes de escolas removendo prefixos administrativos e acentos', () => {
  assert.equal(normalizeSchoolName('E.M.E.I.E.F. TOMAZ LOURENÇO NEGRÃO'), 'tomaz lourenco negrao');
  assert.equal(normalizeSchoolName('EMEF ACENDENDO AS LUZES'), 'acendendo as luzes');
  assert.equal(normalizeSchoolName('ESCOLA MUNICIPAL DR. PEDRO'), 'pedro');
  assert.equal(normalizeSchoolName('COLÉGIO ESTADUAL SÃO JOÃO'), 'sao joao');
});

test('CNCA: identifica automaticamente os 4 componentes oficiais pelas nomenclaturas', () => {
  assert.equal(detectComponent('Avaliação de Matemática 2º ano'), 'MATEMATICA');
  assert.equal(detectComponent('Matemática e suas Tecnologias'), 'MATEMATICA');
  assert.equal(detectComponent('LP - Compreensão Leitora'), 'LEITURA');
  assert.equal(detectComponent('Produção Textual e Escrita'), 'ESCRITA');
  assert.equal(detectComponent('Fluência em Leitura - 2026'), 'FLUENCIA');
});

test('CNCA: mapeia colunas oficiais de Matemática preservando habilidades H01, H02, H03...', () => {
  const headers = [
    'Código INEP',
    'Nome da Escola',
    'Ano Escolar',
    'Avaliação',
    'Matriculados',
    'Avaliados',
    'Taxa de Participação',
    'Proficiência Média',
    'Abaixo do Básico (%)',
    'Básico (%)',
    'Adequado (%)',
    'Avançado (%)',
    'H01',
    'H02',
    'H03',
    'H04',
    'H05',
  ];

  const colMap = mapRowColumns(headers);

  assert.equal(colMap.inep, 0);
  assert.equal(colMap.schoolName, 1);
  assert.equal(colMap.grade, 2);
  assert.equal(colMap.assessment, 3);
  assert.equal(colMap.enrolled, 4);
  assert.equal(colMap.evaluated, 5);
  assert.equal(colMap.participationRate, 6);
  assert.equal(colMap.averageScore, 7);
  assert.equal(colMap.levels.length, 4);
  assert.equal(colMap.skills.length, 5);
  assert.deepEqual(colMap.skills.map((s) => s.code), ['H01', 'H02', 'H03', 'H04', 'H05']);
});

test('CNCA: mapeia colunas oficiais de Fluência preservando PCPM, Precisão e Perfis de Leitor', () => {
  const headers = [
    'INEP',
    'Escola',
    'Previstos',
    'Presentes',
    '% Participação',
    'PCPM Médio',
    'PPCPM',
    'Precisão (%)',
    '% Alunos Fluentes',
    'Pré-leitor (%)',
    'Leitor Iniciante (%)',
    'Leitor Fluente (%)',
  ];

  const colMap = mapRowColumns(headers);

  assert.equal(colMap.inep, 0);
  assert.equal(colMap.schoolName, 1);
  assert.equal(colMap.enrolled, 2);
  assert.equal(colMap.evaluated, 3);
  assert.equal(colMap.participationRate, 4);
  assert.equal(colMap.pcpm, 5);
  assert.equal(colMap.ppcpm, 6);
  assert.equal(colMap.accuracyRate, 7);
  assert.equal(colMap.fluentRate, 8);
  assert.equal(colMap.levels.length, 3);
});

test('CNCA: mapeia colunas oficiais de Escrita preservando níveis psicogenéticos', () => {
  const headers = [
    'INEP',
    'Escola',
    'Ano',
    'Matriculados',
    'Avaliados',
    'Pré-silábico',
    'Silábico',
    'Silábico-Alfabético',
    'Alfabético',
    'H01 - Escrita de Palavras',
    'H02 - Produção Textual',
  ];

  const colMap = mapRowColumns(headers);

  assert.equal(colMap.inep, 0);
  assert.equal(colMap.schoolName, 1);
  assert.equal(colMap.levels.length, 4);
  assert.equal(colMap.skills.length, 2);
  assert.deepEqual(colMap.skills.map((s) => s.code), ['H01', 'H02']);
});

test('CNCA: lê arquivo Excel em memória com múltiplas abas e dados de escolas', () => {
  const wb = xlsx.utils.book_new();

  // Aba Matemática
  const matData = [
    ['Código INEP', 'Escola', 'Matriculados', 'Avaliados', 'Proficiência Média', 'H01', 'H02', 'H03'],
    ['15065359', 'E M E I E F TOMAZ LOURENCO NEGRAO', 77, 75, 245.8, 78.5, 65.0, 82.3],
    ['15145425', 'E M E F ACENDENDO AS LUZES', 60, 58, 230.2, 70.1, 58.4, 75.0],
  ];
  const matSheet = xlsx.utils.aoa_to_sheet(matData);
  xlsx.utils.book_append_sheet(wb, matSheet, 'Matematica');

  // Aba Fluência
  const fluData = [
    ['INEP', 'Escola', 'Previstos', 'Presentes', 'PCPM', 'Precisão', '% Fluentes'],
    ['15065359', 'E M E I E F TOMAZ LOURENCO NEGRAO', 77, 75, 68.4, 94.2, 72.0],
    ['15145425', 'E M E F ACENDENDO AS LUZES', 60, 58, 55.0, 91.0, 58.6],
  ];
  const fluSheet = xlsx.utils.aoa_to_sheet(fluData);
  xlsx.utils.book_append_sheet(wb, fluSheet, 'Fluencia');

  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const sheets = readSpreadsheetSheets(buffer, 'CNCA_OFICIAL_2026.xlsx');

  assert.equal(sheets.length, 2);
  assert.equal(sheets[0].sheetName, 'Matematica');
  assert.equal(sheets[1].sheetName, 'Fluencia');
  assert.equal(sheets[0].rows.length, 3);
  assert.equal(sheets[1].rows.length, 3);
});

test('CNCA: localiza corretamente a linha do cabeçalho em planilhas com linhas de título prévias', () => {
  const rows = [
    ['RELATÓRIO OFICIAL DE RESULTADOS - CNCA 2026'],
    ['MUNICÍPIO DE ABAETETUBA - RESULTADOS CONSOLIDADOS POR ESCOLA'],
    [''],
    ['Código INEP', 'Nome da Escola', 'Matriculados', 'Avaliados', 'Proficiência Média'],
    ['15065359', 'E M E I E F TOMAZ LOURENCO NEGRAO', '77', '75', '245.8'],
  ];

  const headerIdx = findHeaderRowIndex(rows);
  assert.equal(headerIdx, 3);
});

test('CNCA: mapeia colunas de exportação oficial MEC/CAEd HABILIDADE_DESEMPENHO_ESCOLA', () => {
  const headers = [
    'cd_escola',
    'nm_escola',
    'ano_escolar',
    'nm_edicao',
    'nm_disciplina',
    'qtd_matriculados',
    'qtd_avaliados',
    'tx_participacao',
    'proficiencia_media',
    'HAB_01',
    'HAB_02',
    'HAB_03',
  ];

  const colMap = mapRowColumns(headers);

  assert.equal(colMap.inep, 0);
  assert.equal(colMap.schoolName, 1);
  assert.equal(colMap.grade, 2);
  assert.equal(colMap.assessment, 3);
  assert.equal(colMap.component, 4);
  assert.equal(colMap.enrolled, 5);
  assert.equal(colMap.evaluated, 6);
  assert.equal(colMap.participationRate, 7);
  assert.equal(colMap.averageScore, 8);
  assert.equal(colMap.skills.length, 3);
  assert.deepEqual(colMap.skills.map((s) => s.code), ['H01', 'H02', 'H03']);
});

test('CNCA: processa arquivo CSV com delimitador ponto-e-vírgula e nome HABILIDADE_DESEMPENHO_ESCOLA', async () => {
  const csvContent = [
    'cd_escola;nm_escola;ano_escolar;nm_edicao;nm_disciplina;qtd_matriculados;qtd_avaliados;tx_participacao;proficiencia_media;HAB_01;HAB_02',
    '15065359;E M E I E F TOMAZ LOURENCO NEGRAO;2º Ano;Diagnóstica;Matemática;50;48;96,0;248,5;82,0;75,4',
    '15145425;E M E F ACENDENDO AS LUZES;2º Ano;Diagnóstica;Matemática;40;38;95,0;232,1;71,0;68,0',
  ].join('\n');

  const buffer = Buffer.from(csvContent, 'utf-8');

  const mockSchools = [
    { id: 'school-1', inep: '15065359', name: 'E.M.E.I.E.F. TOMAZ LOURENÇO NEGRÃO', zone: 'URBANA', district: 'SEDE' },
    { id: 'school-2', inep: '15145425', name: 'E.M.E.F. ACENDENDO AS LUZES', zone: 'RURAL', district: 'ZONA RURAL' },
  ];

  const originalSchoolFindMany = prisma.school.findMany;
  const originalCncaResultFindMany = prisma.cncaSchoolResult.findMany;

  try {
    prisma.school.findMany = async () => mockSchools;
    prisma.cncaSchoolResult.findMany = async () => [];

    const preview = await parseCncaSpreadsheet(
      buffer,
      'HABILIDADE_DESEMPENHO_ESCOLA 08-09-2026 3-51-57.csv',
      null,
      'prog-1',
    );

    assert.equal(preview.summary.totalRows, 2);
    assert.equal(preview.summary.validRows, 2);
    assert.equal(preview.summary.invalidRows, 0);
    assert.equal(preview.rows[0].component, 'MATEMATICA');
    assert.equal(preview.rows[0].matchedSchool.id, 'school-1');
    assert.equal(preview.rows[0].averageScore, 248.5);
    assert.equal(preview.rows[0].participationRate, 96.0);
    assert.equal(preview.rows[0].skills.length, 2);
    assert.equal(preview.rows[0].skills[0].code, 'H01');
    assert.equal(preview.rows[0].skills[0].percentage, 82.0);
  } finally {
    prisma.school.findMany = originalSchoolFindMany;
    prisma.cncaSchoolResult.findMany = originalCncaResultFindMany;
  }
});

test('CNCA Dinâmico: ignora REDE, ESTADO, REGIONAL, MUNICÍPIO e importa todas as demais colunas individualmente', async () => {
  const csvContent = [
    'Rede;Ano Escolar;Componente Curricular;Estado;Regional;Município;Escola;Avaliados (%);Defasagem;Aprendizado intermediário;Aprendizado adequado;H 01 (%);H 02 (%)',
    'PÚBLICA;ENSINO FUNDAMENTAL DE 9 ANOS - 2º ANO;LÍNGUA PORTUGUESA;PARÁ;DRE ABAETETUBA;ABAETETUBA;E M E F ACENDENDO AS LUZES - 15145425;100;5%;27%;69%;58;61',
  ].join('\n');

  const buffer = Buffer.from(csvContent, 'utf-8');

  const mockSchools = [
    { id: 'sch-15145425', inep: '15145425', name: 'E M E F ACENDENDO AS LUZES', zone: 'RURAL', district: 'ZONA RURAL' },
  ];

  const originalSchoolFindMany = prisma.school.findMany;
  const originalCncaResultFindMany = prisma.cncaSchoolResult.findMany;

  try {
    prisma.school.findMany = async () => mockSchools;
    prisma.cncaSchoolResult.findMany = async () => [];

    const preview = await parseCncaSpreadsheet(buffer, 'teste.csv', null, 'prog-1');

    assert.equal(preview.summary.totalColumns, 13);
    assert.equal(preview.summary.ignoredColumnsCount, 4);
    assert.deepEqual(preview.summary.ignoredColumns, ['Rede', 'Estado', 'Regional', 'Município']);
    assert.equal(preview.summary.importedColumnsCount, 9);
    assert.ok(preview.summary.importedColumns.includes('Ano Escolar'));
    assert.ok(preview.summary.importedColumns.includes('H 01 (%)'));
    assert.ok(preview.summary.importedColumns.includes('H 02 (%)'));
    assert.equal(preview.rows[0].displayValues['H 01 (%)'], '58');
    assert.equal(preview.rows[0].displayValues['H 02 (%)'], '61');
    assert.equal(preview.rows[0].inep, '15145425');
    assert.equal(preview.rows[0].matchedSchool.id, 'sch-15145425');
  } finally {
    prisma.school.findMany = originalSchoolFindMany;
    prisma.cncaSchoolResult.findMany = originalCncaResultFindMany;
  }
});

test('CNCA Gerenciamento: salvar como rascunho, exclusão individual, exclusão em lote e publicação', async () => {
  const mockSchools = [
    { id: 'school-1', inep: '15065359', name: 'E.M.E.I.E.F. TOMAZ LOURENÇO NEGRÃO' },
    { id: 'school-2', inep: '15145425', name: 'E.M.E.F. ACENDENDO AS LUZES' },
  ];

  const mockProgram = {
    id: 'cnca-2026',
    code: 'CNCA-2026',
    name: 'Compromisso Nacional Criança Alfabetizada',
    year: 2026,
    catalog: { id: 'cat-cnca', code: 'CNCA', name: 'CNCA' },
  };

  const records = [
    {
      status: 'VALIDO',
      matchedSchool: mockSchools[0],
      grade: '2º Ano',
      assessment: 'Diagnóstica',
      component: 'MATEMATICA',
      enrolled: 50,
      evaluated: 48,
      participationRate: 96,
      averageScore: 245.0,
      skills: [{ code: 'H01', percentage: 80 }],
    },
    {
      status: 'VALIDO',
      matchedSchool: mockSchools[1],
      grade: '2º Ano',
      assessment: 'Diagnóstica',
      component: 'MATEMATICA',
      enrolled: 40,
      evaluated: 38,
      participationRate: 95,
      averageScore: 230.0,
      skills: [{ code: 'H01', percentage: 70 }],
    },
  ];

  const dbState = new Map();

  const originalProgramFindFirst = prisma.program.findFirst;
  const originalSchoolFindFirst = prisma.school.findFirst;
  const originalProgramSchoolCreateMany = prisma.programSchool.createMany;
  const originalProgramSchoolUpdateMany = prisma.programSchool.updateMany;
  const originalProgramSchoolUpsert = prisma.programSchool.upsert;
  const originalCncaResultFindMany = prisma.cncaSchoolResult.findMany;
  const originalCncaResultFindFirst = prisma.cncaSchoolResult.findFirst;
  const originalCncaResultCount = prisma.cncaSchoolResult.count;
  const originalCncaResultDelete = prisma.cncaSchoolResult.delete;
  const originalCncaResultDeleteMany = prisma.cncaSchoolResult.deleteMany;
  const originalCncaResultUpdateMany = prisma.cncaSchoolResult.updateMany;
  const originalTransaction = prisma.$transaction;
  const originalAudit = prisma.auditLog.create;

  try {
    prisma.program.findFirst = async () => mockProgram;
    prisma.programSchool.createMany = async () => ({ count: 2 });
    prisma.programSchool.updateMany = async () => ({ count: 0 });
    prisma.programSchool.upsert = async ({ create }) => ({ id: 'ps-1', ...create });
    prisma.cncaSchoolResult.findMany = async () => [];
    prisma.auditLog.create = async () => ({ id: 'audit-1' });

    prisma.$transaction = async (callback) => {
      const tx = {
        programSchool: {
          upsert: async ({ create }) => ({ id: 'ps-1', ...create }),
        },
        cncaSchoolResult: {
          findUnique: async ({ where }) => {
            const k = where.programId_schoolId_year_assessment_grade_component;
            return dbState.get(`${k.schoolId}_${k.component}`) || null;
          },
          create: async ({ data }) => {
            const id = `res-${dbState.size + 1}`;
            const rec = { id, ...data };
            dbState.set(`${data.schoolId}_${data.component}`, rec);
            return rec;
          },
          update: async ({ data }) => {
            const rec = { ...data };
            return rec;
          },
        },
      };
      return callback(tx);
    };

    // 1. Salvar como Rascunho
    const draftRes = await confirmCncaImport(mockProgram.id, records, 2026, null, null, true);
    assert.equal(draftRes.total, 2);
    assert.equal(draftRes.isDraft, true);
    for (const rec of dbState.values()) {
      assert.equal(rec.source, 'RASCUNHO');
    }

    // 2. Publicar Rascunhos
    prisma.cncaSchoolResult.updateMany = async ({ where, data }) => {
      let count = 0;
      for (const [k, v] of dbState.entries()) {
        if (v.source === 'RASCUNHO') {
          v.source = data.source;
          count++;
        }
      }
      return { count };
    };

    const { publishCncaSchoolResults, deleteCncaSchoolResult, bulkDeleteCncaSchoolResults } = await import('../src/programs/cnca/service.js');
    const pubRes = await publishCncaSchoolResults(mockProgram.id, {});
    assert.equal(pubRes.updatedCount, 2);

    // 3. Exclusão individual
    prisma.cncaSchoolResult.findFirst = async () => ({
      id: 'res-1',
      programId: mockProgram.id,
      schoolId: 'school-1',
      component: 'MATEMATICA',
      grade: '2º Ano',
      assessment: 'Diagnóstica',
      school: mockSchools[0],
    });
    prisma.cncaSchoolResult.delete = async () => ({ id: 'res-1' });

    const delRes = await deleteCncaSchoolResult(mockProgram.id, 'res-1');
    assert.ok(delRes.success);

    // 4. Exclusão em lote
    prisma.cncaSchoolResult.count = async () => 2;
    prisma.cncaSchoolResult.deleteMany = async () => ({ count: 2 });

    const bulkRes = await bulkDeleteCncaSchoolResults(mockProgram.id, { component: 'MATEMATICA' });
    assert.equal(bulkRes.deletedCount, 2);
  } finally {
    prisma.program.findFirst = originalProgramFindFirst;
    prisma.school.findFirst = originalSchoolFindFirst;
    prisma.programSchool.createMany = originalProgramSchoolCreateMany;
    prisma.programSchool.updateMany = originalProgramSchoolUpdateMany;
    prisma.programSchool.upsert = originalProgramSchoolUpsert;
    prisma.cncaSchoolResult.findMany = originalCncaResultFindMany;
    prisma.cncaSchoolResult.findFirst = originalCncaResultFindFirst;
    prisma.cncaSchoolResult.count = originalCncaResultCount;
    prisma.cncaSchoolResult.delete = originalCncaResultDelete;
    prisma.cncaSchoolResult.deleteMany = originalCncaResultDeleteMany;
    prisma.cncaSchoolResult.updateMany = originalCncaResultUpdateMany;
    prisma.$transaction = originalTransaction;
    prisma.auditLog.create = originalAudit;
  }
});

test('PARC: garante que nenhuma referência ativa ou quebrada permaneça no sistema', () => {
  // O CNCA é o programa oficial e o PARC foi completamente expurgado
  assert.ok(CNCA_COMPONENTS.MATEMATICA);
  assert.ok(CNCA_COMPONENTS.LEITURA);
  assert.ok(CNCA_COMPONENTS.ESCRITA);
  assert.ok(CNCA_COMPONENTS.FLUENCIA);
  assert.ok(CNCA_RANKING_INDICATORS.length >= 8);
});

test('CNCA: suporta especificação explícita de ano escolar (1º ao 5º ano) e avaliação na importação', async () => {
  const csvContent = [
    'cd_escola;nm_escola;qtd_matriculados;qtd_avaliados;tx_participacao;proficiencia_media;HAB_01;HAB_02',
    '15065359;E M E I E F TOMAZ LOURENCO NEGRAO;50;48;96,0;248,5;82,0;75,4',
  ].join('\n');

  const buffer = Buffer.from(csvContent, 'utf-8');

  const mockSchools = [
    { id: 'school-1', inep: '15065359', name: 'E.M.E.I.E.F. TOMAZ LOURENÇO NEGRÃO', zone: 'URBANA', district: 'SEDE' },
  ];

  const originalSchoolFindMany = prisma.school.findMany;
  const originalCncaResultFindMany = prisma.cncaSchoolResult.findMany;

  try {
    prisma.school.findMany = async () => mockSchools;
    prisma.cncaSchoolResult.findMany = async () => [];

    // Teste com 3º Ano e Formativa 1 explícitos
    const preview = await parseCncaSpreadsheet(
      buffer,
      'planilha_generica.csv',
      'MATEMATICA',
      'prog-1',
      '3º Ano',
      'Formativa 1',
    );

    assert.equal(preview.summary.detectedGrade, '3º Ano');
    assert.equal(preview.summary.detectedAssessment, 'Formativa 1');
    assert.equal(preview.rows[0].grade, '3º Ano');
    assert.equal(preview.rows[0].assessment, 'Formativa 1');
  } finally {
    prisma.school.findMany = originalSchoolFindMany;
    prisma.cncaSchoolResult.findMany = originalCncaResultFindMany;
  }
});

test('CNCA Pipeline: prévia, conciliação por INEP/Nome, idempotência e tratamento de erros', async () => {
  const mockSchools = [
    { id: 'school-1', inep: '15065359', name: 'E.M.E.I.E.F. TOMAZ LOURENÇO NEGRÃO', zone: 'URBANA', district: 'SEDE' },
    { id: 'school-2', inep: '15145425', name: 'E.M.E.F. ACENDENDO AS LUZES', zone: 'RURAL', district: 'ZONA RURAL' },
  ];

  const mockProgram = {
    id: 'cnca-prog-1',
    code: 'CNCA-2026',
    name: 'Compromisso Nacional Criança Alfabetizada',
    year: 2026,
    catalog: { id: 'cat-cnca', code: 'CNCA', name: 'CNCA' },
  };

  const originalSchoolFindMany = prisma.school.findMany;
  const originalSchoolFindFirst = prisma.school.findFirst;
  const originalSchoolCount = prisma.school.count;
  const originalProgramFindFirst = prisma.program.findFirst;
  const originalProgramSchoolCreateMany = prisma.programSchool.createMany;
  const originalProgramSchoolUpdateMany = prisma.programSchool.updateMany;
  const originalProgramSchoolUpsert = prisma.programSchool.upsert;
  const originalProgramSchoolFindMany = prisma.programSchool.findMany;
  const originalProgramSchoolFindUnique = prisma.programSchool.findUnique;
  const originalProgramSchoolDelete = prisma.programSchool.delete;
  const originalCncaResultFindMany = prisma.cncaSchoolResult.findMany;
  const originalCncaResultFindUnique = prisma.cncaSchoolResult.findUnique;
  const originalTransaction = prisma.$transaction;
  const originalAudit = prisma.auditLog.create;

  try {
    prisma.school.count = async () => 170; // 170 escolas na rede geral
    prisma.school.findMany = async () => mockSchools;
    prisma.school.findFirst = async ({ where }) => mockSchools.find((s) => s.id === where.id) || null;
    prisma.program.findFirst = async () => mockProgram;
    prisma.programSchool.createMany = async () => ({ count: 2 });
    prisma.programSchool.updateMany = async () => ({ count: 0 });
    prisma.programSchool.upsert = async ({ create }) => ({ id: 'ps-1', ...create });
    prisma.cncaSchoolResult.findMany = async () => [];
    prisma.auditLog.create = async () => ({ id: 'audit-1' });

    // 1. Monta planilha de teste com:
    // - Linha 1: Escola 1 com INEP (Válido)
    // - Linha 2: Escola 2 identificada pelo Nome sem INEP (Válido)
    // - Linha 3: Escola Inexistente (Inválido / Erro tratado sem abortar)
    const wb = xlsx.utils.book_new();
    const matData = [
      ['Código INEP', 'Nome da Escola', 'Ano Escolar', 'Avaliação', 'Matriculados', 'Avaliados', 'Proficiência Média', 'H01', 'H02'],
      ['15065359', 'E M E I E F TOMAZ LOURENCO NEGRAO', '2º Ano', 'Diagnóstica', '50', '48', '250.5', '80', '75'],
      ['', 'E.M.E.F. ACENDENDO AS LUZES', '2º Ano', 'Diagnóstica', '40', '38', '235.0', '70', '65'],
      ['99999999', 'Escola Inexistente no CPE', '2º Ano', 'Diagnóstica', '30', '29', '210.0', '50', '40'],
    ];
    const matSheet = xlsx.utils.aoa_to_sheet(matData);
    xlsx.utils.book_append_sheet(wb, matSheet, 'Matematica');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // 2. Executa parseCncaSpreadsheet
    const preview = await parseCncaSpreadsheet(buffer, 'CNCA_MATEMATICA_2026.xlsx', 'MATEMATICA', mockProgram.id);

    assert.equal(preview.summary.totalRows, 3);
    assert.equal(preview.summary.validRows, 2);
    assert.equal(preview.summary.invalidRows, 1);
    assert.equal(preview.summary.unmatchedCount, 1);
    assert.equal(preview.summary.errorsSummary.length, 1);
    assert.ok(preview.summary.errorsSummary[0].message.includes('99999999'));

    const validRecords = preview.rows.filter((r) => r.status === 'VALIDO');
    assert.equal(validRecords.length, 2);
    assert.equal(validRecords[0].matchedSchool.id, 'school-1');
    assert.equal(validRecords[1].matchedSchool.id, 'school-2');
    assert.equal(validRecords[0].skills.length, 2);
    assert.equal(validRecords[0].skills[0].code, 'H01');

    // 3. Testa confirmação da importação
    const createdItems = [];
    const updatedItems = [];
    prisma.$transaction = async (callback) => {
      const tx = {
        programSchool: {
          upsert: async () => ({ id: 'ps-1' }),
        },
        cncaSchoolResult: {
          findUnique: async ({ where }) => {
            const key = `${where.programId_schoolId_year_assessment_grade_component.schoolId}_${where.programId_schoolId_year_assessment_grade_component.component}`;
            return updatedItems.includes(key) ? { id: 'existing-result' } : null;
          },
          create: async ({ data }) => {
            createdItems.push(`${data.schoolId}_${data.component}`);
            return { id: `new-${createdItems.length}`, ...data };
          },
          update: async ({ data }) => {
            return { id: 'existing-result', ...data };
          },
          upsert: async ({ where, create, update }) => {
            const key = `${where.programId_schoolId_year_assessment_grade_component.schoolId}_${where.programId_schoolId_year_assessment_grade_component.component}`;
            if (updatedItems.includes(key)) {
              return { id: 'existing-result', ...update };
            }
            createdItems.push(`${create.schoolId}_${create.component}`);
            return { id: `new-${createdItems.length}`, ...create };
          },
        },
      };
      return callback(tx);
    };

    const confirmRes1 = await confirmCncaImport(mockProgram.id, preview.rows, 2026);
    assert.equal(confirmRes1.total, 2);
    assert.equal(confirmRes1.createdCount, 2);
    assert.equal(confirmRes1.updatedCount, 0);

    // 4. Testa reimportação idempotente (deve atualizar, sem duplicar)
    updatedItems.push('school-1_MATEMATICA', 'school-2_MATEMATICA');
    const confirmRes2 = await confirmCncaImport(mockProgram.id, preview.rows, 2026);
    assert.equal(confirmRes2.total, 2);
    assert.equal(confirmRes2.createdCount, 0);
    assert.equal(confirmRes2.updatedCount, 2);

    // 5. Testa serviços de Dashboard, Ranking, Filtros e Participantes
    prisma.cncaSchoolResult.findMany = async () => [
      {
        id: 'r1',
        programId: mockProgram.id,
        schoolId: 'school-1',
        school: mockSchools[0],
        year: 2026,
        grade: '2º Ano',
        assessment: 'Diagnóstica',
        component: 'MATEMATICA',
        enrolled: 50,
        evaluated: 48,
        participationRate: 96,
        averageScore: 250.5,
        fluentRate: null,
        pcpm: null,
        performanceLevels: [{ level: 'Adequado', count: 30, percentage: 62.5 }],
        skills: [{ code: 'H01', name: 'H01', percentage: 80 }],
      },
      {
        id: 'r2',
        programId: mockProgram.id,
        schoolId: 'school-2',
        school: mockSchools[1],
        year: 2026,
        grade: '2º Ano',
        assessment: 'Diagnóstica',
        component: 'MATEMATICA',
        enrolled: 40,
        evaluated: 38,
        participationRate: 95,
        averageScore: 235.0,
        fluentRate: null,
        pcpm: null,
        performanceLevels: [{ level: 'Adequado', count: 20, percentage: 52.6 }],
        skills: [{ code: 'H01', name: 'H01', percentage: 70 }],
      },
    ];

    prisma.programSchool.findMany = async () => [
      { id: 'ps-1', programId: mockProgram.id, schoolId: 'school-1', school: mockSchools[0], active: true, joinedAt: new Date() },
      { id: 'ps-2', programId: mockProgram.id, schoolId: 'school-2', school: mockSchools[1], active: true, joinedAt: new Date() },
    ];

    const dashboard = await getCncaDashboard(mockProgram.id);
    assert.equal(dashboard.kpis.totalNetworkSchools, 170);
    assert.equal(dashboard.kpis.totalParticipatingSchools, 2);
    assert.equal(dashboard.kpis.totalEvaluatedSchools, 2);
    assert.equal(dashboard.kpis.totalEnrolled, 90);
    assert.equal(dashboard.kpis.totalEvaluated, 86);
    assert.equal(dashboard.kpis.networkAverageScore, 242.8);

    const ranking = await getCncaRanking(mockProgram.id, { indicator: 'MATEMATICA_PROFICIENCIA' });
    assert.equal(ranking.ranking.length, 2);
    assert.equal(ranking.ranking[0].schoolId, 'school-1'); // 250.5 > 235.0
    assert.equal(ranking.ranking[0].position, 1);
    assert.equal(ranking.ranking[1].position, 2);

    const schoolDetail = await getCncaSingleSchoolDetail(mockProgram.id, 'school-1');
    assert.equal(schoolDetail.school.id, 'school-1');
    assert.equal(schoolDetail.results.length, 2);

    const filters = await getCncaFilters(mockProgram.id);
    assert.ok(filters.components.some((c) => c.code === 'MATEMATICA'));
    assert.equal(filters.schools.length, 2);
    assert.equal(filters.totalNetworkSchools, 170);
    assert.equal(filters.totalParticipatingSchools, 2);

    // 6. Testa gerenciamento de Escolas Participantes (CRUD)
    const participants = await getCncaParticipatingSchools(mockProgram.id);
    assert.equal(participants.totalNetworkSchools, 170);
    assert.equal(participants.totalParticipatingSchools, 2);
    assert.equal(participants.schools.length, 2);

    prisma.programSchool.upsert = async ({ where, create }) => ({ id: 'new-ps-link', ...create });
    const addResult = await addCncaParticipatingSchool(mockProgram.id, 'school-1');
    assert.ok(addResult.success);

    prisma.programSchool.findUnique = async () => ({ id: 'ps-1', programId: mockProgram.id, schoolId: 'school-1', school: mockSchools[0] });
    prisma.programSchool.delete = async () => ({ id: 'ps-1' });
    const removeResult = await removeCncaParticipatingSchool(mockProgram.id, 'school-1');
    assert.ok(removeResult.success);

    // 7. Testa desvinculação em lote de escolas participantes
    const { bulkRemoveCncaParticipatingSchools } = await import('../src/programs/cnca/service.js');
    prisma.programSchool.deleteMany = async ({ where }) => ({ count: where.schoolId.in.length });
    const bulkRemoveRes = await bulkRemoveCncaParticipatingSchools(mockProgram.id, { schoolIds: ['school-1', 'school-2'] });
    assert.equal(bulkRemoveRes.removedCount, 2);
    assert.ok(bulkRemoveRes.success);
  } finally {
    prisma.school.count = originalSchoolCount;
    prisma.school.findMany = originalSchoolFindMany;
    prisma.school.findFirst = originalSchoolFindFirst;
    prisma.program.findFirst = originalProgramFindFirst;
    prisma.programSchool.createMany = originalProgramSchoolCreateMany;
    prisma.programSchool.updateMany = originalProgramSchoolUpdateMany;
    prisma.programSchool.upsert = originalProgramSchoolUpsert;
    prisma.programSchool.findMany = originalProgramSchoolFindMany;
    prisma.programSchool.findUnique = originalProgramSchoolFindUnique;
    prisma.programSchool.delete = originalProgramSchoolDelete;
    prisma.cncaSchoolResult.findMany = originalCncaResultFindMany;
    prisma.cncaSchoolResult.findUnique = originalCncaResultFindUnique;
    prisma.$transaction = originalTransaction;
    prisma.auditLog.create = originalAudit;
  }
});

test('CNCA Persistência: executa importação em lotes curtos (chunks) com pre-fetch e sem timeouts em banco remoto', async () => {
  const mockProgram = {
    id: 'cnca-2026-prod',
    code: 'CNCA-2026',
    name: 'Compromisso Nacional Criança Alfabetizada',
    year: 2026,
    catalog: { id: 'cat-cnca', code: 'CNCA', name: 'CNCA' },
  };

  // Simula 120 escolas para testar múltiplos chunks (CHUNK_SIZE = 50 -> 3 chunks: 50, 50, 20)
  const totalSchools = 120;
  const records = [];
  for (let i = 1; i <= totalSchools; i++) {
    records.push({
      status: 'VALIDO',
      matchedSchool: { id: `school-${i}`, inep: `150000${String(i).padStart(3, '0')}`, name: `Escola ${i}` },
      grade: '2º Ano',
      assessment: 'Diagnóstica',
      component: 'MATEMATICA',
      enrolled: 40 + (i % 10),
      evaluated: 38 + (i % 10),
      participationRate: 95.0,
      averageScore: 230.0 + (i % 30),
      skills: [{ code: 'H01', percentage: 75.0 }],
    });
  }

  const existingSchoolIdsInDb = new Set(['school-1', 'school-2', 'school-3']); // 3 registros já existem previamente

  const originalProgramFindFirst = prisma.program.findFirst;
  const originalProgramSchoolCreateMany = prisma.programSchool.createMany;
  const originalProgramSchoolUpdateMany = prisma.programSchool.updateMany;
  const originalCncaResultFindMany = prisma.cncaSchoolResult.findMany;
  const originalTransaction = prisma.$transaction;
  const originalAudit = prisma.auditLog.create;

  let findManyCalledCount = 0;
  let transactionCallCount = 0;
  let totalRecordsProcessedInTx = 0;
  const createdInTx = [];
  const updatedInTx = [];

  try {
    prisma.program.findFirst = async () => mockProgram;
    prisma.programSchool.createMany = async ({ data }) => {
      assert.equal(data.length, totalSchools);
      return { count: totalSchools };
    };
    prisma.programSchool.updateMany = async () => ({ count: 0 });
    prisma.auditLog.create = async () => ({ id: 'audit-1' });

    // Pre-fetch deve ser chamado apenas 1 vez fora da transação
    prisma.cncaSchoolResult.findMany = async ({ where }) => {
      findManyCalledCount++;
      assert.equal(where.programId, mockProgram.id);
      return [
        { id: 'res-school-1', schoolId: 'school-1', grade: '2º Ano', component: 'MATEMATICA', assessment: 'Diagnóstica' },
        { id: 'res-school-2', schoolId: 'school-2', grade: '2º Ano', component: 'MATEMATICA', assessment: 'Diagnóstica' },
        { id: 'res-school-3', schoolId: 'school-3', grade: '2º Ano', component: 'MATEMATICA', assessment: 'Diagnóstica' },
      ];
    };

    // Prisma $transaction deve receber lotes curtos (<= 50) e nunca chamar findUnique dentro do loop
    prisma.$transaction = async (callback, options) => {
      transactionCallCount++;
      assert.ok(options.timeout >= 20000);
      const tx = {
        cncaSchoolResult: {
          findUnique: async () => {
            throw new Error('findUnique NÃO deve ser chamado dentro da transação quando pre-fetch foi realizado!');
          },
          update: async ({ where, data }) => {
            updatedInTx.push({ where, data });
            totalRecordsProcessedInTx++;
            return { id: where.id, ...data };
          },
          upsert: async ({ where, create, update }) => {
            createdInTx.push({ where, create });
            totalRecordsProcessedInTx++;
            return { id: `new-res-${createdInTx.length}`, ...create };
          },
        },
      };
      return callback(tx);
    };

    const result = await confirmCncaImport(mockProgram.id, records, 2026, { id: 'user-1', name: 'Admin' }, '127.0.0.1', false);

    assert.equal(result.total, 120);
    assert.equal(result.createdCount, 117);
    assert.equal(result.updatedCount, 3);
    assert.equal(findManyCalledCount, 1, 'Pre-fetch findMany deve ser executado exatamente 1 vez');
    assert.equal(transactionCallCount, 3, '120 registros divididos em CHUNK_SIZE=50 devem resultar em exatamente 3 transações');
    assert.equal(totalRecordsProcessedInTx, 120);
    assert.equal(updatedInTx.length, 3);
    assert.equal(createdInTx.length, 117);
  } finally {
    prisma.program.findFirst = originalProgramFindFirst;
    prisma.programSchool.createMany = originalProgramSchoolCreateMany;
    prisma.programSchool.updateMany = originalProgramSchoolUpdateMany;
    prisma.cncaSchoolResult.findMany = originalCncaResultFindMany;
    prisma.$transaction = originalTransaction;
    prisma.auditLog.create = originalAudit;
  }
});
