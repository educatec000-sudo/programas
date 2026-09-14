import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useApi } from '../../hooks/useApi.js';
import { sispaeApi } from '../../services/resources.js';
import { Badge, LoadingBlock, Select } from '../../components/ui.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

export default function SispaeDashboard({ program = {}, onSelectTab }) {
  const [selectedAppId, setSelectedAppId] = useState('');
  const [component, setComponent] = useState('ALL');
  const [grade, setGrade] = useState('ALL');
  const [search, setSearch] = useState('');

  const programId = program?.id;
  const programYear = program?.year || 2026;

  const activeFilters = useMemo(
    () => ({
      year: programYear,
      applicationId: selectedAppId || undefined,
      component,
      grade,
      search: search || undefined,
    }),
    [programYear, selectedAppId, component, grade, search],
  );

  const { data: dashboard, loading, error, refetch } = useApi(
    () => (programId ? sispaeApi.dashboard(programId, activeFilters) : Promise.resolve(null)),
    [programId, activeFilters],
  );

  const currentApp = dashboard?.currentApplication;
  const applications = dashboard?.applications || [];
  const kpis = dashboard?.kpis || {};
  const componentsSummary = dashboard?.componentsSummary || [];
  const performanceDistribution = dashboard?.performanceDistribution || [];
  const skillsSummary = dashboard?.skillsSummary || [];
  const topSchools = dashboard?.topSchools || [];
  const attentionSchools = dashboard?.attentionSchools || [];

  // Dados para o gráfico de rosca de distribuição
  const pieData = useMemo(() => {
    return (performanceDistribution || []).filter((d) => (d.percentage || 0) > 0);
  }, [performanceDistribution]);

  // Dados de habilidades filtrados pelo componente ativo
  const filteredSkills = useMemo(() => {
    if (component === 'ALL') return skillsSummary;
    return (skillsSummary || []).filter((s) => s.component === component);
  }, [skillsSummary, component]);

  // Habilidades críticas (< 50%)
  const criticalSkills = useMemo(() => {
    return (filteredSkills || []).filter((s) => s.averagePercentage < 50);
  }, [filteredSkills]);

  if (loading && !dashboard) {
    return <LoadingBlock message="Carregando visão geral do SisPAE..." />;
  }

  if (error && !dashboard) {
    return (
      <div className="card card-pad" style={{ textAlign: 'center' }}>
        <p style={{ color: '#ef4444', marginBottom: 12 }}>Erro ao carregar dados do SisPAE: {error}</p>
        <button className="btn btn-outline" onClick={refetch}>
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. BARRA DE FILTROS PADRÃO (CONFORME O PADRÃO OFICIAL DO SISTEMA) */}
      <div className="program-filter-panel">
        <div className="program-filter-item">
          <label className="program-filter-label">Aplicação</label>
          <Select
            value={selectedAppId || currentApp?.id || ''}
            onChange={(e) => setSelectedAppId(e.target.value)}
            className="program-select"
          >
            {applications.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name} ({app.type === 'SIMULADO' ? 'Simulado' : 'Oficial'})
              </option>
            ))}
            {applications.length === 0 && (
              <option value="">Nenhuma aplicação encontrada</option>
            )}
          </Select>
        </div>

        <div className="program-filter-item">
          <label className="program-filter-label">Ano escolar</label>
          <Select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="program-select"
          >
            <option value="ALL">Todos os anos</option>
            <option value="2º Ano">2º Ano</option>
            <option value="5º Ano">5º Ano</option>
            <option value="9º Ano">9º Ano</option>
          </Select>
        </div>

        <div className="program-filter-item">
          <label className="program-filter-label">Componente</label>
          <Select
            value={component}
            onChange={(e) => setComponent(e.target.value)}
            className="program-select"
          >
            <option value="ALL">Todos os componentes</option>
            <option value="LINGUA_PORTUGUESA">Língua Portuguesa</option>
            <option value="MATEMATICA">Matemática</option>
          </Select>
        </div>

        <div className="program-filter-item">
          <label className="program-filter-label">Escola / INEP</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por escola..."
            className="input program-select"
            style={{ height: 36 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          {(selectedAppId || component !== 'ALL' || grade !== 'ALL' || search) && (
            <button
              type="button"
              className="program-btn-clear"
              onClick={() => {
                setSelectedAppId('');
                setComponent('ALL');
                setGrade('ALL');
                setSearch('');
              }}
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* 2. CARD DE CONTEXTO DA APLICAÇÃO SELECIONADA */}
      {currentApp && (
        <div
          className="card"
          style={{
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            borderRadius: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                background: currentApp.type === 'SIMULADO' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: currentApp.type === 'SIMULADO' ? '#d97706' : '#16a34a',
                border: `1px solid ${currentApp.type === 'SIMULADO' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              {currentApp.type === 'SIMULADO' ? '📝 SIMULADO' : '🏛️ AVALIAÇÃO OFICIAL'}
            </span>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>
              {currentApp.name}
            </span>
            {currentApp.description && (
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                · {currentApp.description}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 16, fontSize: 12.5, color: 'var(--text-2)' }}>
            <span>Etapa: <strong style={{ color: 'var(--text)' }}>{currentApp.stage || 'Alfabetização'}</strong></span>
            <span>Ano: <strong style={{ color: 'var(--text)' }}>{currentApp.year}</strong></span>
            <span>Registros: <strong style={{ color: '#0284c7' }}>{dashboard?.totalResults || 0}</strong></span>
          </div>
        </div>
      )}

      {/* 3. CARDS DE KPIS GERAIS (5 CARDS LIMPOS, SEM A PARTICIPAÇÃO DA REDE MUNICIPAL) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <div className="card card-pad" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
            Escolas
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
            {fmtInt(kpis.totalSchools ?? kpis.participatingSchools ?? 0)}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>participantes</div>
        </div>

        <div className="card card-pad" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
            Registros
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0284c7' }}>
            {fmtInt(dashboard?.totalResults ?? 0)}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>avaliações registradas</div>
        </div>

        <div className="card card-pad" style={{ padding: '14px 16px', background: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', marginBottom: 4 }}>
            Adequado
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#15803d' }}>
            {fmt(kpis.adequateRate ?? kpis.overallAdequateRate ?? 0)}%
          </div>
          <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>aprendizado adequado</div>
        </div>

        <div className="card card-pad" style={{ padding: '14px 16px', background: '#fffbeb', borderColor: '#fde68a' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', marginBottom: 4 }}>
            Intermediário
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706' }}>
            {fmt(kpis.intermediateRate ?? kpis.overallIntermediateRate ?? 0)}%
          </div>
          <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>aprendizado intermediário</div>
        </div>

        <div className="card card-pad" style={{ padding: '14px 16px', background: '#fef2f2', borderColor: '#fecaca' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', marginBottom: 4 }}>
            Defasagem
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626' }}>
            {fmt(kpis.deficitRate ?? kpis.overallDeficitRate ?? 0)}%
          </div>
          <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>em defasagem crítica</div>
        </div>
      </div>

      {/* 4. CARDS POR COMPONENTE (Língua Portuguesa e Matemática) */}
      {componentsSummary.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
          {componentsSummary.map((comp) => {
            const isLp = (comp.code || comp.component) === 'LINGUA_PORTUGUESA';
            const deficitVal = comp.deficitRate ?? comp.belowBasicRate;
            const intermVal = comp.intermediateRate ?? comp.basicRate;
            const adeqVal = comp.adequateRate;

            return (
              <div
                key={comp.code || comp.component || comp.label}
                className="card card-pad"
                style={{
                  borderLeft: `4px solid ${isLp ? '#0284c7' : '#8b5cf6'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{isLp ? '📖' : '📐'}</span>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#0f172a' }}>
                        {comp.label}
                      </h4>
                      <span style={{ fontSize: 11.5, color: '#64748b' }}>
                        {comp.evaluated ? `${fmtInt(comp.evaluated)} avaliados` : `${comp.schoolsCount || 0} escolas`} ({fmt(comp.participationRate)}% part.)
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>
                      {fmt(adeqVal)}%
                    </div>
                    <div style={{ fontSize: 10.5, color: '#64748b' }}>aprendizado adequado</div>
                  </div>
                </div>

                {/* Níveis de Desempenho do Componente */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <div style={{ background: '#fef2f2', padding: '8px 10px', borderRadius: 6, textAlign: 'center', border: '1px solid #fee2e2' }}>
                    <div style={{ fontSize: 10.5, color: '#991b1b', fontWeight: 700 }}>DEFASAGEM</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#ef4444' }}>
                      {deficitVal != null ? `${fmt(deficitVal)}%` : '—'}
                    </div>
                  </div>
                  <div style={{ background: '#fefce8', padding: '8px 10px', borderRadius: 6, textAlign: 'center', border: '1px solid #fef08a' }}>
                    <div style={{ fontSize: 10.5, color: '#854d0e', fontWeight: 700 }}>INTERMEDIÁRIO</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#d97706' }}>
                      {intermVal != null ? `${fmt(intermVal)}%` : '—'}
                    </div>
                  </div>
                  <div style={{ background: '#f0fdf4', padding: '8px 10px', borderRadius: 6, textAlign: 'center', border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: 10.5, color: '#166534', fontWeight: 700 }}>ADEQUADO</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#10b981' }}>
                      {adeqVal != null ? `${fmt(adeqVal)}%` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. VISUALIZAÇÕES: GRÁFICO DE DISTRIBUIÇÃO & HABILIDADES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
        {/* Gráfico 1: Distribuição Geral */}
        <div className="card card-pad">
          <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            Distribuição Geral de Desempenho
          </h3>
          {pieData.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', height: 210 }}>
              <div style={{ width: '55%', height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="percentage"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={3}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${fmt(value)}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ width: '45%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {performanceDistribution.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color }} />
                    <span style={{ color: '#475569', flex: 1 }}>{item.label}:</span>
                    <strong style={{ color: '#0f172a' }}>{fmt(item.percentage)}%</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ height: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
              Nenhum dado de distribuição registrado nesta aplicação.
            </div>
          )}
        </div>

        {/* Gráfico 2: Domínio das Habilidades */}
        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
              Média de Domínio por Habilidade (%)
            </h3>
            {criticalSkills.length > 0 && (
              <span style={{ fontSize: 11.5, color: '#ef4444', fontWeight: 700, background: '#fee2e2', padding: '2px 7px', borderRadius: 4 }}>
                ⚠️ {criticalSkills.length} críticas (&lt; 50%)
              </span>
            )}
          </div>

          {filteredSkills.length > 0 ? (
            <div style={{ height: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredSkills.slice(0, 14)} margin={{ top: 8, right: 8, left: -24, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="code" tick={{ fontSize: 10.5, fill: '#64748b' }} interval={0} angle={-30} textAnchor="end" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10.5, fill: '#64748b' }} unit="%" />
                  <Tooltip
                    formatter={(val, name, item) => [`${fmt(val)}%`, `${item.payload.label || item.payload.code} (${item.payload.componentLabel})`]}
                  />
                  <Bar
                    dataKey="averagePercentage"
                    radius={[4, 4, 0, 0]}
                  >
                    {filteredSkills.slice(0, 14).map((entry, index) => (
                      <Cell
                        key={`skill-bar-${index}`}
                        fill={entry.averagePercentage < 50 ? '#ef4444' : entry.averagePercentage < 70 ? '#f59e0b' : '#10b981'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ height: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
              Nenhuma matriz de habilidades importada nesta aplicação.
            </div>
          )}
        </div>
      </div>

      {/* 6. TOP 5 ESCOLAS & PONTOS DE ATENÇÃO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
        {/* Top 5 Escolas */}
        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
              🏆 Top 5 Escolas em Aprendizado Adequado
            </h3>
            {onSelectTab && (
              <button
                onClick={() => onSelectTab('sispae-ranking')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Ver ranking completo →
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topSchools.length > 0 ? (
              topSchools.map((school, idx) => (
                <div
                  key={school.schoolId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: idx === 0 ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface-2)',
                    border: `1px solid ${idx === 0 ? 'rgba(16, 185, 129, 0.3)' : 'var(--border)'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, width: 22, textAlign: 'center' }}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {school.schoolName}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                        INEP: {school.inep || '—'} {school.zone ? `· Zona ${school.zone}` : ''}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: '#10b981' }}>
                      {fmt(school.overallAdequateRate)}%
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>adequado</div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>
                Nenhum resultado registrado para calcular o top 5.
              </div>
            )}
          </div>
        </div>

        {/* 5 Escolas Prioritárias para Intervenção */}
        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              ⚠️ Escolas Prioritárias para Apoio Pedagógico
            </h3>
            {onSelectTab && (
              <button
                onClick={() => onSelectTab('sispae-analises')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Ver matriz pedagógica →
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {attentionSchools.length > 0 ? (
              attentionSchools.map((school) => (
                <div
                  key={school.schoolId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>
                      {school.schoolName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      INEP: {school.inep || '—'} · Part: {fmt(school.overallParticipation)}%
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: '#ef4444' }}>
                      {fmt(school.overallDeficitRate)}%
                    </div>
                    <div style={{ fontSize: 10.5, color: '#ef4444' }}>defasagem</div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>
                Nenhuma escola em situação crítica de defasagem.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
