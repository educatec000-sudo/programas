import React, { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi.js';
import { reportsApi, programsApi } from '../services/resources.js';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { Alert, Button, Field, Select, LoadingBlock, ErrorBoundary } from '../components/ui.jsx';
import { PERIODS, yearsRange } from '../utils/format.js';
import { getProgramImplementation } from '../programs/registry.js';

const REPORT_INFO = {
  geral: { icon: '📊', desc: 'Lista gerencial dos programas; cada pontuação permanece isolada' },
  escola: { icon: '🏫', desc: 'Resultados de uma escola dentro de um programa específico' },
  programa: { icon: '📋', desc: 'Ranking completo das escolas de um programa' },
  indicador: { icon: '📈', desc: 'Resultados de um critério dentro de um programa' },
  resultados: { icon: '🧾', desc: 'Resultados lançados no programa selecionado' },
  metas: { icon: '🎯', desc: 'Metas x resultados dos critérios do programa' },
  ranking: { icon: '🏆', desc: 'Ranking exclusivo de um programa' },
  evolucao: { icon: '📉', desc: 'Evolução temporal de um programa' },
};

export default function Reports() {
  const { toast, error } = useToast();
  const { data: types, loading } = useApi(() => reportsApi.types(), []);
  const { data: programsData } = useApi(() => programsApi.list({ pageSize: 100 }), []);
  const programs = programsData?.data || [];

  const [selected, setSelected] = useState('geral');
  const [filters, setFilters] = useState({ programId: '', schoolId: '', indicatorId: '', year: '', period: '' });
  const [format, setFormat] = useState('pdf');
  const [busy, setBusy] = useState(false);

  // Seleciona o primeiro programa automaticamente por padrão se necessário
  useEffect(() => {
    if (!filters.programId && programs.length > 0) {
      setFilters((f) => ({ ...f, programId: programs[0].id, year: String(programs[0].year) }));
    }
  }, [programs, filters.programId]);

  const selectedProgram = useMemo(() => {
    return programs.find((p) => p.id === filters.programId) || programs[0] || null;
  }, [programs, filters.programId]);

  const implementation = useMemo(() => {
    return getProgramImplementation(selectedProgram);
  }, [selectedProgram]);

  const specificReportsTab = useMemo(() => {
    if (!implementation?.adminTabs) return null;
    return implementation.adminTabs.find((t) => t.key.includes('relatorio')) || null;
  }, [implementation]);

  const needsProgram = selected !== 'geral';
  const missingProgram = needsProgram && !filters.programId;
  const missingSchool = selected === 'escola' && !filters.schoolId;
  const missingCriterion = selected === 'indicador' && !filters.indicatorId;
  const missing = missingProgram || missingSchool || missingCriterion;

  const chooseType = (type) => {
    setSelected(type);
    setFilters((current) => ({ ...current, schoolId: '', indicatorId: '' }));
  };

  const chooseProgram = (programId) => {
    const p = programs.find((item) => item.id === programId);
    setFilters((current) => ({
      ...current,
      programId,
      schoolId: '',
      indicatorId: '',
      year: p?.year ? String(p.year) : current.year,
    }));
  };

  const generate = async () => {
    if (missing) {
      const field = missingProgram ? 'programa' : missingSchool ? 'escola' : 'critério';
      toast(`Selecione o campo obrigatório: ${field}.`, { type: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const filename = await reportsApi.generate(selected, { ...filters, format });
      toast(`Relatório gerado: ${filename}`, { type: 'success', title: 'Download iniciado' });
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && programs.length === 0) return <LoadingBlock />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Relatórios & Exportações"
        subtitle="Emissão de relatórios oficiais e consolidações por programa educacional"
      />

      {/* Se o programa selecionado possuir gerador de relatórios específico oficial, renderiza com suporte completo */}
      {specificReportsTab && selectedProgram && (
        <div className="card card-pad" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2, #64748b)', textTransform: 'uppercase' }}>
                Programa Selecionado:
              </span>
              <Select
                value={filters.programId}
                onChange={(e) => chooseProgram(e.target.value)}
                style={{ fontSize: 13, fontWeight: 600, minWidth: 260 }}
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.year})
                  </option>
                ))}
              </Select>
            </div>
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
              Instrumento Oficial
            </span>
          </div>

          <ErrorBoundary>
            <specificReportsTab.Component program={selectedProgram} />
          </ErrorBoundary>
        </div>
      )}

      {/* Gerador de Relatórios Globais do CPE */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="card-title">1. Escolha o tipo de relatório consolidado</div>
          <div className="card-subtitle">Relatórios estruturados para prestação de contas e planejamento pedagógico</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            {(types || []).map((type) => (
              <button
                key={type.key}
                type="button"
                onClick={() => chooseType(type.key)}
                className="card card-pad"
                style={{
                  cursor: 'pointer',
                  textAlign: 'left',
                  padding: '13px 14px',
                  borderColor: selected === type.key ? 'var(--primary)' : 'var(--border)',
                  borderWidth: selected === type.key ? 2 : 1,
                  background: selected === type.key ? 'var(--primary-50)' : 'var(--surface)',
                }}
              >
                <div style={{ fontSize: 20 }}>{REPORT_INFO[type.key]?.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{type.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{REPORT_INFO[type.key]?.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div className="card-title">2. Parâmetros e Formato</div>
          <div className="card-subtitle">Ajuste os filtros de extração</div>

          {needsProgram && (
            <Field label="Programa *">
              <Select value={filters.programId} onChange={(event) => chooseProgram(event.target.value)}>
                <option value="">Selecione o programa...</option>
                {programs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.year})
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {selected === 'escola' && (
            <Field label="Escola participante *">
              <Select
                value={filters.schoolId}
                onChange={(event) => setFilters((current) => ({ ...current, schoolId: event.target.value }))}
                disabled={!selectedProgram}
              >
                <option value="">Selecione a escola...</option>
                {(selectedProgram?.schools || [])
                  .filter((school) => school.linkActive !== false)
                  .map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
              </Select>
            </Field>
          )}

          <Field label="Ano">
            <Select value={filters.year} onChange={(event) => setFilters((current) => ({ ...current, year: event.target.value }))}>
              <option value="">Automático</option>
              {yearsRange(2023).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>

          {['ranking', 'programa', 'metas'].includes(selected) && (
            <Field label="Período">
              <Select value={filters.period} onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value }))}>
                <option value="">Mais recente</option>
                {PERIODS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Formato de Saída">
            <div style={{ display: 'flex', gap: 8 }}>
              {['pdf', 'xlsx', 'csv'].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`pill ${format === item ? 'active' : ''}`}
                  onClick={() => setFormat(item)}
                  style={{ flex: 1, textAlign: 'center' }}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>

          {selected === 'geral' && (
            <Alert type="info">O relatório geral consolida os indicadores dos programas de forma isolada.</Alert>
          )}
          {missing && <Alert type="warn">Preencha os campos obrigatórios (*) antes de gerar.</Alert>}

          <Button block onClick={generate} disabled={busy}>
            {busy ? 'Gerando...' : '⬇ Gerar e baixar relatório'}
          </Button>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 10 }}>
            Toda geração é registrada na auditoria com usuário, tipo, formato e filtros.
          </div>
        </div>
      </div>
    </div>
  );
}
