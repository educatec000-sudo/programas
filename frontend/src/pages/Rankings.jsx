import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { rankingsApi, programsApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Alert, Button, Field, Select, LoadingBlock, Badge } from '../components/ui.jsx';
import { ComparisonBarChart } from '../components/charts.jsx';
import { CLASSIFICATION_INFO, fmt, PERIODS, yearsRange } from '../utils/format.js';
import { supportsSharedFeature } from '../programs/registry.js';

export default function Rankings() {
  const { can } = useAuth();
  const { success, error } = useToast();
  const [searchParams] = useSearchParams();

  const [programId, setProgramId] = useState(searchParams.get('programId') || '');
  const [indicatorId, setIndicatorId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState('');

  const { data: programs } = useApi(() => programsApi.list({ pageSize: 1000 }), []);
  const { data: program } = useApi(
    () => (programId ? programsApi.get(programId) : Promise.resolve(null)),
    [programId],
  );
  const { data, loading, refresh } = useApi(
    () => programId
      ? rankingsApi.get({ programId, indicatorId: indicatorId || undefined, year, period: period || undefined })
      : Promise.resolve(null),
    [programId, indicatorId, year, period],
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
      key: 'schoolName', label: 'Escola',
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
    {
      key: 'open', label: '', align: 'right',
      render: (row) => (
        <Link
          to={`/programas/${programId}/escolas/${row.schoolId}?year=${year}&period=${encodeURIComponent(data?.period || period)}`}
          className="btn btn-ghost btn-sm"
        >
          Ver avaliação
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Rankings por programa"
        subtitle="Cada ranking utiliza somente critérios, escolas e resultados do programa selecionado"
        actions={can('evaluations:write') && programId && data?.period ? (
          <Button variant="success" onClick={consolidate} disabled={busy}>📸 Consolidar avaliação</Button>
        ) : null}
      />

      <div className="filter-bar">
        <Field label="Programa" required>
          <Select value={programId} onChange={(event) => { setProgramId(event.target.value); setIndicatorId(''); setPeriod(''); }}>
            <option value="">Selecione um programa...</option>
            {(programs?.data || []).filter((item) => supportsSharedFeature(item, 'ranking')).map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
          </Select>
        </Field>
        <Field label="Critério">
          <Select value={indicatorId} onChange={(event) => setIndicatorId(event.target.value)} disabled={!programId}>
            <option value="">Todos os critérios do programa</option>
            {(program?.indicators || []).map((criterion) => <option key={criterion.id} value={criterion.id}>{criterion.code} — {criterion.name}</option>)}
          </Select>
        </Field>
        <Field label="Ano">
          <Select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {yearsRange(2023).map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </Field>
        <Field label="Período">
          <Select value={period} onChange={(event) => setPeriod(event.target.value)} disabled={!programId}>
            <option value="">Mais recente com dados</option>
            {PERIODS.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </Field>
      </div>

      {!programId ? (
        <Alert type="info">Selecione um programa. Não existe ranking geral que misture resultados de programas diferentes.</Alert>
      ) : loading ? (
        <LoadingBlock />
      ) : !data ? null : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge cls="badge-blue">Programa: {program?.name || '—'}</Badge>
            <Badge cls="badge-blue">Período: {data.period || '—'}/{data.year}</Badge>
            {data.previousPeriod && <Badge cls="badge-gray">Comparando com: {data.previousPeriod.period}/{data.previousPeriod.year}</Badge>}
            <Badge cls="badge-gray">{data.rows.length} escolas avaliadas</Badge>
          </div>

          <div style={{ marginBottom: 16 }}>
            <ComparisonBarChart
              title={`Top 10 — ${program?.name || 'programa'}`}
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
      )}
    </>
  );
}
