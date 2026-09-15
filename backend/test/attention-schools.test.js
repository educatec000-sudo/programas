import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePactoAttentionSchools } from '../../frontend/src/programs/pacto/dashboard.js';
import { calculateCncaAttentionSchools } from '../src/programs/cnca/service.js';
import { calculateParcAttentionSchools } from '../src/programs/parc/service.js';
import { calculateSispaeAttentionSchools } from '../src/programs/sispae/service.js';

test('Atenção Pacto: identifica de forma determinística participação crítica, proficiência baixa e ciclo incompleto', () => {
  const mockRanking = [
    {
      schoolId: 'sch-1',
      school: 'Escola Atenção Alta',
      inep: '15000001',
      enrolled: 100,
      evaluated: 60,
      participationPercentage: 60, // < 70 -> HIGH
      score: 35, // < 40 -> HIGH
      interventionRate: 42, // > 35 -> HIGH
      isComplete: false,
      missingAssessments: ['A2', 'A3'],
      completenessPercentage: 50,
      components: [],
    },
    {
      schoolId: 'sch-2',
      school: 'Escola Atenção Média',
      inep: '15000002',
      enrolled: 100,
      evaluated: 75,
      participationPercentage: 75, // < 80 -> MEDIUM (2 points)
      score: 72, // > 70 -> OK
      interventionRate: 10, // < 15 -> OK
      isComplete: true,
      missingAssessments: [],
      completenessPercentage: 100,
      components: [],
    },
    {
      schoolId: 'sch-3',
      school: 'Escola Regular Excelente',
      inep: '15000003',
      enrolled: 100,
      evaluated: 95,
      participationPercentage: 95,
      score: 88,
      interventionRate: 5,
      isComplete: true,
      missingAssessments: [],
      completenessPercentage: 100,
      components: [],
    },
  ];

  const result = calculatePactoAttentionSchools(mockRanking, []);

  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.high, 1);
  assert.equal(result.summary.medium, 1);
  assert.equal(result.summary.low, 0);

  const highSchool = result.schools.find((s) => s.schoolId === 'sch-1');
  assert.ok(highSchool);
  assert.equal(highSchool.priority, 'HIGH');
  assert.equal(highSchool.priorityLabel, 'Alta');
  assert.ok(highSchool.reasons.some((r) => r.indicator === 'Taxa de Participação' && r.severity === 'HIGH'));
  assert.ok(highSchool.reasons.some((r) => r.indicator === 'Índice de Proficiência' && r.severity === 'HIGH'));
  assert.ok(highSchool.reasons.some((r) => r.indicator === 'Estudantes em Nível Inicial' && r.severity === 'HIGH'));
  assert.ok(highSchool.reasons.some((r) => r.indicator === 'Ciclo Avaliativo Incompleto'));

  const mediumSchool = result.schools.find((s) => s.schoolId === 'sch-2');
  assert.ok(mediumSchool);
  assert.equal(mediumSchool.priority, 'MEDIUM');
});

test('Atenção CNCA: identifica fragilidades em Escrita, Leitura, Matemática e Fluência', () => {
  const mockSchoolSummaries = [
    {
      id: 'cnca-sch-1',
      name: 'Escola Crítica CNCA',
      inep: '15111111',
      zone: 'URBANA',
      participationRate: 68.0, // < 75 -> HIGH
      score: 38.0,
      performanceLevels: [
        { level: 'Pré-alfabético', count: 48, percentage: 48.0 }, // > 45 -> HIGH
        { level: 'Básico', count: 32, percentage: 32.0 },
        { level: 'Adequado', count: 20, percentage: 20.0 },
      ],
      results: [
        {
          component: 'ESCRITA',
          fluentRate: 28.0, // < 45 -> HIGH
          performanceLevels: [{ level: 'Alfabético', count: 28, percentage: 28.0 }],
        },
        {
          component: 'MATEMATICA',
          averageScore: 35.0, // < 45 -> HIGH
        },
        {
          component: 'FLUENCIA',
          fluentRate: 22.0,
          pcpm: 34.0, // < 40 -> HIGH
        },
      ],
    },
    {
      id: 'cnca-sch-2',
      name: 'Escola CNCA Regular',
      inep: '15222222',
      zone: 'SEDE',
      participationRate: 92.0,
      score: 84.0,
      performanceLevels: [
        { level: 'Adequado', count: 70, percentage: 70.0 },
        { level: 'Básico', count: 20, percentage: 20.0 },
        { level: 'Pré-alfabético', count: 10, percentage: 10.0 },
      ],
      results: [
        { component: 'ESCRITA', fluentRate: 80.0 },
        { component: 'MATEMATICA', averageScore: 82.0 },
      ],
    },
  ];

  const result = calculateCncaAttentionSchools(mockSchoolSummaries, { literacyAverage: 70.0 });

  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.high, 1);
  assert.equal(result.schools[0].schoolId, 'cnca-sch-1');
  assert.equal(result.schools[0].priority, 'HIGH');
  assert.ok(result.schools[0].reasons.some((r) => r.indicator === 'Desempenho em Escrita'));
  assert.ok(result.schools[0].reasons.some((r) => r.indicator === 'Desempenho em Matemática'));
  assert.ok(result.schools[0].reasons.some((r) => r.indicator === 'Fluência Leitora'));
});

