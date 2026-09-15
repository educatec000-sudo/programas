import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizePactoText,
  normalizeInep,
  normalizeSchoolName,
  extractInepFromSchoolText,
  parsePactoInteger,
  parseCsvToRows,
  readConsolidatedSpreadsheet,
  detectConsolidatedComponent,
  parseAssessmentCode,
  parseGradeValue,
  previewConsolidatedPactoImport,
  confirmConsolidatedPactoImport,
} from '../src/programs/pacto/consolidatedImport.js';
import { prisma } from '../src/lib/prisma.js';

test('Pacto Consolidado: normaliza INEP e extrai INEP embutido no nome da escola', () => {
  assert.equal(normalizeInep('15145425'), '15145425');
  assert.equal(normalizeInep('15.145.425'), '15145425');
  assert.equal(normalizeInep('   15065740   '), '15065740');
  assert.equal(normalizeInep(null), null);

  assert.equal(
    extractInepFromSchoolText('E M E F ACENDENDO AS LUZES 15145425'),
    '15145425',
  );
  assert.equal(
    extractInepFromSchoolText('E M E F COMANDANTE GERMANO 15065740'),
    '15065740',
  );
  assert.equal(
    extractInepFromSchoolText('E M E F DR FRANCISCO LEITE LOPES 15553752'),
    '15553752',
  );
});

test('Pacto Consolidado: normaliza nomes de escolas removendo prefixos administrativos e acentos', () => {
  assert.equal(
    normalizeSchoolName('E M E F ACENDENDO AS LUZES'),
    'acendendo as luzes',
  );
  assert.equal(
    normalizeSchoolName('E.M.E.I.E.F. SÃO PEDRO'),
    'sao pedro',
  );
  assert.equal(
    normalizeSchoolName('Creche Municipal Menino Jesus'),
    'menino jesus',
  );
});

test('Pacto Consolidado: converte inteiros com segurança', () => {
  assert.equal(parsePactoInteger(21), 21);
  assert.equal(parsePactoInteger('21'), 21);
  assert.equal(parsePactoInteger('  22  '), 22);
  assert.equal(parsePactoInteger('100%'), 100);
  assert.equal(parsePactoInteger(''), null);
  assert.equal(parsePactoInteger(null), null);
});

test('Pacto Consolidado: detecta componente curricular (Português vs Matemática) pelos cabeçalhos', () => {
  const lpHeaders = ['SME', 'CodA', 'Escolas', 'Ano', 'Turno', 'Turma', 'Nº mat', 'Nº aval', 'Nº PL', 'Nº LI', 'Nº LF', 'Nº NC', 'Nº CO', 'Nº CA', 'Nº PA', 'Nº AI', 'Nº AC'];
  const matHeaders = ['SME', 'CodA', 'Escolas', 'Ano', 'Turno', 'Turma', 'Nº mat', 'Nº aval', 'Nº alunos NP', 'Nº alunos PI', 'Nº alunos P', '%NP', '%PI', '%P', 'fK_SME_Esc_AvMAT1ANO'];

  assert.equal(detectConsolidatedComponent(lpHeaders), 'PORTUGUES');
  assert.equal(detectConsolidatedComponent(matHeaders), 'MATEMATICA');
});

test('Pacto Consolidado: identifica código de avaliação (A1, A2, A3, A0) e ano escolar', () => {
  assert.equal(parseAssessmentCode('A1'), 'A1');
  assert.equal(parseAssessmentCode('A2'), 'A2');
  assert.equal(parseAssessmentCode('A3'), 'A3');
  assert.equal(parseAssessmentCode('1'), 'A1');
  assert.equal(parseAssessmentCode('2'), 'A2');

  assert.equal(parseGradeValue('1º Ano'), 1);
  assert.equal(parseGradeValue('1º ano'), 1);
  assert.equal(parseGradeValue('2º Ano'), 2);
  assert.equal(parseGradeValue('PII'), 0);
  assert.equal(parseGradeValue('Pré II'), 0);
});

