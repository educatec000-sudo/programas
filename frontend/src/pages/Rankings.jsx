import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { rankingsApi, programsApi, indicatorsApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Button, Field, Select, LoadingBlock, Badge } from '../components/ui.jsx';
import { ComparisonBarChart } from '../components/charts.jsx';
import { CLASSIFICATION_INFO, fmt, PERIODS, yearsRange } from '../utils/format.js';

export default function Rankings() {
  const { can } = useAuth();
  const { success, error } = useToast();

  const [programId, setProgramId] = useState('');
  const [indicatorId, setIndicatorId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState('');

  const { data, loading } = useApi(
    () => rankingsApi.get({ programId: programId || undefined, indicatorId: indicatorId || undefined, year, period: period || undefined }),
    [programId, indicatorId, year, period],
  );
  const { data: programs } = useApi(() => programsApi.list({ pageSize: 200 }), []);
  const { data: indicators } = useApi(() => indicatorsApi.list({ pageSize: 200 }), []);

  const [busy, setBusy] = useState(false);
  const consolidate = async () => {
    if (!programId || !data?.period) return;
    setBusy(true);
    try {
      const res = await rankingsApi.consolidate({ programId, year, period: data.period });
      success(`Avaliação consolidada: ${res.consolidated} escolas (${res.period}/${res.year}).`);
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'position', label: '#', width: 60, align: 'center', render: (r) => <strong style={{ fontSize: 15 }}>{r.position}</strong> },
    {
      key: 'schoolName', label: 'Escola',
      render: (r) => (
        <div>
          <strong>{r.schoolName}</strong>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>INEP {r.schoolInep} · {r.municipality}</div>
        </div>
      ),
    },
    { key: 'programsCount', label: 'Programas', align: 'center', render: (r) => (programId ? 1 : r.programsCount) },
    { key: 'resultsCount', label: 'Resultados', align: 'center' },
    { key: 'score', label: 'Pontuação', align: 'right', render: (r) => <strong style={{ fontSize: 14.5 }}>{fmt(r.score)}%</strong> },
    {
      key: 'classification', label: 'Classificação',
      render: (r) => {
        const info = CLASSIFICATION_INFO[r.classification];
        return <Badge cls={info?.cls} title={info?.label}>{r.classification} · {info?.label}</Badge>;
      },
    },
    { key: 'previousScore', label: 'Pont. anterior', align: 'right', render: (r) => fmt(r.previousScore) },
    {
      key: 'evolution', label: 'Evolução', align: 'right',
      render: (r) =>
        r.scoreDiff === null || r.scoreDiff === undefined ? (
          '—'
        ) : (
          <span className={r.scoreDiff >= 0 ? 'pos-up' : 'pos-down'}>
            {r.scoreDiff >= 0 ? '▲' : '▼'} {fmt(Math.abs(r.scoreDiff))} p.p.
          </span>
        ),
    },
    {
      key: 'posDiff', label: 'Posição', align: 'center',
      render: (r) =>
        r.positionDiff === null || r.positionDiff === undefined ? (
          '—'
        ) : (
          <span className={r.positionDiff >= 0 ? 'pos-up' : 'pos-down'}>
            {r.positionDiff >= 0 ? '↑' : '↓'} {Math.abs(r.positionDiff)}
          </span>
        ),
    },
    {
      key: 'open', label: '', align: 'right',
      render: (r) => <Link to={`/escolas/${r.schoolId}`} className="btn btn-ghost btn-sm">Ver escola →</Link>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Rankings"
        subtitle="Pontuação ponderada por indicador, classificação e evolução entre períodos"
        actions={
          can('evaluations:write') && programId && data?.period ? (
            <Button variant="success" onClick={consolidate} disabled={busy}>📸 Consolidar avaliação</Button>
          ) : null
        }
      />

      <div className="filter-bar">
        <Field label="Programa">
          <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">Geral (todos os programas)</option>
            {(programs?.data || []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </Select>
        </Field>
        <Field label="Indicador">
          <Select value={indicatorId} onChange={(e) => setIndicatorId(e.target.value)}>
            <option value="">Todos (pontuação ponderada)</option>
            {(indicators?.data || []).map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
          </Select>
        </Field>
        <Field label="Ano">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearsRange(2023).map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
        <Field label="Período">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="">Mais recente com dados</option>
            {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : !data ? null : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge cls="badge-blue">Período: {data.period || '—'}/{data.year}</Badge>
            {data.previousPeriod && <Badge cls="badge-gray">Comparando com: {data.previousPeriod.period}/{data.previousPeriod.year}</Badge>}
            <Badge cls="badge-gray">{data.rows.length} escolas pontuadas</Badge>
          </div>

          <div style={{ marginBottom: 16 }}>
            <ComparisonBarChart
              title="Top 10 escolas no período"
              subtitle="Percentual de atingimento das metas"
              data={data.rows.slice(0, 10).map((r) => ({ name: r.schoolName.split(' ').slice(0, 3).join(' '), score: r.score }))}
            />
          </div>

          <DataTable
            columns={columns}
            rows={data.rows}
            emptyTitle="Sem pontuação no período selecionado"
            emptyHint="É necessário ter resultados lançados e metas cadastradas para os indicadores."
            emptyIcon="🏆"
          />
        </>
      )}
    </>
  );
}
