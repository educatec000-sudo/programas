/**
 * Configurações e definições oficiais do programa
 * Compromisso Nacional Criança Alfabetizada (CNCA).
 *
 * O CNCA opera exclusivamente no nível consolidado por ESCOLA,
 * abrangendo quatro componentes oficiais:
 * 1. Escrita
 * 2. Leitura
 * 3. Matemática
 * 4. Fluência
 */

export const CNCA_CATALOG_CODE = 'CNCA';
export const CNCA_PROGRAM_NAME = 'Compromisso Nacional Criança Alfabetizada';

export const CNCA_COMPONENTS = {
  MATEMATICA: {
    code: 'MATEMATICA',
    label: 'Matemática',
    shortLabel: 'Matemática',
    icon: '📐',
    color: '#0284c7',
    aliases: ['matematica', 'matemática', 'mat', 'raciocinio', 'raciocínio', 'matematica e suas tecnologias'],
    defaultPrimaryMetric: 'averageScore',
    primaryMetricLabel: 'Proficiência Média',
    primaryMetricUnit: 'pontos',
    officialLevels: [
      { id: 'ABAIXO_DO_BASICO', label: 'Abaixo do Básico', color: '#ef4444' },
      { id: 'BASICO', label: 'Básico', color: '#f59e0b' },
      { id: 'ADEQUADO', label: 'Adequado', color: '#10b981' },
      { id: 'AVANCADO', label: 'Avançado', color: '#059669' },
    ],
    rankingIndicators: [
      { id: 'MATEMATICA_PROFICIENCIA', label: 'Proficiência Média (Matemática)', field: 'averageScore', unit: 'pontos' },
      { id: 'MATEMATICA_ADEQUADO', label: '% Adequado + Avançado (Matemática)', field: 'adequatePlusAdvanced', unit: '%' },
      { id: 'MATEMATICA_PARTICIPACAO', label: 'Taxa de Participação (Matemática)', field: 'participationRate', unit: '%' },
    ],
  },
  LEITURA: {
    code: 'LEITURA',
    label: 'Leitura',
    shortLabel: 'Leitura',
    icon: '📖',
    color: '#6366f1',
    aliases: [
      'leitura',
      'compreensao leitora',
      'compreensão leitora',
      'lingua portuguesa - leitura',
      'lp - leitura',
      'lp leitura',
      'lingua portuguesa',
      'língua portuguesa',
      'lingua_portuguesa',
      'portugues',
      'português',
      'lp',
    ],
    defaultPrimaryMetric: 'averageScore',
    primaryMetricLabel: 'Proficiência Média',
    primaryMetricUnit: 'pontos',
    officialLevels: [
      { id: 'ABAIXO_DO_BASICO', label: 'Abaixo do Básico', color: '#ef4444' },
      { id: 'BASICO', label: 'Básico', color: '#f59e0b' },
      { id: 'ADEQUADO', label: 'Adequado', color: '#10b981' },
      { id: 'AVANCADO', label: 'Avançado', color: '#059669' },
    ],
    rankingIndicators: [
      { id: 'LEITURA_PROFICIENCIA', label: 'Proficiência Média (Leitura)', field: 'averageScore', unit: 'pontos' },
      { id: 'LEITURA_ADEQUADO', label: '% Adequado + Avançado (Leitura)', field: 'adequatePlusAdvanced', unit: '%' },
      { id: 'LEITURA_PARTICIPACAO', label: 'Taxa de Participação (Leitura)', field: 'participationRate', unit: '%' },
    ],
  },
  ESCRITA: {
    code: 'ESCRITA',
    label: 'Escrita',
    shortLabel: 'Escrita',
    icon: '✍️',
    color: '#8b5cf6',
    aliases: [
      'escrita',
      'producao textual',
      'produção textual',
      'lingua portuguesa - escrita',
      'lp - escrita',
      'lp escrita',
      'documento_download_escola',
      'documento download escola',
      'aspecto',
      'redacao',
      'redação',
      'producao',
      'produção',
    ],
    defaultPrimaryMetric: 'fluentRate', // % Alfabético / Alfabetizado
    primaryMetricLabel: '% Alfabético',
    primaryMetricUnit: '%',
    officialLevels: [
      { id: 'PRE_SILABICO', label: 'Pré-silábico', color: '#ef4444', aliases: ['pré-silábico', 'pre-silabico', 'pre silabico', 'abaixo do basico', 'abaixo do básico', 'inadequado', 'muito baixo'] },
      { id: 'SILABICO', label: 'Silábico', color: '#f59e0b', aliases: ['silábico', 'silabico', 'basico', 'básico', 'baixo'] },
      { id: 'SILABICO_ALFABETICO', label: 'Silábico-Alfabético', color: '#3b82f6', aliases: ['silábico-alfabético', 'silabico-alfabetico', 'silabico alfabetico', 'adequado', 'medio', 'médio'] },
      { id: 'ALFABETICO', label: 'Alfabético', color: '#10b981', aliases: ['alfabético', 'alfabetico', 'ortografico', 'ortográfico', 'avancado', 'avançado', 'alto'] },
    ],
    rankingIndicators: [
      { id: 'ESCRITA_ALFABETICO', label: '% Nível Alfabético (Escrita)', field: 'fluentRate', unit: '%' },
      { id: 'ESCRITA_PROFICIENCIA', label: 'Proficiência Média (Escrita)', field: 'averageScore', unit: 'pontos' },
      { id: 'ESCRITA_PARTICIPACAO', label: 'Taxa de Participação (Escrita)', field: 'participationRate', unit: '%' },
    ],
  },
  FLUENCIA: {
    code: 'FLUENCIA',
    label: 'Fluência em Leitura',
    shortLabel: 'Fluência',
    icon: '🗣️',
    color: '#0ea5e9',
    aliases: ['fluencia', 'fluência', 'fluencia em leitura', 'fluência em leitura', 'leitor', 'leitura em voz alta', 'fluência leitora'],
    defaultPrimaryMetric: 'fluentRate',
    primaryMetricLabel: '% Leitores Fluentes',
    primaryMetricUnit: '%',
    officialLevels: [
      { id: 'PRE_LEITOR', label: 'Pré-leitor', color: '#ef4444', aliases: ['pré-leitor', 'pre-leitor', 'pre leitor', 'não leitor', 'nao leitor'] },
      { id: 'LEITOR_INICIANTE', label: 'Leitor Iniciante', color: '#f59e0b', aliases: ['leitor iniciante', 'iniciante', 'leitor de palavras', 'leitor de silabas', 'leitor de sílabas'] },
      { id: 'LEITOR_FLUENTE', label: 'Leitor Fluente', color: '#10b981', aliases: ['leitor fluente', 'fluente', 'leitor de texto fluente', 'leitor com fluência'] },
    ],
    rankingIndicators: [
      { id: 'FLUENCIA_FLUENTES', label: '% Alunos Fluentes (MEC/CNCA)', field: 'fluentRate', unit: '%' },
      { id: 'FLUENCIA_PCPM', label: 'PCPM Médio (Palavras Corretas / Minuto)', field: 'pcpm', unit: 'ppm' },
      { id: 'FLUENCIA_PRECISAO', label: 'Taxa de Precisão Leitora (%)', field: 'accuracyRate', unit: '%' },
      { id: 'FLUENCIA_PARTICIPACAO', label: 'Taxa de Participação (Fluência)', field: 'participationRate', unit: '%' },
    ],
  },
};

