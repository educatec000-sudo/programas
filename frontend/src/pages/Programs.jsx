import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useDebounce } from '../hooks/useApi.js';
import { programsApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Button, Field, Input, Select, Textarea, Modal, Badge } from '../components/ui.jsx';
import { PROGRAM_STATUS, yearsRange } from '../utils/format.js';

const emptyForm = {
  code: '', name: '', description: '', objective: '', organ: '',
  year: new Date().getFullYear(), periodLabel: 'Anual', status: 'EM_EXECUCAO', globalGoal: '',
};

export default function Programs() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { success } = useToast();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [year, setYear] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading, refresh } = useApi(
    () => programsApi.list({ search: debouncedSearch, year, status, page, pageSize: 15 }),
    [debouncedSearch, year, status, page],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  const openCreate = () => {
    setForm(emptyForm);
    setEditing(null);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = async (program) => {
    const full = await programsApi.get(program.id);
    setForm({
      code: full.code, name: full.name, description: full.description || '',
      objective: full.objective || '', organ: full.organ || '', year: full.year,
      periodLabel: full.periodLabel || '', status: full.status,
      globalGoal: full.globalGoal ?? '',
    });
    setEditing(program.id);
    setFormError(null);
    setModalOpen(true);
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    const payload = { ...form, globalGoal: form.globalGoal === '' ? null : Number(form.globalGoal), year: Number(form.year) };
    try {
      if (editing) {
        await programsApi.update(editing, payload);
        success('Programa atualizado.');
      } else {
        await programsApi.create(payload);
        success('Programa criado.');
      }
      setModalOpen(false);
      refresh();
    } catch (err) {
      setFormError(err.details?.map((d) => `${d.field}: ${d.message}`).join(' · ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'code', label: 'Código', render: (p) => <span className="mono">{p.code}</span> },
    { key: 'name', label: 'Programa', render: (p) => <strong>{p.name}</strong> },
    { key: 'organ', label: 'Órgão' },
    { key: 'year', label: 'Ano' },
    {
      key: 'status', label: 'Status',
      render: (p) => { const info = PROGRAM_STATUS[p.status]; return <Badge cls={info?.cls}>{info?.label}</Badge>; },
    },
    { key: 'schoolsCount', label: 'Escolas', align: 'center' },
    { key: 'indicatorsCount', label: 'Indicadores', align: 'center' },
    { key: 'resultsCount', label: 'Resultados', align: 'center' },
    {
      key: 'actions', label: '', align: 'right',
      render: (p) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
          {can('programs:write') && <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>Editar</Button>}
          <Button size="sm" variant="ghost" onClick={() => navigate(`/programas/${p.id}`)}>Abrir →</Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Programas"
        subtitle="Programas educacionais, escolas participantes e indicadores"
        actions={can('programs:write') && <Button onClick={openCreate}>+ Novo programa</Button>}
      />

      <div className="filter-bar">
        <div className="field grow">
          <label>Buscar</label>
          <Input placeholder="Nome, código ou órgão..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Field label="Ano">
          <Select value={year} onChange={(e) => { setYear(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {yearsRange(2023).map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {Object.entries(PROGRAM_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
      </div>

      <DataTable
        columns={columns}
        rows={data?.data || []}
        loading={loading}
        pagination={data?.pagination}
        onPageChange={setPage}
        onRowClick={(p) => navigate(`/programas/${p.id}`)}
        emptyTitle="Nenhum programa encontrado"
        emptyIcon="📋"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar programa' : 'Novo programa'}
        size="lg"
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
            <Field label="Código" required hint="Ex.: PRG-2026-01">
              <Input value={form.code} onChange={set('code')} required />
            </Field>
            <Field label="Nome" required>
              <Input value={form.name} onChange={set('name')} required minLength={3} />
            </Field>
            <Field label="Órgão responsável">
              <Input value={form.organ} onChange={set('organ')} placeholder="SEDUC, SEMED..." />
            </Field>
            <Field label="Ano" required>
              <Select value={form.year} onChange={set('year')}>
                {yearsRange(2023).map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </Field>
            <Field label="Período de vigência">
              <Input value={form.periodLabel} onChange={set('periodLabel')} placeholder="Anual, 2025-2026..." />
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={set('status')}>
                {Object.entries(PROGRAM_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Field>
            <Field label="Meta global (%)" hint="Percentual de atingimento esperado pelo programa">
              <Input type="number" step="0.1" min="0" value={form.globalGoal} onChange={set('globalGoal')} />
            </Field>
          </div>
          <Field label="Objetivo">
            <Textarea value={form.objective} onChange={set('objective')} />
          </Field>
          <Field label="Descrição">
            <Textarea value={form.description} onChange={set('description')} />
          </Field>
        </form>
      </Modal>
    </>
  );
}
