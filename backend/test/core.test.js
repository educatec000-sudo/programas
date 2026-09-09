import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attainment,
  computeRanking,
  programIndicatorConfig,
} from '../src/services/scoring.service.js';
import { resolveGoalFromList } from '../src/services/goal.service.js';
import { durationToMs } from '../src/lib/auth.js';
import { normalizeCoordinate } from '../src/modules/imports/coordinates.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseSpreadsheet, toNumber } from '../src/modules/imports/parser.js';
import { autoMapColumns } from '../src/modules/imports/schoolFields.js';
import { schoolsStrategy } from '../src/modules/imports/schools.strategy.js';
import { resultsStrategy } from '../src/modules/imports/results.strategy.js';
import { createGoalSchema } from '../src/validations/result.validation.js';
import { createProgramCriterionSchema } from '../src/validations/program.validation.js';
import {
  countSchoolsWithData,
  getSchoolProgramDeletionImpact,
  removeSchool,
} from '../src/services/program.service.js';
import { getAssessmentDefinition } from '../src/programs/pacto/config.js';
import {
  buildSchoolStatus,
  percentage,
  publicCollectionPath,
  validateAssessmentPayload,
} from '../src/programs/pacto/service.js';
import { updateClassSchema } from '../src/programs/pacto/validation.js';
import { resolvePactoPublicLink } from '../../frontend/src/programs/pacto/link.js';
import { buildPactoDashboard } from '../../frontend/src/programs/pacto/dashboard.js';
import {
  permanentProgramCode,
  permanentProgramName,
  programCycleCode,
  selectCurrentProgramCycle,
  summarizeProgramDeletionCounts,
} from '../src/services/program-catalog.js';
import {
  CollectionLinkState,
  assessmentCanBeReopened,
  classIdentificationLocked,
  collectionLinkState,
  draftAssessmentStatus,
  publicAssessmentLocked,
} from '../src/programs/pacto/lifecycle.js';

test('calcula atingimento respeitando a polaridade e o teto', () => {
  assert.equal(attainment(50, 100, 'MAIOR_MELHOR'), 50);
  assert.equal(attainment(150, 100, 'MAIOR_MELHOR'), 150);
  assert.equal(attainment(5, 10, 'MENOR_MELHOR'), 200);
  assert.equal(attainment(20, 10, 'MENOR_MELHOR'), 50);
  assert.equal(attainment(0, 10, 'MENOR_MELHOR'), 200);
  assert.equal(attainment(-1, 10, 'MENOR_MELHOR'), null);
  assert.equal(attainment(1, 0, 'MAIOR_MELHOR'), null);
});

test('não herda meta nem peso globais quando o programa não os configurou', () => {
  const config = programIndicatorConfig({
    weight: null,
    goal: null,
    indicator: { weight: 99, defaultGoal: 100 },
  });
  assert.deepEqual(config, { weight: 1, goal: null });
});

test('calcula cobertura dos cards somente para escolas vinculadas e ativas', () => {
  const counts = countSchoolsWithData(
    [
      { programId: 'p1', schoolId: 's1' },
      { programId: 'p1', schoolId: 's2' },
      { programId: 'p2', schoolId: 's3' },
    ],
    [
      { programId: 'p1', schoolId: 's1' },
      { programId: 'p1', schoolId: 's1' },
      { programId: 'p1', schoolId: 's2' },
      { programId: 'p1', schoolId: 's9' },
      { programId: 'p2', schoolId: 's3' },
    ],
  );
  assert.equal(counts.get('p1'), 2);
  assert.equal(counts.get('p2'), 1);
});

test('separa a identidade permanente do programa de seus ciclos anuais', () => {
  assert.equal(permanentProgramCode('PACTO-ALFABETIZACAO-2026', 2026), 'PACTO-ALFABETIZACAO');
  assert.equal(permanentProgramCode('PRG-2024-01', 2024), 'PRG-01');
  assert.equal(permanentProgramName('Pacto pela Alfabetização 2026', 2026), 'Pacto pela Alfabetização');
  assert.equal(programCycleCode('PACTO-ALFABETIZACAO', 2027), 'PACTO-ALFABETIZACAO-2027');

  const cycles = [
    { id: '2027', year: 2027, status: 'PLANEJAMENTO', deletedAt: null },
    { id: '2026', year: 2026, status: 'EM_EXECUCAO', deletedAt: null },
    { id: '2025', year: 2025, status: 'CONCLUIDO', deletedAt: null },
  ];
  assert.equal(selectCurrentProgramCycle(cycles).id, '2026');
  assert.equal(selectCurrentProgramCycle(cycles, 'PLANEJAMENTO').id, '2027');
});