export const CNCA_RANKING_INDICATORS = [
  { id: 'FLUENCIA_FLUENTES', label: '🗣️ Fluência · % Alunos Fluentes', component: 'FLUENCIA', field: 'fluentRate', unit: '%' },
  { id: 'FLUENCIA_PCPM', label: '🗣️ Fluência · PCPM Médio (Palavras/min)', component: 'FLUENCIA', field: 'pcpm', unit: 'ppm' },
  { id: 'MATEMATICA_PROFICIENCIA', label: '📐 Matemática · Proficiência Média', component: 'MATEMATICA', field: 'averageScore', unit: 'pts' },
  { id: 'MATEMATICA_ADEQUADO', label: '📐 Matemática · % Adequado + Avançado', component: 'MATEMATICA', field: 'adequatePlusAdvanced', unit: '%' },
  { id: 'LEITURA_PROFICIENCIA', label: '📖 Leitura · Proficiência Média', component: 'LEITURA', field: 'averageScore', unit: 'pts' },
  { id: 'LEITURA_ADEQUADO', label: '📖 Leitura · % Adequado + Avançado', component: 'LEITURA', field: 'adequatePlusAdvanced', unit: '%' },
  { id: 'ESCRITA_ALFABETICO', label: '✍️ Escrita · % Nível Alfabético', component: 'ESCRITA', field: 'fluentRate', unit: '%' },
  { id: 'ESCRITA_PROFICIENCIA', label: '✍️ Escrita · Proficiência Média', component: 'ESCRITA', field: 'averageScore', unit: 'pts' },
  { id: 'GERAL_PROFICIENCIA', label: '🌐 Média Geral dos Componentes', component: 'GERAL', field: 'compositeScore', unit: 'pts' },
  { id: 'PARTICIPACAO', label: '👥 Taxa de Participação Geral', component: 'GERAL', field: 'participationRate', unit: '%' },
];

export function normalizeCncaText(val) {
  return String(val || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function detectComponent(hint) {
  const norm = normalizeCncaText(hint);
  if (!norm) return null;

  // Ordena todos os aliases pelo tamanho decrescente para priorizar termos mais específicos
  const allAliases = [];
  for (const [key, comp] of Object.entries(CNCA_COMPONENTS)) {
    for (const alias of comp.aliases) {
      allAliases.push({ key, aliasNorm: normalizeCncaText(alias) });
    }
  }
  allAliases.sort((a, b) => b.aliasNorm.length - a.aliasNorm.length);

  for (const item of allAliases) {
    if (norm.includes(item.aliasNorm)) {
      return item.key;
    }
  }
  return null;
}