test('Atenção PARC: identifica concentração de Não Leitores, IFL crítico e queda entre ciclos', () => {
  const activeResults = [
    {
      schoolId: 'parc-sch-1',
      school: { id: 'parc-sch-1', name: 'Escola Crítica PARC', inep: '15333333', zone: 'ILHAS' },
      enrolled: 50,
      evaluated: 32,
      participationRate: 64.0, // < 75 -> HIGH
      preReaderLevel1: 25.0,
      preReaderLevel2: 20.0, // sum = 45% -> HIGH
      preReaderTotal: 65.0,
      beginnerReader: 25.0,
      fluentReader: 10.0, // < 25% -> HIGH
      ifl: 3.2, // < 4.0 -> HIGH
    },
  ];

  const comparative = [
    {
      schoolId: 'parc-sch-1',
      deltaFluent: -8.0, // queda -> HIGH
      deltaPreReaderReduction: -5.0, // aumento de pré-leitores -> HIGH
    },
  ];

  const result = calculateParcAttentionSchools(activeResults, comparative, { ifl: 6.5 });

  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.high, 1);
  const s = result.schools[0];
  assert.equal(s.priority, 'HIGH');
  assert.ok(s.reasons.some((r) => r.indicator === 'Taxa de Participação'));
  assert.ok(s.reasons.some((r) => r.indicator === 'Não Leitores e Soletradores'));
  assert.ok(s.reasons.some((r) => r.indicator === 'Índice de Fluência (IFL)'));
  assert.ok(s.reasons.some((r) => r.indicator === 'Leitores Fluentes'));
  assert.ok(s.reasons.some((r) => r.indicator === 'Evolução Entrada × Saída'));
});

test('Atenção SisPAE: identifica alta taxa de defasagem, baixo aprendizado e descompasso entre LP e MAT', () => {
  const schoolRows = [
    {
      schoolId: 'sispae-sch-1',
      schoolName: 'Escola Defasagem SisPAE',
      inep: '15444444',
      zone: 'ESTRADAS',
      overallParticipation: 70.0, // < 75 -> HIGH
      overallDeficitRate: 44.0, // > 35 -> HIGH
      overallAdequateRate: 22.0, // < 35 -> HIGH
      components: {
        LINGUA_PORTUGUESA: { deficitRate: 48.0, adequateRate: 18.0 },
        MATEMATICA: { deficitRate: 40.0, adequateRate: 46.0 }, // gap between LP 18 and MAT 46 = 28 p.p.
      },
    },
  ];

  const result = calculateSispaeAttentionSchools(schoolRows, { avgAdequate: 55.0, avgDeficit: 20.0 });

  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.high, 1);
  const s = result.schools[0];
  assert.equal(s.priority, 'HIGH');
  assert.ok(s.reasons.some((r) => r.indicator === 'Taxa de Defasagem'));
  assert.ok(s.reasons.some((r) => r.indicator === 'Aprendizado Adequado'));
  assert.ok(s.reasons.some((r) => r.indicator === 'Defasagem em Língua Portuguesa'));
  assert.ok(s.reasons.some((r) => r.indicator === 'Descompasso entre Componentes'));
});
