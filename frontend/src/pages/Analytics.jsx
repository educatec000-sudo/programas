import React, { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { analyticsApi, programsApi, indicatorsApi, schoolsApi } from '../services/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import { LoadingBlock, Field, Select, StatCard } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import { EvolutionChart, ClassificationDonut, ComparisonBarChart, MultiLineChart, CHART_COLORS } from '../components/charts.jsx';
import { fmt, fmtInt, yearsRange, PERIODS, CLASSIFICATION_INFO } from '../utils/format.js';
import { Icon } from '../components/icons.jsx';

export default function Analytics() {
  const [programId, setProgramId] = useState('');
  const [indicatorId, setIndicatorId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [compareProgramYear, setCompareProgramYear] = useState(new Date().getFullYear());

  const { data: overview, loading } = useApi(
    () => analyticsApi.overview({ programId: programId || undefined, indicatorId: indicatorId || undefined, year }),
    [programId, indicatorId, year],
  );

  const { data: programs } = useApi(() => programsApi.list({ pageSize: 200 }), []);
  const { data: indicators } = useApi(() => indicatorsApi.list({ pageSize: 200 }), []);
  const { data: schools } = useApi(() => schoolsApi.list({ pageSize: 200 }), []);

  const [selectedSchools, setSelectedSchools] = useState([]);
  const { data: comparison } = useApi(
    () =>
      selectedSchools.length
        ? analyticsApi.compareSchools({ schoolIds: selectedSchools.join(','), programId: programId || undefined, year })
        : Promise.resolve(null),
    [selectedSchools.join(','), programId, year],
  );

  const { data: programComparison } = useApi(
    () => analyticsApi.comparePrograms({ year: compareProgramYear }),
    [compareProgramYear],
  );

  const toggleSchool = (id) =>
    setSelectedSchools((sel) => (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id].slice(-6)));

  return (
    <>
      <PageHeader
        title="Análises"
        subtitle="Desempenho de escolas e programas, metas, evolução e comparações"
      />

      <div className="filter-bar">
        <Field label="Programa">
          <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">Todos os programas</option>
            {(programs?.data || []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </Select>
        </Field>
        <Field label="Indicador">
          <Select value={indicatorId} onChange={(e) => setIndicatorId(e.target.value)}>
            <option value="">Todos os indicadores</option>
            {(indicators?.data || []).map((i) => <option key={i.id} value={i.id}>{i.code}</option>)}
          </Select>
        </Field>
        <Field label="Ano">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearsRange(2023).map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
      </div>

      {loading || !overview ? (
        <LoadingBlock label="Processando análises..." />
      ) : (
        <>
          <div className="stats-grid">
            <StatCard icon={Icon.check()} label="Escolas acima da meta" value={fmtInt(overview.goals.totals.met)} tone="green" />
            <StatCard icon={Icon.filter()} label="Escolas abaixo da meta" value={fmtInt(overview.goals.totals.notMet)} tone="red" />
            <StatCard icon={Icon.school()} label="Escolas avaliadas" value={fmtInt(overview.goals.totals.schools)} tone="blue" />
          </div>

          <div className="chart-grid" style={{ marginBottom: 16 }}>
            <EvolutionChart title="Evolução temporal" subtitle="Pontuação média (% da meta)" data={overview.evolution} />
            <ClassificationDonut
              title="Distribuição de classificações"
              subtitle={`${overview.distribution.period || '—'}/${year}`}
              distribution={overview.distribution.distribution}
            />
          </div>

          {/* Metas por indicador */}
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="card-title">Metas x Resultados por indicador</div>
            <div className="card-subtitle">
              Quantidade de escolas acima e abaixo da meta em {overview.goals.period || '—'}/{year}
            </div>
            <DataTable
              columns={[
                { key: 'indicatorCode', label: 'Código', render: (i) => <span className="mono">{i.indicatorCode}</span> },
                { key: 'indicatorName', label: 'Indicador' },
                { key: 'met', label: 'Acima da meta', align: 'center', render: (i) => <strong style={{ color: 'var(--success)' }}>{i.met}</strong> },
                { key: 'notMet', label: 'Abaixo da meta', align: 'center', render: (i) => <strong style={{ color: 'var(--danger)' }}>{i.notMet}</strong> },
                {
                  key: 'pct', label: '% de atingimento', align: 'right',
                  render: (i) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                      <div className="meter" style={{ width: 120 }}>
                        <div style={{ width: `${Math.min(100, (i.met / (i.total || 1)) * 100)}%`, background: i.met / (i.total || 1) >= 0.7 ? 'var(--success)' : 'var(--warning)' }} />
                      </div>
                      {fmt((i.met / (i.total || 1)) * 100)}%
                    </div>
                  ),
                },
              ]}
              rows={overview.goals.byIndicator}
              emptyTitle="Sem metas aplicadas no período"
              emptyIcon="🎯"
            />
          </div>

          {/* Comparação entre escolas */}
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="card-title">Comparação entre escolas</div>
            <div className="card-subtitle">Selecione até 6 escolas para comparar a evolução da pontuação</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
              {(schools?.data || []).slice(0, 24).map((s) => (
                <button
                  key={s.id}
                  className={`pill ${selectedSchools.includes(s.id) ? 'active' : ''}`}
                  onClick={() => toggleSchool(s.id)}
                  type="button"
                >
                  {s.name.replace('E.M.E.F. ', '')}
                </button>
              ))}
            </div>
            {comparison && comparison.length ? (
              <MultiLineChart
                title="Evolução comparada"
                subtitle="Pontuação (% da meta) por período"
                labels={comparison[0].data.map((d) => d.label)}
                series={comparison.map((c, i) => ({
                  name: c.schoolName.replace('E.M.E.F. ', '').slice(0, 22),
                  color: CHART_COLORS[i % CHART_COLORS.length],
                  points: c.data.map((d) => d.score),
                }))}
                height={300}
              />
            ) : (
              <div className="empty-state">Selecione escolas acima para comparar.</div>
            )}
          </div>

          {/* Comparação entre programas */}
          <div className="card card-pad">
            <div className="card-header-row">
              <div>
                <div className="card-title">Comparação entre programas</div>
                <div className="card-subtitle">Pontuação média das escolas — período mais recente de cada programa</div>
              </div>
              <Select value={compareProgramYear} onChange={(e) => setCompareProgramYear(Number(e.target.value))} style={{ width: 110 }}>
                {yearsRange(2023).map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </div>
            {programComparison?.programs?.length ? (
              <ComparisonBarChart
                title=""
                subtitle=""
                data={programComparison.programs.map((p) => ({ name: p.code, score: p.currentScore }))}
                height={280}
              />
            ) : (
              <div className="empty-state">Sem dados de programas neste ano.</div>
            )}
          </div>
        </>
      )}
    </>
  );
}
