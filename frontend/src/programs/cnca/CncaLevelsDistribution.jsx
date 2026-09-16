import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';
import { fmt, fmtInt } from '../../utils/format.js';

export const COMPONENT_INFO = {
  MATEMATICA: {
    label: 'Matemática',
    shortLabel: 'Matemática',
    icon: '📐',
    color: '#0284c7',
    bg: '#f0f9ff',
    border: '#bae6fd',
    badgeCls: 'badge-blue',
  },
  LEITURA: {
    label: 'Leitura',
    shortLabel: 'Leitura',
    icon: '📖',
    color: '#6366f1',
    bg: '#eef2ff',
    border: '#c7d2fe',
    badgeCls: 'badge-indigo',
  },
  ESCRITA: {
    label: 'Escrita',
    shortLabel: 'Escrita',
    icon: '✍️',
    color: '#8b5cf6',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    badgeCls: 'badge-purple',
  },
  FLUENCIA: {
    label: 'Fluência em Leitura',
    shortLabel: 'Fluência',
    icon: '🗣️',
    color: '#0ea5e9',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    badgeCls: 'badge-cyan',
  },
};

/**
 * Retorna as configurações visuais de cor, fundo e borda para cada nível/padrão oficial de desempenho.
 */
export function getLevelColor(levelName = '') {
  const norm = String(levelName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // 6. Avançado / Fluente / Alfabético / Ortográfico / Excelente / Muito Alto / Alto
  if (
    norm.includes('avancado') ||
    norm.includes('fluente') ||
    norm.includes('alfabetico') ||
    norm.includes('ortografico') ||
    norm.includes('excelente') ||
    norm === 'alto' ||
    norm.includes('muito alto')
  ) {
    return { bg: '#059669', text: '#065f46', badgeCls: 'badge-green', lightBg: '#ecfdf5', border: '#a7f3d0' };
  }

  // 5. Satisfatório / Adequado / Proficiente
  if (
    (norm.includes('satisfatorio') && !norm.includes('insatisfatorio')) ||
    norm.includes('adequado') ||
    norm.includes('proficiente')
  ) {
    return { bg: '#16a34a', text: '#166534', badgeCls: 'badge-green', lightBg: '#f0fdf4', border: '#bbf7d0' };
  }

  // 4. Intermediário / Silábico-Alfabético / Médio
  if (
    norm.includes('intermediario') ||
    norm.includes('silabico-alfabetico') ||
    norm === 'medio'
  ) {
    return { bg: '#0284c7', text: '#075985', badgeCls: 'badge-blue', lightBg: '#f0f9ff', border: '#bae6fd' };
  }

  // 3. Insatisfatório / Básico / Silábico / Iniciante / Baixo
  if (
    norm.includes('insatisfatorio') ||
    norm.includes('basico') ||
    norm.includes('iniciante') ||
    norm.includes('silabico') ||
    norm === 'baixo'
  ) {
    return { bg: '#d97706', text: '#92400e', badgeCls: 'badge-yellow', lightBg: '#fffbeb', border: '#fde68a' };
  }

  // 2. Insuficiente / Crítico
  if (
    norm.includes('insuficiente') ||
    norm.includes('critico')
  ) {
    return { bg: '#ea580c', text: '#9a3412', badgeCls: 'badge-yellow', lightBg: '#fff7ed', border: '#fed7aa' };
  }

  // 1. Inadequado / Muito Crítico / Muito Baixo / Abaixo do Básico / Não Leitor / Pré-leitor / Pré-silábico / Defasagem
  if (
    norm.includes('inadequado') ||
    norm.includes('abaixo') ||
    norm.includes('nao leitor') ||
    norm.includes('pre-leitor') ||
    norm.includes('pre-silabico') ||
    norm.includes('defasagem') ||
    norm.includes('muito baixo') ||
    norm.includes('muito critico')
  ) {
    return { bg: '#dc2626', text: '#991b1b', badgeCls: 'badge-red', lightBg: '#fef2f2', border: '#fecaca' };
  }

  return { bg: '#64748b', text: '#334155', badgeCls: 'badge-gray', lightBg: '#f8fafc', border: '#e2e8f0' };
}

/**
 * Retorna a ordem pedagógica padrão de um nível de desempenho (1 = mais crítico a 6 = mais avançado).
 */
export function getLevelRank(levelName = '') {
  const norm = String(levelName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (
    norm.includes('inadequado') ||
    norm.includes('muito critico') ||
    norm.includes('muito baixo') ||
    norm.includes('abaixo') ||
    norm.includes('nao leitor') ||
    norm.includes('pre-leitor') ||
    norm.includes('pre-silabico') ||
    norm.includes('defasagem')
  ) {
    return 1;
  }
  if (norm.includes('insuficiente') || norm.includes('critico')) {
    return 2;
  }
  if (
    norm.includes('insatisfatorio') ||
    norm.includes('basico') ||
    norm.includes('iniciante') ||
    norm.includes('silabico') ||
    norm === 'baixo'
  ) {
    return 3;
  }
  if (
    norm.includes('intermediario') ||
    norm.includes('silabico-alfabetico') ||
    norm === 'medio'
  ) {
    return 4;
  }
  if (
    (norm.includes('satisfatorio') && !norm.includes('insatisfatorio')) ||
    norm.includes('adequado') ||
    norm.includes('proficiente')
  ) {
    return 5;
  }
  if (
    norm.includes('avancado') ||
    norm.includes('fluente') ||
    norm.includes('alfabetico') ||
    norm.includes('ortografico') ||
    norm.includes('excelente') ||
    norm === 'alto' ||
    norm.includes('muito alto')
  ) {
    return 6;
  }
  return 10;
}

/**
 * Seleciona os níveis do componente ativo (levelsByComponent tem prioridade sobre
 * levelsDistribution) e retorna a lista já ordenada pela ordem pedagógica.
 */
export function pickComponentLevels({ levelsByComponent, levelsDistribution = [], component, chartComponent }) {
  let list = [];
  const targetComp = component !== 'TODOS' ? component : chartComponent;
  if (levelsByComponent && levelsByComponent[targetComp] && levelsByComponent[targetComp].length > 0) {
    list = levelsByComponent[targetComp];
  } else if (levelsDistribution.length > 0) {
    const filtered = levelsDistribution.filter((l) => l.component === targetComp);
    if (filtered.length > 0) list = filtered;
    else list = levelsDistribution;
  }

  return [...list].sort((a, b) => getLevelRank(a.level) - getLevelRank(b.level));
}

/**
 * Agrega a distribuição de todos os componentes (usado quando o filtro geral
 * de componente está em "Todos"): soma contagens por nível e recalcula o %.
 */
export function aggregateLevels(levelsDistribution = []) {
  const map = new Map();
  for (const l of levelsDistribution) {
    if (!l || !l.level) continue;
    const cur = map.get(l.level) || { level: l.level, count: 0, pctSum: 0, n: 0 };
    if (l.count != null) cur.count += Number(l.count) || 0;
    if (l.percentage != null) {
      cur.pctSum += Number(l.percentage) || 0;
      cur.n += 1;
    }
    map.set(l.level, cur);
  }
  const total = Array.from(map.values()).reduce((acc, c) => acc + (c.count || 0), 0);
  return Array.from(map.values())
    .map((c) => ({
      level: c.level,
      count: c.count > 0 ? c.count : null,
      percentage:
        total > 0 && c.count > 0
          ? (c.count / total) * 100
          : c.n > 0
            ? c.pctSum / c.n
            : 0,
    }))
    .sort((a, b) => getLevelRank(a.level) - getLevelRank(b.level));
}

/**
 * Seção "Distribuição Detalhada por Padrões / Níveis de Desempenho".
 * Com `compact` reduz tipografia, cards e altura do gráfico para caber no dashboard.
 */
export default function CncaLevelsDistribution({
  levels = [],
  selectedComponent,
  onSelectComponent,
  compact = false,
  chartOnly = false,
}) {
  return (
    <div>
      <div
        style={
          compact || chartOnly
            ? { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }
            : { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }
        }
      >
        {compact || chartOnly ? (
          <div className="cnca-chart-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>Distribuição por Níveis de Desempenho</span>
          </div>
        ) : (
          <div>
            <div className="card-title">Distribuição Detalhada por Padrões / Níveis de Desempenho</div>
            <div className="card-subtitle">
              Visualização da proporção de estudantes em cada um dos estágios oficiais de desenvolvimento.
            </div>
          </div>
        )}

        {/* Abas de componente (Matemática / Leitura / Escrita / Fluência) */}
        {!chartOnly && (
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: compact ? 6 : 8, padding: compact ? 2 : 3, gap: compact ? 2 : 4 }}>
          {Object.entries(COMPONENT_INFO).map(([k, info]) => {
            const isSelected = selectedComponent === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => onSelectComponent && onSelectComponent(k)}
                style={{
                  padding: compact ? '3px 8px' : '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: isSelected ? '#fff' : 'transparent',
                  fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? info.color : 'var(--text-2)',
                  cursor: 'pointer',
                  fontSize: compact ? 10.5 : 12,
                  whiteSpace: 'nowrap',
                }}
              >
                {info.icon} {info.shortLabel}
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* Mini Cards dos Níveis / Padrões Detectados */}
      {!chartOnly && levels.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(${compact ? '96px' : levels.length >= 6 ? '150px' : '180px'}, 1fr))`,
            gap: compact ? 8 : 12,
            marginBottom: compact ? 12 : 20,
          }}
        >
          {levels.map((lvl, idx) => {
            const styling = getLevelColor(lvl.level);
            return (
              <div
                key={idx}
                style={{
                  padding: compact ? '7px 9px' : '12px 14px',
                  borderRadius: 8,
                  background: styling.lightBg,
                  border: `1px solid ${styling.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: compact ? 4 : 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: compact ? 10 : 12.5, fontWeight: 700, color: styling.text }}>
                    {lvl.level}
                  </span>
                  <strong style={{ fontSize: compact ? 12 : 16, color: styling.bg }}>
                    {fmt(lvl.percentage, 1)}%
                  </strong>
                </div>
                <div style={{ width: '100%', height: compact ? 4 : 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, lvl.percentage || 0))}%`,
                      height: '100%',
                      background: styling.bg,
                      borderRadius: 3,
                    }}
                  />
                </div>
                {lvl.count != null && (
                  <div style={{ fontSize: compact ? 9.5 : 11, color: styling.text, opacity: 0.85, textAlign: 'right' }}>
                    {fmtInt(lvl.count)} estudante(s)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Gráfico de Barras Horizontais com todos os níveis */}
      {levels.length > 0 ? (
        <div style={{ width: '100%', height: chartOnly ? Math.max(240, levels.length * 44 + 40) : compact ? Math.max(150, levels.length * 30 + 20) : Math.max(220, levels.length * 48 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={levels}
              margin={compact ? { top: 4, right: 12, left: 0, bottom: 0 } : chartOnly ? { top: 5, right: 46, left: 10, bottom: 0 } : { top: 10, right: 30, left: 30, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: compact ? 9.5 : 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} />
              <YAxis type="category" dataKey="level" tick={{ fontSize: compact ? 10 : chartOnly ? 12 : 12.5, fill: '#334155', fontWeight: 600 }} width={compact ? 110 : chartOnly ? 150 : 160} axisLine={false} />
              <Tooltip
                formatter={(v, name, props) => [
                  `${fmt(v, 1)}% ${props.payload?.count != null ? `(${fmtInt(props.payload.count)} alunos)` : ''}`,
                  'Distribuição',
                ]}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: compact ? 11 : undefined }}
              />
              <Bar dataKey="percentage" radius={[0, 6, 6, 0]} maxBarSize={compact ? 14 : chartOnly ? 18 : 26} isAnimationActive={false}>
                {levels.map((entry, index) => {
                  const styling = getLevelColor(entry.level);
                  return <Cell key={`cell-${index}`} fill={styling.bg} />;
                })}
                {(compact || chartOnly) && (
                  <LabelList
                    dataKey="percentage"
                    position="right"
                    formatter={(v) => `${fmt(v, 1)}%`}
                    style={{ fontSize: 9.5, fontWeight: 700, fill: '#475569' }}
                  />
                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: compact ? 16 : 30, color: 'var(--text-3)', fontSize: compact ? 12 : undefined }}>
          Nenhum nível com dados disponível para o filtro selecionado.
        </div>
      )}
    </div>
  );
}
