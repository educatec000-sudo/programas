import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { dashboardApi } from '../services/resources.js';
import { LoadingBlock, Select } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { StatCard, Badge } from '../components/ui.jsx';
import { EvolutionChart, ComparisonBarChart, ClassificationDonut } from '../components/charts.jsx';
import { CLASSIFICATION_INFO, fmt, fmtInt, yearsRange } from '../utils/format.js';
import { Icon } from '../components/icons.jsx';

export default function Dashboard() {
  const [year, setYear] = useState('');
  const { data, loading } = useApi(() => dashboardApi.get({ year: year || undefined }), [year]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral dos programas educacionais, metas e resultados"
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Ano de referência</span>
            <Select value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 120 }}>
              <option value="">Automático</option>
              {yearsRange().map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </div>
        }
      />

      {loading || !data ? (
        <LoadingBlock label="Calculando indicadores do painel..." />
      ) : (
        <>
          <div className="stats-grid">
            <StatCard icon={Icon.program()} label="Programas ativos" value={data.kpis.programsActive} hint={`${data.kpis.programsTotal} no total`} tone="blue" />
            <StatCard icon={Icon.school()} label="Escolas cadastradas" value={fmtInt(data.kpis.schoolsTotal)} tone="cyan" />
            <StatCard icon={Icon.check()} label="Escolas participantes" value={fmtInt(data.kpis.participatingSchools)} tone="violet" />
            <StatCard icon={Icon.indicator()} label="Indicadores ativos" value={fmtInt(data.kpis.indicatorsActive)} tone="yellow" />
            <StatCard icon={Icon.result()} label="Resultados lançados" value={fmtInt(data.kpis.resultsTotal)} hint={`${data.kpis.resultsThisYear} em ${data.year}`} tone="green" />
            <StatCard icon={Icon.goal()} label="Metas atingidas" value={fmtInt(data.kpis.goalsMet)} hint={`${data.kpis.goalsNotMet} não atingidas`} tone={data.kpis.goalsMet >= data.kpis.goalsNotMet ? 'green' : 'red'} />
          </div>

          <div className="chart-grid" style={{ marginBottom: 16 }}>
            <EvolutionChart
              title="Evolução da pontuação média"
              subtitle={`Percentual de atingimento das metas · ${data.year}`}
              data={data.charts.evolution}
            />
            <ClassificationDonut
              title="Classificação das escolas"
              subtitle={`Último período de ${data.year}`}
              distribution={Object.fromEntries(data.charts.distribution.map((d) => [d.classification, d.count]))}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
            <ComparisonBarChart
              title="Desempenho por programa"
              subtitle="Pontuação média das escolas no período mais recente"
              data={data.charts.performanceByProgram.map((p) => ({ name: p.name, score: p.score }))}
            />

            <div className="card card-pad">
              <div className="card-title">Top 5 escolas</div>
              <div className="card-subtitle">Melhores pontuações no período</div>
              {data.charts.topSchools.map((s) => (
                <div key={s.schoolId || s.position} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px dashed var(--border)' }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center',
                    fontWeight: 800, fontSize: 13,
                    background: s.position === 1 ? '#fde68a' : s.position <= 3 ? '#e2e8f0' : '#f1f5f9',
                    color: 'var(--text)',
                  }}>
                    {s.position}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.name}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{fmt(s.score)}%</div>
                    <Badge cls={CLASSIFICATION_INFO[s.classification]?.cls}>{s.classification} · {CLASSIFICATION_INFO[s.classification]?.label}</Badge>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 12 }}>
                <Link to="/rankings" style={{ fontSize: 13 }}>Ver ranking completo →</Link>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
