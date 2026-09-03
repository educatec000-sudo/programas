export const PACTO_CATALOG_CODE = 'PACTO-ALFABETIZACAO';
export const PACTO_PROGRAM_CODE = 'PACTO-ALFABETIZACAO-2026';
export const PACTO_PROGRAM_YEAR = 2026;

export const ASSESSMENT_CODES = ['A0', 'A1', 'A2', 'A3'];

const DEVELOPMENT_LEVELS = [
  { code: 'POR_DESENVOLVER', label: 'Por desenvolver', color: 'red' },
  { code: 'EM_DESENVOLVIMENTO', label: 'Em desenvolvimento', color: 'yellow' },
  { code: 'DESENVOLVIDO', label: 'Desenvolvidos', color: 'green' },
];

const PORTUGUESE_SKILLS = [
  {
    code: 'LEITURA',
    label: 'Leitura',
    levels: [
      { code: 'PRE_LEITOR', label: 'Pré-leitores', color: 'red' },
      { code: 'LEITOR_INICIAL', label: 'Leitores iniciais', color: 'yellow' },
      { code: 'LEITOR_FLUENTE', label: 'Leitores fluentes', color: 'green' },
    ],
  },
  {
    code: 'COMPREENSAO_TEXTO',
    label: 'Compreensão de texto',
    levels: [
      { code: 'NAO_COMPREENDE', label: 'Não compreende', color: 'red' },
      { code: 'COMPREENDE_ORALIDADE', label: 'Compreende por oralidade', color: 'yellow' },
      { code: 'COMPREENDE_AUTONOMAMENTE', label: 'Compreende autonomamente', color: 'green' },
    ],
  },
  {
    code: 'ESCRITA',
    label: 'Escrita',
    levels: [
      { code: 'PRE_ALFABETICO', label: 'Pré-alfabético', color: 'red' },
      { code: 'ALFABETICO_INICIAL', label: 'Alfabético inicial', color: 'yellow' },
      { code: 'ALFABETICO_COMPLETO', label: 'Alfabético completo', color: 'green' },
    ],
  },
];

const MATHEMATICS_SKILLS = [
  {
    code: 'PROFICIENCIA_MATEMATICA',
    label: 'Proficiência em Matemática',
    levels: [
      { code: 'NAO_PROFICIENTE', label: 'Não proficiente — até 4 pontos', color: 'red' },
      { code: 'PROFICIENTE_INICIAL', label: 'Proficiente inicial — 5 a 6 pontos', color: 'yellow' },
      { code: 'PROFICIENTE', label: 'Proficiente — 7 a 10 pontos', color: 'green' },
    ],
  },
];

const A0_FIRST_GRADE_SKILLS = [
  ['COORDENACAO_MOTORA', 'Coordenação motora'],
  ['CONSCIENCIA_FONOLOGICA_ALITERACAO', 'Consciência fonológica — Aliteração'],
  ['CONSCIENCIA_FONOLOGICA_SILABAS', 'Consciência fonológica — Sílabas'],
  ['CONSCIENCIA_FONOLOGICA_RIMAS', 'Consciência fonológica — Rimas'],
  ['PRINCIPIO_ALFABETICO', 'Princípio alfabético'],
  ['COMPREENSAO_ORAL', 'Compreensão oral'],
  ['ORALIDADE', 'Oralidade'],
].map(([code, label]) => ({ code, label, levels: DEVELOPMENT_LEVELS }));

const A0_SECOND_GRADE_SKILLS = [
  ['PRINCIPIO_ALFABETICO', 'Princípio alfabético'],
  ['DECODIFICACAO', 'Decodificação'],
  ['GRAFIA_LETRAS_MINUSCULAS', 'Grafia de letras minúsculas'],
  ['CODIFICACAO', 'Codificação'],
].map(([code, label]) => ({ code, label, levels: DEVELOPMENT_LEVELS }));

export const PACTO_CONFIG = Object.freeze({
  programCode: PACTO_PROGRAM_CODE,
  year: PACTO_PROGRAM_YEAR,
  grades: [
    { value: 1, label: '1º ano' },
    { value: 2, label: '2º ano' },
  ],
  shifts: [
    { value: 'M', label: 'M' },
    { value: 'T', label: 'T' },
  ],
  assessments: ASSESSMENT_CODES.map((code) => ({ code, label: `Avaliação ${code}` })),
});

export function getAssessmentDefinition(grade, code) {
  const numericGrade = Number(grade);
  if (![1, 2].includes(numericGrade) || !ASSESSMENT_CODES.includes(code)) return null;
  if (code === 'A0') {
    return {
      code,
      label: `Avaliação A0 — ${numericGrade}º ano`,
      components: [
        {
          code: 'INICIAL',
          label: 'Habilidades iniciais',
          skills: numericGrade === 1 ? A0_FIRST_GRADE_SKILLS : A0_SECOND_GRADE_SKILLS,
        },
      ],
    };
  }
  return {
    code,
    label: `Avaliação ${code} — ${numericGrade}º ano`,
    components: [
      { code: 'PORTUGUES', label: 'Língua Portuguesa', skills: PORTUGUESE_SKILLS },
      { code: 'MATEMATICA', label: 'Matemática', skills: MATHEMATICS_SKILLS },
    ],
  };
}

export function listDefinitionsForGrade(grade) {
  return ASSESSMENT_CODES.map((code) => getAssessmentDefinition(grade, code));
}
