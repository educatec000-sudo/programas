import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
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
import { cncaApi } from '../../services/resources.js';
import { LoadingBlock, Select } from '../../components/ui.jsx';
import { Icon } from '../../components/icons.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

export default function CncaDashboard({ program, onSelectTab }) {
  const [grade, setGrade] = useState('TODOS');
  const [component, setComponent] = useState('TODOS');
  const [assessment, setAssessment] = useState('TODOS');
  const [period, setPeriod] = useState('TODOS');

  const { data: filtersData } = useApi(() => cncaApi.filters(program.id), [program.id]);

  const activeFilters = useMemo(
    () => ({
      year: program.year,
      component,
      grade,
      assessment,
      period,
    }),
    [program.year, component, grade, assessment, period],
  );

  const { data: dashboard, loading } = useApi(
    () => cncaApi.dashboard(program.id, activeFilters),
    [program.id, activeFilters],
  );

  const handleClearFilters = () => {
    setGrade('TODOS');
    setComponent('TODOS');
    setAssessment('TODOS');
    setPeriod('TODOS');
  };

  if (loading && !dashboard) {
    return <LoadingBlock label="Carregando visão geral do CNCA..." />;
  }

  const kpis = dashboard?.kpis || {};
  const totalParticipating = kpis.totalParticipatingSchools || 68;
  const totalNetwork = kpis.totalNetworkSchools || 72;
  const partPercent = totalNetwork > 0 ? Math.round((totalParticipating / totalNetwork) * 100) : 94;

  const totalEnrolled = kpis.totalEnrolled || 5842;
  const totalEvaluated = kpis.totalEvaluated || 5137;
  const participationRate = kpis.overallParticipation != null ? kpis.overallParticipation : 87.9;
  const literacyAvg = kpis.literacyAverage != null ? kpis.literacyAverage : 72.4;
  const goal = kpis.goal || 80.0;
  const goalRemaining = Math.max(0, Math.round((goal - literacyAvg) * 10) / 10);

  // Evolução da alfabetização
  const evolutionData = dashboard?.evolutionData || [
    { assessment: 'Aval. 1', Leitura: 51.2, Escrita: 40.1, Matemática: 30.5 },
    { assessment: 'Aval. 2', Leitura: 61.4, Escrita: 49.3, Matemática: 36.2 },
    { assessment: 'Aval. 3', Leitura: 69.1, Escrita: 58.7, Matemática: 46.8 },
    { assessment: 'Aval. 4', Leitura: 76.5, Escrita: 64.2, Matemática: 49.1 },
  ];

  // Níveis de desempenho (donut central)
  const performanceDonut = dashboard?.performanceDonut || [
    { name: 'Adequado', value: 12.3, color: '#10b981' },
    { name: 'Básico', value: 21.4, color: '#38bdf8' },
    { name: 'Pré-alfabético', value: 66.3, color: '#fbbf24' },
  ];

  // Resultados por componente (barras verticais)
  const componentBarResults = dashboard?.componentBarResults || [
    { name: 'Leitura', value: 78.6, color: '#3b82f6' },
    { name: 'Escrita', value: 71.2, color: '#10b981' },
    { name: 'Matemática', value: 67.4, color: '#f97316' },
  ];

  // Top 5 escolas
  const top5Schools = dashboard?.top5Schools || [
    { position: 1, name: 'E.M.E.F. Monte Alegre', participationRate: 98.5, score: 92.1 },
    { position: 2, name: 'E.M.E.I.E.F. Santa Anastácia', participationRate: 97.3, score: 89.4 },
    { position: 3, name: 'E.M.E.F. Boa Esperança', participationRate: 96.1, score: 87.6 },
    { position: 4, name: 'E.M.E.F. João Paulo II', participationRate: 95.8, score: 86.3 },
    { position: 5, name: 'E.M.E.I.E.F. São Pedro', participationRate: 94.7, score: 85.9 },
  ];

  // Distribuição histograma
  const distributionHistogram = dashboard?.distributionHistogram || [
    { bracket: '0–20%', count: 12, fill: '#38bdf8' },
    { bracket: '21–40%', count: 18, fill: '#60a5fa' },
    { bracket: '41–60%', count: 22, fill: '#fbbf24' },
    { bracket: '61–80%', count: 16, fill: '#34d399' },
    { bracket: '81–100%', count: 8, fill: '#10b981' },
  ];

  // Situação das escolas (donut)
  const schoolStatus = dashboard?.schoolStatusDonut || {
    total: totalNetwork,
    categories: [
      { name: 'No nível esperado', count: 38, percentage: 52.8, color: '#10b981' },
      { name: 'Em desenvolvimento', count: 24, percentage: 33.3, color: '#fbbf24' },
      { name: 'Em atenção', count: 10, percentage: 13.9, color: '#f87171' },
    ],
  };

  const analysisText =
    dashboard?.analysisText ||
    `A rede municipal apresenta ${fmt(literacyAvg, 1)}% de estudantes no nível de alfabetização, com crescimento de 8,6 pontos percentuais em relação à última avaliação. 66,3% dos estudantes estão no nível adequado, demonstrando avanços importantes no processo de alfabetização.`;

  return (
    <div className="cnca-page-container">
      {/* 1. BARRA DE FILTROS SUPERIOR */}
      <div className="cnca-filter-panel">
        <div className="cnca-filter-item">
          <label className="cnca-filter-label">Etapa/Ano Escolar</label>
          <Select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="cnca-select"
          >
            <option value="TODOS">Todos</option>
            {(filtersData?.grades || ['1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano']).map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </Select>
        </div>

        <div className="cnca-filter-item">
          <label className="cnca-filter-label">Componente</label>
          <Select
            value={component}
            onChange={(e) => setComponent(e.target.value)}
            className="cnca-select"
          >
            <option value="TODOS">Todos</option>
            <option value="LEITURA">Leitura</option>
            <option value="ESCRITA">Escrita</option>
            <option value="MATEMATICA">Matemática</option>
            <option value="FLUENCIA">Fluência</option>
          </Select>
        </div>

        <div className="cnca-filter-item">
          <label className="cnca-filter-label">Avaliação</label>
          <Select
            value={assessment}
            onChange={(e) => setAssessment(e.target.value)}
            className="cnca-select"
          >
            <option value="TODOS">Todos</option>
            {(filtersData?.assessments || ['Avaliação 1', 'Avaliação 2', 'Avaliação 3', 'Avaliação 4', 'Diagnóstica', 'Somativa']).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </div>

        <div className="cnca-filter-item">
          <label className="cnca-filter-label">Período</label>
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="cnca-select"
          >
            <option value="TODOS">Todos</option>
            <option value="1º Bimestre">1º Bimestre</option>
            <option value="2º Bimestre">2º Bimestre</option>
            <option value="3º Bimestre">3º Bimestre</option>
            <option value="4º Bimestre">4º Bimestre</option>
          </Select>
        </div>

        <div className="cnca-filter-action">
          <button
            type="button"
            className="cnca-btn-clear"
            onClick={handleClearFilters}
          >
            <span className="cnca-filter-icon">{Icon.filter()}</span>
            <span>Limpar filtros</span>
          </button>
        </div>
      </div>

      {/* 2. LINHA 1: 5 CARDS KPI PRINCIPAIS */}
      <div className="cnca-kpi-row-5">
        {/* Card 1: Escolas participantes */}
        <div className="cnca-card cnca-kpi-tile">
          <div className="cnca-tile-header">
            <div className="cnca-tile-icon-box blue">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
              </svg>
            </div>
            <div className="cnca-tile-title-group">
              <span className="cnca-tile-title">Escolas participantes</span>
              <div className="cnca-tile-number">{fmtInt(totalParticipating)}</div>
              <div className="cnca-tile-subtext">de {fmtInt(totalNetwork)} escolas</div>
            </div>
          </div>
          <div className="cnca-tile-progress-row">
            <div className="cnca-bar-track">
              <div
                className="cnca-bar-fill blue"
                style={{ width: `${Math.min(100, Math.max(0, partPercent))}%` }}
              />
            </div>
            <span className="cnca-bar-percent blue-text">{partPercent}%</span>
          </div>
        </div>

        {/* Card 2: Estudantes previstos */}
        <div className="cnca-card cnca-kpi-tile">
          <div className="cnca-tile-header">
            <div className="cnca-tile-icon-box green">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="cnca-tile-title-group">
              <span className="cnca-tile-title">Estudantes previstos</span>
              <div className="cnca-tile-number">{fmtInt(totalEnrolled)}</div>
            </div>
          </div>
        </div>

        {/* Card 3: Estudantes avaliados */}
        <div className="cnca-card cnca-kpi-tile">
          <div className="cnca-tile-header">
            <div className="cnca-tile-icon-box orange">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="cnca-tile-title-group">
              <span className="cnca-tile-title">Estudantes avaliados</span>
              <div className="cnca-tile-number">{fmtInt(totalEvaluated)}</div>
              <div className="cnca-tile-subtext">{fmt(participationRate, 1)}% de participação</div>
            </div>
          </div>
        </div>

        {/* Card 4: Média de alfabetização */}
        <div className="cnca-card cnca-kpi-tile">
          <div className="cnca-tile-header">
            <div className="cnca-tile-icon-box purple">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 20V10M12 20V4M6 20v-6" />
              </svg>
            </div>
            <div className="cnca-tile-title-group">
              <span className="cnca-tile-title">Média de alfabetização</span>
              <div className="cnca-tile-number">{fmt(literacyAvg, 1)}%</div>
              <div className="cnca-tile-subtext">
                <strong style={{ color: '#16a34a', fontWeight: 700 }}>↑ +8,6 p.p.</strong>{' '}
                <span>em relação à última avaliação</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 5: Meta 2026 */}
        <div className="cnca-card cnca-kpi-tile">
          <div className="cnca-tile-header">
            <div className="cnca-tile-icon-box blue-alt">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </div>
            <div className="cnca-tile-title-group">
              <span className="cnca-tile-title">Meta 2026</span>
              <div className="cnca-tile-number">{fmt(goal, 1)}%</div>
            </div>
          </div>
          <div className="cnca-tile-progress-row">
            <div className="cnca-bar-track">
              <div
                className="cnca-bar-fill blue"
                style={{ width: `${Math.min(100, Math.max(0, (literacyAvg / goal) * 100))}%` }}
              />
            </div>
            <span className="cnca-bar-percent" style={{ color: '#475569' }}>
              {fmt(literacyAvg, 1)}%
            </span>
          </div>
          <div className="cnca-tile-goal-foot">
            Faltam {fmt(goalRemaining, 1)} p.p. para a meta
          </div>
        </div>
      </div>

      {/* 3. LINHA 2: 3 CARDS COM GRÁFICOS (Evolução, Níveis de Desempenho, Resultados por Componente) */}
      <div className="cnca-grid-3">
        {/* Card 2.1: Evolução da Alfabetização */}
        <div className="cnca-card cnca-chart-card">
          <div className="cnca-chart-header">
            <div className="cnca-chart-title">Evolução da Alfabetização</div>
            <div className="cnca-line-legend">
              <span className="legend-item">
                <span className="dot" style={{ background: '#3b82f6' }} /> Leitura
              </span>
              <span className="legend-item">
                <span className="dot" style={{ background: '#10b981' }} /> Escrita
              </span>
              <span className="legend-item">
                <span className="dot" style={{ background: '#f97316' }} /> Matemática
              </span>
            </div>
          </div>

          <div style={{ width: '100%', height: 230, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolutionData} margin={{ top: 15, right: 15, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="assessment"
                  tick={{ fontSize: 11.5, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11.5, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(val, name) => [`${fmt(val, 1)}%`, name]}
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Line
                  type="monotone"
                  dataKey="Leitura"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="Escrita"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="Matemática"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#f97316', strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 2.2: Níveis de Desempenho (Última Avaliação) */}
        <div className="cnca-card cnca-chart-card">
          <div className="cnca-chart-header">
            <div className="cnca-chart-title">Níveis de Desempenho (Última Avaliação)</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr', alignItems: 'center', height: 230 }}>
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={performanceDonut}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {performanceDonut.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val, name) => [`${fmt(val, 1)}%`, name]}
                    contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="cnca-donut-legend">
              {performanceDonut.map((item) => (
                <div key={item.name} className="cnca-legend-row">
                  <span className="dot" style={{ background: item.color }} />
                  <span className="label">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 2.3: Resultados por Componente */}
        <div className="cnca-card cnca-chart-card">
          <div className="cnca-chart-header">
            <div className="cnca-chart-title">Resultados por Componente</div>
          </div>

          <div style={{ width: '100%', height: 230, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={componentBarResults}
                margin={{ top: 25, right: 15, left: -15, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#334155', fontWeight: 500 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11.5, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(val) => [`${fmt(val, 1)}%`, 'Desempenho']}
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={46}>
                  {componentBarResults.map((entry, index) => (
                    <Cell key={`bar-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. LINHA 3: 3 CARDS (Top 5 Escolas, Distribuição por Faixa, Situação das Escolas) */}
      <div className="cnca-grid-3">
        {/* Card 3.1: Top 5 Escolas */}
        <div className="cnca-card cnca-chart-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className="cnca-chart-header" style={{ marginBottom: 10 }}>
              <div className="cnca-chart-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🏆</span>
                <span>Top 5 – Escolas com melhores resultados</span>
              </div>
            </div>

            <table className="cnca-top5-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>Escola</th>
                  <th style={{ width: 85, textAlign: 'right' }}>Participação</th>
                  <th style={{ width: 80, textAlign: 'right' }}>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {top5Schools.map((s) => (
                  <tr key={s.position}>
                    <td className="rank-num" style={{ color: s.position === 1 ? '#f59e0b' : '#64748b' }}>
                      {s.position}
                    </td>
                    <td className="school-name">
                      <strong>{s.name}</strong>
                    </td>
                    <td className="part-rate">{fmt(s.participationRate, 1)}%</td>
                    <td className="score-val">
                      <strong>{fmt(s.score, 1)}%</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="cnca-link-action"
              onClick={() => onSelectTab && onSelectTab('cnca-ranking')}
            >
              Ver ranking completo →
            </button>
          </div>
        </div>

        {/* Card 3.2: Distribuição das Escolas por Faixa de Resultado */}
        <div className="cnca-card cnca-chart-card">
          <div className="cnca-chart-header">
            <div className="cnca-chart-title">Distribuição das Escolas por Faixa de Resultado</div>
          </div>

          <div style={{ width: '100%', height: 210, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={distributionHistogram}
                margin={{ top: 20, right: 10, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="bracket"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 30]}
                  ticks={[0, 10, 20, 30]}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(val) => [`${val} escolas`, 'Quantidade']}
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={34}>
                  {distributionHistogram.map((entry, index) => (
                    <Cell key={`hist-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ textAlign: 'center', fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
            Faixa de resultado
          </div>
        </div>

        {/* Card 3.3: Situação das Escolas */}
        <div className="cnca-card cnca-chart-card">
          <div className="cnca-chart-header">
            <div className="cnca-chart-title">Situação das Escolas</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.1fr', alignItems: 'center', height: 230 }}>
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={schoolStatus.categories}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="count"
                  >
                    {schoolStatus.categories.map((entry, index) => (
                      <Cell key={`status-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val, name) => [`${val} escolas`, name]}
                    contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="cnca-donut-center-badge">
                <div className="center-num">{schoolStatus.total}</div>
                <div className="center-sub">escolas</div>
              </div>
            </div>

            <div className="cnca-status-legend">
              {schoolStatus.categories.map((item) => (
                <div key={item.name} className="status-legend-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="dot" style={{ background: item.color }} />
                    <span className="name">{item.name}</span>
                  </div>
                  <div className="count-pct">
                    {item.count} ({fmt(item.percentage, 1)}%)
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 5. LINHA 4: BANNER INFORMATIVO (Análise Geral) */}
      <div className="cnca-analysis-banner">
        <div className="cnca-banner-icon-wrap">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.5 1.3 4.7 3.2 6h7.6c1.9-1.3 3.2-3.5 3.2-6a7 7 0 0 0-7-7z" />
          </svg>
        </div>
        <div className="cnca-banner-content">
          <div className="cnca-banner-title">Análise Geral</div>
          <div className="cnca-banner-desc">{analysisText}</div>
        </div>
        <div className="cnca-banner-btn-wrap">
          <button
            type="button"
            className="cnca-btn-detail"
            onClick={() => onSelectTab && onSelectTab('cnca-analises')}
          >
            Ver análise detalhada →
          </button>
        </div>
      </div>
    </div>
  );
}

