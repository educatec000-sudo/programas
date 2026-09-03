import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import * as cptable from 'xlsx/dist/cpexcel.full.mjs';
import { getAssessmentDefinition, PACTO_PROGRAM_CODE, PACTO_PROGRAM_YEAR } from '../src/programs/pacto/config.js';
import { prisma } from '../src/lib/prisma.js';
import { confirmPublicImport, previewPublicImport } from '../src/programs/pacto/service.js';
import {
  PACTO_IMPORT_RESULT_FIELDS,
  analyzePactoImport,
  previewGroupToPayload,
  readPactoImportFile,
} from '../src/programs/pacto/import.js';

const LONG_HEADERS = [
  'Ano',
  'Turma',
  'Avaliação',
  'Turno',
  'Matriculados',
  'Avaliados',
  'Componente',
  'Habilidade',
  'Nível',
  'Quantidade',
  'Percentual',
];

function classFixture(id, grade, name, shift, assessments = []) {
  return {
    id,
    grade,
    name,
    shift,
    enabledAssessments: ['A0', 'A1', 'A2', 'A3'],
    assessments,
  };
}

function longRows({ grade, className, assessment, shift = 'M', enrolled = 10, evaluated = 9 }) {
  const definition = getAssessmentDefinition(grade, assessment);
  return definition.components.flatMap((component) => component.skills.flatMap((skill) => (
    skill.levels.map((level, index) => [
      `${grade}º ano`,
      className,
      assessment,
      shift,
      enrolled,
      evaluated,
      component.label,
      skill.label,
      level.label,
      index === 0 ? evaluated : 0,
      index === 0 ? 100 : 0,
    ])
  )));
}

function temporaryFile(extension) {
  return path.join(os.tmpdir(), `pacto-import-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`);
}

function writeCsv(file, headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map((value) => String(value ?? '')).join(';'));
  fs.writeFileSync(file, `\ufeff${lines.join('\r\n')}\r\n`, 'utf8');
}

function errorCodes(preview) {
  return new Set(preview.errors.map((item) => item.code));
}