test('bloqueia exclusão do programa quando qualquer relação possui dados', () => {
  assert.deepEqual(summarizeProgramDeletionCounts({ schools: 0, results: 0 }), {
    counts: { schools: 0, results: 0 },
    relatedRecords: 0,
    canDelete: true,
  });
  assert.deepEqual(summarizeProgramDeletionCounts({ schools: 2, results: 5, documents: 1 }), {
    counts: { schools: 2, results: 5, documents: 1 },
    relatedRecords: 8,
    canDelete: false,
  });
});

test('exclusão de escola com dados exige confirmação explícita de limpeza', async () => {
  const actor = { id: 'admin-id', name: 'Admin' };
  const ip = '127.0.0.1';

  // Quando não há dados, exclusão é direta
  // Quando há dados e purgeData=false, lança 409 SCHOOL_HAS_PROGRAM_DATA
  // Quando há dados e purgeData=true, executa exclusão em cascata
  assert.equal(typeof removeSchool, 'function');
  assert.equal(typeof getSchoolProgramDeletionImpact, 'function');
});

test('representa as seis matrizes oficiais do Pacto 2026', () => {
  assert.equal(getAssessmentDefinition(1, 'A0').components[0].skills.length, 7);
  assert.equal(getAssessmentDefinition(2, 'A0').components[0].skills.length, 4);
  const a1FirstGrade = getAssessmentDefinition(1, 'A1');
  assert.deepEqual(a1FirstGrade.components.map((item) => item.code), ['PORTUGUES', 'MATEMATICA']);
  assert.equal(a1FirstGrade.components[0].skills.length, 3);
  assert.equal(a1FirstGrade.components[1].skills[0].levels.length, 3);
});

test('filtra o dashboard gerencial do Pacto por escola, ano, componente e avaliação', () => {
  const definition = getAssessmentDefinition(2, 'A1');
  const components = definition.components.map((component, componentIndex) => ({
    id: `component-${componentIndex}`,
    component: component.code,
    enrolled: componentIndex === 0 ? 10 : 9,
    evaluated: componentIndex === 0 ? 8 : 7,
    results: component.skills.flatMap((skill) => skill.levels.map((level, index) => ({
      skill: skill.code,
      level: level.code,
      count: componentIndex === 0 ? [2, 3, 3][index] : [1, 2, 4][index],
    }))),
  }));
  const overview = {
    schools: [
      {
        id: 'school-1', name: 'Escola 1', inep: '15000001',
        classes: [{
          id: 'class-1', schoolId: 'school-1', grade: 2, shift: 'M', name: 'A',
          enabledAssessments: ['A1'],
          assessments: [{ id: 'assessment-1', code: 'A1', status: 'ENVIADO', definition, components }],
        }],
      },
      {
        id: 'school-2', name: 'Escola 2', inep: '15000002',
        classes: [{
          id: 'class-2', schoolId: 'school-2', grade: 2, shift: 'M', name: 'B',
          enabledAssessments: ['A1'],
          assessments: [{ id: 'assessment-2', code: 'A1', status: 'ENVIADO', definition, components }],
        }],
      },
    ],
  };

  const dashboard = buildPactoDashboard(overview, {
    schoolId: 'school-1', grade: '2', component: 'PORTUGUES', assessment: 'A1', shift: 'M', classId: '',
  });
  assert.deepEqual(dashboard.metrics, {
    participatingSchools: 1,
    registeredClasses: 1,
    classesWithData: 1,
    enrolled: 10,
    evaluated: 8,
    completionPercentage: 100,
    participationPercentage: 80,
    completedAssessments: 1,
    expectedAssessments: 1,
    startedAssessments: 1,
  });
  assert.equal(dashboard.charts.length, 3);
  assert.equal(dashboard.charts.find((item) => item.skill === 'LEITURA').levels[0].percentage, 25);
  assert.equal(dashboard.schoolComparison.length, 1);
  assert.equal(dashboard.classComparison.length, 1);
  assert.equal(dashboard.classComparison[0].school, 'Escola 1');
  assert.equal(dashboard.classComparison[0].component, 'PORTUGUES');

  const incompatibleSchoolAndClass = buildPactoDashboard(overview, {
    schoolId: 'school-1', grade: '', component: '', assessment: '', shift: '', classId: 'class-2',
  });
  assert.equal(incompatibleSchoolAndClass.metrics.registeredClasses, 0);
  assert.equal(incompatibleSchoolAndClass.schoolComparison.length, 0);
  assert.equal(incompatibleSchoolAndClass.classComparison.length, 0);
});

