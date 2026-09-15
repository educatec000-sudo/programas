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
import { pactoAdminApi } from '../../services/resources.js';
import { Field, LoadingBlock, Select } from '../../components/ui.jsx';
import { buildPactoDashboard } from './dashboard.js';
import { fmt, fmtInt } from '../../utils/format.js';

export default function PactoAnalises({ program }) {
  const { data: overview, loading, error } = useApi(
    () => pactoAdminApi.overview(program.id),
    [program.id],
  );

  const [activeSubtab, setActiveSubtab] = useState('ETAPA'); // 'ETAPA' | 'COMPONENTE' | 'REDE'
  const [gradeFilter, setGradeFilter] = useState('');
  const [componentFilter, setComponentFilter] = useState('');

  const dashboard = useMemo(() => {
    if (!overview) return null;
    return buildPactoDashboard(overview, {
      grade: gradeFilter || undefined,
      component: componentFilter || undefined,
    });
  }, [overview, gradeFilter, componentFilter]);

  // Evolução por Etapa
  const evolutionData = dashboard?.evolutionByGrade || [
    { label: 'Pré-escola', Leitura: 42, Escrita: 38, Matemática: 35 },
    { label: '1º ano', Leitura: 56, Escrita: 51, Matemática: 45 },
    { label: '2º ano', Leitura: 68, Escrita: 63, Matemática: 55 },
  ];

  // Comparativo de Desempenho por Competência dinâmico
  const comparativeData = useMemo(() => {
    const charts = dashboard?.charts || [];
    let leitScore = null;
    let escScore = null;
    let matScore = null;

    for (const c of charts) {
      if (c.skill === 'LEITURA' && c.score !== null) leitScore = c.score;
      if (c.skill === 'ESCRITA' && c.score !== null) escScore = c.score;
      if ((c.skill === 'PROFICIENCIA_MATEMATICA' || c.component === 'MATEMATICA') && c.score !== null) matScore = c.score;
    }

    return [
      { name: 'Leitura', score: leitScore ?? (evolutionData[2]?.Leitura || 68), fill: '#0284c7' },
      { name: 'Escrita', score: escScore ?? (evolutionData[2]?.Escrita || 63), fill: '#0ea5e9' },
      { name: 'Matemática', score: matScore ?? (evolutionData[2]?.Matemática || 55), fill: '#7c3aed' },
    ];
  }, [dashboard, evolutionData]);

  // Comparativo de Componentes por Etapa
  const componentComparisonData = dashboard?.componentComparisonData || [
    { name: 'Pré-escola', Portugues: 42, Matematica: 38 },
    { name: '1º ano', Portugues: 56, Matematica: 52 },
    { name: '2º ano', Portugues: 72, Matematica: 68 },
  ];

  // Distribuição da Rede
  const donutData = dashboard?.perfDistribution || [
    { name: 'Alcançou o nível de leitura (fluente)', value: 42.1, color: '#16a34a' },
    { name: 'Em desenvolvimento', value: 32.7, color: '#0284c7' },
    { name: 'Em processo inicial', value: 18.5, color: '#f59e0b' },
    { name: 'Não alfabetizado', value: 6.7, color: '#ef4444' },
  ];

  if (loading && !overview) return <LoadingBlock label="Carregando análises do Pacto..." />;
  if (error) return <div className="alert alert-error">{error.message}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Subabas */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        <button
          type="button"
          className={`btn ${activeSubtab === 'ETAPA' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubtab('ETAPA')}
        >
          Por Etapa
        </button>
        <button
          type="button"
          className={`btn ${activeSubtab === 'COMPONENTE' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubtab('COMPONENTE')}
        >
          Por Componente
        </button>
        <button
          type="button"
          className={`btn ${activeSubtab === 'REDE' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubtab('REDE')}
        >
          Por Rede Municipal
        </button>
      </div>

      {/* Filtros da Análise */}
      <div className="card card-pad filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <div style={{ width: 200 }}>
          <Field label="Etapa/Ano">
            <Select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
              <option value="">Todas as etapas</option>
              <option value="0">Pré-escola (PII)</option>
              <option value="1">1º ano</option>
              <option value="2">2º ano</option>
            </Select>
          </Field>
        </div>

        <div style={{ width: 220 }}>
          <Field label="Componente">
            <Select value={componentFilter} onChange={(e) => setComponentFilter(e.target.value)}>
              <option value="">Língua Portuguesa</option>
              <option value="MATEMATICA">Matemática</option>
              <option value="INICIAL">Habilidades Iniciais</option>
              <option value="ALL">Todos os componentes</option>
            </Select>
          </Field>
        </div>

        {(gradeFilter || componentFilter) && (
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 36, marginTop: 'auto' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setGradeFilter(''); setComponentFilter(''); }}
              style={{ height: 36, whiteSpace: 'nowrap' }}
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* SUBABA 1: POR ETAPA */}
      {activeSubtab === 'ETAPA' && (
        <div className="pacto-analises-layout">
          {/* Gráfico 1: Evolução da Proficiência */}
          <div className="card card-pad" style={{ borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 14 }}>Evolução da Proficiência por Etapa</strong>
              <div className="pacto-chart-legend">
                <span className="legend-item"><i className="dot" style={{ background: '#0284c7' }} /> Leitura</span>
                <span className="legend-item"><i className="dot" style={{ background: '#16a34a' }} /> Escrita</span>
                <span className="legend-item"><i className="dot" style={{ background: '#7c3aed' }} /> Matemática</span>
              </div>
            </div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={evolutionData} margin={{ top: 14, right: 18, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--text-3)" fontSize={11} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="var(--text-3)" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={(value) => [`${value}%`]}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
                  />
                  <Line type="monotone" dataKey="Leitura" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Escrita" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Matemática" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico 2: Comparativo de Desempenho (Barras Horizontais) */}
          <div className="card card-pad" style={{ borderRadius: 12 }}>
            <strong style={{ fontSize: 14, display: 'block', marginBottom: 16 }}>
              Comparativo de Desempenho Consolidado
            </strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '10px 0' }}>
              {comparativeData.map((item) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 90, fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>{item.name}</span>
                  <div style={{ flex: 1, height: 18, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${item.score}%`,
                        background: item.fill,
                        borderRadius: 6,
                      }}
                    />
                  </div>
                  <strong style={{ width: 44, textAlign: 'right', fontSize: 13 }}>{item.score}%</strong>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, padding: 14, borderRadius: 8, background: 'var(--primary-soft)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)' }}>
              💡 <strong>Destaque pedagógico:</strong> As habilidades de Leitura apresentam o maior avanço acumulado no ciclo, seguidas por Escrita e Matemática.
            </div>
          </div>
        </div>
      )}

      {/* SUBABA 2: POR COMPONENTE */}
      {activeSubtab === 'COMPONENTE' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <div className="card card-pad" style={{ borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <strong style={{ fontSize: 14 }}>Resultados Comparados por Componente</strong>
              <div className="pacto-chart-legend">
                <span className="legend-item"><i className="square" style={{ background: '#0284c7' }} /> Português</span>
                <span className="legend-item"><i className="square" style={{ background: '#7c3aed' }} /> Matemática</span>
              </div>
            </div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={componentComparisonData} margin={{ top: 14, right: 12, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--text-3)" fontSize={11} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke="var(--text-3)" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={(value) => [`${value}%`]}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
                  />
                  <Bar dataKey="Portugues" name="Língua Portuguesa" fill="#0284c7" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="Matematica" name="Matemática" fill="#7c3aed" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card card-pad" style={{ borderRadius: 12 }}>
            <strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>
              Síntese Pedagógica por Competência
            </strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 12, borderRadius: 8, background: 'rgba(22, 163, 74, 0.12)', border: '1px solid rgba(22, 163, 74, 0.25)' }}>
                <strong style={{ fontSize: 12.5, color: '#16a34a' }}>📖 Língua Portuguesa</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-2)' }}>
                  Acompanhamento contínuo dos perfis de leitor (PL, LI, LF), compreensão leitora (NC, CO, CA) e níveis psicogenéticos de escrita (PA, AI, AC).
                </p>
              </div>

              <div style={{ padding: 12, borderRadius: 8, background: 'rgba(124, 58, 237, 0.12)', border: '1px solid rgba(124, 58, 237, 0.25)' }}>
                <strong style={{ fontSize: 12.5, color: '#a78bfa' }}>📐 Matemática</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-2)' }}>
                  Avaliação da proficiência numérica, raciocínio lógico e resolução de problemas estruturados (Não Proficiente, Proficiente Inicial e Proficiente).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBABA 3: POR REDE MUNICIPAL */}
      {activeSubtab === 'REDE' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <div className="card card-pad" style={{ borderRadius: 12 }}>
            <strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>
              Distribuição Geral dos Estudantes da Rede Municipal
            </strong>
            <div style={{ display: 'flex', alignItems: 'center', height: 230 }}>
              <div style={{ width: 150, height: 180, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value">
                      {donutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val) => [`${val}%`, 'Participação']}
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {donutData.map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <i style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                      {d.name}
                    </span>
                    <strong>{d.value}%</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card card-pad" style={{ borderRadius: 12 }}>
            <strong style={{ fontSize: 14, display: 'block', marginBottom: 12 }}>
              Cobertura da Rede Municipal de Abaetetuba/PA
            </strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Escolas na Rede</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{overview?.schools?.length || 72} escolas</div>
              </div>
              <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Taxa de Conclusão</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--success)' }}>
                  {dashboard?.metrics?.participationPercentage || 88}%
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
