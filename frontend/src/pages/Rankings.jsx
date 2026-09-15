import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { rankingsApi, programsApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Alert, Button, Field, Select, LoadingBlock, Badge, ErrorBoundary } from '../components/ui.jsx';
import { ComparisonBarChart } from '../components/charts.jsx';
import { CLASSIFICATION_INFO, fmt, PERIODS, yearsRange } from '../utils/format.js';
import { getProgramImplementation } from '../programs/registry.js';

export default function Rankings() {
  const { can } = useAuth();
  const { success, error } = useToast();
  const [searchParams] = useSearchParams();

  const [programId, setProgramId] = useState(searchParams.get('programId') || '');
  const [indicatorId, setIndicatorId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState('');

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

  // Procura aba de ranking específica do programa (ex.: pacto-ranking, cnca-ranking, parc-ranking, sispae-ranking)
  const specificRankingTab = useMemo(() => {
    if (!implementation?.adminTabs) return null;
    return implementation.adminTabs.find((t) => t.key.includes('ranking')) || null;
  }, [implementation]);

  const { data, loading: loadingRanking, refresh } = useApi(
    () =>
      programId && !specificRankingTab
        ? rankingsApi.get({ programId, indicatorId: indicatorId || undefined, year, period: period || undefined })
        : Promise.resolve(null),
    [programId, indicatorId, year, period, specificRankingTab],
  );

  const [busy, setBusy] = useState(false);
  const consolidate = async () => {
    if (!programId || !data?.period) return;
    setBusy(true);
    try {
      const result = await rankingsApi.consolidate({ programId, year, period: data.period });
      success(`Avaliação consolidada: ${result.consolidated} escolas (${result.period}/${result.year}).`);
      refresh();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'position', label: '#', width: 60, align: 'center', render: (row) => <strong style={{ fontSize: 15 }}>{row.position}</strong> },
    {
      key: 'schoolName', label: 'Escola Municipal',
      render: (row) => (
        <div>
          <strong>{row.schoolName}</strong>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>INEP {row.schoolInep}</div>
        </div>
      ),
    },
    { key: 'resultsCount', label: 'Resultados', align: 'center' },
    { key: 'score', label: 'Pontuação', align: 'right', render: (row) => <strong style={{ fontSize: 14.5 }}>{fmt(row.score)}%</strong> },
    {
      key: 'classification', label: 'Classificação',
      render: (row) => {
        const info = CLASSIFICATION_INFO[row.classification];
        return <Badge cls={info?.cls} title={info?.label}>{row.classification} · {info?.label}</Badge>;
      },
    },
    { key: 'previousScore', label: 'Pont. anterior', align: 'right', render: (row) => fmt(row.previousScore) },
    {
      key: 'evolution', label: 'Evolução', align: 'right',
      render: (row) => row.scoreDiff == null ? '—' : (
        <span className={row.scoreDiff >= 0 ? 'pos-up' : 'pos-down'}>
          {row.scoreDiff >= 0 ? '▲' : '▼'} {fmt(Math.abs(row.scoreDiff))} p.p.
        </span>
      ),
    },
  ];

  if (loadingPrograms && programs.length === 0) {
    return <LoadingBlock label="Carregando rankings dos programas..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Rankings & Classificação por Programa"
        subtitle="Classificação oficial calculada rigorosamente dentro dos critérios de cada programa"
        actions={can('evaluations:write') && programId && data?.period && !specificRankingTab ? (
          <Button variant="success" onClick={consolidate} disabled={busy}>📸 Consolidar avaliação</Button>
        ) : null}
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
              setPeriod('');
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

      {/* Renderização do Ranking Específico do Programa ou Padrão */}
      {specificRankingTab && selectedProgram ? (
        <ErrorBoundary>
          <specificRankingTab.Component program={selectedProgram} />
        </ErrorBoundary>
      ) : loadingRanking ? (
        <LoadingBlock label="Carregando classificação do programa..." />
      ) : data ? (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge cls="badge-blue">Programa: {selectedProgram?.name || '—'}</Badge>
            <Badge cls="badge-blue">Período: {data.period || '—'}/{data.year}</Badge>
            {data.previousPeriod && <Badge cls="badge-gray">Comparando com: {data.previousPeriod.period}/{data.previousPeriod.year}</Badge>}
            <Badge cls="badge-gray">{data.rows.length} escolas avaliadas</Badge>
          </div>

          <div style={{ marginBottom: 16 }}>
            <ComparisonBarChart
              title={`Top 10 — ${selectedProgram?.name || 'programa'}`}
              subtitle="Percentual de atingimento das metas configuradas neste programa"
              data={data.rows.slice(0, 10).map((row) => ({ name: row.schoolName.split(' ').slice(0, 3).join(' '), score: row.score }))}
            />
          </div>

          <DataTable
            columns={columns}
            rows={data.rows}
            emptyTitle="Sem pontuação no período selecionado"
            emptyHint="Configure metas específicas do programa e lance resultados para seus critérios."
            emptyIcon="🏆"
          />
        </>
      ) : (
        <Alert type="info">Selecione um programa acima para visualizar o ranking.</Alert>
      )}
    </div>
  );
}