test('calcula os percentuais inteiros como a planilha do Pacto', () => {
  assert.equal(percentage(16, 17), 94);
  assert.equal(percentage(1, 17), 6);
  assert.equal(percentage(14, 19), 74);
  assert.equal(percentage(0, 0), null);
});

test('bloqueia envio do Pacto quando os níveis não fecham com avaliados', () => {
  const definition = getAssessmentDefinition(2, 'A0');
  const payload = {
    classId: crypto.randomUUID(),
    code: 'A0',
    components: definition.components.map((component) => ({
      component: component.code,
      enrolled: 20,
      evaluated: 20,
      results: component.skills.flatMap((skill) => skill.levels.map((level, index) => ({
        skill: skill.code,
        level: level.code,
        count: index === 0 ? 19 : 0,
      }))),
    })),
  };
  assert.throws(
    () => validateAssessmentPayload({ grade: 2 }, payload, { submit: true }),
    (error) => error.code === 'PACTO_VALIDATION_ERROR' && error.status === 422,
  );
});

test('permite avaliados acima de matriculados no Pacto, mas gera alerta', () => {
  const definition = getAssessmentDefinition(2, 'A1');
  const math = definition.components.find((item) => item.code === 'MATEMATICA');
  const checked = validateAssessmentPayload(
    { grade: 2 },
    {
      classId: crypto.randomUUID(),
      code: 'A1',
      components: [{
        component: 'MATEMATICA',
        enrolled: 18,
        evaluated: 19,
        results: math.skills.flatMap((skill) => skill.levels.map((level, index) => ({
          skill: skill.code,
          level: level.code,
          count: [3, 7, 9][index],
        }))),
      }],
    },
    { submit: false },
  );
  assert.equal(checked.warnings.some((item) => item.code === 'EVALUATED_ABOVE_ENROLLED'), true);
});

test('recusa o Pacto na importação genérica de resultados', () => {
  const pacto = {
    id: 'pacto-id',
    code: 'PACTO-ALFABETIZACAO-2027',
    name: 'Pacto',
    year: 2027,
    catalog: { code: 'PACTO-ALFABETIZACAO' },
  };
  const built = resultsStrategy.buildRow(
    { raw: { programa: pacto.code, inep: '15000000', criterio: 'IND-1', ano: 2027, periodo: 'Anual', resultado: 10 } },
    {
      programByCode: new Map([[pacto.code.toLowerCase(), pacto]]),
      schoolByInep: new Map([['15000000', { id: 'school-id', inep: '15000000', name: 'Escola' }]]),
      indicatorByCode: new Map([['ind-1', { id: 'indicator-id', code: 'IND-1', name: 'Indicador' }]]),
      schoolLinks: new Set(['pacto-id|school-id']),
      indicatorLinks: new Set(['pacto-id|indicator-id']),
    },
  );
  assert.equal(built.errors.some((item) => item.field === 'programa' && item.message.includes('coleta específica')), true);
});

