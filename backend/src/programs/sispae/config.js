/**
 * Configurações e definições oficiais do programa
 * SisPAE — Sistema Paraense de Avaliação Educacional.
 *
 * O SisPAE avalia os componentes curriculares da rede (Língua Portuguesa, Matemática, etc.)
 * através de aplicações estruturadas:
 * - SIMULADO (Aplicações preparatórias, ex: "Simulado Pará 2026 – Alfabetização")
 * - AVALIAÇÃO OFICIAL (Resultados oficiais do SisPAE, ex: "Avaliação SisPAE 2026")
 *
 * Cada aplicação possui resultados estritamente independentes.
 */

export const SISPAE_CATALOG_CODE = 'SISPAE';
export const SISPAE_PROGRAM_NAME = 'SisPAE — Sistema Paraense de Avaliação Educacional';
export const SISPAE_DEFAULT_YEAR = 2026;
export const SISPAE_DEFAULT_STAGE = 'Alfabetização';

export const SISPAE_APPLICATION_TYPES = {
  SIMULADO: {
    code: 'SIMULADO',
    label: 'Simulado Preparatório',
    shortLabel: 'Simulado',
    badgeClass: 'badge-amber',
    icon: '📝',
    description: 'Aplicação preparatória de acompanhamento diagnóstico ou formativo',
  },
  AVALIACAO_OFICIAL: {
    code: 'AVALIACAO_OFICIAL',
    label: 'Avaliação Oficial SisPAE',
    shortLabel: 'Oficial',
    badgeClass: 'badge-emerald',
    icon: '🏛️',
    description: 'Aplicação somativa oficial do Sistema Paraense de Avaliação Educacional',
  },
};

export const SISPAE_APPLICATION_STATUS = {
  PLANEJADA: {
    code: 'PLANEJADA',
    label: 'Planejada',
    badgeClass: 'badge-slate',
  },
  EM_ANDAMENTO: {
    code: 'EM_ANDAMENTO',
    label: 'Em Andamento',
    badgeClass: 'badge-blue',
  },
  CONCLUIDA: {
    code: 'CONCLUIDA',
    label: 'Concluída',
    badgeClass: 'badge-purple',
  },
  PUBLICADA: {
    code: 'PUBLICADA',
    label: 'Publicada',
    badgeClass: 'badge-emerald',
  },
};

export const SISPAE_COMPONENTS = {
  LINGUA_PORTUGUESA: {
    code: 'LINGUA_PORTUGUESA',
    label: 'Língua Portuguesa',
    shortLabel: 'Língua Portuguesa',
    icon: '📖',
    color: '#0284c7',
    aliases: [
      'lingua portuguesa',
      'língua portuguesa',
      'lingua_portuguesa',
      'portugues',
      'português',
      'lp',
      'leitura',
      'compreensao leitora',
      'compreensão leitora',
    ],
    defaultPrimaryMetric: 'averageScore',
    primaryMetricLabel: 'Proficiência Média',
    primaryMetricUnit: 'pontos',
    skillsPrefix: 'H',
  },
  MATEMATICA: {
    code: 'MATEMATICA',
    label: 'Matemática',
    shortLabel: 'Matemática',
    icon: '📐',
    color: '#8b5cf6',
    aliases: [
      'matematica',
      'matemática',
      'mat',
      'raciocinio',
      'raciocínio',
      'matematica e suas tecnologias',
    ],
    defaultPrimaryMetric: 'averageScore',
    primaryMetricLabel: 'Proficiência Média',
    primaryMetricUnit: 'pontos',
    skillsPrefix: 'H',
  },
  CIENCIAS_HUMANAS: {
    code: 'CIENCIAS_HUMANAS',
    label: 'Ciências Humanas',
    shortLabel: 'Humanas',
    icon: '🌍',
    color: '#f59e0b',
    aliases: ['ciencias humanas', 'ciências humanas', 'historia', 'geografia', 'ch'],
    defaultPrimaryMetric: 'averageScore',
    primaryMetricLabel: 'Proficiência Média',
    primaryMetricUnit: 'pontos',
    skillsPrefix: 'H',
  },
  CIENCIAS_NATUREZA: {
    code: 'CIENCIAS_NATUREZA',
    label: 'Ciências da Natureza',
    shortLabel: 'Natureza',
    icon: '🔬',
    color: '#10b981',
    aliases: ['ciencias da natureza', 'ciências da natureza', 'ciencias', 'ciências', 'cn'],
    defaultPrimaryMetric: 'averageScore',
    primaryMetricLabel: 'Proficiência Média',
    primaryMetricUnit: 'pontos',
    skillsPrefix: 'H',
  },
  PRODUCAO_TEXTUAL: {
    code: 'PRODUCAO_TEXTUAL',
    label: 'Produção Textual',
    shortLabel: 'Redação',
    icon: '✍️',
    color: '#ec4899',
    aliases: ['producao textual', 'produção textual', 'redacao', 'redação', 'escrita'],
    defaultPrimaryMetric: 'averageScore',
    primaryMetricLabel: 'Nota Média',
    primaryMetricUnit: 'pontos',
    skillsPrefix: 'A',
  },
  OUTRO: {
    code: 'OUTRO',
    label: 'Outro Componente',
    shortLabel: 'Outro',
    icon: '📚',
    color: '#64748b',
    aliases: ['outro', 'geral'],
    defaultPrimaryMetric: 'averageScore',
    primaryMetricLabel: 'Desempenho Médio',
    primaryMetricUnit: '%',
    skillsPrefix: 'H',
  },
};

