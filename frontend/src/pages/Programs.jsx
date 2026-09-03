import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useDebounce } from '../hooks/useApi.js';
import { programsApi } from '../services/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import { Badge, Field, Input, Select, LoadingBlock } from '../components/ui.jsx';
import { PROGRAM_STATUS } from '../utils/format.js';
import { getProgramImplementation } from '../programs/registry.js';

function coverageLabel(program) {
  if (!program.schoolsCount) return 'Sem escolas vinculadas';
  if (program.dataCoveragePercent === 100) return 'Dados registrados para todas as escolas';
  if (program.schoolsWithDataCount) return 'Dados parcialmente registrados';
  return 'Nenhum resultado registrado';
}

function ProgramCard({ program, onOpen }) {
  const status = PROGRAM_STATUS[program.status];
  const percentage = program.dataCoveragePercent || 0;
  const implementation = getProgramImplementation({
    ...program.currentCycle,
    catalog: { code: program.code },
  });
  const specificAvailable = implementation && !implementation.unavailableCycle;

  return (
    <article
      className="program-card"
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className={`program-card-accent program-card-accent-${program.status.toLowerCase()}`} />
      <div className="program-card-header">
        <div>
          <div className="program-card-code">{program.code}</div>
          <h2>{program.name}</h2>
          <div className="program-card-cycle">
            {program.availableYears.length > 1 ? 'Ciclos' : 'Ciclo'}: {program.availableYears.join(' · ')}
          </div>
        </div>
        <Badge cls={status?.cls}>{status?.label || program.status}</Badge>
      </div>

      <p className="program-card-description">
        {program.description || program.objective || 'Programa educacional implementado no CPE.'}
      </p>

      <div className="program-card-current-cycle">
        Dados do ciclo em destaque: <strong>{program.year}</strong>{program.periodLabel ? ` · ${program.periodLabel}` : ''}
      </div>

      <div className="program-card-metrics">
        <div>
          <strong>{program.schoolsCount}</strong>
          <span>Escolas vinculadas</span>
        </div>
        <div>
          <strong>{program.schoolsWithDataCount}</strong>
          <span>Com dados</span>
        </div>
        <div>
          <strong>{program.pendingSchoolsCount}</strong>
          <span>Sem dados</span>
        </div>
      </div>

      <div className="program-card-progress-block">
        <div className="program-card-progress-label">
          <span>{coverageLabel(program)}</span>
          <strong>{percentage}%</strong>
        </div>
        <div className="program-card-progress" aria-label={`Cobertura de dados: ${percentage}%`}>
          <span style={{ width: `${percentage}%` }} />
        </div>
      </div>

      <div className="program-card-footer">
        <div>
          <span className="program-card-footnote">
            {specificAvailable ? `Cobertura dos envios oficiais do ciclo ${program.year}` : `Cobertura dos resultados do ciclo ${program.year}`}
          </span>
          <span className="program-card-collection-note">
            {implementation?.unavailableCycle
              ? 'Ciclo cadastrado; instrumento oficial ainda não implementado.'
              : specificAvailable
                ? 'Ambiente específico implementado a partir da documentação oficial.'
                : 'Infraestrutura compartilhada atual; coleta por link ainda não disponível.'}
          </span>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={(event) => { event.stopPropagation(); onOpen(); }}>
          Acessar programa →
        </button>
      </div>
    </article>
  );
}

export default function Programs() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [status, setStatus] = useState('');

  const { data, loading, error } = useApi(
    () => programsApi.catalogs({ search: debouncedSearch, status, includeCoverage: true }),
    [debouncedSearch, status],
  );

  const programs = data?.data || [];
  const summary = useMemo(() => programs.reduce(
    (totals, program) => ({
      schools: totals.schools + program.schoolsCount,
      withData: totals.withData + program.schoolsWithDataCount,
      pending: totals.pending + program.pendingSchoolsCount,
    }),
    { schools: 0, withData: 0, pending: 0 },
  ), [programs]);

  return (
    <>
      <PageHeader
        title="Programas Educacionais"
        subtitle="Catálogo permanente de programas do CPE — selecione um programa para acessar seus anos e ciclos"
      />

      <div className="stats-grid program-dashboard-summary">
        <div className="stat-card">
          <div className="stat-icon blue">▦</div>
          <div><div className="stat-value">{data?.pagination?.total || 0}</div><div className="stat-label">Programas disponíveis</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">⌂</div>
          <div><div className="stat-value">{summary.schools}</div><div className="stat-label">Vínculos nos ciclos em destaque</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">✓</div>
          <div><div className="stat-value">{summary.withData}</div><div className="stat-label">Escolas com dados</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">◷</div>
          <div><div className="stat-value">{summary.pending}</div><div className="stat-label">Escolas sem dados</div></div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="field grow">
          <label>Buscar programa</label>
          <Input placeholder="Nome, código ou órgão..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <Field label="Status dos ciclos">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            {Object.entries(PROGRAM_STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
          </Select>
        </Field>
      </div>

      {loading ? (
        <LoadingBlock label="Carregando programas..." />
      ) : error ? (
        <div className="alert alert-error">{error.message}</div>
      ) : programs.length ? (
        <div className="program-card-grid">
          {programs.map((program) => (
            <ProgramCard
              key={program.id}
              program={program}
              onOpen={() => navigate(`/programas/${program.currentCycleId}`)}
            />
          ))}
        </div>
      ) : (
        <div className="card card-pad table-empty">
          <div className="empty-icon">▦</div>
          <strong>Nenhum programa encontrado no catálogo</strong>
          <span>Ajuste a busca ou o status. Os programas não são ocultados por ano.</span>
        </div>
      )}
    </>
  );
}