test('Pacto Consolidado: processa arquivo real de Língua Portuguesa do 1º Ano (14).CSV', async () => {
  const filePath = path.join('/home/user/uploads', 'Média do desempenho dos alunos por turma - 1ºano (detalhe), 2026. (14).CSV');
  assert.ok(fs.existsSync(filePath), 'O arquivo de Língua Portuguesa deve existir no workspace.');

  const buffer = fs.readFileSync(filePath);
  const rows = readConsolidatedSpreadsheet(buffer, 'lp-pacto.csv');
  assert.ok(rows.length > 500, 'Deve conter mais de 500 linhas.');

  const header = rows[0];
  assert.equal(detectConsolidatedComponent(header), 'PORTUGUES');

  // Simula consulta de escolas em banco
  const mockSchools = [
    { id: 'sch-1', inep: '15145425', name: 'E M E F ACENDENDO AS LUZES' },
    { id: 'sch-2', inep: '15065740', name: 'E M E F COMANDANTE GERMANO' },
    { id: 'sch-3', inep: '15553752', name: 'E M E F DR FRANCISCO LEITE LOPES' },
  ];

  const origFindMany = prisma.school.findMany;
  prisma.school.findMany = async () => mockSchools;

  try {
    const preview = await previewConsolidatedPactoImport('pacto-prog-id', {
      buffer,
      originalname: 'Média do desempenho dos alunos por turma - 1ºano (detalhe), 2026. (14).CSV',
    });

    assert.equal(preview.component, 'PORTUGUES');
    assert.deepEqual(preview.assessments, ['A1', 'A2', 'A3']);
    assert.ok(preview.summary.validRows > 300, 'Deve conter mais de 300 registros válidos.');
    assert.ok(preview.summary.schoolsCount > 100, 'Deve identificar mais de 100 escolas municipais.');
    assert.ok(preview.summary.totalEvaluated > 3000, 'Total avaliado deve superar 3.000 alunos.');

    // Valida primeiro registro
    const first = preview.records[0];
    assert.equal(first.schoolInep, '15145425');
    assert.equal(first.assessment, 'A1');
    assert.equal(first.grade, 1);
    assert.equal(first.shift, 'M');
    assert.equal(first.className, 'A');
    assert.equal(first.enrolled, 21);
    assert.equal(first.evaluated, 21);

    // Valida que a soma dos níveis de leitura bate com 21
    const leituraResults = first.results.filter((r) => r.skill === 'LEITURA');
    const sumLeitura = leituraResults.reduce((sum, r) => sum + r.count, 0);
    assert.equal(sumLeitura, 21);

    // Valida que a soma dos níveis de compreensão de texto (NC, CO, CA) bate com 21
    const compreensaoResults = first.results.filter((r) => r.skill === 'COMPREENSAO_TEXTO');
    const sumCompreensao = compreensaoResults.reduce((sum, r) => sum + r.count, 0);
    assert.equal(sumCompreensao, 21);
    assert.equal(first.displaySkills.compreensao, 'NC: 10 · CO: 8 · CA: 3');

    // Valida que a soma dos níveis de escrita (PA, AI, AC) bate com 21
    const escritaResults = first.results.filter((r) => r.skill === 'ESCRITA');
    const sumEscrita = escritaResults.reduce((sum, r) => sum + r.count, 0);
    assert.equal(sumEscrita, 21);
    assert.equal(first.displaySkills.escrita, 'PA: 17 · AI: 3 · AC: 1');
  } finally {
    prisma.school.findMany = origFindMany;
  }
});

