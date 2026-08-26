/** Períodos canônicos, em ordem cronológica dentro do ano. */
export const PERIODS = [
  '1º Bimestre',
  '2º Bimestre',
  '3º Bimestre',
  '4º Bimestre',
  '1º Semestre',
  '2º Semestre',
  'Anual',
];

export function periodOrder(period) {
  const i = PERIODS.indexOf(period);
  return i === -1 ? 99 : i;
}

/**
 * Classificação a partir do percentual de atingimento da meta.
 * A: atingiu/excedeu · B: quase · C: regular · D: baixo · E: crítico
 */
export const CLASSIFICATIONS = [
  { key: 'A', label: 'Excelente', min: 100, color: '#16a34a' },
  { key: 'B', label: 'Bom', min: 80, color: '#65a30d' },
  { key: 'C', label: 'Regular', min: 60, color: '#d97706' },
  { key: 'D', label: 'Baixo', min: 40, color: '#ea580c' },
  { key: 'E', label: 'Crítico', min: -Infinity, color: '#dc2626' },
];

export function classify(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
  return CLASSIFICATIONS.find((c) => pct >= c.min)?.key || 'E';
}

export function classificationLabel(key) {
  return CLASSIFICATIONS.find((c) => c.key === key)?.label || key;
}

/** Limita o percentual de atingimento para evitar distorções extremas. */
export const ATTAINMENT_CAP = 200;

export const ENTITY_LABELS = {
  User: 'Usuário',
  Role: 'Perfil',
  School: 'Escola',
  Program: 'Programa',
  Indicator: 'Indicador',
  IndicatorCategory: 'Categoria',
  Result: 'Resultado',
  Goal: 'Meta',
  Evaluation: 'Avaliação',
  ImportJob: 'Importação',
  Document: 'Documento',
};

export const IMPORT_ROW_STATUS = {
  NOVO: 'NOVO',
  ATUALIZAR: 'ATUALIZAR',
  DUPLICADO: 'DUPLICADO',
  ERRO: 'ERRO',
};
