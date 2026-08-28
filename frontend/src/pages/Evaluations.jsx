import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { rankingsApi, programsApi, schoolsApi } from '../services/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Badge, Field, Select } from '../components/ui.jsx';
import { CLASSIFICATION_INFO, fmt, fmtDateTime, PERIODS, yearsRange } from '../utils/format.js';

/** Avaliações consolidadas, sempre identificadas por programa e escola. */
export default function Evaluations() {
  const [filters, setFilters] = useState({ programId: '', schoolId: '', year: '', period: '' });
  const { data, loading } = useApi(
    () => rankingsApi.evaluations(Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))),
    [filters],
  );
  const { data: programs } = useApi(() => programsApi.list({ pageSize: 1000 }), []);
  const { data: schools } = useApi(() => schoolsApi.list({ pageSize: 1000 }), []);

  const set = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));

  return (
    <>
      <PageHeader
        title="Avaliações"
        subtitle="Avaliações consolidadas por programa, escola, ano e período — sem combinar programas"
      />

      <div className="filter-bar">
        <Field label="Programa">
          <Select value={filters.programId} onChange={set('programId')}>
            <option value="">Todos, exibidos separadamente</option>
            {(programs?.data || []).map((program) => (
              <option key={program.id} value={program.id}>{program.code} — {program.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Escola">
          <Select value={filters.schoolId} onChange={set('schoolId')}>
            <option value="">Todas</option>
            {(schools?.data || []).map((school) => (
              <option key={school.id} value={school.id}>{school.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Ano">
          <Select value={filters.year} onChange={set('year')}>
            <option value="">Todos</option>
            {yearsRange(2023).map((year) => <option key={year} value={year}>{year}</option>)}
          </Select>
        </Field>
        <Field label="Período">
          <Select value={filters.period} onChange={set('period')}>
            <option value="">Todos</option>
            {PERIODS.map((period) => <option key={period} value={period}>{period}</option>)}
          </Select>
        </Field>
      </div>

      <DataTable
        columns={[
          { key: 'program', label: 'Programa', render: (row) => <strong>{row.program.name}</strong> },
          { key: 'school', label: 'Escola', render: (row) => row.school.name },
          { key: 'year', label: 'Ano' },
          { key: 'period', label: 'Período' },
          { key: 'score', label: 'Pontuação', align: 'right', render: (row) => `${fmt(row.score)}%` },
          {
            key: 'classification', label: 'Classificação',
            render: (row) => {
              const info = CLASSIFICATION_INFO[row.classification];
              return <Badge cls={info?.cls}>{row.classification} · {info?.label}</Badge>;
            },
          },
          { key: 'position', label: 'Posição', align: 'center' },
          { key: 'consolidatedAt', label: 'Consolidada em', render: (row) => fmtDateTime(row.consolidatedAt) },
          { key: 'consolidatedBy', label: 'Responsável', render: (row) => row.consolidatedBy?.name || '—' },
          {
            key: 'open', label: '', align: 'right',
            render: (row) => (
              <Link
                to={`/programas/${row.program.id}/escolas/${row.school.id}?year=${row.year}&period=${encodeURIComponent(row.period)}`}
                className="btn btn-secondary btn-sm"
              >
                Abrir avaliação
              </Link>
            ),
          },
        ]}
        rows={data?.data || []}
        loading={loading}
        footer={<span>{data?.total ?? 0} avaliação(ões), sempre separadas por programa</span>}
        emptyTitle="Nenhuma avaliação consolidada"
        emptyHint="Selecione um programa no Ranking e consolide um período com resultados e metas configurados."
        emptyIcon="📝"
      />
    </>
  );
}