test('Pacto Consolidado: processa arquivo real de Matemática do 1º Ano (15).CSV', async () => {
  const filePath = path.join('/home/user/uploads', 'Média do desempenho dos alunos por turma - 1ºano (detalhe), 2026. (15).CSV');
  assert.ok(fs.existsSync(filePath), 'O arquivo de Matemática deve existir no workspace.');

  const buffer = fs.readFileSync(filePath);
  const rows = readConsolidatedSpreadsheet(buffer, 'mat-pacto.csv');
  assert.ok(rows.length > 500, 'Deve conter mais de 500 linhas.');

  const header = rows[0];
  assert.equal(detectConsolidatedComponent(header), 'MATEMATICA');

  const mockSchools = [
    { id: 'sch-1', inep: '15145425', name: 'E M E F ACENDENDO AS LUZES' },
  ];

  const origFindMany = prisma.school.findMany;
  prisma.school.findMany = async () => mockSchools;

  try {
    const preview = await previewConsolidatedPactoImport('pacto-prog-id', {
      buffer,
      originalname: 'Média do desempenho dos alunos por turma - 1ºano (detalhe), 2026. (15).CSV',
    });

    assert.equal(preview.component, 'MATEMATICA');
    assert.deepEqual(preview.assessments, ['A1', 'A2', 'A3']);
    assert.ok(preview.summary.validRows > 300);

    const first = preview.records[0];
    assert.equal(first.schoolInep, '15145425');
    assert.equal(first.assessment, 'A1');
    assert.equal(first.grade, 1);
    assert.equal(first.enrolled, 21);
    assert.equal(first.evaluated, 21);

    // Valida que a soma dos níveis de matemática bate com 21
    const matResults = first.results.filter((r) => r.skill === 'PROFICIENCIA_MATEMATICA');
    const sumMat = matResults.reduce((sum, r) => sum + r.count, 0);
    assert.equal(sumMat, 21);
  } finally {
    prisma.school.findMany = origFindMany;
  }
});

test('Pacto Consolidado: executa confirmação em lotes / transações seguras', async () => {
  const mockProgram = { id: 'prog-123', code: 'PACTO-ALFABETIZACAO-2026', year: 2026 };
  const mockSchools = [{ id: 'sch-1', inep: '15145425', name: 'E M E F ACENDENDO AS LUZES' }];

  const origFindProgram = prisma.program.findFirst;
  const origFindSchool = prisma.school.findMany;
  const origProgramSchoolUpsert = prisma.programSchool.upsert;
  const origTransaction = prisma.$transaction;

  prisma.program.findFirst = async () => mockProgram;
  prisma.school.findMany = async () => mockSchools;
  prisma.programSchool.upsert = async () => ({ id: 'ps-1' });

  let transactionCalls = 0;
  prisma.$transaction = async (fn) => {
    transactionCalls++;
    const mockTx = {
      pactoClass: {
        upsert: async () => ({
          id: 'cls-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      pactoAssessment: {
        upsert: async () => ({
          id: 'ass-1',
        }),
      },
      pactoAssessmentComponent: {
        upsert: async () => ({
          id: 'comp-1',
        }),
      },
      pactoSkillResult: {
        deleteMany: async () => ({ count: 0 }),
        createMany: async () => ({ count: 3 }),
      },
    };
    return fn(mockTx);
  };

  try {
    const records = [
      {
        schoolName: 'E M E F ACENDENDO AS LUZES',
        schoolInep: '15145425',
        grade: 1,
        shift: 'M',
        className: 'A',
        assessment: 'A1',
        component: 'PORTUGUES',
        enrolled: 21,
        evaluated: 21,
        results: [
          { skill: 'LEITURA', level: 'PRE_LEITOR', count: 18 },
          { skill: 'LEITURA', level: 'LEITOR_INICIAL', count: 0 },
          { skill: 'LEITURA', level: 'LEITOR_FLUENTE', count: 3 },
        ],
      },
    ];

    const result = await confirmConsolidatedPactoImport(
      'prog-123',
      { records },
      { id: 'usr-1', name: 'Admin' },
      '127.0.0.1',
    );

    assert.equal(result.success, true);
    assert.equal(result.totalRecords, 1);
    assert.equal(result.importedSchoolsCount, 1);
    assert.ok(transactionCalls >= 1);
  } finally {
    prisma.program.findFirst = origFindProgram;
    prisma.school.findMany = origFindSchool;
    prisma.programSchool.upsert = origProgramSchoolUpsert;
    prisma.$transaction = origTransaction;
  }
});
