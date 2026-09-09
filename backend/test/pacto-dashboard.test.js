import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPactoDashboard, getPerformanceClassification, formatGradeLabel, getPositionBadge } from '../../frontend/src/programs/pacto/dashboard.js';

const PII_DEFINITION = {
  components: [
    {
      code: 'LINGUAGEM',
      label: 'Linguagem',
      skills: [
        {
          code: 'COMPREENSAO_HISTORIA',
          label: 'Compreensão de História',
          levels: [
            { code: 'DESENVOLVIDO', label: 'Desenvolvido', color: 'green' },
            { code: 'EM_DESENVOLVIMENTO', label: 'Em Desenvolvimento', color: 'yellow' },
            { code: 'POR_DESENVOLVER', label: 'Por Desenvolver', color: 'red' },
          ],
        },
      ],
    },
  ],
};

const GRADE1_DEFINITION = {
  components: [
    {
      code: 'PORTUGUES',
      label: 'Língua Portuguesa',
      skills: [
        {
          code: 'LEITURA_PALAVRAS',
          label: 'Leitura de Palavras',
          levels: [
            { code: 'ALFABETICO', label: 'Alfabético', color: 'green' },
            { code: 'SILABICO_COM_VALOR', label: 'Silábico c/ valor', color: 'yellow' },
            { code: 'PRE_SILABICO', label: 'Pré-silábico', color: 'red' },
          ],
        },
      ],
    },
  ],
};