export const SISPAE_PERFORMANCE_LEVELS = [
  {
    id: 'DEFASAGEM',
    label: 'Defasagem',
    color: '#ef4444',
    bgColor: '#fee2e2',
    textColor: '#991b1b',
    description: 'Alunos com defasagem acentuada de aprendizagem para a etapa.',
    aliases: [
      'defasagem',
      'inadequado',
      'muito critico',
      'muito crítico',
      'critico',
      'crítico',
      'muito baixo',
      'abaixo do basico',
      'abaixo do básico',
    ],
  },
  {
    id: 'INTERMEDIARIO',
    label: 'Aprendizado Intermediário',
    shortLabel: 'Intermediário',
    color: '#f59e0b',
    bgColor: '#fef3c7',
    textColor: '#92400e',
    description: 'Alunos em desenvolvimento parcial dos objetivos de aprendizagem.',
    aliases: [
      'aprendizado intermediario',
      'aprendizado intermediário',
      'intermediario',
      'intermediário',
      'medio',
      'médio',
      'insuficiente',
      'insatisfatorio',
      'insatisfatório',
      'basico',
      'básico',
    ],
  },
  {
    id: 'ADEQUADO',
    label: 'Aprendizado Adequado',
    shortLabel: 'Adequado',
    color: '#10b981',
    bgColor: '#d1fae5',
    textColor: '#065f46',
    description: 'Alunos com domínio satisfatório ou avançado das habilidades essenciais.',
    aliases: [
      'aprendizado adequado',
      'adequado',
      'satisfatorio',
      'satisfatório',
      'avancado',
      'avançado',
      'proficiente',
      'alto',
      'excelente',
    ],
  },
];

export const SISPAE_RANKING_INDICATORS = [
  {
    id: 'ADEQUADO',
    label: '🎯 % Aprendizado Adequado',
    field: 'adequateRate',
    unit: '%',
    polarity: 'MAIOR_MELHOR',
    description: 'Percentual de alunos no nível de aprendizado adequado ou proficiente',
  },
  {
    id: 'PROFICIENCIA',
    label: '📈 Proficiência Média',
    field: 'averageScore',
    unit: 'pontos',
    polarity: 'MAIOR_MELHOR',
    description: 'Nota ou proficiência média alcançada pelas escolas',
  },
  {
    id: 'PARTICIPACAO',
    label: '👥 Taxa de Participação',
    field: 'participationRate',
    unit: '%',
    polarity: 'MAIOR_MELHOR',
    description: 'Percentual de estudantes previstos que realizaram a avaliação',
  },
  {
    id: 'MENOR_DEFASAGEM',
    label: '📉 Menor % de Defasagem',
    field: 'deficitRate',
    unit: '%',
    polarity: 'MENOR_MELHOR',
    description: 'Escolas com menor proporção de alunos em defasagem',
  },
];

export function normalizeSispaeText(val) {
  return String(val || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function detectSispaeComponent(hint) {
  const norm = normalizeSispaeText(hint);
  if (!norm) return 'LINGUA_PORTUGUESA';

  // Ordena por tamanho do alias decrescente para máxima precisão
  const allAliases = [];
  for (const [key, comp] of Object.entries(SISPAE_COMPONENTS)) {
    for (const alias of comp.aliases) {
      allAliases.push({ key, aliasNorm: normalizeSispaeText(alias) });
    }
  }
  allAliases.sort((a, b) => b.aliasNorm.length - a.aliasNorm.length);

  for (const item of allAliases) {
    if (norm.includes(item.aliasNorm)) {
      return item.key;
    }
  }
  return 'LINGUA_PORTUGUESA';
}

export function detectSispaeApplicationType(hint) {
  const norm = normalizeSispaeText(hint);
  if (!norm) return 'SIMULADO';
  if (
    norm.includes('oficial') ||
    norm.includes('avaliacao sispae') ||
    norm.includes('avaliação sispae') ||
    norm.includes('somativa') ||
    norm.includes('censo') ||
    norm.includes('saida') ||
    norm.includes('saída')
  ) {
    return 'AVALIACAO_OFICIAL';
  }
  return 'SIMULADO';
}
