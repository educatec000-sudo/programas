import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { analyticsApi, programsApi } from '../services/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import { Alert, LoadingBlock, Field, Select, StatCard, ErrorBoundary } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import { EvolutionChart, ClassificationDonut, ComparisonBarChart, MultiLineChart, CHART_COLORS } from '../components/charts.jsx';
import { fmt, fmtInt, yearsRange, CLASSIFICATION_INFO } from '../utils/format.js';
import { Icon } from '../components/icons.jsx';
import { getProgramImplementation } from '../programs/registry.js';

export default function Analytics() {
  const [searchParams] = useSearchParams();
  const [programId, setProgramId] = useState(searchParams.get('programId') || '');
  const [indicatorId, setIndicatorId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [compareProgramYear, setCompareProgramYear] = useState(new Date().getFullYear());

  const { data: programsData, loading: loadingPrograms } = useApi(
    () => programsApi.list({ pageSize: 100 }),
    [],
  );
  const programs = programsData?.data || [];

  // Seleciona o primeiro programa automaticamente por padrão
  useEffect(() => {
    if (!programId && programs.length > 0) {
      setProgramId(programs[0].id);
    }
  }, [programId, programs]);

  const selectedProgram = useMemo(() => {
    return programs.find((p) => p.id === programId) || programs[0] || null;
  }, [programs, programId]);

  const implementation = useMemo(() => {
    return getProgramImplementation(selectedProgram);
  }, [selectedProgram]);

  // Procura aba analítica específica do programa (ex.: pacto-analises, cnca-analises, parc-evolucao, sispae-analises)
  const specificAnalyticsTab = useMemo(() => {
    if (!implementation?.adminTabs) return null;
    return (
      implementation.adminTabs.find((t) => t.key.includes('analise')) ||
      implementation.adminTabs.find((t) => t.key.includes('evolucao')) ||
      null
    );
  }, [implementation]);

  const { data: overview, loading: loadingOverview } = useApi(
    () =>
      programId && !specificAnalyticsTab
        ? analyticsApi.overview({ programId, indicatorId: indicatorId || undefined, year })
        : Promise.resolve(null),
    [programId, indicatorId, year, specificAnalyticsTab],
  );

  const [selectedSchools, setSelectedSchools] = useState([]);
  const { data: comparison } = useApi(
    () =>
      selectedSchools.length && programId && !specificAnalyticsTab
        ? analyticsApi.compareSchools({ schoolIds: selectedSchools.join(','), programId, year })
        : Promise.resolve(null),
    [selectedSchools.join(','), programId, year, specificAnalyticsTab],
  );

  const { data: programComparison } = useApi(
    () => (!specificAnalyticsTab ? analyticsApi.comparePrograms({ year: compareProgramYear }) : Promise.resolve(null)),
    [compareProgramYear, specificAnalyticsTab],
  );

  const toggleSchool = (id) =>
    setSelectedSchools((sel) => (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id].slice(-6)));

  if (loadingPrograms && programs.length === 0) {
    return <LoadingBlock label="Carregando análises dos programas educacionais..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Análises & Indicadores Pedagógicos"
        subtitle="Evolução, desempenho e gráficos detalhados por programa educacional"
      />

      {/* Barra de Seleção do Programa */}
      <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 300px' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2, #64748b)', textTransform: 'uppercase' }}>
            Programa:
          </span>
          <Select
            value={programId}
            onChange={(e) => {
              setProgramId(e.target.value);
              setIndicatorId('');
              setSelectedSchools([]);
            }}
            style={{ fontSize: 13, fontWeight: 600, minWidth: 260 }}
          >
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.year})
              </option>
            ))}
          </Select>
        </div>

        {selectedProgram && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                background: 'rgba(2, 132, 199, 0.1)',
                color: '#0284c7',
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {selectedProgram.periodLabel || `Ciclo ${selectedProgram.year}`}
            </span>
          </div>
        )}
      </div>

      {/* Renderização da Análise Específica do Programa ou Padrão */}
      {specificAnalyticsTab && selectedProgram ? (
        <ErrorBoundary>
          <specificAnalyticsTab.Component program={selectedProgram} />
        </ErrorBoundary>
      ) : loadingOverview ? (
        <LoadingBlock label="Processando análises..." />
      ) : overview ? (
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
              {(selectedProgram?.schools || []).filter((school) => school.linkActive).slice(0, 24).map((s) => (
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
        </>
      ) : (
        <Alert type="info">Selecione um programa acima para visualizar as análises pedagógicas.</Alert>
      )}
    </div>
  );
}
