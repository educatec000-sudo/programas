import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { useApi } from '../../hooks/useApi.js';
import { cncaApi } from '../../services/resources.js';
import { Badge, Field, LoadingBlock, Select, Button, Input } from '../../components/ui.jsx';
import { fmt, fmtInt } from '../../utils/format.js';
import DataTable from '../../components/DataTable.jsx';

const COMPONENT_INFO = {
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

function getLevelColor(levelName = '') {
  const norm = levelName.toLowerCase();
  if (
    norm.includes('avançado') ||
    norm.includes('avancado') ||
    norm.includes('fluente') ||
    norm.includes('alfabético') ||
    norm.includes('alfabetico') ||
    norm === 'alto'
  ) {
    return { bg: '#16a34a', text: '#166534', badgeCls: 'badge-green', lightBg: '#f0fdf4' };
  }
  if (
    norm.includes('adequado') ||
    norm.includes('silábico-alfabético') ||
    norm.includes('silabico-alfabetico') ||
    norm === 'médio' ||
    norm === 'medio'
  ) {
    return { bg: '#0284c7', text: '#075985', badgeCls: 'badge-blue', lightBg: '#f0f9ff' };
  }
  if (
    norm.includes('básico') ||
    norm.includes('basico') ||
    norm.includes('iniciante') ||
    norm.includes('silábico') ||
    norm.includes('silabico') ||
    norm === 'baixo'
  ) {
    return { bg: '#d97706', text: '#92400e', badgeCls: 'badge-yellow', lightBg: '#fffbeb' };
  }
  if (
    norm.includes('abaixo') ||
    norm.includes('não leitor') ||
    norm.includes('nao leitor') ||
    norm.includes('pré-leitor') ||
    norm.includes('pre-leitor') ||
    norm.includes('pré-silábico') ||
    norm.includes('pre-silabico') ||
    norm.includes('defasagem') ||
    norm.includes('inadequado') ||
    norm.includes('muito baixo')
  ) {
    return { bg: '#dc2626', text: '#991b1b', badgeCls: 'badge-red', lightBg: '#fef2f2' };
  }
  return { bg: '#64748b', text: '#334155', badgeCls: 'badge-gray', lightBg: '#f8fafc' };
}

export default function CncaAnalises({ program }) {
  const [component, setComponent] = useState('TODOS');
  const [grade, setGrade] = useState('TODOS');
  const [assessment, setAssessment] = useState('TODOS');
  const [chartComponent, setChartComponent] = useState('MATEMATICA');
  const [showAllSkills, setShowAllSkills] = useState(false);

  const { data: filtersData } = useApi(() => cncaApi.filters(program.id), [program.id]);

  const activeFilters = useMemo(
    () => ({
      year: program.year,
      component,
      grade,
      assessment,
    }),
    [program.year, component, grade, assessment],
  );

  const { data: dashboard, loading } = useApi(
    () => cncaApi.dashboard(program.id, activeFilters),
    [program.id, activeFilters],
  );

  const skillsPerformance = dashboard?.skillsPerformance || [];
  const criticalSkills = dashboard?.criticalSkills || [];
  const levelsByComponent = dashboard?.levelsByComponent || {};
  const levelsDistribution = dashboard?.levelsDistribution || [];

  const displayedSkills = showAllSkills ? skillsPerformance : skillsPerformance.slice(0, 8);

  const activeLevels = useMemo(() => {
    const targetComp = component !== 'TODOS' ? component : chartComponent;
    if (levelsByComponent && levelsByComponent[targetComp] && levelsByComponent[targetComp].length > 0) {
      return levelsByComponent[targetComp];
    }
    if (levelsDistribution.length > 0) {
      const filtered = levelsDistribution.filter((l) => l.component === targetComp);
      if (filtered.length > 0) return filtered;
      if (component !== 'TODOS') return levelsDistribution;
    }
    return [];
  }, [component, chartComponent, levelsByComponent, levelsDistribution]);

  if (loading && !dashboard) {
    return <LoadingBlock label="Carregando análises detalhadas do CNCA..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Barra de Filtros */}
      <div className="card card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', background: '#f8fafc' }}>
        <Field label="Ano Escolar / Etapa" style={{ minWidth: 180 }}>
          <Select value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="TODOS">Todas as etapas</option>
            {(filtersData?.grades || ['1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano']).map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </Select>
        </Field>

        <Field label="Avaliação" style={{ minWidth: 180 }}>
          <Select value={assessment} onChange={(e) => setAssessment(e.target.value)}>
            <option value="TODOS">Todas as avaliações</option>
            {(filtersData?.assessments || ['Diagnóstica', 'Formativa 1', 'Formativa 2', 'Somativa']).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </Field>

        <Field label="Componente" style={{ minWidth: 200 }}>
          <Select value={component} onChange={(e) => setComponent(e.target.value)}>
            <option value="TODOS">Todos os componentes</option>
            {Object.entries(COMPONENT_INFO).map(([k, info]) => (
              <option key={k} value={k}>{info.icon} {info.label}</option>
            ))}
          </Select>
        </Field>

        <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setGrade('TODOS'); setAssessment('TODOS'); setComponent('TODOS'); }}
          >
            Limpar filtros
          </Button>
        </div>
      </div>

      {/* 1. DISTRIBUIÇÃO POR NÍVEIS DE DESEMPENHO */}
      <div className="card card-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <div className="card-title">Distribuição Detalhada por Padrões / Níveis de Desempenho</div>
            <div className="card-subtitle">Visualização da proporção de estudantes em cada estágio de desenvolvimento.</div>
          </div>

          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 3, gap: 4 }}>
            {Object.entries(COMPONENT_INFO).map(([k, info]) => {
              const isSelected = (component !== 'TODOS' ? component : chartComponent) === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (component !== 'TODOS') setComponent(k);
                    else setChartComponent(k);
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: isSelected ? '#fff' : 'transparent',
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? info.color : 'var(--text-2)',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  {info.icon} {info.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        {activeLevels.length > 0 ? (
          <div style={{ width: '100%', height: Math.max(180, activeLevels.length * 44 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={activeLevels} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis type="category" dataKey="level" tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} width={160} axisLine={false} />
                <Tooltip formatter={(v) => [`${fmt(v, 1)}%`, 'Percentual']} />
                <Bar dataKey="percentage" radius={[0, 6, 6, 0]} maxBarSize={24}>
                  {activeLevels.map((entry, index) => {
                    const styling = getLevelColor(entry.level);
                    return <Cell key={`cell-${index}`} fill={styling.bg} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
            Nenhum nível com dados disponível para o filtro selecionado.
          </div>
        )}
      </div>

      {/* 2. PONTOS DE ATENÇÃO PRIORITÁRIA */}
      {criticalSkills.length > 0 && (
        <div className="card card-pad" style={{ background: '#fffafa', borderColor: '#fecaca' }}>
          <div className="card-header-row" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <div className="card-title" style={{ color: '#991b1b', margin: 0 }}>
                  Pontos de Atenção Pedagógica ({criticalSkills.length} habilidades &lt; 50%)
                </div>
                <div className="card-subtitle" style={{ margin: 0 }}>
                  Habilidades com percentual de acerto crítico que demandam reforço escolar.
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {criticalSkills.map((sk) => (
              <div key={sk.code} style={{ background: '#fff', border: '1px solid #fecaca', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13, color: '#991b1b' }}>{sk.code}</strong>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#dc2626' }}>{fmt(sk.percentage, 1)}%</span>
                </div>
                {sk.name && sk.name !== sk.code && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>{sk.name}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. MATRIZ COMPLETA DE HABILIDADES */}
      {skillsPerformance.length > 0 && (
        <div className="card card-pad">
          <div className="card-header-row" style={{ marginBottom: 14 }}>
            <div>
              <div className="card-title">Habilidades e Descritores da Matriz Oficial</div>
              <div className="card-subtitle">Percentual médio de acertos obtido em cada habilidade avaliada.</div>
            </div>
            {skillsPerformance.length > 8 && (
              <Button variant="secondary" size="sm" onClick={() => setShowAllSkills(!showAllSkills)}>
                {showAllSkills ? 'Recolher' : `Exibir todas (${skillsPerformance.length})`}
              </Button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayedSkills.map((sk) => {
              const isCrit = sk.percentage < 50;
              const barColor = isCrit ? '#dc2626' : sk.percentage >= 70 ? '#16a34a' : '#0284c7';
              return (
                <div key={sk.code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border)', gap: 16 }}>
                  <div style={{ minWidth: 260, flex: 1 }}>
                    <strong style={{ fontSize: 13, color: isCrit ? '#991b1b' : 'var(--text-1)' }}>{sk.code}</strong>
                    {sk.name && sk.name !== sk.code && <span style={{ fontSize: 12.5, color: 'var(--text-2)', marginLeft: 8 }}>· {sk.name}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 200, flex: 1 }}>
                    <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, Math.max(0, sk.percentage))}%`, height: '100%', background: barColor, borderRadius: 999 }} />
                    </div>
                    <strong style={{ fontSize: 13.5, color: barColor, width: 50, textAlign: 'right' }}>{fmt(sk.percentage, 1)}%</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
