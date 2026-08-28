import React, { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { programsApi } from '../services/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Badge, Field, LoadingBlock, Select, StatCard } from '../components/ui.jsx';
import { CLASSIFICATION_INFO, fmt, fmtDateTime, yearsRange } from '../utils/format.js';
import { Icon } from '../components/icons.jsx';

const SITUATIONS = {
  META_ATINGIDA: { label: 'Meta atingida', cls: 'badge-green' },
  ABAIXO_DA_META: { label: 'Abaixo da meta', cls: 'badge-red' },
  SEM_META: { label: 'Sem meta configurada', cls: 'badge-yellow' },
  SEM_RESULTADO: { label: 'Sem resultado', cls: 'badge-gray' },
};

/** Detalhe de uma escola dentro do contexto isolado de um programa. */
export default function ProgramSchoolEvaluation() {
  const { id, schoolId } = useParams();
  const [searchParams] = useSearchParams();
  const [year, setYear] = useState(searchParams.get('year') || '');
  const [period, setPeriod] = useState(searchParams.get('period') || '');

  const { data, loading, error } = useApi(
    () => programsApi.schoolEvaluation(id, schoolId, {
      ...(year && { year }),
      ...(period && { period }),
    }),
    [id, schoolId, year, period],
  );

  if (loading || !data) {
    if (error) return <div className="alert alert-error">{error.message}</div>;
    return <LoadingBlock label="Carregando avaliação da escola..." />;
  }

  const evaluationInfo = CLASSIFICATION_INFO[data.evaluation?.classification];
  const withResults = data.criteria.filter((criterion) => criterion.result).length;
  const goalsMet = data.criteria.filter((criterion) => criterion.situation === 'META_ATINGIDA').length;

  return (
    <>
      <PageHeader
        title={data.school.name}
        subtitle={`${data.program.name} · INEP ${data.school.inep || '—'} · avaliação exclusiva deste programa`}
        actions={
          <Link to={`/programas/${data.program.id}`} className="btn btn-secondary btn-sm">
            ← Voltar ao programa
          </Link>
        }
      />

      <div className="filter-bar">
        <Field label="Ano">
          <Select value={year || data.year} onChange={(event) => { setYear(event.target.value); setPeriod(''); }}>
            {yearsRange(2023).map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </Field>
        <Field label="Período">
          <Select value={period || data.period || ''} onChange={(event) => setPeriod(event.target.value)}>
            {!data.periods.length && <option value="">Sem resultados</option>}
            {data.periods.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </Field>
        <div style={{ alignSelf: 'flex-end', paddingBottom: 8, fontSize: 12.5, color: 'var(--text-2)' }}>
          Os critérios e resultados abaixo pertencem somente a <strong>{data.program.name}</strong>.
        </div>
      </div>

      <div className="stats-grid">
        <StatCard icon={Icon.indicator()} label="Critérios do programa" value={data.criteria.length} tone="blue" />
        <StatCard icon={Icon.result()} label="Com resultado" value={withResults} tone="cyan" />
        <StatCard icon={Icon.goal()} label="Metas atingidas" value={goalsMet} tone="green" />
        <StatCard
          icon={Icon.trophy()}
          label="Avaliação consolidada"
          value={data.evaluation ? `${fmt(data.evaluation.score)}%` : '—'}
          hint={data.evaluation ? `${data.evaluation.period || data.period} · posição ${data.evaluation.position}` : 'Ainda não consolidada'}
          tone="violet"
        />
      </div>

      {data.evaluation && (
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="card-header-row">
            <div>
              <div className="card-title">Avaliação consolidada</div>
              <div className="card-subtitle">
                {data.period}/{data.year} · consolidada em {fmtDateTime(data.evaluation.consolidatedAt)}
                {data.evaluation.consolidatedBy?.name ? ` por ${data.evaluation.consolidatedBy.name}` : ''}
              </div>
            </div>
            <Badge cls={evaluationInfo?.cls}>
              {data.evaluation.classification} · {evaluationInfo?.label}
            </Badge>
          </div>
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="card-title">Avaliação da escola</div>
        <div className="card-subtitle">
          Resultado, meta e situação calculados somente com a configuração deste programa. Sem meta configurada, o critério não pontua.
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'code', label: 'Código', render: (criterion) => <span className="mono">{criterion.code}</span> },
          { key: 'name', label: 'Critério', render: (criterion) => <strong>{criterion.name}</strong> },
          {
            key: 'result', label: 'Resultado', align: 'right',
            render: (criterion) => criterion.result ? `${fmt(criterion.result.value, 2)}${criterion.unit ? ` ${criterion.unit}` : ''}` : '—',
          },
          {
            key: 'target', label: 'Meta', align: 'right',
            render: (criterion) => criterion.target == null ? '—' : `${fmt(criterion.target, 2)}${criterion.unit ? ` ${criterion.unit}` : ''}`,
          },
          {
            key: 'percentage', label: '% da meta', align: 'right',
            render: (criterion) => criterion.percentage == null ? '—' : `${fmt(criterion.percentage, 1)}%`,
          },
          {
            key: 'situation', label: 'Situação',
            render: (criterion) => {
              const info = SITUATIONS[criterion.situation] || SITUATIONS.SEM_RESULTADO;
              return <Badge cls={info.cls}>{info.label}</Badge>;
            },
          },
          { key: 'notes', label: 'Observação', render: (criterion) => criterion.result?.notes || '—' },
        ]}
        rows={data.criteria}
        emptyTitle="Nenhum critério configurado neste programa"
        emptyHint="Cadastre critérios na área Critérios de avaliação do programa."
        emptyIcon="📊"
      />
    </>
  );
}
