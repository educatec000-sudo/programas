import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { dashboardApi, programsApi } from '../services/resources.js';
import { Alert, LoadingBlock, Select, StatCard, Badge } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { EvolutionChart, ComparisonBarChart, ClassificationDonut } from '../components/charts.jsx';
import { CLASSIFICATION_INFO, fmt, fmtInt, yearsRange } from '../utils/format.js';
import { Icon } from '../components/icons.jsx';
import SchoolMap from '../components/SchoolMap.jsx';
import { supportsSharedFeature } from '../programs/registry.js';

export default function Dashboard() {
  const [year, setYear] = useState('');
  const [programId, setProgramId] = useState('');
  const { data: programs } = useApi(() => programsApi.list({ pageSize: 1000 }), []);
  const { data, loading } = useApi(
    () => dashboardApi.get({ year: year || undefined, programId: programId || undefined }),
    [year, programId],
  );

  const selectedProgram = data?.selectedProgram;

  return (
    <>
      <PageHeader
        title="Dashboard — Estatística"
        subtitle="Visão gerencial da plataforma; pontuações e rankings sempre pertencem a um único programa"
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={programId} onChange={(event) => setProgramId(event.target.value)} style={{ minWidth: 240 }}>
              <option value="">Visão gerencial — sem nota geral</option>
              {(programs?.data || []).filter((item) => supportsSharedFeature(item, 'graficos')).map((program) => (
                <option key={program.id} value={program.id}>{program.code} — {program.name}</option>
              ))}
            </Select>
            <Select value={year} onChange={(event) => setYear(event.target.value)} style={{ width: 120 }}>
              <option value="">Ano automático</option>
              {yearsRange().map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </div>
        }
      />

      {loading || !data ? (
        <LoadingBlock label="Calculando indicadores do painel..." />
      ) : (
        <>
          {!selectedProgram && (
            <Alert type="info">
              A visão geral compara programas em blocos separados e não cria uma nota municipal misturando programas diferentes. Selecione um programa para ver avaliação, classificação, evolução e ranking.
            </Alert>
          )}

          <div className="stats-grid">
            <StatCard icon={Icon.program()} label="Programas ativos" value={data.kpis.programsActive} hint={`${data.kpis.programsTotal} no total`} tone="blue" />
            <StatCard icon={Icon.school()} label="Escolas cadastradas" value={fmtInt(data.kpis.schoolsTotal)} tone="cyan" />
            <StatCard
              icon={Icon.check()}
              label={selectedProgram ? `Escolas em ${selectedProgram.name}` : 'Escolas participantes'}
              value={fmtInt(data.kpis.participatingSchools)}
              tone="violet"
            />
            <StatCard
              icon={Icon.indicator()}
              label={selectedProgram ? 'Critérios do programa' : 'Critérios ativos no catálogo'}
              value={fmtInt(data.kpis.indicatorsActive)}
              tone="yellow"
            />
            <StatCard icon={Icon.result()} label="Resultados lançados" value={fmtInt(data.kpis.resultsTotal)} hint={`${data.kpis.resultsThisYear} em ${data.year}`} tone="green" />
            {selectedProgram && (
              <StatCard icon={Icon.goal()} label="Metas atingidas" value={fmtInt(data.kpis.goalsMet)} hint={`${data.kpis.goalsNotMet} não atingidas`} tone={data.kpis.goalsMet >= data.kpis.goalsNotMet ? 'green' : 'red'} />
            )}
          </div>

          <SchoolMap schools={data.map?.schools || []} />

          <div style={{ marginBottom: 16 }}>
            <ComparisonBarChart
              title="Desempenho por programa"
              subtitle="Cada barra é calculada isoladamente com os critérios do próprio programa"
              data={data.charts.performanceByProgram.map((program) => ({ name: program.name, score: program.score }))}
            />
          </div>

          {selectedProgram && (
            <>
              <div className="chart-grid" style={{ marginBottom: 16 }}>
                <EvolutionChart
                  title={`Evolução — ${selectedProgram.name}`}
                  subtitle={`Percentual de atingimento das metas configuradas · ${data.year}`}
                  data={data.charts.evolution}
                />
                <ClassificationDonut
                  title={`Classificação — ${selectedProgram.name}`}
                  subtitle={`Último período de ${data.year}`}
                  distribution={Object.fromEntries(data.charts.distribution.map((entry) => [entry.classification, entry.count]))}
                />
              </div>

              <div className="card card-pad">
                <div className="card-title">Ranking — {selectedProgram.name}</div>
                <div className="card-subtitle">Escolas avaliadas somente neste programa</div>
                {data.charts.topSchools.map((school) => (
                  <div key={school.schoolId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px dashed var(--border)' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', fontWeight: 800, background: school.position === 1 ? '#fde68a' : '#f1f5f9' }}>
                      {school.position}
                    </div>
                    <div style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{school.name}</div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{fmt(school.score)}%</div>
                      <Badge cls={CLASSIFICATION_INFO[school.classification]?.cls}>
                        {school.classification} · {CLASSIFICATION_INFO[school.classification]?.label}
                      </Badge>
                    </div>
                    <Link to={`/programas/${selectedProgram.id}/escolas/${school.schoolId}`} className="btn btn-ghost btn-sm">Abrir</Link>
                  </div>
                ))}
                {!data.charts.topSchools.length && <div className="empty-state">Sem resultados e metas suficientes neste programa.</div>}
                <div style={{ marginTop: 12 }}>
                  <Link to={`/rankings?programId=${selectedProgram.id}`} style={{ fontSize: 13 }}>Ver ranking completo →</Link>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