test('buildPactoDashboard ranking penalizes incomplete assessment cycles fairly', () => {
  // School A has only A1 submitted (incomplete, 1/2) with 95% proficiency, 100% participation
  const schoolA = {
    id: 'school-a',
    name: 'Escola Incompleta (Tomaz Lourenço)',
    inep: '11111111',
    definition: PII_DEFINITION,
    classes: [
      {
        id: 'c1',
        name: 'Pré II A',
        grade: 0,
        shift: 'MANHA',
        definition: PII_DEFINITION,
        assessments: [
          {
            id: 'ass-a1',
            code: 'A1',
            status: 'ENVIADO',
            components: [
              {
                component: 'LINGUAGEM',
                enrolled: 20,
                evaluated: 20,
                results: {
                  COMPREENSAO_HISTORIA: {
                    POR_DESENVOLVER: 0,
                    EM_DESENVOLVIMENTO: 1,
                    DESENVOLVIDO: 19,
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };

  // School B has A1 and A2 submitted (complete, 2/2) with 85% proficiency, 100% participation
  const schoolB = {
    id: 'school-b',
    name: 'Escola Completa (Santa Anastácia)',
    inep: '22222222',
    definition: PII_DEFINITION,
    classes: [
      {
        id: 'c2',
        name: 'Pré II B',
        grade: 0,
        shift: 'MANHA',
        definition: PII_DEFINITION,
        assessments: [
          {
            id: 'ass-b1',
            code: 'A1',
            status: 'ENVIADO',
            components: [
              {
                component: 'LINGUAGEM',
                enrolled: 20,
                evaluated: 20,
                results: {
                  COMPREENSAO_HISTORIA: {
                    POR_DESENVOLVER: 1,
                    EM_DESENVOLVIMENTO: 2,
                    DESENVOLVIDO: 17,
                  },
                },
              },
            ],
          },
          {
            id: 'ass-b2',
            code: 'A2',
            status: 'ENVIADO',
            components: [
              {
                component: 'LINGUAGEM',
                enrolled: 20,
                evaluated: 20,
                results: {
                  COMPREENSAO_HISTORIA: {
                    POR_DESENVOLVER: 1,
                    EM_DESENVOLVIMENTO: 2,
                    DESENVOLVIDO: 17,
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };

  const dashboard = buildPactoDashboard(
    { schools: [schoolA, schoolB] },
    { selectedGrade: '0' }
  );

  assert.equal(dashboard.schoolRanking.length, 2);

  const rankedSchool1 = dashboard.schoolRanking[0];
  const rankedSchool2 = dashboard.schoolRanking[1];

  // School B (Complete) should be ranked 1st because it completed all 2 expected assessments
  assert.equal(rankedSchool1.schoolId, 'school-b');
  assert.equal(rankedSchool1.isComplete, true);
  assert.equal(rankedSchool1.completedCount, 2);
  assert.equal(rankedSchool1.expectedCount, 2);
  assert.equal(rankedSchool1.completenessPercentage, 100);
  assert.equal(rankedSchool1.missingAssessments.length, 0);

  // School A (Incomplete) should be ranked 2nd and flagged as incomplete
  assert.equal(rankedSchool2.schoolId, 'school-a');
  assert.equal(rankedSchool2.isComplete, false);
  assert.equal(rankedSchool2.completedCount, 1);
  assert.equal(rankedSchool2.expectedCount, 2);
  assert.equal(rankedSchool2.completenessPercentage, 50);
  assert.deepEqual(rankedSchool2.missingAssessments, ['A2']);
  assert.equal(rankedSchool2.completenessLabel, '1/2');

  // School B rankingScore > School A rankingScore
  assert.ok(rankedSchool1.rankingScore > rankedSchool2.rankingScore);
});

test('buildPactoDashboard 1º Ano evaluation cycle completeness calculation (A0-A3)', () => {
  const school1 = {
    id: 'school-1ano',
    name: 'Escola 1º Ano Completa',
    definition: GRADE1_DEFINITION,
    classes: [
      {
        id: 'c-1a',
        name: '1º Ano A',
        grade: 1,
        enabledAssessments: ['A0', 'A1', 'A2', 'A3'],
        definition: GRADE1_DEFINITION,
        assessments: [
          {
            id: 'ass-1a0',
            code: 'A0',
            status: 'ENVIADO',
            components: [{ component: 'PORTUGUES', enrolled: 25, evaluated: 25, results: { LEITURA_PALAVRAS: { ALFABETICO: 20 } } }],
          },
          {
            id: 'ass-1a1',
            code: 'A1',
            status: 'ENVIADO',
            components: [{ component: 'PORTUGUES', enrolled: 25, evaluated: 25, results: { LEITURA_PALAVRAS: { ALFABETICO: 22 } } }],
          },
          {
            id: 'ass-1a2',
            code: 'A2',
            status: 'ENVIADO',
            components: [{ component: 'PORTUGUES', enrolled: 25, evaluated: 25, results: { LEITURA_PALAVRAS: { ALFABETICO: 23 } } }],
          },
          {
            id: 'ass-1a3',
            code: 'A3',
            status: 'ENVIADO',
            components: [{ component: 'PORTUGUES', enrolled: 25, evaluated: 25, results: { LEITURA_PALAVRAS: { ALFABETICO: 24 } } }],
          },
        ],
      },
    ],
  };

  const dashboard = buildPactoDashboard({ schools: [school1] }, { grade: '1' });
  const ranked = dashboard.schoolRanking[0];
  assert.equal(ranked.expectedCount, 4);
  assert.equal(ranked.completedCount, 4);
  assert.equal(ranked.isComplete, true);
  assert.equal(ranked.completenessPercentage, 100);
  assert.equal(ranked.completenessLabel, '4/4');
});

test('buildPactoDashboard marks completeness correctly when single assessment filter is selected', () => {
  const schoolA = {
    id: 'school-a',
    name: 'Escola A',
    definition: PII_DEFINITION,
    classes: [
      {
        id: 'c1',
        name: 'Turma A',
        grade: 0,
        definition: PII_DEFINITION,
        assessments: [
          {
            id: 'ass-a1',
            code: 'A1',
            status: 'ENVIADO',
            components: [
              {
                component: 'LINGUAGEM',
                enrolled: 10,
                evaluated: 10,
                results: {
                  COMPREENSAO_HISTORIA: {
                    DESENVOLVIDO: 10,
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };

  const dashboard = buildPactoDashboard(
    { schools: [schoolA] },
    { grade: '0', assessment: 'A1' }
  );

  const ranked = dashboard.schoolRanking[0];
  assert.equal(ranked.expectedCount, 1);
  assert.equal(ranked.completedCount, 1);
  assert.equal(ranked.isComplete, true);
  assert.equal(ranked.completenessPercentage, 100);
});

test('buildPactoDashboard identifies attention points for critical skills and incomplete cycles', () => {
  const schoolCritical = {
    id: 'school-crit',
    name: 'Escola Necessitando Intervenção',
    definition: PII_DEFINITION,
    classes: [
      {
        id: 'c-crit',
        name: 'Pré II C',
        grade: 0,
        definition: PII_DEFINITION,
        assessments: [
          {
            id: 'ass-crit1',
            code: 'A1',
            status: 'ENVIADO',
            components: [
              {
                component: 'LINGUAGEM',
                enrolled: 20,
                evaluated: 20,
                results: {
                  COMPREENSAO_HISTORIA: {
                    POR_DESENVOLVER: 16,
                    EM_DESENVOLVIMENTO: 4,
                    DESENVOLVIDO: 0,
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };

  const dashboard = buildPactoDashboard({ schools: [schoolCritical] }, { grade: '0' });
  assert.ok(dashboard.attentionPoints.length > 0);
  
  // Checks for critical skill diagnosis
  const skillWarning = dashboard.attentionPoints.find((p) => p.type === 'skill');
  assert.ok(skillWarning);
  assert.equal(skillWarning.severity, 'critical');

  // Checks for pending/incomplete assessment diagnosis (since only A1 is done and A2 is expected)
  const incompleteWarning = dashboard.attentionPoints.find((p) => p.type === 'incomplete');
  assert.ok(incompleteWarning);
  assert.equal(incompleteWarning.severity, 'warning');
});

test('formatGradeLabel formats PII, 1º ano and 2º ano accurately', () => {
  assert.equal(formatGradeLabel(0), 'PII');
  assert.equal(formatGradeLabel('0'), 'PII');
  assert.equal(formatGradeLabel(1), '1º ano');
  assert.equal(formatGradeLabel('1'), '1º ano');
  assert.equal(formatGradeLabel(2), '2º ano');
  assert.equal(formatGradeLabel('2'), '2º ano');
});

test('getPositionBadge returns medal badges for top 3 and numbered ranks', () => {
  assert.equal(getPositionBadge(1), '🥇 1º');
  assert.equal(getPositionBadge(2), '🥈 2º');
  assert.equal(getPositionBadge(3), '🥉 3º');
  assert.equal(getPositionBadge(4), '4º');
  assert.equal(getPositionBadge(10), '10º');
});

test('getPerformanceClassification returns expected ranges and badges', () => {
  assert.equal(getPerformanceClassification(85).label, 'Excelente');
  assert.equal(getPerformanceClassification(70).label, 'Bom desempenho');
  assert.equal(getPerformanceClassification(50).label, 'Atenção');
  assert.equal(getPerformanceClassification(30).label, 'Crítico');
});
