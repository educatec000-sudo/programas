import React, { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { reportsApi, programsApi } from '../services/resources.js';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { Alert, Button, Field, Select, LoadingBlock } from '../components/ui.jsx';
import { PERIODS, yearsRange } from '../utils/format.js';

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
  const { data: programs } = useApi(() => programsApi.list({ pageSize: 1000 }), []);

  const [selected, setSelected] = useState('geral');
  const [filters, setFilters] = useState({ programId: '', schoolId: '', indicatorId: '', year: '', period: '' });
  const [format, setFormat] = useState('pdf');
  const [busy, setBusy] = useState(false);
  const { data: program } = useApi(
    () => (filters.programId ? programsApi.get(filters.programId) : Promise.resolve(null)),
    [filters.programId],
  );

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
    setFilters((current) => ({ ...current, programId, schoolId: '', indicatorId: '' }));
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

  if (loading) return <LoadingBlock />;

  return (
    <>
      <PageHeader
        title="Relatórios por programa"
        subtitle="Relatórios avaliativos nunca misturam resultados de programas diferentes"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="card-title">1. Escolha o relatório</div>
          <div className="card-subtitle">Todos os relatórios usam dados reais do PostgreSQL</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            {(types || []).map((type) => (
              <button
                key={type.key}
                type="button"
                onClick={() => chooseType(type.key)}
                className="card card-pad"
                style={{
                  cursor: 'pointer', textAlign: 'left', padding: '13px 14px',
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
          <div className="card-title">2. Filtros</div>
          <div className="card-subtitle">Ajuste o escopo do relatório</div>

          {needsProgram && (
            <Field label="Programa *">
              <Select value={filters.programId} onChange={(event) => chooseProgram(event.target.value)}>
                <option value="">Selecione o programa...</option>
                {(programs?.data || []).map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
              </Select>
            </Field>
          )}

          {selected === 'escola' && (
            <Field label="Escola participante *">
              <Select value={filters.schoolId} onChange={(event) => setFilters((current) => ({ ...current, schoolId: event.target.value }))} disabled={!program}>
                <option value="">Selecione a escola...</option>
                {(program?.schools || []).filter((school) => school.linkActive).map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
              </Select>
            </Field>
          )}

          {selected === 'indicador' && (
            <Field label="Critério do programa *">
              <Select value={filters.indicatorId} onChange={(event) => setFilters((current) => ({ ...current, indicatorId: event.target.value }))} disabled={!program}>
                <option value="">Selecione o critério...</option>
                {(program?.indicators || []).map((criterion) => <option key={criterion.id} value={criterion.id}>{criterion.code} — {criterion.name}</option>)}
              </Select>
            </Field>
          )}

          <Field label="Ano">
            <Select value={filters.year} onChange={(event) => setFilters((current) => ({ ...current, year: event.target.value }))}>
              <option value="">Automático</option>
              {yearsRange(2023).map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </Field>

          {['ranking', 'programa', 'metas'].includes(selected) && (
            <Field label="Período">
              <Select value={filters.period} onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value }))}>
                <option value="">Mais recente</option>
                {PERIODS.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </Field>
          )}

          <Field label="3. Formato">
            <div style={{ display: 'flex', gap: 8 }}>
              {['pdf', 'xlsx', 'csv'].map((item) => (
                <button key={item} type="button" className={`pill ${format === item ? 'active' : ''}`} onClick={() => setFormat(item)} style={{ flex: 1, textAlign: 'center' }}>
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>

          {selected === 'geral' && (
            <Alert type="info">O relatório geral lista os programas separadamente; não calcula uma nota única da escola ou do município.</Alert>
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
    </>
  );
}
