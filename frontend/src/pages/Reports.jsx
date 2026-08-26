import React, { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { reportsApi, programsApi, schoolsApi, indicatorsApi } from '../services/resources.js';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { Button, Field, Select, LoadingBlock } from '../components/ui.jsx';
import { PERIODS, yearsRange } from '../utils/format.js';

const REPORT_INFO = {
  geral: { icon: '📊', desc: 'Panorama de todos os programas com pontuação média' },
  escola: { icon: '🏫', desc: 'Resultados e metas de uma escola específica' },
  programa: { icon: '📋', desc: 'Ranking completo das escolas de um programa' },
  indicador: { icon: '📈', desc: 'Médias e distribuição de um indicador' },
  resultados: { icon: '🧾', desc: 'Listagem de resultados lançados' },
  metas: { icon: '🎯', desc: 'Metas x resultados por indicador' },
  ranking: { icon: '🏆', desc: 'Ranking geral ou por programa' },
  evolucao: { icon: '📉', desc: 'Evolução temporal da pontuação' },
};

export default function Reports() {
  const { toast, error } = useToast();
  const { data: types, loading } = useApi(() => reportsApi.types(), []);
  const { data: programs } = useApi(() => programsApi.list({ pageSize: 200 }), []);
  const { data: schools } = useApi(() => schoolsApi.list({ pageSize: 200 }), []);
  const { data: indicators } = useApi(() => indicatorsApi.list({ pageSize: 200 }), []);

  const [selected, setSelected] = useState('geral');
  const [filters, setFilters] = useState({ programId: '', schoolId: '', indicatorId: '', year: '', period: '' });
  const [format, setFormat] = useState('pdf');
  const [busy, setBusy] = useState(false);

  const needs = {
    escola: 'schoolId',
    programa: 'programId',
    indicador: 'indicatorId',
  };
  const missing = needs[selected] && !filters[needs[selected]];

  const generate = async () => {
    if (missing) {
      toast(`Selecione o campo obrigatório deste relatório (${needs[selected] === 'schoolId' ? 'escola' : needs[selected] === 'programId' ? 'programa' : 'indicador'}).`, { type: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const name = await reportsApi.generate(selected, { ...filters, format });
      toast(`Relatório gerado: ${name}`, { type: 'success', title: 'Download iniciado' });
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
        title="Relatórios"
        subtitle="Geração de relatórios oficiais com exportação em PDF, XLSX e CSV"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="card-title">1. Escolha o relatório</div>
          <div className="card-subtitle">Todos os relatórios usam dados reais do PostgreSQL</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            {(types || []).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSelected(t.key)}
                className="card card-pad"
                style={{
                  cursor: 'pointer', textAlign: 'left', padding: '13px 14px',
                  borderColor: selected === t.key ? 'var(--primary)' : 'var(--border)',
                  borderWidth: selected === t.key ? 2 : 1,
                  background: selected === t.key ? 'var(--primary-50)' : 'var(--surface)',
                }}
              >
                <div style={{ fontSize: 20 }}>{REPORT_INFO[t.key]?.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{t.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{REPORT_INFO[t.key]?.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div className="card-title">2. Filtros</div>
          <div className="card-subtitle">Ajuste o escopo do relatório</div>

          {(selected === 'programa' || selected === 'ranking' || selected === 'metas' || selected === 'resultados' || selected === 'escola' || selected === 'indicador' || selected === 'evolucao') && (
            <Field label={selected === 'escola' ? 'Escola *' : 'Programa' + (selected === 'programa' ? ' *' : '')}>
              {selected === 'escola' ? (
                <Select value={filters.schoolId} onChange={(e) => setFilters((f) => ({ ...f, schoolId: e.target.value }))}>
                  <option value="">Selecione a escola...</option>
                  {(schools?.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              ) : (
                <Select value={filters.programId} onChange={(e) => setFilters((f) => ({ ...f, programId: e.target.value }))}>
                  <option value="">Todos</option>
                  {(programs?.data || []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </Select>
              )}
            </Field>
          )}

          {selected === 'indicador' && (
            <Field label="Indicador *">
              <Select value={filters.indicatorId} onChange={(e) => setFilters((f) => ({ ...f, indicatorId: e.target.value }))}>
                <option value="">Selecione o indicador...</option>
                {(indicators?.data || []).map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
              </Select>
            </Field>
          )}

          <Field label="Ano">
            <Select value={filters.year} onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}>
              <option value="">Automático</option>
              {yearsRange(2023).map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>

          {(selected === 'ranking' || selected === 'programa' || selected === 'metas') && (
            <Field label="Período">
              <Select value={filters.period} onChange={(e) => setFilters((f) => ({ ...f, period: e.target.value }))}>
                <option value="">Mais recente</option>
                {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
          )}

          <Field label="3. Formato">
            <div style={{ display: 'flex', gap: 8 }}>
              {['pdf', 'xlsx', 'csv'].map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`pill ${format === f ? 'active' : ''}`}
                  onClick={() => setFormat(f)}
                  style={{ flex: 1, textAlign: 'center' }}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>

          {missing && (
            <div className="alert alert-warn">Preencha o campo obrigatório (*) antes de gerar.</div>
          )}

          <Button block onClick={generate} disabled={busy}>
            {busy ? 'Gerando...' : '⬇ Gerar e baixar relatório'}
          </Button>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 10 }}>
            Toda geração de relatório é registrada na auditoria (usuário, tipo, formato e filtros).
          </div>
        </div>
      </div>
    </>
  );
}
