import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateEnrollmentRows, buildEnrollmentRow } from '../src/modules/enrollment/parser.js';
import { DEFAULT_ENROLLMENT_STAGES } from '../src/modules/enrollment/catalog.js';
import { buildProjectionForSchool, rebalanceSiblingStageProjectedStudents, roundByMode } from '../src/modules/enrollment/engine.js';

test('hidrata linhas de continuação do CSV oficial de matrículas', () => {
  const rows = hydrateEnrollmentRows([
    {
      rowNumber: 2,
      raw: {
        inepescola: '15145425',
        escola: 'E M E F ACENDENDO AS LUZES',
        etapaturma: 'MULTI (9 ANOS)',
        turma: 'A',
        turno: 'MANHÃ',
        etapamatricula: '1º ANO (9 ANOS)',
        contagemtotaldealunos: '12',
      },
    },
    {
      rowNumber: 3,
      raw: {
        inepescola: '',
        escola: '',
        etapaturma: '',
        turma: '',
        turno: '',
        etapamatricula: '2º ANO (9 ANOS)',
        contagemtotaldealunos: '9',
      },
    },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[1].hydrated.inep, '15145425');
  assert.equal(rows[1].hydrated.schoolName, 'E M E F ACENDENDO AS LUZES');
  assert.equal(rows[1].hydrated.classStageRaw, 'MULTI (9 ANOS)');
  assert.equal(rows[1].hydrated.classLabel, 'A');
  assert.equal(rows[1].hydrated.shift, 'MANHÃ');
  assert.equal(rows[1].hydrated.enrollmentStageRaw, '2º ANO (9 ANOS)');
});

test('constrói linha de matrícula normalizada e detecta turma multietapa', () => {
  const hydrated = hydrateEnrollmentRows([
    {
      rowNumber: 2,
      raw: {
        inepescola: '15145425',
        escola: 'E M E F ACENDENDO AS LUZES',
        etapaturma: 'MULTI (9 ANOS)',
        turma: 'A',
        turno: 'MANHÃ',
        etapamatricula: '3º ANO (9 ANOS)',
        contagemtotaldealunos: '18',
      },
    },
  ])[0];

  const built = buildEnrollmentRow(
    hydrated,
    {
      schoolByInep: new Map([['15145425', { id: 'school-1', inep: '15145425', name: 'Escola Exemplo' }]]),
      schoolByName: new Map(),
      existingKeys: new Set(),
    },
    { referenceYear: 2026 },
  );

  assert.deepEqual(built.errors, []);
  assert.equal(built.data.schoolId, 'school-1');
  assert.equal(built.data.stageCode, 'EF3');
  assert.equal(built.data.studentsCount, 18);
  assert.equal(built.data.isMultiStage, true);
});

test('roundByMode respeita o modo de arredondamento configurado', () => {
  assert.equal(roundByMode(10.2, 'BAIXO'), 10);
  assert.equal(roundByMode(10.2, 'CIMA'), 11);
  assert.equal(roundByMode(10.5, 'ARREDONDAR'), 11);
});

test('mantém o total fixo de turmas e calcula vagas novas apenas na primeira etapa', () => {
  const stages = DEFAULT_ENROLLMENT_STAGES.filter((stage) => ['EF1', 'EF2', 'EF3'].includes(stage.code));
  const result = buildProjectionForSchool({
    stages,
    countsByStage: new Map([
      ['EF1', 20],
      ['EF2', 25],
      ['EF3', 60],
    ]),
    classCountsByStage: new Map([
      ['EF1', 1],
      ['EF2', 1],
      ['EF3', 2],
    ]),
    totalClassesAvailable: 4,
    rulesByStage: new Map([
      ['EF1', { stageCode: 'EF1', nextStageCode: 'EF2', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 100, capacityLimit: 25 }],
      ['EF2', { stageCode: 'EF2', nextStageCode: 'EF3', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 25 }],
      ['EF3', { stageCode: 'EF3', nextStageCode: 'EF4', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 25 }],
    ]),
    schoolSetting: { entryStageCode: 'EF1', capacityOverrides: {} },
    adjustmentsByStage: new Map(),
  });

  const ef1 = result.results.find((row) => row.stageCode === 'EF1');
  const ef2 = result.results.find((row) => row.stageCode === 'EF2');
  const ef3 = result.results.find((row) => row.stageCode === 'EF3');

  assert.equal(result.entryStageCode, 'EF1');
  assert.equal(result.summary.totalAvailableClasses, 4);
  assert.equal(result.summary.totalPlannedClasses, 4);
  assert.equal(result.summary.limitAppliedOnlyToEntryStage, true);
  assert.equal(ef2.projectedStudents, 20);
  assert.equal(ef2.projectedClasses, 1);
  assert.equal(ef3.projectedStudents, 25);
  assert.equal(ef3.projectedClasses, 2);
  assert.equal(ef1.projectedStudents, 0);
  assert.equal(ef1.projectedClasses, 1);
  assert.equal(ef1.reasonJson.entryReferenceStudents, 20);
  assert.equal(ef1.reasonJson.plannedCapacity, 25);
  assert.equal(result.summary.entryNewVacancies, 25);
  assert.equal(result.summary.continuityStudentsUnserved, 0);
});

test('a continuidade avança pelo percurso real sem aplicar teto máximo nas etapas intermediárias', () => {
  const stages = DEFAULT_ENROLLMENT_STAGES.filter((stage) => ['EF1', 'EF2', 'EF3'].includes(stage.code));
  const result = buildProjectionForSchool({
    stages,
    countsByStage: new Map([
      ['EF1', 40],
      ['EF2', 40],
      ['EF3', 0],
    ]),
    classCountsByStage: new Map([
      ['EF1', 2],
      ['EF2', 1],
      ['EF3', 0],
    ]),
    totalClassesAvailable: 3,
    rulesByStage: new Map([
      ['EF1', { stageCode: 'EF1', nextStageCode: 'EF2', promotionRate: 70, repetitionRate: 10, dropoutRate: 5, entryRate: 100, capacityLimit: 25 }],
      ['EF2', { stageCode: 'EF2', nextStageCode: 'EF3', promotionRate: 90, repetitionRate: 10, dropoutRate: 0, entryRate: 0, capacityLimit: 25 }],
      ['EF3', { stageCode: 'EF3', nextStageCode: 'EF4', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 25 }],
    ]),
    schoolSetting: { entryStageCode: 'EF1', capacityOverrides: {} },
    adjustmentsByStage: new Map(),
  });

  const ef1 = result.results.find((row) => row.stageCode === 'EF1');
  const ef2 = result.results.find((row) => row.stageCode === 'EF2');
  const ef3 = result.results.find((row) => row.stageCode === 'EF3');

  assert.equal(ef1.reasonJson.rawPromotionRate, 70);
  assert.equal(ef1.reasonJson.effectivePromotionRate, 85);
  assert.equal(ef1.projectedStudents, 0);
  assert.equal(ef2.projectedStudents, 40);
  assert.equal(ef2.projectedClasses, 1);
  assert.equal(ef3.projectedStudents, 40);
  assert.equal(ef3.projectedClasses, 0);
  assert.equal(result.summary.totalPlannedClasses, 3);
  assert.equal(result.summary.additionalClassesNeeded, 0);
  assert.equal(result.summary.continuitySatisfied, true);
  assert.equal(result.summary.entryNewVacancies, 50);
});

test('segue para a próxima etapa realmente ofertada pela escola quando existe lacuna interna', () => {
  const stages = DEFAULT_ENROLLMENT_STAGES.filter((stage) => ['EF1', 'EF3'].includes(stage.code));
  const result = buildProjectionForSchool({
    stages,
    countsByStage: new Map([
      ['EF1', 18],
      ['EF3', 22],
    ]),
    classCountsByStage: new Map([
      ['EF1', 1],
      ['EF3', 1],
    ]),
    totalClassesAvailable: 2,
    rulesByStage: new Map([
      ['EF1', { stageCode: 'EF1', nextStageCode: 'EF2', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 100, capacityLimit: 25 }],
      ['EF3', { stageCode: 'EF3', nextStageCode: 'EF4', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 25 }],
      ['EF2', { stageCode: 'EF2', nextStageCode: 'EF3', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 25 }],
      ['EF4', { stageCode: 'EF4', nextStageCode: 'EF5', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 25 }],
    ]),
    schoolSetting: { entryStageCode: 'EF1', capacityOverrides: {} },
    adjustmentsByStage: new Map(),
  });

  const ef1 = result.results.find((row) => row.stageCode === 'EF1');
  const ef3 = result.results.find((row) => row.stageCode === 'EF3');

  assert.equal(ef3.projectedStudents, 18);
  assert.equal(ef3.projectedClasses, 1);
  assert.equal(ef1.projectedClasses, 1);
  assert.equal(result.summary.entryNewVacancies, 25);
});

test('sinaliza pendência quando a primeira etapa não possui limite configurado', () => {
  const stages = DEFAULT_ENROLLMENT_STAGES
    .filter((stage) => ['EF1', 'EF2'].includes(stage.code))
    .map((stage) => (stage.code === 'EF1' ? { ...stage, defaultCapacity: null } : stage));
  const result = buildProjectionForSchool({
    stages,
    countsByStage: new Map([
      ['EF1', 20],
      ['EF2', 22],
    ]),
    classCountsByStage: new Map([
      ['EF1', 1],
      ['EF2', 1],
    ]),
    totalClassesAvailable: 2,
    rulesByStage: new Map([
      ['EF1', { stageCode: 'EF1', nextStageCode: 'EF2', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 100, capacityLimit: null }],
      ['EF2', { stageCode: 'EF2', nextStageCode: 'EF3', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 25 }],
    ]),
    schoolSetting: { entryStageCode: 'EF1', capacityOverrides: {} },
    adjustmentsByStage: new Map(),
  });

  const ef1 = result.results.find((row) => row.stageCode === 'EF1');

  assert.equal(ef1.projectedClasses, 1);
  assert.equal(ef1.reasonJson.capacityConfigMissing, true);
  assert.equal(result.summary.entryCapacityLimitMissing, true);
  assert.equal(result.summary.entryNewVacancies, null);
});

test('usa demanda histórica na etapa raiz da rede quando a escola inicia no berçário', () => {
  const stages = DEFAULT_ENROLLMENT_STAGES.filter((stage) => ['BER2', 'MAT1'].includes(stage.code));
  const result = buildProjectionForSchool({
    stages,
    countsByStage: new Map([
      ['BER2', 16],
      ['MAT1', 18],
    ]),
    classCountsByStage: new Map([
      ['BER2', 1],
      ['MAT1', 1],
    ]),
    totalClassesAvailable: 2,
    rulesByStage: new Map([
      ['BER2', { stageCode: 'BER2', nextStageCode: 'MAT1', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 100, capacityLimit: 16 }],
      ['MAT1', { stageCode: 'MAT1', nextStageCode: 'MAT2', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 18 }],
    ]),
    schoolSetting: { entryStageCode: 'BER2', capacityOverrides: {} },
    adjustmentsByStage: new Map(),
    useHistoricalEntryDemand: true,
  });

  const ber2 = result.results.find((row) => row.stageCode === 'BER2');
  const mat1 = result.results.find((row) => row.stageCode === 'MAT1');

  assert.equal(ber2.projectedStudents, 16);
  assert.equal(ber2.reasonJson.historicalEntryDemand, 16);
  assert.equal(mat1.projectedStudents, 16);
});

test('recebe demanda externa na primeira etapa quando o fluxo vem de outra escola da rede', () => {
  const stages = DEFAULT_ENROLLMENT_STAGES.filter((stage) => ['EF1', 'EF2'].includes(stage.code));
  const result = buildProjectionForSchool({
    stages,
    countsByStage: new Map([
      ['EF1', 20],
      ['EF2', 22],
    ]),
    classCountsByStage: new Map([
      ['EF1', 1],
      ['EF2', 1],
    ]),
    totalClassesAvailable: 2,
    rulesByStage: new Map([
      ['EF1', { stageCode: 'EF1', nextStageCode: 'EF2', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 100, capacityLimit: 25 }],
      ['EF2', { stageCode: 'EF2', nextStageCode: 'EF3', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 25 }],
    ]),
    schoolSetting: { entryStageCode: 'EF1', capacityOverrides: {} },
    adjustmentsByStage: new Map(),
    externalEntryDemand: 30,
  });

  const ef1 = result.results.find((row) => row.stageCode === 'EF1');
  const ef2 = result.results.find((row) => row.stageCode === 'EF2');

  assert.equal(ef1.projectedStudents, 30);
  assert.equal(ef1.reasonJson.externalEntryDemand, 30);
  assert.equal(ef2.projectedStudents, 20);
});

test('segue o percurso real para a opção integral quando ela é a próxima oferta disponível', () => {
  const stages = DEFAULT_ENROLLMENT_STAGES.filter((stage) => ['PER2', 'EF1_INT'].includes(stage.code));
  const result = buildProjectionForSchool({
    stages,
    countsByStage: new Map([
      ['PER2', 21],
      ['EF1_INT', 19],
    ]),
    classCountsByStage: new Map([
      ['PER2', 1],
      ['EF1_INT', 1],
    ]),
    totalClassesAvailable: 2,
    rulesByStage: new Map([
      ['PER2', { stageCode: 'PER2', nextStageCode: 'EF1', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 100, capacityLimit: 20 }],
      ['EF1', { stageCode: 'EF1', nextStageCode: 'EF2', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 25 }],
      ['EF1_INT', { stageCode: 'EF1_INT', nextStageCode: 'EF2_INT', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 25 }],
      ['EF2_INT', { stageCode: 'EF2_INT', nextStageCode: 'EF3_INT', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 25 }],
    ]),
    schoolSetting: { entryStageCode: 'PER2', capacityOverrides: {} },
    adjustmentsByStage: new Map(),
  });

  const ef1Integral = result.results.find((row) => row.stageCode === 'EF1_INT');

  assert.equal(ef1Integral.projectedStudents, 21);
});

test('redistribui o excedente entre regular e integral antes de superlotar a modalidade preferencial', () => {
  const stages = DEFAULT_ENROLLMENT_STAGES.filter((stage) => ['MAT1_INT', 'MAT2', 'MAT2_INT'].includes(stage.code));
  const result = buildProjectionForSchool({
    stages,
    countsByStage: new Map([
      ['MAT1_INT', 67],
      ['MAT2', 40],
      ['MAT2_INT', 21],
    ]),
    classCountsByStage: new Map([
      ['MAT1_INT', 1],
      ['MAT2', 1],
      ['MAT2_INT', 1],
    ]),
    totalClassesAvailable: 3,
    rulesByStage: new Map([
      ['MAT1_INT', { stageCode: 'MAT1_INT', nextStageCode: 'MAT2_INT', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 100, capacityLimit: 18 }],
      ['MAT2', { stageCode: 'MAT2', nextStageCode: 'PER1', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 18 }],
      ['MAT2_INT', { stageCode: 'MAT2_INT', nextStageCode: 'PER1', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 18 }],
      ['PER1', { stageCode: 'PER1', nextStageCode: 'PER2', promotionRate: 100, repetitionRate: 0, dropoutRate: 0, entryRate: 0, capacityLimit: 20 }],
    ]),
    schoolSetting: { entryStageCode: 'MAT1_INT', capacityOverrides: {} },
    adjustmentsByStage: new Map(),
  });

  const mat2 = result.results.find((row) => row.stageCode === 'MAT2');
  const mat2Integral = result.results.find((row) => row.stageCode === 'MAT2_INT');

  assert.equal(mat2.projectedStudents, 40);
  assert.equal(mat2Integral.projectedStudents, 27);
  assert.ok(mat2Integral.projectedStudents < 67);
});

test('rebalanceia excesso agregado entre regular e integral após consolidar os turnos', () => {
  const rows = rebalanceSiblingStageProjectedStudents([
    {
      stageCode: 'MAT2',
      currentStudents: 67,
      currentClasses: 1,
      projectedStudents: 46,
      capacityLimit: 18,
      reasonJson: {},
    },
    {
      stageCode: 'MAT2_INT',
      currentStudents: 21,
      currentClasses: 1,
      projectedStudents: 67,
      capacityLimit: 18,
      reasonJson: {},
    },
  ]);

  const mat2 = rows.find((row) => row.stageCode === 'MAT2');
  const mat2Integral = rows.find((row) => row.stageCode === 'MAT2_INT');

  assert.equal(mat2.projectedStudents, 57);
  assert.equal(mat2Integral.projectedStudents, 56);
  assert.equal(mat2.reasonJson.siblingRedistributedIn, 11);
  assert.equal(mat2Integral.reasonJson.siblingRedistributedOut, 11);
});