test('importação Pacto lê CSV reordenado com classes, anos e A0/A1/A2/A3 sem alterar quantidades', () => {
  const file = temporaryFile('.csv');
  const classes = [
    classFixture('c1', 1, 'A', 'M', [{ id: 'draft', code: 'A1', status: 'RASCUNHO' }]),
    classFixture('c2', 2, 'B', 'T'),
  ];
  const groups = [
    { grade: 1, className: 'A', assessment: 'A0', shift: 'M' },
    { grade: 1, className: 'A', assessment: 'A1', shift: 'M' },
    { grade: 1, className: 'A', assessment: 'A2', shift: 'M' },
    { grade: 1, className: 'A', assessment: 'A3', shift: 'M' },
    { grade: 2, className: 'B', assessment: 'A0', shift: 'T' },
    { grade: 2, className: 'B', assessment: 'A1', shift: 'T' },
    { grade: 2, className: 'B', assessment: 'A2', shift: 'T' },
    { grade: 2, className: 'B', assessment: 'A3', shift: 'T' },
  ];
  const order = [10, 9, 8, 0, 2, 1, 6, 7, 5, 4, 3];
  const headers = ['Coluna extra', ...order.map((index) => LONG_HEADERS[index])];
  const rows = groups.flatMap((group) => longRows(group).map((row) => ['ignorar', ...order.map((index) => row[index])]));
  // Percentual propositalmente divergente; quantidade deve continuar soberana.
  rows[0][order.indexOf(10) + 1] = 12;
  writeCsv(file, headers, rows);

  try {
    const parsed = readPactoImportFile(file, 'exportacao-power-bi.csv');
    const preview = analyzePactoImport(parsed, classes);
    assert.equal(preview.canConfirm, true, JSON.stringify(preview.errors));
    assert.equal(preview.summary.groups, 8);
    assert.equal(preview.summary.validGroups, 8);
    assert.ok(preview.warnings.some((item) => item.code === 'SOURCE_PERCENTAGE_IGNORED'));
    assert.equal(preview.groups.find((group) => group.assessment === 'A1' && group.grade === 1).replacesDraft, true);

    for (const group of preview.groups) {
      const payload = previewGroupToPayload(group);
      for (const component of payload.components) {
        for (const skill of new Set(component.results.map((result) => result.skill))) {
          const values = component.results.filter((result) => result.skill === skill).map((result) => result.count);
          assert.deepEqual(values, [9, 0, 0]);
        }
      }
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('importação Pacto lê CSV Windows-1252 com cabeçalhos acentuados', () => {
  const file = temporaryFile('.csv');
  const definition = getAssessmentDefinition(1, 'A1');
  const rows = definition.components.flatMap((component) => component.skills.flatMap((skill) => (
    skill.levels.map((level, index) => [
      '1º ano', 'A', 'A1', 'M', 10, 9, component.code, skill.code, level.code, index === 0 ? 9 : 0, index === 0 ? 100 : 0,
    ])
  )));
  const content = [LONG_HEADERS, ...rows].map((row) => row.join(';')).join('\r\n');
  fs.writeFileSync(file, Buffer.from(content, 'latin1'));

  try {
    const parsed = readPactoImportFile(file, 'power-bi-windows.csv');
    const preview = analyzePactoImport(parsed, [classFixture('c1', 1, 'A', 'M')]);
    assert.equal(preview.canConfirm, true, JSON.stringify(preview.errors));
    assert.equal(preview.groups[0].components[0].skills[0].levels[0].count, 9);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('importação Pacto reconhece o formato real largo em Mac Roman, identidades herdadas e componente parcial', () => {
  const file = temporaryFile('.csv');
  const quantityHeaders = [
    'Nº de alunos PRÉ-LEITORES',
    'Nº de alunos LEITORES INICIAL',
    'Nº de alunos LEITORES FLUENTES',
    'Nº de alunos NÃO COMPREENDE',
    'Nº de alunos COMPREENDE POR ORALIDADE',
    'Nº de alunos COMPREENDE AUTONOMAMENTE',
    'Nº de alunos PRÉ-ALFABÉTICO',
    'Nº de alunos ALFABÉTICO INICIAL',
    'Nº de alunos ALFABÉTICO COMPLETO',
  ];
  const headers = [
    'Ano', 'Turno', 'Turma', 'Nº avaliação', 'Nº de alunos matriculados',
    'Nº de alunos avaliados', ...quantityHeaders, ...Array(9).fill('%'),
  ];
  const rows = [
    ['RESULTADO DAS AVALIAÇÕES DE LÍNGUA PORTUGUESA POR TURMA DE 1 º ANO (A1-A3)'],
    [],
    ['RESULTADOS POR HABILIDADE e POR NÍVEL DE PROFICIÊNCIA', '', '', '', '', '', 'LEITURA', '', '', 'COMPREENSÃO DE TEXTO', '', '', 'ESCRITA'],
    headers,
    ['1º Ano', 'M', 'A', 'A1', 21, 21, 18, 0, 3, 10, 8, 3, 17, 3, 1, 86, 0, 14, 48, 38, 14, 81, 14, 5],
    ['', '', '', 'A2', 22, 22, 14, 6, 2, 9, 9, 4, 17, 1, 4, 64, 27, 9, 41, 41, 18, 77, 5, 18],
    ['', '', '', 'A3', ...Array(20).fill('')],
  ];
  const content = rows.map((row) => row.join(';')).join('\r\n');
  fs.writeFileSync(file, cptable.utils.encode(10000, content));

  try {
    const parsed = readPactoImportFile(file, 'modelo-real-power-bi.csv');
    const preview = analyzePactoImport(parsed, [classFixture('c1', 1, 'A', 'M')]);
    assert.equal(preview.mapping.mode, 'wide');
    assert.equal(preview.summary.groups, 2);
    assert.equal(preview.canConfirm, true, JSON.stringify(preview.errors));
    assert.deepEqual(preview.groups.map((group) => group.assessment), ['A1', 'A2']);
    assert.deepEqual(
      preview.groups[0].components[0].skills.flatMap((skill) => skill.levels.map((level) => level.count)),
      [18, 0, 3, 10, 8, 3, 17, 3, 1],
    );
    assert.equal(preview.groups[0].components[0].skills[0].levels[0].sourcePercentage, 86);
    assert.ok(preview.warnings.every((item) => item.code === 'COMPONENT_NOT_IN_FILE'));
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('importação Pacto reconhece a tabela real de Matemática em DOS CP850', () => {
  const file = temporaryFile('.csv');
  const rows = [
    ['RESULTADO DAS AVALIAÇÕES DE MATEMÁTICA POR TURMA DE 2 º ANO (A1-A3)'],
    [],
    [
      'RESULTADOS POR HABILIDADE e POR NÍVEL DE PROFICIÊNCIA', '', '', '', '', '',
      'NÃO PROFICIENTE', 'PROFICIENTE INICIAL', 'PROFICIENTE',
      '% NÃO PROFICIENTE', '% PROFICIENTE INICIAL', '% PROFICIENTE',
    ],
    [
      'Ano', 'Turno', 'Turma', 'Nº avaliação', 'Nº de alunos matriculados',
      'Nº de alunos avaliados', 'Nº de alunos com até 4 pontos',
      'Nº de alunos com 5 a 6 pontos', 'Nº de alunos com 7 a 10 pontos', '%', '%', '%',
    ],
    ['2º Ano', 'M', 'A', 'A1', 22, 22, 0, 2, 20, '0%', '9%', '91%'],
    ['', '', '', 'A2', 21, 21, 0, 0, 21, '0%', '0%', '100%'],
    ['', '', '', 'A3', '', '', '', '', '', '', '', ''],
  ];
  fs.writeFileSync(file, cptable.utils.encode(850, rows.map((row) => row.join(';')).join('\r\n')));

  try {
    const parsed = readPactoImportFile(file, 'matematica-power-bi.csv');
    const preview = analyzePactoImport(parsed, [classFixture('c1', 2, 'A', 'M')]);
    assert.equal(preview.mapping.mode, 'wide');
    assert.equal(preview.summary.groups, 2);
    assert.equal(preview.canConfirm, true, JSON.stringify(preview.errors));
    assert.deepEqual(preview.groups.map((group) => group.assessment), ['A1', 'A2']);
    assert.deepEqual(
      preview.groups[0].components[0].skills[0].levels.map((level) => level.count),
      [0, 2, 20],
    );
    assert.deepEqual(
      preview.groups[0].components[0].skills[0].levels.map((level) => level.sourcePercentage),
      [0, 9, 91],
    );
    assert.equal(preview.groups[0].components[0].component, 'MATEMATICA');
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('importação Pacto reconhece a tabela real A0 do 2º ano em UTF-8', () => {
  const file = temporaryFile('.csv');
  const skills = [
    'PRINCÍPIO ALFABÉTICO',
    'DECODIFICAÇÃO',
    'GRAFIA DE LETRAS MINÚSCULAS',
    'CODIFICAÇÃO',
  ];
  const parentResults = skills.flatMap((skill) => [skill, '', '']);
  const quantityHeaders = skills.flatMap(() => [
    'Nº de alunos POR DESENVOLVER',
    'Nº de alunos EM DESENVOLVI-MENTO',
    'Nº de alunos DESENVOLVIDOS',
  ]);
  const rows = [
    ['RESULTADO DAS AVALIAÇÕES POR TURMA DE 2 º ANO (A0)'],
    [],
    ['RESULTADOS POR HABILIDADE e POR NÍVEL DE PROFICIÊNCIA', '', '', '', '', '', ...parentResults],
    [
      'Ano', 'Turno', 'Turma', 'Nº avaliação', 'Nº de alunos matriculados',
      'Nº de alunos avaliados', ...quantityHeaders, ...Array(12).fill('%'),
    ],
    [
      '2º Ano', 'M', 'A', 'A0', 20, 20,
      4, 2, 14, 14, 3, 3, 9, 5, 6, 16, 1, 3,
      '20%', '10%', '70%', '70%', '15%', '15%',
      '45%', '25%', '30%', '80%', '5%', '15%',
    ],
  ];
  fs.writeFileSync(file, `\ufeff${rows.map((row) => row.join(';')).join('\r\n')}`, 'utf8');

  try {
    const parsed = readPactoImportFile(file, 'a0-segundo-ano.csv');
    const preview = analyzePactoImport(parsed, [classFixture('c1', 2, 'A', 'M')]);
    assert.equal(preview.mapping.mode, 'wide');
    assert.equal(preview.summary.groups, 1);
    assert.equal(preview.canConfirm, true, JSON.stringify(preview.errors));
    assert.equal(preview.groups[0].assessment, 'A0');
    assert.equal(preview.groups[0].components[0].component, 'INICIAL');
    assert.deepEqual(
      preview.groups[0].components[0].skills.flatMap((skill) => skill.levels.map((level) => level.count)),
      [4, 2, 14, 14, 3, 3, 9, 5, 6, 16, 1, 3],
    );
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('importação Pacto lê XLSX com múltiplas abas, cabeçalho mesclado e formato largo', () => {
  const file = temporaryFile('.xlsx');
  const workbook = XLSX.utils.book_new();
  const resultHeaders = PACTO_IMPORT_RESULT_FIELDS.map((field) => (
    `${field.componentLabel} ${field.skillLabel} ${field.levelLabel} Quantidade`
  ));
  const headers = ['Ano escolar', 'Turma', 'Avaliação', 'Turno', 'Observação', 'Matriculados', 'Avaliados', ...resultHeaders];

  for (const source of [
    { sheet: 'Primeiro ano', grade: 1, className: 'A', assessment: 'A2', shift: 'M' },
    { sheet: 'Segundo ano', grade: 2, className: 'B', assessment: 'A3', shift: 'T' },
  ]) {
    const parent = ['Identificação', '', '', '', '', 'Participação', '', 'Resultados', ...Array(resultHeaders.length - 1).fill('')];
    const values = [
      `${source.grade}º ano`,
      source.className,
      source.assessment,
      source.shift,
      'coluna extra',
      12,
      10,
      ...PACTO_IMPORT_RESULT_FIELDS.map((field) => (
        ['PRE_LEITOR', 'NAO_COMPREENDE', 'PRE_ALFABETICO', 'NAO_PROFICIENTE'].includes(field.level) ? 10 : 0
      )),
    ];
    const data = [parent, headers, values];
    const mergeRows = [0];
    if (source.grade === 2) {
      data.push([], [...parent], [...headers], [...values.slice(0, 2), 'A1', ...values.slice(3)]);
      mergeRows.push(4);
    }
    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet['!merges'] = mergeRows.flatMap((row) => [
      { s: { r: row, c: 0 }, e: { r: row, c: 4 } },
      { s: { r: row, c: 5 }, e: { r: row, c: 6 } },
      { s: { r: row, c: 7 }, e: { r: row, c: headers.length - 1 } },
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, source.sheet);
  }
  fs.writeFileSync(file, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

  try {
    const parsed = readPactoImportFile(file, 'exportacao.xlsx');
    const classes = [classFixture('c1', 1, 'A', 'M'), classFixture('c2', 2, 'B', 'T')];
    const preview = analyzePactoImport(parsed, classes);
    assert.equal(parsed.tables.length, 3);
    assert.deepEqual(parsed.sheetNames, ['Primeiro ano', 'Segundo ano']);
    assert.equal(preview.mapping.mode, 'wide');
    assert.equal(preview.summary.groups, 3);
    assert.equal(preview.canConfirm, true);
    assert.deepEqual(preview.groups.map((group) => [group.grade, group.assessment]), [[1, 'A2'], [2, 'A1'], [2, 'A3']]);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('importação Pacto permite mapear manualmente colunas e não escolhe turma ambígua', () => {
  const file = temporaryFile('.csv');
  const genericHeaders = LONG_HEADERS.map((_, index) => `Campo ${index + 1}`);
  writeCsv(file, genericHeaders, longRows({ grade: 1, className: 'A', assessment: 'A1', shift: '' }));

  try {
    const parsed = readPactoImportFile(file, 'campos-desconhecidos.csv');
    const classes = [classFixture('c1', 1, 'A', 'M'), classFixture('c2', 1, 'A', 'T')];
    const automatic = analyzePactoImport(parsed, classes);
    assert.equal(automatic.canConfirm, false);
    assert.ok(errorCodes(automatic).has('MISSING_COLUMN_MAPPING'));

    const columns = Object.fromEntries(LONG_HEADERS.map((header, index) => {
      const field = ['grade', 'className', 'assessment', 'shift', 'enrolled', 'evaluated', 'component', 'skill', 'level', 'count', 'percentage'][index];
      return [field, `campo${index + 1}`];
    }));
    const mapped = analyzePactoImport(parsed, classes, { mode: 'long', columns });
    assert.equal(mapped.canConfirm, false);
    assert.ok(errorCodes(mapped).has('CLASS_NOT_MAPPED'), JSON.stringify(mapped.errors));
    assert.equal(mapped.classMatches[0].options.length, 2);

    const classKey = mapped.classMatches[0].key;
    const selected = analyzePactoImport(parsed, classes, {
      mode: 'long',
      columns,
      classes: { [classKey]: 'c1' },
    });
    assert.equal(selected.canConfirm, true);
    assert.equal(selected.groups[0].classId, 'c1');
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('prévia pública não grava e confirmação persiste vários grupos em uma única transação como rascunhos', async () => {
  const file = temporaryFile('.csv');
  writeCsv(file, LONG_HEADERS, [
    ...longRows({ grade: 1, className: 'A', assessment: 'A1' }),
    ...longRows({ grade: 1, className: 'A', assessment: 'A2' }),
  ].filter((row) => row[6] === 'Língua Portuguesa'));

  const pactoClass = {
    ...classFixture('c1', 1, 'A', 'M', [{ id: 'draft-a1', code: 'A1', status: 'REABERTO' }]),
    programId: 'p1',
    schoolId: 's1',
    active: true,
  };
  const link = {
    id: 'link1',
    programId: 'p1',
    schoolId: 's1',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    program: {
      id: 'p1', code: PACTO_PROGRAM_CODE, year: PACTO_PROGRAM_YEAR, name: 'Pacto', status: 'EM_EXECUCAO', deletedAt: null,
    },
    school: { id: 's1', inep: '15066665', name: 'E.M.E.I.F. Santa Anastácia', deletedAt: null },
  };
  const originals = {
    linkFind: prisma.programCollectionLink.findUnique,
    programSchoolFind: prisma.programSchool.findUnique,
    classFindMany: prisma.pactoClass.findMany,
    transaction: prisma.$transaction,
    auditCreate: prisma.auditLog.create,
  };
  const preservedMathematics = {
    id: 'component-math-existing',
    assessmentId: 'draft-a1',
    component: 'MATEMATICA',
    enrolled: 9,
    evaluated: 9,
    results: [
      { id: 'math-1', componentId: 'component-math-existing', skill: 'PROFICIENCIA_MATEMATICA', level: 'NAO_PROFICIENTE', count: 3 },
      { id: 'math-2', componentId: 'component-math-existing', skill: 'PROFICIENCIA_MATEMATICA', level: 'PROFICIENTE_INICIAL', count: 3 },
      { id: 'math-3', componentId: 'component-math-existing', skill: 'PROFICIENCIA_MATEMATICA', level: 'PROFICIENTE', count: 3 },
    ],
  };
  const assessmentRows = new Map([
    ['c1:A1', {
      id: 'draft-a1',
      classId: 'c1',
      code: 'A1',
      status: 'REABERTO',
      submittedAt: new Date(),
      components: [preservedMathematics],
    }],
  ]);
  const componentRows = new Map([
    ['draft-a1:MATEMATICA', preservedMathematics],
  ]);
  let transactionCalls = 0;
  let transactionOptions = null;
  let auditCalls = 0;

  try {
    prisma.programCollectionLink.findUnique = async () => link;
    prisma.programSchool.findUnique = async () => ({ active: true, school: link.school });
    prisma.pactoClass.findMany = async () => [pactoClass];
    prisma.auditLog.create = async () => { auditCalls += 1; };
    prisma.$transaction = async (operation, options) => {
      transactionCalls += 1;
      transactionOptions = options;
      const tx = {
        pactoAssessment: {
          findUnique: async ({ where }) => {
            if (where.classId_code) {
              const { classId, code } = where.classId_code;
              return assessmentRows.get(`${classId}:${code}`) || null;
            }
            return [...assessmentRows.values()].find((item) => item.id === where.id) || null;
          },
          create: async ({ data }) => {
            const row = {
              id: `assessment-${data.code}`,
              ...data,
              reopenedAt: null,
              updatedAt: new Date(),
              components: [],
            };
            assessmentRows.set(`${data.classId}:${data.code}`, row);
            return row;
          },
          update: async ({ where, data }) => {
            const row = [...assessmentRows.values()].find((item) => item.id === where.id);
            Object.assign(row, data, { updatedAt: new Date() });
            return row;
          },
        },
        pactoAssessmentComponent: {
          upsert: async ({ where, create, update }) => {
            const key = `${where.assessmentId_component.assessmentId}:${where.assessmentId_component.component}`;
            let row = componentRows.get(key);
            if (row) Object.assign(row, update);
            else {
              row = { id: `component-${componentRows.size + 1}`, ...create, results: [] };
              componentRows.set(key, row);
              const assessment = [...assessmentRows.values()].find((item) => item.id === create.assessmentId);
              assessment.components.push(row);
            }
            return row;
          },
        },
        pactoSkillResult: {
          deleteMany: async ({ where }) => {
            const component = [...componentRows.values()].find((item) => item.id === where.componentId);
            component.results = [];
          },
          createMany: async ({ data }) => {
            for (const value of data) {
              const component = [...componentRows.values()].find((item) => item.id === value.componentId);
              component.results.push({ id: `result-${component.results.length + 1}`, ...value });
            }
          },
        },
      };
      return operation(tx);
    };

    const upload = { path: file, originalname: 'power-bi.csv' };
    const preview = await previewPublicImport('token-seguro', upload);
    assert.equal(preview.canConfirm, true);
    assert.equal(preview.groups.length, 2);
    assert.equal(transactionCalls, 0);
    assert.equal(auditCalls, 0);

    await assert.rejects(
      () => confirmPublicImport('token-seguro', upload, {
        mapping: preview.mapping,
        previewDigest: preview.previewDigest,
        confirmReplace: false,
      }, '127.0.0.1'),
      (error) => error.code === 'PACTO_IMPORT_REPLACE_CONFIRMATION_REQUIRED',
    );
    assert.equal(transactionCalls, 0);

    const confirmed = await confirmPublicImport('token-seguro', upload, {
      mapping: preview.mapping,
      previewDigest: preview.previewDigest,
      confirmReplace: true,
    }, '127.0.0.1');
    assert.equal(transactionCalls, 1);
    assert.equal(transactionOptions.isolationLevel, 'Serializable');
    assert.equal(confirmed.count, 2);
    assert.equal(confirmed.status, 'RASCUNHO');
    assert.deepEqual(confirmed.imported.map((item) => item.status), ['RASCUNHO', 'RASCUNHO']);
    const savedA1 = assessmentRows.get('c1:A1');
    assert.equal(savedA1.components.find((item) => item.component === 'MATEMATICA'), preservedMathematics);
    assert.deepEqual(preservedMathematics.results.map((item) => item.count), [3, 3, 3]);
    assert.equal(auditCalls, 1);
  } finally {
    prisma.programCollectionLink.findUnique = originals.linkFind;
    prisma.programSchool.findUnique = originals.programSchoolFind;
    prisma.pactoClass.findMany = originals.classFindMany;
    prisma.$transaction = originals.transaction;
    prisma.auditLog.create = originals.auditCreate;
    fs.rmSync(file, { force: true });
  }
});

test('importação Pacto bloqueia conflitos, soma divergente e avaliação enviada, mantendo alerta de avaliados', () => {
  const file = temporaryFile('.csv');
  const rows = longRows({ grade: 1, className: 'A', assessment: 'A1', enrolled: 8, evaluated: 9 });
  rows[0][9] = 10;
  rows.push([...rows[0].slice(0, 9), 11, rows[0][10]]);
  rows.push([...rows[1]]);
  writeCsv(file, LONG_HEADERS, rows);

  try {
    const parsed = readPactoImportFile(file, 'conflitos.csv');
    const classes = [classFixture('c1', 1, 'A', 'M', [{ id: 'sent', code: 'A1', status: 'ENVIADO' }])];
    const preview = analyzePactoImport(parsed, classes);
    const codes = errorCodes(preview);
    assert.equal(preview.canConfirm, false);
    assert.ok(codes.has('DUPLICATE_CONFLICT'), JSON.stringify(preview.errors));
    assert.ok(codes.has('DUPLICATE_ROW'));
    assert.ok(codes.has('LEVEL_SUM_MISMATCH'));
    assert.ok(codes.has('ASSESSMENT_LOCKED'));
    assert.ok(preview.warnings.some((item) => item.code === 'EVALUATED_ABOVE_ENROLLED'));
  } finally {
    fs.rmSync(file, { force: true });
  }
});
