import React, { useState, useMemo, useEffect } from 'react';
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

// Tooltip personalizado e refinado para o gráfico de barras
const CustomLevelTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const colorInfo = getLevelColor(data.level);
    return (
      <div
        style={{
          background: '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '10px 14px',
          boxShadow: '0 4px 14px rgba(15,23,42,0.12)',
          fontSize: 12.5,
        }}
      >
        <div style={{ fontWeight: 700, color: 'var(--text-1)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorInfo.bg, display: 'inline-block' }} />
          {data.level}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: 'var(--text-2)', fontSize: 12 }}>
          <span>Percentual:</span>
          <strong style={{ color: colorInfo.text, fontSize: 13 }}>{fmt(data.percentage, 1)}%</strong>
        </div>
        {data.count > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: 'var(--text-3)', fontSize: 11.5, marginTop: 2 }}>
            <span>Estudantes:</span>
            <span>~{fmtInt(data.count)} alunos</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export default function CncaDashboard({ program }) {
  const [year, setYear] = useState('');
  const [component, setComponent] = useState('TODOS');
  const [grade, setGrade] = useState('TODOS');
  const [assessment, setAssessment] = useState('TODOS');
  const [schoolId, setSchoolId] = useState('TODAS');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [showAllSkills, setShowAllSkills] = useState(false);

  // Filtro direto no gráfico de níveis de desempenho
  const [chartComponent, setChartComponent] = useState('MATEMATICA');

  const { data: filtersData } = useApi(() => cncaApi.filters(program.id), [program.id]);

  const activeFilters = useMemo(
    () => ({
      year: year || program.year,
      component,
      grade,
      assessment,
      schoolId,
    }),
    [year, program.year, component, grade, assessment, schoolId],
  );

  const { data: dashboard, loading } = useApi(
    () => cncaApi.dashboard(program.id, activeFilters),
    [program.id, activeFilters],
  );

  const hasActiveFilters =
    (year && String(year) !== String(program.year)) ||
    component !== 'TODOS' ||
    grade !== 'TODOS' ||
    assessment !== 'TODOS' ||
    schoolId !== 'TODAS';

  const handleClearFilters = () => {
    setYear(program.year);
    setComponent('TODOS');
    setGrade('TODOS');
    setAssessment('TODOS');
    setSchoolId('TODAS');
  };

  const filteredSchools = useMemo(() => {
    if (!dashboard?.schoolSummaries) return [];
    if (!schoolSearch.trim()) return dashboard.schoolSummaries;
    const q = schoolSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return dashboard.schoolSummaries.filter((s) => {
      const name = (s.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const inep = String(s.inep || '');
      const dist = String(s.district || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return name.includes(q) || inep.includes(q) || dist.includes(q);
    });
  }, [dashboard?.schoolSummaries, schoolSearch]);

  const kpis = dashboard?.kpis || {};
  const componentSummaries = dashboard?.componentSummaries || [];
  const levelsDistribution = dashboard?.levelsDistribution || [];
  const levelsByComponent = dashboard?.levelsByComponent || {};
  const skillsPerformance = dashboard?.skillsPerformance || [];
  const criticalSkills = dashboard?.criticalSkills || [];

  const participatingCount =
    kpis.totalParticipatingSchools || filtersData?.totalParticipatingSchools || filtersData?.schools?.length || 0;
  const networkCount = kpis.totalNetworkSchools || filtersData?.totalNetworkSchools || 0;

  // Sincroniza o componente do gráfico quando o filtro geral de componente mudar
  useEffect(() => {
    if (component !== 'TODOS') {
      setChartComponent(component);
    } else {
      // Se estava em TODOS, escolhe o primeiro componente que possui níveis com dados
      const availableWithData = Object.keys(COMPONENT_INFO).find(
        (k) => (levelsByComponent[k] || []).length > 0,
      );
      if (availableWithData && chartComponent !== availableWithData) {
        setChartComponent(availableWithData);
      }
    }
  }, [component, levelsByComponent]);

  // Níveis ativos para o gráfico com base no filtro direto do gráfico
  const activeLevels = useMemo(() => {
    const targetComp = component !== 'TODOS' ? component : chartComponent;
    if (levelsByComponent && levelsByComponent[targetComp] && levelsByComponent[targetComp].length > 0) {
      return levelsByComponent[targetComp];
    }
    // Fallback: se houver levelsDistribution geral filtrado
    if (levelsDistribution.length > 0) {
      const filtered = levelsDistribution.filter((l) => l.component === targetComp);
      if (filtered.length > 0) return filtered;
      if (component !== 'TODOS') return levelsDistribution;
    }
    return [];
  }, [component, chartComponent, levelsByComponent, levelsDistribution]);

  // Habilidades a exibir (recolhido x expandido)
  const displayedSkills = showAllSkills ? skillsPerformance : skillsPerformance.slice(0, 6);

  // Soma dos percentuais para normalização da barra empilhada
  const activeLevelsSumPct = useMemo(() => {
    return activeLevels.reduce((acc, l) => acc + (l.percentage || 0), 0) || 100;
  }, [activeLevels]);

  if (loading && !dashboard) {
    return <LoadingBlock label="Carregando painel analítico do CNCA..." />;
  }

  const activeChartCompInfo = COMPONENT_INFO[component !== 'TODOS' ? component : chartComponent] || COMPONENT_INFO.MATEMATICA;

  return (
    <div className="cnca-overview-container">
      {/* 1. CABEÇALHO */}
      <div className="cnca-header-block">
        <div>
          <h1 className="cnca-header-title">CNCA — Visão Geral</h1>
          <div className="cnca-header-subtitle">
            Resultados da rede municipal • <strong>{activeFilters.year || program.year}</strong>
            {activeFilters.grade !== 'TODOS' && <span> • <strong>{activeFilters.grade}</strong></span>}
            {activeFilters.assessment !== 'TODOS' && <span> • <strong>{activeFilters.assessment}</strong></span>}
            {activeFilters.component !== 'TODOS' && (
              <span> • <strong>{COMPONENT_INFO[activeFilters.component]?.label || activeFilters.component}</strong></span>
            )}
          </div>
        </div>

        {hasActiveFilters && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Filtros ativos</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClearFilters}
              style={{ fontSize: 12, height: 32 }}
            >
              ✕ Limpar filtros
            </Button>
          </div>
        )}
      </div>

      {/* 2. FILTROS DA ANÁLISE */}
      <div className="cnca-filter-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔍</span> Filtros da análise
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
              Personalize o recorte dos indicadores por ano, avaliação, etapa ou unidade escolar
            </div>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 6px',
              }}
            >
              Restaurar padrão
            </button>
          )}
        </div>

        <div className="cnca-filter-grid">
          <Field label="Ano da Avaliação" style={{ margin: 0 }}>
            <Select value={year || program.year} onChange={(e) => setYear(e.target.value)} style={{ fontSize: 12.5, height: 36 }}>
              {(filtersData?.years || [program.year]).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </Field>

          <Field label="Avaliação / Edição" style={{ margin: 0 }}>
            <Select value={assessment} onChange={(e) => setAssessment(e.target.value)} style={{ fontSize: 12.5, height: 36 }}>
              <option value="TODOS">Todas as edições</option>
              {(filtersData?.assessments || ['Diagnóstica', 'Formativa 1', 'Formativa 2', 'Somativa']).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
          </Field>

          <Field label="Ano Escolar / Etapa" style={{ margin: 0 }}>
            <Select value={grade} onChange={(e) => setGrade(e.target.value)} style={{ fontSize: 12.5, height: 36 }}>
              <option value="TODOS">Todas as etapas (1º ao 5º ano)</option>
              {(filtersData?.grades || ['1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano']).map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </Select>
          </Field>

          <Field label="Componente Curricular" style={{ margin: 0 }}>
            <Select value={component} onChange={(e) => setComponent(e.target.value)} style={{ fontSize: 12.5, height: 36 }}>
              <option value="TODOS">Todos os componentes</option>
              {Object.entries(COMPONENT_INFO).map(([k, info]) => (
                <option key={k} value={k}>{info.icon} {info.label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Escola Participante" style={{ margin: 0 }}>
            <Select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} style={{ fontSize: 12.5, height: 36 }}>
              <option value="TODAS">Todas as participantes ({participatingCount})</option>
              {(filtersData?.schools || []).map((s) => (
                <option key={s.id} value={s.id}>{s.name} (INEP: {s.inep || '—'})</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {/* 3. INDICADORES PRINCIPAIS (4 CARDS GRANDES E EXECUTIVOS) */}
      <div className="cnca-kpi-grid">
        {/* Card 1: Escolas Participantes */}
        <div className="cnca-kpi-card">
          <div className="cnca-kpi-top">
            <span className="cnca-kpi-label">Escolas Participantes</span>
            <div className="cnca-kpi-icon" style={{ background: '#e0f2fe', color: '#0369a1' }}>🏫</div>
          </div>
          <div className="cnca-kpi-value">{fmtInt(participatingCount)}</div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4 }}>
              <span>{fmtInt(kpis.totalEvaluatedSchools || 0)} avaliadas</span>
              <strong>{kpis.dataCoveragePercent || 0}% cobertura</strong>
            </div>
            <div style={{ width: '100%', height: 5, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, kpis.dataCoveragePercent || 0))}%`,
                  height: '100%',
                  background: '#0284c7',
                  borderRadius: 999,
                }}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Estudantes Avaliados */}
        <div className="cnca-kpi-card">
          <div className="cnca-kpi-top">
            <span className="cnca-kpi-label">Estudantes Avaliados</span>
            <div className="cnca-kpi-icon" style={{ background: '#dcfce7', color: '#15803d' }}>👥</div>
          </div>
          <div className="cnca-kpi-value">
            {kpis.totalEvaluated > 0 ? fmtInt(kpis.totalEvaluated) : '—'}
          </div>
          <div className="cnca-kpi-hint">
            {kpis.totalEnrolled > 0 ? (
              <span>de <strong>{fmtInt(kpis.totalEnrolled)}</strong> matriculados na rede</span>
            ) : (
              <span>Total de estudantes participantes registrados</span>
            )}
          </div>
        </div>

        {/* Card 3: Taxa de Participação */}
        <div className="cnca-kpi-card">
          <div className="cnca-kpi-top">
            <span className="cnca-kpi-label">Taxa de Participação</span>
            <div
              className="cnca-kpi-icon"
              style={{
                background: (kpis.overallParticipation ?? 0) >= 80 ? '#dcfce7' : '#fef3c7',
                color: (kpis.overallParticipation ?? 0) >= 80 ? '#15803d' : '#b45309',
              }}
            >
              📊
            </div>
          </div>
          <div
            className="cnca-kpi-value"
            style={{
              color: (kpis.overallParticipation ?? 0) >= 80 ? '#15803d' : (kpis.overallParticipation != null ? '#b45309' : 'var(--text)'),
            }}
          >
            {kpis.overallParticipation != null ? `${fmt(kpis.overallParticipation, 1)}%` : '—'}
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4 }}>
              <span>Meta recomendada: ≥ 80%</span>
              <strong style={{ color: (kpis.overallParticipation ?? 0) >= 80 ? '#15803d' : '#b45309' }}>
                {(kpis.overallParticipation ?? 0) >= 80 ? 'Adequada' : 'Atenção'}
              </strong>
            </div>
            <div style={{ width: '100%', height: 5, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, kpis.overallParticipation || 0))}%`,
                  height: '100%',
                  background: (kpis.overallParticipation ?? 0) >= 80 ? '#16a34a' : '#d97706',
                  borderRadius: 999,
                }}
              />
            </div>
          </div>
        </div>

        {/* Card 4: Proficiência Média */}
        <div className="cnca-kpi-card">
          <div className="cnca-kpi-top">
            <span className="cnca-kpi-label">Proficiência Média Geral</span>
            <div className="cnca-kpi-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}>🎯</div>
          </div>
          <div className="cnca-kpi-value" style={{ color: '#6d28d9' }}>
            {kpis.networkAverageScore != null
              ? `${fmt(kpis.networkAverageScore, 1)} pts`
              : kpis.networkFluentRate != null
              ? `${fmt(kpis.networkFluentRate, 1)}%`
              : kpis.networkAdequateRate != null
              ? `${fmt(kpis.networkAdequateRate, 1)}%`
              : '—'}
          </div>
          <div className="cnca-kpi-hint">
            {kpis.networkAverageScore != null
              ? 'Escala média de desempenho na matriz oficial'
              : kpis.networkFluentRate != null
              ? 'Média de leitores no estágio fluente'
              : 'Média consolidada das escolas avaliadas'}
          </div>
        </div>
      </div>

      {/* 4. COMPONENTES CURRICULARES (4 CARDS COM MÉTRICAS PRÓPRIAS E VISUAL EXECUTIVO) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Componentes Curriculares</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Indicadores específicos de cada componente oficial do CNCA
            </div>
          </div>
          {component !== 'TODOS' && (
            <Badge cls="badge-blue">Filtrado por: {COMPONENT_INFO[component]?.label || component}</Badge>
          )}
        </div>

        <div className="cnca-component-grid">
          {componentSummaries.map((c) => {
            const info = COMPONENT_INFO[c.component] || {
              label: c.label,
              shortLabel: c.label,
              icon: '📚',
              color: '#4b5563',
              bg: '#f9fafb',
              border: '#e5e7eb',
            };
            const isSelected = component === c.component;

            let mainMetricLabel = 'Proficiência Média';
            let mainMetricValue = c.averageScore != null ? `${fmt(c.averageScore, 1)} pts` : '—';
            let progressValue = 0;
            let progressColor = info.color;

            if (c.component === 'FLUENCIA') {
              mainMetricLabel = '% Alunos Fluentes';
              mainMetricValue = c.fluentRate != null ? `${fmt(c.fluentRate, 1)}%` : '—';
              progressValue = c.fluentRate || 0;
              progressColor = '#059669';
            } else if (c.component === 'ESCRITA') {
              if (c.fluentRate != null) {
                mainMetricLabel = '% Nível Alfabético';
                mainMetricValue = `${fmt(c.fluentRate, 1)}%`;
                progressValue = c.fluentRate || 0;
                progressColor = '#7c3aed';
              } else if (c.averageScore != null) {
                mainMetricLabel = 'Nota Média';
                mainMetricValue = `${fmt(c.averageScore, 1)} pts`;
                progressValue = Math.min(100, Math.max(0, (c.averageScore / 300) * 100));
              }
            } else {
              mainMetricLabel = 'Proficiência Média';
              mainMetricValue = c.averageScore != null ? `${fmt(c.averageScore, 1)} pts` : '—';
              progressValue = c.averageScore ? Math.min(100, Math.max(0, (c.averageScore / 350) * 100)) : 0;
            }

            return (
              <div
                key={c.component}
                className={`cnca-component-card ${isSelected ? 'active-filter' : ''}`}
                onClick={() => setComponent(isSelected ? 'TODOS' : c.component)}
                title={`Clique para ${isSelected ? 'remover filtro' : `filtrar por ${info.label}`}`}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 22 }}>{info.icon}</span>
                      <strong style={{ fontSize: 15, color: info.color }}>{info.shortLabel}</strong>
                    </div>
                    {c.hasData ? (
                      <Badge cls="badge-green" style={{ fontSize: 10.5 }}>{c.schoolsCount} escolas</Badge>
                    ) : (
                      <Badge cls="badge-gray" style={{ fontSize: 10.5 }}>Sem dados</Badge>
                    )}
                  </div>

                  {c.hasData ? (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
                        {mainMetricLabel}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: info.color, margin: '2px 0 8px' }}>
                        {mainMetricValue}
                      </div>

                      {/* Barra de Progresso do Componente */}
                      <div style={{ width: '100%', height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, progressValue))}%`,
                            height: '100%',
                            background: progressColor,
                            borderRadius: 999,
                          }}
                        />
                      </div>

                      {/* Métricas específicas e independentes */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: 'var(--text-2)', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-3)' }}>Participação:</span>
                          <strong>
                            {c.participationRate != null ? `${fmt(c.participationRate, 1)}%` : '—'}
                          </strong>
                        </div>
                        {c.evaluated > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-3)' }}>Avaliados:</span>
                            <span>{fmtInt(c.evaluated)} {c.enrolled ? `/ ${fmtInt(c.enrolled)}` : ''}</span>
                          </div>
                        )}
                        {c.pcpm != null && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-3)' }}>PCPM Médio:</span>
                            <strong>{fmt(c.pcpm, 1)} ppm</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '24px 0 12px', textAlign: 'center' }}>
                      Nenhum resultado importado para este componente.
                    </div>
                  )}
                </div>

                {isSelected && (
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--primary)', fontWeight: 600, textAlign: 'center' }}>
                    ✓ Filtro Ativo
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. DISTRIBUIÇÃO POR NÍVEIS DE DESEMPENHO (GRÁFICO INTERATIVO COM FILTRO DIRETO NO GRÁFICO) */}
      <div className="card card-pad" style={{ background: '#ffffff', borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <div className="card-title" style={{ fontSize: 16 }}>
              Distribuição por Padrões / Níveis de Desempenho
            </div>
            <div className="card-subtitle" style={{ margin: 0 }}>
              Visualização gráfica da proporção de estudantes em cada estágio de desenvolvimento no CNCA.
            </div>
          </div>

          {/* FILTRO DIRETO NO GRÁFICO (Pills de Componente) */}
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 3, gap: 4, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
            {Object.entries(COMPONENT_INFO).map(([k, info]) => {
              const currentActive = component !== 'TODOS' ? component : chartComponent;
              const isSelected = currentActive === k;
              const compLevels = levelsByComponent?.[k] || [];
              const hasData = compLevels.length > 0;

              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (component !== 'TODOS') {
                      setComponent(k);
                    } else {
                      setChartComponent(k);
                    }
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: isSelected ? '#ffffff' : 'transparent',
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? info.color : hasData ? 'var(--text-2)' : 'var(--text-3)',
                    cursor: 'pointer',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{info.icon}</span>
                  <span>{info.shortLabel}</span>
                  {hasData && (
                    <span
                      style={{
                        fontSize: 10,
                        background: isSelected ? `${info.color}18` : '#e2e8f0',
                        color: isSelected ? info.color : 'inherit',
                        padding: '1px 5px',
                        borderRadius: 10,
                      }}
                    >
                      {compLevels.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {activeLevels.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            
            {/* Barra Empilhada Unificada do Componente Selecionado (100%) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6 }}>
                <span>Visão agregada 100% ({activeChartCompInfo.label})</span>
                <span>{activeLevels.length} níveis identificados</span>
              </div>

              <div className="cnca-stacked-bar-container">
                {activeLevels.map((lvl, idx) => {
                  const styling = getLevelColor(lvl.level);
                  const widthPct = activeLevelsSumPct > 0 ? (lvl.percentage / activeLevelsSumPct) * 100 : 0;
                  if (widthPct <= 0) return null;

                  return (
                    <div
                      key={idx}
                      className="cnca-stacked-segment"
                      style={{
                        width: `${widthPct}%`,
                        background: styling.bg,
                      }}
                      title={`${lvl.level}: ${fmt(lvl.percentage, 1)}% (~${fmtInt(lvl.count)} estudantes)`}
                    >
                      {widthPct >= 10 ? `${fmt(lvl.percentage, 1)}%` : ''}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* GRÁFICO DE BARRAS RECHARTS INTERATIVO */}
            <div style={{ width: '100%', height: Math.max(180, activeLevels.length * 44 + 40), marginTop: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={activeLevels}
                  margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="level"
                    tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    width={160}
                  />
                  <Tooltip content={<CustomLevelTooltip />} />
                  <Bar dataKey="percentage" radius={[0, 6, 6, 0]} maxBarSize={24}>
                    {activeLevels.map((entry, index) => {
                      const styling = getLevelColor(entry.level);
                      return <Cell key={`cell-${index}`} fill={styling.bg} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Detalhamento Compacto e Limpo dos Níveis do Componente */}
            <div className="cnca-levels-grid">
              {activeLevels.map((lvl, idx) => {
                const styling = getLevelColor(lvl.level);
                return (
                  <div
                    key={idx}
                    className="cnca-level-item"
                    style={{ background: styling.lightBg, borderColor: `${styling.bg}33` }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Badge cls={styling.badgeCls} style={{ fontSize: 11 }}>
                        {lvl.level}
                      </Badge>
                      <span style={{ fontSize: 16, fontWeight: 800, color: styling.text }}>
                        {fmt(lvl.percentage, 1)}%
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 5, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, lvl.percentage))}%`,
                          height: '100%',
                          background: styling.bg,
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    {lvl.count > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>
                        ~{fmtInt(lvl.count)} alunos estimados
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-3)', fontSize: 13 }}>
            Nenhum dado de distribuição de níveis disponível para <strong>{activeChartCompInfo.label}</strong> nos filtros selecionados.
          </div>
        )}
      </div>

      {/* 6. PONTOS DE ATENÇÃO PRIORITÁRIA (QUANDO HOUVER RESULTADOS CRÍTICOS < 50%) */}
      {criticalSkills.length > 0 && (
        <div className="card card-pad" style={{ background: '#fffafa', borderColor: '#fecaca', borderRadius: 12 }}>
          <div className="card-header-row" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <div className="card-title" style={{ color: '#991b1b', margin: 0 }}>
                  Pontos de Atenção Prioritária ({criticalSkills.length} itens &lt; 50%)
                </div>
                <div className="card-subtitle" style={{ margin: 0 }}>
                  Habilidades com percentual de acerto abaixo da meta mínima recomendada que demandam intervenção pedagógica.
                </div>
              </div>
            </div>
            <Badge cls="badge-red">Atenção Pedagógica</Badge>
          </div>

          <div className="cnca-attention-grid">
            {criticalSkills.map((sk) => (
              <div key={sk.code} className="cnca-attention-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <strong style={{ fontSize: 13, color: '#991b1b' }}>
                    {sk.code} {sk.name !== sk.code ? `· ${sk.name}` : ''}
                  </strong>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#dc2626' }}>
                    {fmt(sk.percentage, 1)}%
                  </span>
                </div>
                <div style={{ width: '100%', height: 6, background: '#fee2e2', borderRadius: 999, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, sk.percentage))}%`,
                      height: '100%',
                      background: '#dc2626',
                      borderRadius: 999,
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>
                  Abaixo do limiar de 50% de consolidação na rede.
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. HABILIDADES E DESCRITORES DA MATRIZ OFICIAL (BARRAS HORIZONTAIS LIMPAS COM 'VER TODAS') */}
      {skillsPerformance.length > 0 && (
        <div className="card card-pad" style={{ background: '#ffffff', borderRadius: 12 }}>
          <div className="card-header-row" style={{ marginBottom: 14 }}>
            <div>
              <div className="card-title">Habilidades e Descritores Oficiais da Matriz</div>
              <div className="card-subtitle">
                Percentual médio de acertos obtido pelas escolas participantes em cada habilidade avaliada.
              </div>
            </div>
            {skillsPerformance.length > 6 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAllSkills(!showAllSkills)}
                style={{ fontSize: 12 }}
              >
                {showAllSkills ? 'Recolher lista' : `Ver todas as ${skillsPerformance.length} habilidades`}
              </Button>
            )}
          </div>

          <div className="cnca-skills-list">
            {displayedSkills.map((sk) => {
              const isCrit = sk.percentage < 50;
              const isAdeq = sk.percentage >= 70;
              const barColor = isCrit ? '#dc2626' : isAdeq ? '#16a34a' : '#0284c7';

              return (
                <div key={sk.code} className="cnca-skill-row">
                  <div style={{ minWidth: 260, flex: 1 }}>
                    <strong style={{ fontSize: 13, color: isCrit ? '#991b1b' : 'var(--text-1)' }}>
                      {sk.code}
                    </strong>
                    {sk.name && sk.name !== sk.code && (
                      <span style={{ fontSize: 12.5, color: 'var(--text-2)', marginLeft: 8 }}>
                        · {sk.name}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 220, flex: 1 }}>
                    <div className="cnca-skill-bar-track">
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, sk.percentage))}%`,
                          height: '100%',
                          background: barColor,
                          borderRadius: 999,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                    <strong style={{ fontSize: 13.5, color: barColor, width: 52, textAlign: 'right' }}>
                      {fmt(sk.percentage, 1)}%
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>

          {skillsPerformance.length > 6 && !showAllSkills && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllSkills(true)}
                style={{ fontSize: 12.5, color: 'var(--primary)' }}
              >
                + Exibir mais {skillsPerformance.length - 6} habilidades da matriz
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 8. DETALHAMENTO POR ESCOLA PARTICIPANTE (TABELA COMPARATIVA) */}
      <div className="card card-pad" style={{ background: '#ffffff', borderRadius: 12 }}>
        <div className="card-header-row" style={{ marginBottom: 14 }}>
          <div>
            <div className="card-title">Detalhamento por Escola Participante</div>
            <div className="card-subtitle">
              Resumo do desempenho consolidado e participação de cada unidade participante do CNCA.
            </div>
          </div>
          <div style={{ width: 280 }}>
            <Input
              type="text"
              placeholder="🔎 Buscar escola ou INEP..."
              value={schoolSearch}
              onChange={(e) => setSchoolSearch(e.target.value)}
              style={{ fontSize: 12.5, height: 34 }}
            />
          </div>
        </div>

        <DataTable
          columns={[
            {
              key: 'inep',
              label: 'INEP',
              render: (s) => <span className="mono" style={{ fontWeight: 600 }}>{s.inep || '—'}</span>,
            },
            {
              key: 'name',
              label: 'Escola',
              render: (s) => (
                <div>
                  <strong>{s.name}</strong>
                  {s.district && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.district}</div>}
                </div>
              ),
            },
            {
              key: 'zone',
              label: 'Zona',
              render: (s) => (
                <Badge cls={s.zone === 'RURAL' ? 'badge-yellow' : s.zone === 'ILHAS' ? 'badge-cyan' : 'badge-blue'}>
                  {s.zone || '—'}
                </Badge>
              ),
            },
            {
              key: 'participation',
              label: 'Participação',
              render: (s) => (
                <div>
                  <strong style={{ color: (s.participationRate ?? 0) >= 80 ? '#15803d' : '#b45309' }}>
                    {s.participationRate != null ? `${fmt(s.participationRate, 1)}%` : '—'}
                  </strong>
                  {s.evaluated > 0 && s.enrolled > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {s.evaluated} / {s.enrolled} alunos
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'score',
              label: 'Proficiência Média',
              align: 'right',
              render: (s) =>
                s.averageScore != null ? (
                  <strong style={{ color: '#0284c7', fontSize: 13.5 }}>{fmt(s.averageScore, 1)} pts</strong>
                ) : (
                  '—'
                ),
            },
            {
              key: 'fluent',
              label: '% Fluência / Alfabético',
              align: 'right',
              render: (s) =>
                s.fluentRate != null ? (
                  <strong style={{ color: '#059669', fontSize: 13.5 }}>{fmt(s.fluentRate, 1)}%</strong>
                ) : (
                  '—'
                ),
            },
            {
              key: 'components',
              label: 'Componentes',
              align: 'center',
              render: (s) => (
                <Badge cls="badge-blue">
                  {s.componentsEvaluatedCount} componente(s)
                </Badge>
              ),
            },
          ]}
          rows={filteredSchools}
          emptyTitle="Nenhum resultado registrado para os filtros selecionados"
          emptyHint="Verifique os filtros selecionados acima ou importe novos dados na aba 'Importar Planilha Oficial'."
          emptyIcon="📊"
        />
      </div>
    </div>
  );
}
