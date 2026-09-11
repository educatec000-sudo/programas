/**
 * Configurações e definições oficiais do programa
 * PARC — Parceria pela Alfabetização em Regime de Colaboração.
 *
 * O PARC avalia a Fluência Leitora no 2º Ano do Ensino Fundamental
 * em dois ciclos anuais:
 * - Ciclo de Entrada (avaliação diagnóstica inicial)
 * - Ciclo de Saída (avaliação final de evolução)
 */

export const PARC_CATALOG_CODE = 'PARC';
export const PARC_PROGRAM_NAME = 'Parceria pela Alfabetização em Regime de Colaboração';
export const PARC_DEFAULT_YEAR = 2026;
export const PARC_DEFAULT_GRADE = '2º Ano';
export const PARC_ASSESSMENT_NAME = 'Fluência Leitora';

export const PARC_CYCLES = {
  ENTRADA: {
    code: 'ENTRADA',
    label: 'Ciclo de Entrada',
    shortLabel: 'Entrada',
    description: 'Avaliação inicial de Fluência Leitora no início do ano letivo',
    badgeClass: 'badge-blue',
    icon: '📥',
  },
  SAIDA: {
    code: 'SAIDA',
    label: 'Ciclo de Saída',
    shortLabel: 'Saída',
    description: 'Avaliação final de Fluência Leitora para medição de evolução',
    badgeClass: 'badge-green',
    icon: '📤',
  },
};

export const PARC_FLUENCY_LEVELS = [
  {
    id: 'PRE_LEITOR_TOTAL',
    label: 'Pré-leitor (Total)',
    field: 'preReaderTotal',
    color: '#ef4444',
    description: 'Alunos que ainda não consolidaram o processo de decodificação de palavras ou frases.',
  },
  {
    id: 'PRE_LEITOR_N1',
    label: 'Pré-leitor (Nível 1)',
    field: 'preReaderLevel1',
    color: '#f87171',
    description: 'Não lê palavras ou pseudopalavras.',
  },
  {
    id: 'PRE_LEITOR_N2',
    label: 'Pré-leitor (Nível 2)',
    field: 'preReaderLevel2',
    color: '#fb923c',
    description: 'Lê poucas sílabas ou palavras isoladas muito simples.',
  },
  {
    id: 'PRE_LEITOR_N3',
    label: 'Pré-leitor (Nível 3)',
    field: 'preReaderLevel3',
    color: '#fbbf24',
    description: 'Lê palavras com lentidão e hesitação acentuada.',
  },
  {
    id: 'PRE_LEITOR_N4',
    label: 'Pré-leitor (Nível 4)',
    field: 'preReaderLevel4',
    color: '#a3e635',
    description: 'Decodifica frases simples, aproximando-se do perfil iniciante.',
  },
  {
    id: 'LEITOR_INICIANTE',
    label: 'Leitor Iniciante',
    field: 'beginnerReader',
    color: '#3b82f6',
    description: 'Lê palavras e frases com relativa precisão, em transição para a leitura autônoma.',
  },
  {
    id: 'LEITOR_FLUENTE',
    label: 'Leitor Fluente',
    field: 'fluentReader',
    color: '#10b981',
    description: 'Lê com precisão, velocidade adequada e prosódia apropriada ao 2º ano.',
  },
];

export const PARC_RANKING_INDICATORS = [
  {
    id: 'FLUENTE',
    label: '🗣️ % Leitor Fluente',
    field: 'fluentReader',
    unit: '%',
    polarity: 'MAIOR_MELHOR',
    description: 'Percentual de alunos classificados no nível Leitor Fluente',
  },
  {
    id: 'INICIANTE_MAIS_FLUENTE',
    label: '📖 % Leitor Iniciante + Fluente',
    field: 'beginnerPlusFluent',
    unit: '%',
    polarity: 'MAIOR_MELHOR',
    description: 'Soma dos alunos leitores (iniciantes e fluentes)',
  },
  {
    id: 'MENOR_PRE_LEITOR',
    label: '📉 Menor % Pré-leitor (Total)',
    field: 'preReaderTotal',
    unit: '%',
    polarity: 'MENOR_MELHOR',
    description: 'Menor taxa de alunos classificados como Pré-leitor',
  },
  {
    id: 'PARTICIPACAO',
    label: '👥 Taxa de Participação',
    field: 'participationRate',
    unit: '%',
    polarity: 'MAIOR_MELHOR',
    description: 'Percentual de alunos previstos que foram efetivamente avaliados',
  },
];

export const PARC_EVOLUTION_INDICATORS = [
  {
    id: 'DELTA_FLUENTE',
    label: '🚀 Ganho em Leitores Fluentes (Saída - Entrada)',
    field: 'deltaFluent',
    unit: 'p.p.',
    polarity: 'MAIOR_MELHOR',
    description: 'Crescimento percentual de alunos no perfil fluente',
  },
  {
    id: 'DELTA_REDUCAO_PRE_LEITOR',
    label: '🎯 Redução de Pré-leitores (Entrada - Saída)',
    field: 'deltaPreReaderReduction',
    unit: 'p.p.',
    polarity: 'MAIOR_MELHOR',
    description: 'Queda na proporção de alunos no perfil pré-leitor',
  },
  {
    id: 'DELTA_INICIANTE_FLUENTE',
    label: '📈 Ganho de Leitores (Iniciante + Fluente)',
    field: 'deltaBeginnerPlusFluent',
    unit: 'p.p.',
    polarity: 'MAIOR_MELHOR',
    description: 'Evolução agregada de leitores',
  },
];

export function normalizeParcText(val) {
  return String(val || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function detectParcCycle(text) {
  const norm = normalizeParcText(text);
  if (!norm) return 'ENTRADA';
  if (norm.includes('saida') || norm.includes('saída') || norm.includes('final') || norm.includes('pos') || norm.includes('pós') || norm.includes('2 ciclo') || norm.includes('2º ciclo') || norm.includes('2o ciclo')) {
    return 'SAIDA';
  }
  if (norm.includes('entrada') || norm.includes('diagnostica') || norm.includes('diagnóstica') || norm.includes('inicial') || norm.includes('1 ciclo') || norm.includes('1º ciclo') || norm.includes('1o ciclo')) {
    return 'ENTRADA';
  }
  return 'ENTRADA';
}