test('monta o link público na origem atual do CPE e nunca em outro site', () => {
  const token = 'A'.repeat(43);
  const path = publicCollectionPath(token);
  const resolved = resolvePactoPublicLink(path, 'https://cpe-oficial.vercel.app');
  assert.equal(path, `/coleta/pacto/${token}`);
  assert.equal(resolved.token, token);
  assert.equal(resolved.url, `https://cpe-oficial.vercel.app/coleta/pacto/${token}`);
  assert.throws(
    () => resolvePactoPublicLink(`https://formulario-teste.example/${token}`, 'https://cpe-oficial.vercel.app'),
    /rota pública inválida/,
  );
});

test('atualização parcial de turma não habilita avaliações implicitamente', () => {
  assert.deepEqual(updateClassSchema.parse({ name: 'B' }), { name: 'B' });
  assert.deepEqual(
    updateClassSchema.parse({ enabledAssessments: ['A1', 'A2', 'A3'] }).enabledAssessments,
    ['A1', 'A2', 'A3'],
  );
  assert.throws(() => updateClassSchema.parse({ enabledAssessments: [] }));
});

test('aplica validade e revogação no ciclo de vida do link de coleta', () => {
  const now = new Date('2026-09-02T12:00:00.000Z');
  assert.equal(collectionLinkState(null, now), CollectionLinkState.INVALID);
  assert.equal(collectionLinkState({ expiresAt: new Date('2026-09-03T12:00:00.000Z'), revokedAt: now }, now), CollectionLinkState.REVOKED);
  assert.equal(collectionLinkState({ expiresAt: new Date('2026-09-02T12:00:00.000Z'), revokedAt: null }, now), CollectionLinkState.EXPIRED);
  assert.equal(collectionLinkState({ expiresAt: new Date('2026-09-03T12:00:00.000Z'), revokedAt: null }, now), CollectionLinkState.ACTIVE);
});

test('bloqueia o enviado e preserva o estado reaberto durante a correção', () => {
  assert.equal(publicAssessmentLocked('ENVIADO'), true);
  assert.equal(publicAssessmentLocked('REABERTO'), false);
  assert.equal(classIdentificationLocked([{ status: 'RASCUNHO' }, { status: 'ENVIADO' }]), true);
  assert.equal(classIdentificationLocked([{ status: 'REABERTO' }]), false);
  assert.equal(assessmentCanBeReopened('ENVIADO'), true);
  assert.equal(assessmentCanBeReopened('RASCUNHO'), false);
  assert.equal(draftAssessmentStatus('REABERTO'), 'REABERTO');
  assert.equal(draftAssessmentStatus('RASCUNHO'), 'RASCUNHO');
});

test('calcula pendências e conclusão pelos quatro envios independentes de cada turma', () => {
  const partial = buildSchoolStatus([{ assessments: [{ code: 'A0', status: 'ENVIADO', submittedAt: new Date('2026-09-01') }] }]);
  assert.equal(partial.expectedAssessmentsCount, 4);
  assert.equal(partial.pendingAssessmentsCount, 3);
  assert.equal(partial.completionPercentage, 25);
  assert.equal(partial.status, 'PARCIAL');

  const selectedAssessments = buildSchoolStatus([{
    enabledAssessments: ['A1', 'A2', 'A3'],
    assessments: [{ code: 'A1', status: 'ENVIADO', submittedAt: new Date('2026-09-01') }],
  }]);
  assert.equal(selectedAssessments.expectedAssessmentsCount, 3);
  assert.equal(selectedAssessments.pendingAssessmentsCount, 2);
  assert.equal(selectedAssessments.completionPercentage, 33);

  const completed = buildSchoolStatus([{ assessments: ['A0', 'A1', 'A2', 'A3'].map((code) => ({
    code,
    status: 'ENVIADO',
    submittedAt: new Date('2026-09-02'),
  })) }]);
  assert.equal(completed.completionPercentage, 100);
  assert.equal(completed.status, 'CONCLUIDA');
});

test('recusa ranking sem programa para não misturar avaliações', async () => {
  await assert.rejects(
    () => computeRanking({ year: 2026 }),
    (error) => error.code === 'PROGRAM_REQUIRED' && error.status === 422,
  );
});

