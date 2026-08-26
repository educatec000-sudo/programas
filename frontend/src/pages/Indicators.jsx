import React, { useState } from 'react';
import { useApi, useDebounce } from '../hooks/useApi.js';
import { indicatorsApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Button, Field, Input, Select, Textarea, Modal, Badge, Tabs, ConfirmDialog } from '../components/ui.jsx';
import { fmt } from '../utils/format.js';

const emptyForm = {
  code: '', name: '', description: '', categoryId: '', unit: '%',
  polarity: 'MAIOR_MELHOR', weight: 1, defaultGoal: '', minValue: '', maxValue: '',
  periodLabel: '', status: 'ATIVO',
};

export default function Indicators() {
  const { can } = useAuth();
  const { success, error } = useToast();
  const [tab, setTab] = useState('indicadores');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading, refresh } = useApi(
    () => indicatorsApi.list({ search: debouncedSearch, categoryId, status, page, pageSize: 15 }),
    [debouncedSearch, categoryId, status, page],
  );
  const { data: categories, refresh: refreshCategories } = useApi(() => indicatorsApi.categories(), []);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [catModal, setCatModal] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', description: '' });

  const openCreate = () => { setForm(emptyForm); setEditing(null); setFormError(null); setModalOpen(true); };
  const openEdit = (ind) => {
    setForm({
      code: ind.code, name: ind.name, description: ind.description || '',
      categoryId: ind.category?.id || '', unit: ind.unit || '', polarity: ind.polarity,
      weight: ind.weight ?? 1, defaultGoal: ind.defaultGoal ?? '', minValue: ind.minValue ?? '',
      maxValue: ind.maxValue ?? '', periodLabel: ind.periodLabel || '', status: ind.status,
    });
    setEditing(ind.id);
    setFormError(null);
    setModalOpen(true);
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    const num = (v) => (v === '' ? null : Number(v));
    const payload = {
      ...form,
      categoryId: form.categoryId || null,
      weight: Number(form.weight) || 1,
      defaultGoal: num(form.defaultGoal),
      minValue: num(form.minValue),
      maxValue: num(form.maxValue),
    };
    try {
      if (editing) { await indicatorsApi.update(editing, payload); success('Indicador atualizado.'); }
      else { await indicatorsApi.create(payload); success('Indicador criado.'); }
      setModalOpen(false);
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
      await indicatorsApi.remove(deleteTarget.id);
      success('Indicador removido (exclusão lógica).');
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitCategory = async (e) => {
    e.preventDefault();
    try {
      await indicatorsApi.createCategory(catForm);
      success('Categoria criada.');
      setCatModal(false);
      setCatForm({ name: '', description: '' });
      refreshCategories();
    } catch (err) {
      error(err.message);
    }
  };

  const removeCategory = async (cat) => {
    try {
      await indicatorsApi.removeCategory(cat.id);
      success('Categoria excluída.');
      refreshCategories();
    } catch (err) {
      error(err.message);
    }
  };

  const columns = [
    { key: 'code', label: 'Código', render: (i) => <span className="mono">{i.code}</span> },
    { key: 'name', label: 'Indicador', render: (i) => <strong>{i.name}</strong> },
    { key: 'category', label: 'Categoria', render: (i) => i.category?.name || '—' },
    { key: 'unit', label: 'Unidade' },
    { key: 'polarity', label: 'Polaridade', render: (i) => (i.polarity === 'MENOR_MELHOR' ? <Badge cls="badge-yellow">Menor é melhor</Badge> : <Badge cls="badge-blue">Maior é melhor</Badge>) },
    { key: 'weight', label: 'Peso', align: 'center' },
    { key: 'defaultGoal', label: 'Meta padrão', align: 'right', render: (i) => fmt(i.defaultGoal, 2) },
    { key: 'programsCount', label: 'Programas', align: 'center' },
    { key: 'resultsCount', label: 'Resultados', align: 'center' },
    {
      key: 'status', label: 'Status',
      render: (i) => <Badge cls={i.status === 'ATIVO' ? 'badge-green' : 'badge-gray'}>{i.status === 'ATIVO' ? 'Ativo' : 'Inativo'}</Badge>,
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (i) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {can('indicators:write') && <Button size="sm" variant="secondary" onClick={() => openEdit(i)}>Editar</Button>}
          {can('indicators:delete') && <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(i)}>🗑</Button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Indicadores"
        subtitle="Indicadores configuráveis com categoria, unidade, polaridade, peso e metas"
        actions={can('indicators:write') && <Button onClick={openCreate}>+ Novo indicador</Button>}
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'indicadores', label: 'Indicadores' },
          { key: 'categorias', label: 'Categorias', count: categories?.length },
        ]}
      />

      {tab === 'indicadores' && (
        <>
          <div className="filter-bar">
            <div className="field grow">
              <label>Buscar</label>
              <Input placeholder="Nome ou código..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Field label="Categoria">
              <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
                <option value="">Todas</option>
                {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="">Todos</option>
                <option value="ATIVO">Ativo</option>
                <option value="INATIVO">Inativo</option>
              </Select>
            </Field>
          </div>
          <DataTable
            columns={columns}
            rows={data?.data || []}
            loading={loading}
            pagination={data?.pagination}
            onPageChange={setPage}
            emptyTitle="Nenhum indicador encontrado"
            emptyIcon="📊"
          />
        </>
      )}

      {tab === 'categorias' && (
        <>
          <div style={{ marginBottom: 12, textAlign: 'right' }}>
            {can('indicators:write') && <Button onClick={() => setCatModal(true)}>+ Nova categoria</Button>}
          </div>
          <DataTable
            columns={[
              { key: 'name', label: 'Categoria', render: (c) => <strong>{c.name}</strong> },
              { key: 'description', label: 'Descrição' },
              { key: 'count', label: 'Indicadores', align: 'center', render: (c) => c._count?.indicators ?? 0 },
              {
                key: 'actions', label: '', align: 'right',
                render: (c) => can('indicators:write') && <Button size="sm" variant="ghost" onClick={() => removeCategory(c)}>🗑</Button>,
              },
            ]}
            rows={categories || []}
            loading={!categories}
            emptyTitle="Nenhuma categoria"
            emptyIcon="🗂"
          />
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar indicador' : 'Novo indicador'}
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
            <Field label="Código" required><Input value={form.code} onChange={set('code')} required /></Field>
            <Field label="Nome" required><Input value={form.name} onChange={set('name')} required /></Field>
            <Field label="Categoria">
              <Select value={form.categoryId} onChange={set('categoryId')}>
                <option value="">Sem categoria</option>
                {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Unidade"><Input value={form.unit} onChange={set('unit')} placeholder="%, alunos, escolas..." /></Field>
            <Field label="Polaridade" hint="Como o valor se relaciona com a qualidade">
              <Select value={form.polarity} onChange={set('polarity')}>
                <option value="MAIOR_MELHOR">Maior é melhor</option>
                <option value="MENOR_MELHOR">Menor é melhor</option>
              </Select>
            </Field>
            <Field label="Peso"><Input type="number" step="0.1" min="0" value={form.weight} onChange={set('weight')} /></Field>
            <Field label="Meta padrão"><Input type="number" step="0.1" value={form.defaultGoal} onChange={set('defaultGoal')} /></Field>
            <Field label="Valor mínimo"><Input type="number" step="0.1" value={form.minValue} onChange={set('minValue')} /></Field>
            <Field label="Valor máximo"><Input type="number" step="0.1" value={form.maxValue} onChange={set('maxValue')} /></Field>
            <Field label="Periodicidade"><Input value={form.periodLabel} onChange={set('periodLabel')} placeholder="Anual, Semestral..." /></Field>
            <Field label="Status">
              <Select value={form.status} onChange={set('status')}>
                <option value="ATIVO">Ativo</option>
                <option value="INATIVO">Inativo</option>
              </Select>
            </Field>
          </div>
          <Field label="Descrição"><Textarea value={form.description} onChange={set('description')} /></Field>
        </form>
      </Modal>

      <Modal
        open={catModal}
        onClose={() => setCatModal(false)}
        title="Nova categoria"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCatModal(false)}>Cancelar</Button>
            <Button onClick={submitCategory}>Salvar</Button>
          </>
        }
      >
        <form onSubmit={submitCategory}>
          <Field label="Nome" required><Input value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))} required /></Field>
          <Field label="Descrição"><Input value={catForm.description} onChange={(e) => setCatForm((f) => ({ ...f, description: e.target.value }))} /></Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Excluir indicador"
        message={`Remover "${deleteTarget?.name}"? A exclusão é lógica; resultados são preservados.`}
        danger
        confirmLabel="Excluir"
        busy={busy}
      />
    </>
  );
}
