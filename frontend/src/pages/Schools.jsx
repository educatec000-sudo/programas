import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useDebounce } from '../hooks/useApi.js';
import { schoolsApi, techniciansApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import ImportWizard from '../components/ImportWizard.jsx';
import { Button, Field, Input, Select, Modal, Badge, ConfirmDialog } from '../components/ui.jsx';
import { SCHOOL_SITUATION, SCHOOL_ZONE, DEPENDENCY } from '../utils/format.js';

const emptyForm = {
  inep: '', name: '', schoolType: '', situation: 'ATIVA', adminDependency: 'MUNICIPAL',
  address: '', addressNumber: '', addressComplement: '', district: '', cep: '', zone: '',
  responsible: '', phone: '', email: '',
  latitude: '', longitude: '', notes: '',
};

const SECTION_TITLE = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--primary-dark)', margin: '18px 0 10px', borderBottom: '1px solid var(--border)', paddingBottom: 4 };
const coordinate = (value) => (value == null ? '—' : Number(value).toFixed(6).replace(/0+$/, '').replace(/\.$/, ''));

export default function Schools() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { success, error } = useToast();

  // ---- pesquisa + filtros compactos ----
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [zone, setZone] = useState('');
  const [hasCoordinates, setHasCoordinates] = useState('');
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState('asc');

  const filters = {
    search: debouncedSearch, zone,
    ...(hasCoordinates && { hasCoordinates }),
    page: 1, pageSize: 1000, sort, dir,
  };

  const { data, loading, refresh } = useApi(() => schoolsApi.list(filters), [
    debouncedSearch, zone, hasCoordinates, sort, dir,
  ]);
  const { data: stats, refresh: refreshStats } = useApi(() => schoolsApi.stats(), []);

  const hasFilters = search || zone || hasCoordinates;
  const clearFilters = () => {
    setSearch(''); setZone(''); setHasCoordinates('');
  };

  // ---- importação ----
  const [importOpen, setImportOpen] = useState(false);

  // ---- cadastro / edição ----
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const { data: editingSchool } = useApi(
    () => (editingId ? schoolsApi.get(editingId) : Promise.resolve(null)),
    [editingId],
  );

  React.useEffect(() => {
    if (editingSchool) {
      const s = editingSchool;
      setForm({
        inep: s.inep || '', name: s.name, schoolType: s.schoolType || '',
        situation: s.situation, adminDependency: s.adminDependency || 'MUNICIPAL',
        address: s.address || '', addressNumber: s.addressNumber || '', addressComplement: s.addressComplement || '',
        district: s.district || '', cep: s.cep || '', zone: s.zone || '',
        responsible: s.responsible || '', phone: s.phone || '', email: s.email || '',
        latitude: s.latitude ?? '', longitude: s.longitude ?? '', notes: s.notes || '',
      });
    }
  }, [editingSchool]);

  const openCreate = () => { setForm(emptyForm); setEditingId(null); setFormError(null); setModalOpen(true); };
  const openEdit = (school) => { setEditingId(school.id); setFormError(null); setModalOpen(true); };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    const payload = {
      ...form,
      latitude: form.latitude === '' ? null : Number(form.latitude),
      longitude: form.longitude === '' ? null : Number(form.longitude),
    };
    try {
      if (editingId) {
        await schoolsApi.update(editingId, payload);
        success('Escola atualizada.');
      } else {
        await schoolsApi.create(payload);
        success('Escola cadastrada.');
      }
      setModalOpen(false);
      refresh();
      refreshStats();
    } catch (err) {
      setFormError(err.details?.map((d) => `${d.field}: ${d.message}`).join(' · ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- inativar/reativar ----
  const toggleSituation = async (school) => {
    try {
      const next = school.situation === 'ATIVA' ? 'INATIVA' : 'ATIVA';
      await schoolsApi.update(school.id, { situation: next });
      success(`"${school.name}" ${next === 'ATIVA' ? 'reativada' : 'inativada'}.`);
      refresh();
      refreshStats();
    } catch (err) {
      error(err.message);
    }
  };

  // ---- exclusão (unitária e em lote — modo seleção discreto) ----
  const [deleteTarget, setDeleteTarget] = useState(null);
  const confirmDelete = async () => {
    setBusy(true);
    try {
      await schoolsApi.remove(deleteTarget.id);
      success('Escola removida (exclusão lógica).');
      setDeleteTarget(null);
      refresh();
      refreshStats();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const toggleSelect = (id) => setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  const pageIds = (data?.data || []).map((s) => s.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const confirmBulk = async () => {
    setBusy(true);
    try {
      const res = await schoolsApi.batchDelete(selected);
      success(`${res.deleted} escola(s) removida(s) — histórico preservado.`);
      setBulkOpen(false);
      setSelected([]);
      setSelectMode(false);
      refresh();
      refreshStats();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo(
    () => [
      ...(selectMode
        ? [{
            key: 'selection', width: 34,
            label: (
              <input type="checkbox" checked={allOnPage}
                onChange={() => setSelected((sel) => (allOnPage ? sel.filter((id) => !pageIds.includes(id)) : [...new Set([...sel, ...pageIds])]))}
                style={{ width: 14, height: 14, accentColor: 'var(--primary)' }} />
            ),
            render: (s) => (
              <input type="checkbox" checked={selected.includes(s.id)}
                onClick={(e) => e.stopPropagation()} onChange={() => toggleSelect(s.id)}
                style={{ width: 14, height: 14, accentColor: 'var(--primary)' }} />
            ),
          }]
        : []),
      { key: 'inep', label: 'INEP', width: 100, sortable: true, render: (s) => <span className="mono">{s.inep || '—'}</span> },
      {
        key: 'name', label: 'Escola', sortable: true,
        render: (s) => (
          <div>
            <strong>{s.name}</strong>
            {s.schoolType && <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{s.schoolType}</div>}
          </div>
        ),
      },
      { key: 'address', label: 'Endereço', render: (s) => <span style={{ color: 'var(--text-2)' }}>{s.address || '—'}</span> },
      { key: 'responsible', label: 'Gestor(a)', render: (s) => s.responsible || '—' },
      {
        key: 'zone', label: 'Zona',
        render: (s) => {
          const info = SCHOOL_ZONE[s.zone];
          return info ? <Badge cls={info.cls}>{info.label}</Badge> : '—';
        },
      },
      { key: 'latitude', label: 'Latitude', render: (s) => <span className="mono">{coordinate(s.latitude)}</span> },
      { key: 'longitude', label: 'Longitude', render: (s) => <span className="mono">{coordinate(s.longitude)}</span> },
      {
        key: 'actions', label: '', align: 'right',
        render: (s) => (
          <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost" title="Ver detalhes" onClick={() => navigate(`/escolas/${s.id}`)}>👁</Button>
            {can('schools:write') && <Button size="sm" variant="ghost" title="Editar" onClick={() => openEdit(s)}>✏️</Button>}
            {can('schools:write') && (
              <Button size="sm" variant="ghost" title={s.situation === 'ATIVA' ? 'Inativar' : 'Reativar'} onClick={() => toggleSituation(s)}>
                {s.situation === 'ATIVA' ? '⏸' : '▶'}
              </Button>
            )}
            {can('schools:delete') && <Button size="sm" variant="ghost" title="Excluir" onClick={() => setDeleteTarget(s)}>🗑</Button>}
          </div>
        ),
      },
    ],
    [can, navigate, selectMode, selected, allOnPage],
  );

  return (
    <>
      <PageHeader
        title="Escolas"
        subtitle="Cadastro, importação e acompanhamento das escolas do município"
        actions={
          <>
            {can('imports:write') && (
              <Button variant="secondary" onClick={() => setImportOpen(true)}>⬆ Importar escolas</Button>
            )}
            {can('schools:write') && <Button onClick={openCreate}>+ Nova escola</Button>}
          </>
        }
      />

      {/* resumo — apenas o essencial */}
      <div className="stats-grid">
        <MiniStat icon="🏫" tone="blue" value={stats?.total} label="Total de escolas" />
        <MiniStat icon="🏙" tone="violet" value={stats?.sede} label="Sede" />
        <MiniStat icon="🛣" tone="yellow" value={stats?.estradas} label="Estradas" />
        <MiniStat icon="🏝" tone="green" value={stats?.ilhas} label="Ilhas" />
      </div>

      {/* pesquisa + filtros em uma linha */}
      <div className="filter-bar">
        <div className="field grow">
          <label>Buscar</label>
          <Input placeholder="Escola, INEP, endereço ou gestor(a)..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Field label="Zona">
          <Select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">Todas</option>
            <option value="SEDE">Sede</option>
            <option value="ESTRADAS">Estradas</option>
            <option value="ILHAS">Ilhas</option>
          </Select>
        </Field>
        <Field label="Coordenadas">
          <Select value={hasCoordinates} onChange={(e) => setHasCoordinates(e.target.value)}>
            <option value="">Todas</option>
            <option value="true">Com coordenadas</option>
            <option value="false">Sem coordenadas</option>
          </Select>
        </Field>
        {hasFilters && <Button variant="ghost" onClick={clearFilters}>Limpar</Button>}
        {can('schools:delete') && (
          <Button variant="ghost" onClick={() => { setSelectMode((v) => !v); setSelected([]); }} title="Exclusão em lote">
            {selectMode ? '✕ Cancelar seleção' : '🗑⋯'}
          </Button>
        )}
      </div>

      {selectMode && selected.length > 0 && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', marginBottom: 12, borderColor: 'var(--warning)', background: 'var(--warning-bg)' }}>
          <strong>{selected.length}</strong>
          <span style={{ color: 'var(--text-2)', fontSize: 13, marginRight: 'auto' }}>escola(s) selecionada(s)</span>
          <Button size="sm" variant="danger" onClick={() => setBulkOpen(true)}>Excluir selecionadas</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Limpar</Button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={data?.data || []}
        loading={loading}
        footer={<span>{data?.pagination?.total ?? 0} escola(s) — role a página para visualizar todas</span>}
        sort={sort}
        dir={dir}
        onSort={(s, d) => { setSort(s); setDir(d); }}
        onRowClick={(s) => navigate(`/escolas/${s.id}`)}
        emptyTitle="Nenhuma escola encontrada"
        emptyHint="Importe a planilha LOCALIZAÇÃO ESCOLAS.xlsx ou cadastre manualmente."
        emptyIcon="🏫"
      />

      {/* ---------- formulário por seções ---------- */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar escola' : 'Nova escola'}
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
          <div style={SECTION_TITLE}>Identificação</div>
          <div className="form-grid">
            <Field label="Código INEP" hint="Identificador principal da escola">
              <Input value={form.inep} onChange={set('inep')} pattern="\d{6,10}" />
            </Field>
            <Field label="Nome da escola" required>
              <Input value={form.name} onChange={set('name')} required minLength={3} />
            </Field>
            <Field label="Tipo de escola" hint="Ex.: E.M.E.F., Creche, E.E.E.F.M.">
              <Input value={form.schoolType} onChange={set('schoolType')} />
            </Field>
            <Field label="Situação">
              <Select value={form.situation} onChange={set('situation')}>
                {Object.entries(SCHOOL_SITUATION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Field>
            <Field label="Dependência administrativa">
              <Select value={form.adminDependency} onChange={set('adminDependency')}>
                <option value="">—</option>
                {Object.entries(DEPENDENCY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>

          <div style={SECTION_TITLE}>Endereço</div>
          <div className="form-grid">
            <Field label="Endereço">
              <Input value={form.address} onChange={set('address')} />
            </Field>
            <div className="form-grid" style={{ gridTemplateColumns: '90px 1fr' }}>
              <Field label="Número"><Input value={form.addressNumber} onChange={set('addressNumber')} /></Field>
              <Field label="Complemento"><Input value={form.addressComplement} onChange={set('addressComplement')} /></Field>
            </div>
            <Field label="Bairro"><Input value={form.district} onChange={set('district')} /></Field>
            <Field label="CEP" hint="8 dígitos"><Input value={form.cep} onChange={set('cep')} /></Field>
            <Field label="Zona">
              <Select value={form.zone} onChange={set('zone')}>
                <option value="">—</option>
                {Object.entries(SCHOOL_ZONE).map(([key, info]) => (
                  <option key={key} value={key}>{info.label}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div style={SECTION_TITLE}>Gestão</div>
          <div className="form-grid">
            <Field label="Gestor(a) / Direção"><Input value={form.responsible} onChange={set('responsible')} /></Field>
            <Field label="Telefone"><Input value={form.phone} onChange={set('phone')} /></Field>
            <Field label="E-mail"><Input type="email" value={form.email} onChange={set('email')} /></Field>
          </div>

          <div style={SECTION_TITLE}>Localização</div>
          <div className="form-grid">
            <Field label="Latitude" hint="Decimal (ex.: -1.62195)"><Input type="number" step="0.0000001" value={form.latitude} onChange={set('latitude')} /></Field>
            <Field label="Longitude" hint="Decimal (ex.: -48.25461)"><Input type="number" step="0.0000001" value={form.longitude} onChange={set('longitude')} /></Field>
          </div>

          <div style={SECTION_TITLE}>Observações</div>
          <Field><Input value={form.notes} onChange={set('notes')} placeholder="Informações complementares" /></Field>
        </form>
      </Modal>

      <ImportWizard
        type="ESCOLAS"
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { refresh(); refreshStats(); }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Excluir escola"
        message={`Remover "${deleteTarget?.name}"? Exclusão lógica — histórico preservado.`}
        danger confirmLabel="Excluir" busy={busy}
      />
      <ConfirmDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onConfirm={confirmBulk}
        title="Excluir escolas em lote"
        message={`Remover ${selected.length} escola(s)? Exclusão lógica — histórico preservado.`}
        danger confirmLabel={`Excluir ${selected.length}`} busy={busy}
      />
    </>
  );
}

function MiniStat({ icon, value, label, tone }) {
  const tones = {
    blue: ['#eff6ff', '#1d4ed8'], green: ['#f0fdf4', '#15803d'],
    violet: ['#f5f3ff', '#6d28d9'], yellow: ['#fffbeb', '#b45309'],
  };
  const [bg, color] = tones[tone] || tones.blue;
  return (
    <div className="stat-card" style={{ padding: '12px 16px' }}>
      <div className="stat-icon" style={{ background: bg, color, width: 38, height: 38, fontSize: 17 }}>{icon}</div>
      <div>
        <div className="stat-value" style={{ fontSize: 19 }}>{value ?? '—'}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}