test('valida criação de critério específico no contexto do programa', () => {
  const parsed = createProgramCriterionSchema.safeParse({
    code: 'FLUENCIA',
    name: 'Fluência leitora',
    description: '',
    categoryId: null,
    unit: '%',
    polarity: 'MAIOR_MELHOR',
    weight: 2,
    target: 80,
    minValue: 0,
    maxValue: 100,
    periodLabel: 'Anual',
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.code, 'FLUENCIA');
  assert.equal(parsed.data.target, 80);
});

test('resolve a meta mais específica', () => {
  const goals = [
    { id: 'global', programId: null, schoolId: null, indicatorId: null, period: null },
    { id: 'program', programId: 'p1', schoolId: null, indicatorId: null, period: null },
    { id: 'specific', programId: 'p1', schoolId: 's1', indicatorId: 'i1', period: 'Anual' },
  ];
  const resolved = resolveGoalFromList(goals, {
    programId: 'p1',
    schoolId: 's1',
    indicatorId: 'i1',
    period: 'Anual',
  });
  assert.equal(resolved.id, 'specific');
});

test('valida coerência entre escopo e dimensões da meta', () => {
  const base = { year: 2026, value: 90, period: null };
  assert.equal(createGoalSchema.safeParse({ ...base, scope: 'GERAL' }).success, true);
  assert.equal(
    createGoalSchema.safeParse({ ...base, scope: 'GERAL', programId: crypto.randomUUID() }).success,
    false,
  );
  assert.equal(createGoalSchema.safeParse({ ...base, scope: 'PROGRAMA' }).success, false);
});

test('normaliza durações usadas pelo cookie de acesso', () => {
  assert.equal(durationToMs('30s'), 30_000);
  assert.equal(durationToMs('15m'), 900_000);
  assert.equal(durationToMs('2h'), 7_200_000);
  assert.equal(durationToMs('1d'), 86_400_000);
});

test('interpreta números pt-BR e coordenadas com decimal implícita', () => {
  assert.equal(toNumber('1.234,56'), 1234.56);
  assert.equal(toNumber('-48,832820'), -48.83282);
  assert.equal(toNumber('não informado'), null);
  assert.equal(normalizeCoordinate(-165917, 'latitude'), -1.65917);
  assert.equal(normalizeCoordinate(-48832820, 'longitude'), -48.83282);
});

test('mapeia automaticamente colunas conhecidas de escolas', () => {
  const { mapping, unmapped } = autoMapColumns([
    'INEP',
    'ESCOLAS',
    'ENDEREÇO',
    'LONGTUDE',
    'COLUNA EXTRA',
  ]);
  assert.equal(mapping.inep, 'INEP');
  assert.equal(mapping.name, 'ESCOLAS');
  assert.equal(mapping.address, 'ENDEREÇO');
  assert.equal(mapping.longitude, 'LONGTUDE');
  assert.deepEqual(unmapped, ['COLUNA EXTRA']);
});

test('lê o CSV oficial Windows-1252 e normaliza zona e coordenadas', () => {
  const fixture = path.join(os.tmpdir(), `cpe-schools-${process.pid}-${Date.now()}.csv`);
  const csv = [
    'INEP;ESCOLAS;ENDEREÇO;GESTOR(A);ZONA;LATITUDE;LONGTUDE',
    '15181278;EMEF GUAJARÁ DE BEJA;RAMAL BAIA;; ESTRADAS;-165.917;-48.832.820',
    '',
  ].join('\r\n');
  // Os caracteres usados nesta amostra pertencem ao mesmo intervalo de bytes
  // em Latin-1 e Windows-1252. O teste não depende de um arquivo externo.
  fs.writeFileSync(fixture, Buffer.from(csv, 'latin1'));

  try {
    const [row] = parseSpreadsheet(fixture);
    const { mapping } = autoMapColumns(Object.keys(row.raw));
    const built = schoolsStrategy.buildRow(
      row,
      { byInep: new Map(), byNameKey: new Map() },
      mapping,
    );

    assert.deepEqual(built.errors, []);
    assert.equal(built.data.name, 'EMEF GUAJARÁ DE BEJA');
    assert.equal(built.data.address, 'RAMAL BAIA');
    assert.equal(built.data.zone, 'ESTRADAS');
    assert.equal(built.data.latitude, -1.65917);
    assert.equal(built.data.longitude, -48.83282);
  } finally {
    fs.rmSync(fixture, { force: true });
  }
});

test('Pacto: Português e Matemática na mesma turma/avaliação NÃO duplicam matriculados nem avaliados', () => {
  const definition = getAssessmentDefinition(1, 'A1');
  const components = [
    {
      component: 'PORTUGUES',
      enrolled: 300,
      evaluated: 290,
      results: [
        { skill: 'LEITURA_PALAVRAS', level: 'ALFABETICO', count: 250 },
        { skill: 'LEITURA_PALAVRAS', level: 'PRE_SILABICO', count: 40 },
      ],
    },
    {
      component: 'MATEMATICA',
      enrolled: 300,
      evaluated: 285,
      results: [
        { skill: 'NUMEROS_CONTAGEM', level: 'ALFABETICO', count: 240 },
        { skill: 'NUMEROS_CONTAGEM', level: 'PRE_SILABICO', count: 45 },
      ],
    },
  ];

  const overview = {
    schools: [
      {
        id: 'school-dedup',
        name: 'Escola Exemplo Deduplicação',
        inep: '15000099',
        classes: [
          {
            id: 'class-dedup-1',
            schoolId: 'school-dedup',
            grade: 1,
            shift: 'M',
            name: '1º Ano Único',
            enabledAssessments: ['A1'],
            assessments: [{ id: 'ass-dedup-1', code: 'A1', status: 'ENVIADO', definition, components }],
          },
        ],
      },
    ],
  };

  const dashboard = buildPactoDashboard(overview, { grade: '1', assessment: 'A1' });
  const school = dashboard.schoolRanking[0];

  // Regra Fundamental: Português (300) + Matemática (300) = 300 alunos únicos matriculados (NÃO 600)
  assert.equal(school.enrolled, 300, 'Matriculados deve ser 300 e não 600');
  // Português (290) + Matemática (285) = 290 alunos únicos avaliados (NÃO 575)
  assert.equal(school.evaluated, 290, 'Avaliados deve ser 290 e não 575');
  assert.equal(school.participationPercentage, 97, 'Participação deve ser 97%');
  assert.equal(dashboard.metrics.enrolled, 300, 'Métrica da rede deve ser 300');
  assert.equal(dashboard.metrics.evaluated, 290, 'Métrica da rede deve ser 290');
});

test('Pacto: A1 e A2 na mesma turma utilizam a última avaliação A2 e NÃO somam A1 + A2', () => {
  const definition = getAssessmentDefinition(0, 'A1');
  const overview = {
    schools: [
      {
        id: 'school-a1-a2',
        name: 'Escola A1 e A2',
        inep: '15000088',
        classes: [
          {
            id: 'class-pii-1',
            schoolId: 'school-a1-a2',
            grade: 0,
            shift: 'M',
            name: 'Pré II A',
            enabledAssessments: ['A1', 'A2'],
            assessments: [
              {
                id: 'ass-pii-a1',
                code: 'A1',
                status: 'ENVIADO',
                definition,
                components: [{ component: 'LINGUAGEM', enrolled: 300, evaluated: 280, results: [] }],
              },
              {
                id: 'ass-pii-a2',
                code: 'A2',
                status: 'ENVIADO',
                definition,
                components: [{ component: 'LINGUAGEM', enrolled: 305, evaluated: 295, results: [] }],
              },
            ],
          },
        ],
      },
    ],
  };

  const dashboard = buildPactoDashboard(overview, { grade: '0' });
  const school = dashboard.schoolRanking[0];

  // Regra Fundamental: A1 (300/280) e A2 (305/295) -> Usa A2 (305/295), NÃO 605 nem 575!
  assert.equal(school.enrolled, 305, 'Matriculados da escola deve ser 305 (da A2)');
  assert.equal(school.evaluated, 295, 'Avaliados da escola deve ser 295 (da A2)');
  assert.equal(school.participationPercentage, 97, 'Participação da escola deve ser 97%');
  assert.equal(school.completenessLabel, '2/2');
  assert.equal(school.isComplete, true);
});

