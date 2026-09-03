import React, { useState } from 'react';
import { useApi, useDebounce } from '../hooks/useApi.js';
import { goalsApi, programsApi, schoolsApi, indicatorsApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Button, Field, Input, Select, Modal, Badge, ConfirmDialog } from '../components/ui.jsx';
import { fmt, PERIODS, yearsRange } from '../utils/format.js';
import { supportsSharedFeature } from '../programs/registry.js';

const SCOPE_LABELS = {
  GERAL: 'Geral',
  PROGRAMA: 'Programa',
  ESCOLA: 'Escola',
  INDICADOR: 'Indicador',
};

export default function Goals() {
  const { can } = useAuth();
  const { success, error } = useToast();

  const [filters, setFilters] = useState({ programId: '', schoolId: '', indicatorId: '', year: '', scope: '' });
  const [page, setPage] = useState(1);
  const debounced = useDebounce(filters, 300);

  const { data, loading, refresh } = useApi(
    () => goalsApi.list({ ...debounced, page, pageSize: 15 }),
    [debounced, page],
  );

  const { data: programs } = useApi(() => programsApi.list({ pageSize: 200 }), []);
  const { data: schools } = useApi(() => schoolsApi.list({ pageSize: 200 }), []);
  const { data: indicators } = useApi(() => indicatorsApi.list({ pageSize: 200 }), []);

  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({
    scope: 'PROGRAMA', programId: '', schoolId: '', indicatorId: '',
    year: new Date().getFullYear(), period: '', value: '', description: '',
  });
  const goalPrograms = (programs?.data || []).filter((item) => (
    supportsSharedFeature(item, 'resultados') || item.id === form.programId
  ));

  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    const payload = {
      scope: form.scope,
      programId: form.programId || null,
      schoolId: form.schoolId || null,
      indicatorId: form.indicatorId || null,
      year: Number(form.year),
      period: form.period || null,
      value: Number(form.value),
      description: form.description || null,
    };
    try {
      if (editTarget) {
        await goalsApi.update(editTarget.id, { value: payload.value, period: payload.period, description: payload.description });
        success('Meta atualizada.');
      } else {
        await goalsApi.create(payload);
        success('Meta criada.');
      }
      setModalOpen(false);
      setEditTarget(null);
      refresh();
    } catch (err) {
      setFormError(err.details?.map((d) => `${d.field}: ${d.message}`).join(' · ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await goalsApi.remove(deleteTarget.id);
      success('Meta excluída.');
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'year', label: 'Ano' },
    { key: 'period', label: 'Período', render: (g) => g.period || <span style={{ color: 'var(--text-3)' }}>Todo o ano</span> },
    { key: 'scope', label: 'Escopo', render: (g) => <Badge cls="badge-gray">{SCOPE_LABELS[g.scope]}</Badge> },
    { key: 'program', label: 'Programa', render: (g) => g.program?.name || '—' },
    { key: 'school', label: 'Escola', render: (g) => g.school?.name || '—' },
    { key: 'indicator', label: 'Indicador', render: (g) => g.indicator?.name || '—' },
    { key: 'value', label: 'Meta', align: 'right', render: (g) => <strong>{fmt(g.value, 2)}</strong> },
    { key: 'unit', label: 'Unid.', render: (g) => g.indicator?.unit || '—' },
    { key: 'description', label: 'Descrição' },
    {
      key: 'actions', label: '', align: 'right',
      render: (g) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {can('goals:write') && (
            <Button size="sm" variant="secondary" onClick={() => {
              setEditTarget(g);
              setForm({
                scope: g.scope, programId: g.programId || '', schoolId: g.schoolId || '',
                indicatorId: g.indicatorId || '', year: g.year, period: g.period || '',
                value: g.value, description: g.description || '',
              });
              setFormError(null);
              setModalOpen(true);
            }}>Editar</Button>
          )}
          {can('goals:delete') && <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(g)}>🗑</Button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Metas"
        subtitle="Metas gerais, por programa, por escola e por indicador — comparadas com os resultados"
        actions={can('goals:write') && (
          <Button onClick={() => { setEditTarget(null); setFormError(null); setModalOpen(true); }}>+ Nova meta</Button>
        )}
      />

      <div className="filter-bar">
        <Field label="Escopo">
          <Select value={filters.scope} onChange={setF('scope')}>
            <option value="">Todos</option>
            {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Programa">
          <Select value={filters.programId} onChange={setF('programId')}>
            <option value="">Todos</option>
            {(programs?.data || []).map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
          </Select>
        </Field>
        <Field label="Escola">
          <Select value={filters.schoolId} onChange={setF('schoolId')}>
            <option value="">Todas</option>
            {(schools?.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Indicador">
          <Select value={filters.indicatorId} onChange={setF('indicatorId')}>
            <option value="">Todos</option>
            {(indicators?.data || []).map((i) => <option key={i.id} value={i.id}>{i.code}</option>)}
          </Select>
        </Field>
        <Field label="Ano">
          <Select value={filters.year} onChange={setF('year')}>
            <option value="">Todos</option>
            {[...new Set([...(programs?.data || []).map((item) => item.year), ...yearsRange(2023)])]
              .sort((a, b) => b - a)
              .map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
      </div>

      <DataTable
        columns={columns}
        rows={data?.data || []}
        loading={loading}
        pagination={data?.pagination}
        onPageChange={setPage}
        emptyTitle="Nenhuma meta encontrada"
        emptyHint="Cadastre metas para habilitar o cálculo de atingimento nos rankings."
        emptyIcon="🎯"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Editar meta' : 'Nova meta'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Salvando...' : 'Salvar'}</Button>
          </>
        }
      >
        {formError && <div className="alert alert-error" style={{ marginBottom: 14 }}>{formError}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field label="Escopo" required>
              <Select value={form.scope} onChange={set('scope')}>
                {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Ano/ciclo" required hint={form.programId ? 'Definido pelo ciclo do programa' : undefined}>
              <Select value={form.year} onChange={set('year')} disabled={Boolean(form.programId)}>
                {[...new Set([Number(form.year), ...(programs?.data || []).map((item) => item.year), ...yearsRange(2023)])]
                  .filter(Boolean)
                  .sort((a, b) => b - a)
                  .map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </Field>
            <Field label="Programa" hint="Opcional — selecione a execução anual correta">
              <Select value={form.programId} onChange={(event) => {
                const selected = goalPrograms.find((item) => item.id === event.target.value);
                setForm((current) => ({
                  ...current,
                  programId: event.target.value,
                  year: selected?.year || current.year,
                }));
              }}>
                <option value="">—</option>
                {goalPrograms.map((p) => <option key={p.id} value={p.id}>{p.code} — ciclo {p.year}</option>)}
              </Select>
            </Field>
            <Field label="Escola" hint="Opcional — meta específica da escola">
              <Select value={form.schoolId} onChange={set('schoolId')}>
                <option value="">—</option>
                {(schools?.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Indicador" hint="Opcional — meta do indicador">
              <Select value={form.indicatorId} onChange={set('indicatorId')}>
                <option value="">—</option>
                {(indicators?.data || []).map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
              </Select>
            </Field>
            <Field label="Período" hint="Vazio = vale para o ano inteiro">
              <Select value={form.period} onChange={set('period')}>
                <option value="">Todo o ano</option>
                {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label="Valor da meta" required>
              <Input type="number" step="0.01" value={form.value} onChange={set('value')} required />
            </Field>
          </div>
          <Field label="Descrição">
            <Input value={form.description} onChange={set('description')} placeholder="Ex.: meta pactuada no plano 2025" />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Excluir meta"
        message={`Excluir a meta de valor ${fmt(deleteTarget?.value)}?`}
        danger
        confirmLabel="Excluir"
        busy={busy}
      />
    </>
  );
}
