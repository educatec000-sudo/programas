import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi, useDebounce } from '../hooks/useApi.js';
import { resultsApi, programsApi, schoolsApi, indicatorsApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Button, Field, Input, Select, Modal, Badge, Alert } from '../components/ui.jsx';
import { fmt, fmtDateTime, PERIODS, yearsRange } from '../utils/format.js';

export default function Results() {
  const { can } = useAuth();
  const { success, error } = useToast();
  const [params] = useSearchParams();

  const [filters, setFilters] = useState({
    programId: params.get('programId') || '',
    schoolId: '',
    indicatorId: '',
    year: '',
    period: '',
  });
  const [page, setPage] = useState(1);
  const debounced = useDebounce(filters, 300);

  const { data, loading, refresh } = useApi(
    () => resultsApi.list({ ...debounced, page, pageSize: 15 }),
    [debounced, page],
  );

  const { data: programs } = useApi(() => programsApi.list({ pageSize: 200 }), []);
  const { data: schools } = useApi(() => schoolsApi.list({ pageSize: 200 }), []);
  const { data: indicators } = useApi(() => indicatorsApi.list({ pageSize: 200 }), []);

  // ---- lançamento individual ----
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    programId: '', schoolId: '', indicatorId: '', year: new Date().getFullYear(),
    period: '1º Semestre', value: '', notes: '',
  });
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  // ---- lote ----
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchResult, setBatchResult] = useState(null);
  const [batchOverwrite, setBatchOverwrite] = useState(true);

  // ---- edição ----
  const [editRow, setEditRow] = useState(null);

  const setF = (k) => (e) => { setFilters((f) => ({ ...f, [k]: e.target.value })); setPage(1); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await resultsApi.create({ ...form, value: Number(form.value) }, { overwrite: String(overwrite) });
      success(overwrite ? 'Resultado atualizado com sucesso.' : 'Resultado lançado com sucesso.');
      setModalOpen(false);
      setForm((f) => ({ ...f, value: '', notes: '' }));
      refresh();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const parseBatch = () => {
    // formato: código_programa;inep;código_indicador;ano;período;valor (uma linha por resultado)
    return batchText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [programCode, inep, indicatorCode, year, period, value] = line.split(';').map((p) => (p || '').trim());
        return { programCode, inep, indicatorCode, year, period, value };
      });
  };

  const submitBatchText = async () => {
    const rows = parseBatch();
    if (!rows.length) { error('Cole ao menos uma linha no padrão informado.'); return; }

    const programMap = new Map((programs?.data || []).map((p) => [p.code.toLowerCase(), p.id]));
    const schoolMap = new Map((schools?.data || []).map((s) => [s.inep, s.id]));
    const indicatorMap = new Map((indicators?.data || []).map((i) => [i.code.toLowerCase(), i.id]));

    const items = [];
    const errors = [];
    rows.forEach((r, idx) => {
      const programId = programMap.get((r.programCode || '').toLowerCase());
      const schoolId = schoolMap.get(r.inep);
      const indicatorId = indicatorMap.get((r.indicatorCode || '').toLowerCase());
      const value = Number(String(r.value).replace(',', '.'));
      if (!programId) errors.push(`Linha ${idx + 1}: programa "${r.programCode}" não encontrado`);
      else if (!schoolId) errors.push(`Linha ${idx + 1}: escola INEP ${r.inep} não encontrada`);
      else if (!indicatorId) errors.push(`Linha ${idx + 1}: indicador "${r.indicatorCode}" não encontrado`);
      else if (!Number.isFinite(value)) errors.push(`Linha ${idx + 1}: valor inválido (${r.value})`);
      else items.push({ programId, schoolId, indicatorId, year: Number(r.year), period: r.period, value });
    });

    if (errors.length && !items.length) { setBatchResult({ errors, created: 0, updated: 0 }); return; }

    setBusy(true);
    try {
      const res = await resultsApi.createBatch(items, { overwrite: String(batchOverwrite) });
      setBatchResult({ ...res, errors: [...errors, ...res.errors.map((e) => `Item ${e.index + 1}: ${e.message}`)] });
      refresh();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await resultsApi.update(editRow.id, { value: Number(editRow.value), notes: editRow.notes });
      success('Resultado atualizado.');
      setEditRow(null);
      refresh();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeResult = async (row) => {
    try {
      await resultsApi.remove(row.id);
      success('Resultado excluído.');
      refresh();
    } catch (err) {
      error(err.message);
    }
  };

  const columns = [
    { key: 'year', label: 'Ano' },
    { key: 'period', label: 'Período' },
    { key: 'school', label: 'Escola', render: (r) => <strong>{r.school.name}</strong> },
    { key: 'program', label: 'Programa', render: (r) => r.program.name },
    { key: 'indicator', label: 'Indicador', render: (r) => r.indicator.name },
    { key: 'value', label: 'Valor', align: 'right', render: (r) => <strong>{fmt(r.value, 2)}</strong> },
    { key: 'unit', label: 'Unid.', render: (r) => r.indicator.unit || '—' },
    { key: 'source', label: 'Origem', render: (r) => <Badge cls={r.source === 'IMPORTACAO' ? 'badge-cyan' : 'badge-gray'}>{r.source === 'IMPORTACAO' ? 'Import.' : 'Manual'}</Badge> },
    { key: 'updatedBy', label: 'Por', render: (r) => r.createdBy?.name || r.updatedBy?.name || '—' },
    { key: 'updatedAt', label: 'Atualizado', render: (r) => fmtDateTime(r.updatedAt) },
    {
      key: 'actions', label: '', align: 'right',
      render: (r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {can('results:write') && <Button size="sm" variant="secondary" onClick={() => setEditRow({ ...r, notes: r.notes || '' })}>Editar</Button>}
          {can('results:delete') && <Button size="sm" variant="ghost" onClick={() => removeResult(r)}>🗑</Button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Resultados"
        subtitle="Lançamento individual e em lote — Programa → Escola → Indicador → Período → Resultado"
        actions={
          <>
            {can('results:read') && (
              <Button variant="secondary" onClick={() => resultsApi.export({ ...filters })}>⬇ Exportar</Button>
            )}
            {can('results:write') && (
              <>
                <Button variant="secondary" onClick={() => { setBatchResult(null); setBatchOpen(true); }}>⧉ Lançamento em lote</Button>
                <Button onClick={() => { setFormError(null); setModalOpen(true); }}>+ Lançar resultado</Button>
              </>
            )}
          </>
        }
      />

      <div className="filter-bar">
        <Field label="Programa">
          <Select value={filters.programId} onChange={setF('programId')}>
            <option value="">Todos</option>
            {(programs?.data || []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
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
            {(indicators?.data || []).map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
          </Select>
        </Field>
        <Field label="Ano">
          <Select value={filters.year} onChange={setF('year')}>
            <option value="">Todos</option>
            {yearsRange(2023).map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
        <Field label="Período">
          <Select value={filters.period} onChange={setF('period')}>
            <option value="">Todos</option>
            {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
      </div>

      <DataTable
        columns={columns}
        rows={data?.data || []}
        loading={loading}
        pagination={data?.pagination}
        onPageChange={setPage}
        emptyTitle="Nenhum resultado lançado"
        emptyHint="Use o lançamento individual, o lote rápido ou a central de importações."
        emptyIcon="📈"
      />

      {/* lançamento individual */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Lançar resultado"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Salvando...' : 'Lançar'}</Button>
          </>
        }
      >
        {formError && <Alert type="error">{formError}</Alert>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field label="Programa" required>
              <Select value={form.programId} onChange={(e) => setForm((f) => ({ ...f, programId: e.target.value }))} required>
                <option value="">Selecione...</option>
                {(programs?.data || []).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </Select>
            </Field>
            <Field label="Escola" required>
              <Select value={form.schoolId} onChange={(e) => setForm((f) => ({ ...f, schoolId: e.target.value }))} required>
                <option value="">Selecione...</option>
                {(schools?.data || []).map((s) => <option key={s.id} value={s.id}>{s.inep} — {s.name}</option>)}
              </Select>
            </Field>
            <Field label="Indicador" required>
              <Select value={form.indicatorId} onChange={(e) => setForm((f) => ({ ...f, indicatorId: e.target.value }))} required>
                <option value="">Selecione...</option>
                {(indicators?.data || []).map((i) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
              </Select>
            </Field>
            <Field label="Ano" required>
              <Select value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}>
                {yearsRange(2023).map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </Field>
            <Field label="Período" required>
              <Select value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}>
                {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label="Resultado (valor)" required>
              <Input type="number" step="0.01" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} required />
            </Field>
          </div>
          <Field label="Observação">
            <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
          <label className="checkbox-row">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            Atualizar se já existir resultado para esta combinação
          </label>
        </form>
      </Modal>

      {/* lote */}
      <Modal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        title="Lançamento em lote (rápido)"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBatchOpen(false)}>Fechar</Button>
            <Button onClick={submitBatchText} disabled={busy}>{busy ? 'Processando...' : 'Processar lote'}</Button>
          </>
        }
      >
        <Alert type="info">
          Uma linha por resultado, no formato:
          <div style={{ marginTop: 6 }}><code>código_programa;inep_escola;código_indicador;ano;período;valor</code></div>
          <div style={{ marginTop: 6, color: 'var(--text-2)' }}>Ex.: <code>PRG-2025-01;15010137;IND-001;2025;1º Semestre;87,5</code></div>
        </Alert>
        <label className="checkbox-row" style={{ margin: '10px 0' }}>
          <input type="checkbox" checked={batchOverwrite} onChange={(e) => setBatchOverwrite(e.target.checked)} />
          Atualizar registros existentes
        </label>
        <textarea
          className="textarea"
          style={{ minHeight: 160, fontFamily: 'var(--mono)', fontSize: 12.5 }}
          value={batchText}
          onChange={(e) => setBatchText(e.target.value)}
          placeholder={'PRG-2025-01;15010137;IND-001;2025;1º Semestre;87,5\nPRG-2025-01;15010274;IND-001;2025;1º Semestre;92,3'}
        />
        {batchResult && (
          <Alert type={batchResult.errors.length ? 'warn' : 'success'}>
            <div><strong>{batchResult.created}</strong> criado(s), <strong>{batchResult.updated}</strong> atualizado(s), <strong>{batchResult.errors.length}</strong> com problema.</div>
            {batchResult.errors.slice(0, 8).map((e, i) => <div key={i} style={{ fontSize: 12 }}>• {e}</div>)}
          </Alert>
        )}
      </Modal>

      {/* edição */}
      <Modal
        open={Boolean(editRow)}
        onClose={() => setEditRow(null)}
        title="Editar resultado"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditRow(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={busy}>Salvar</Button>
          </>
        }
      >
        {editRow && (
          <>
            <p style={{ marginTop: 0, color: 'var(--text-2)', fontSize: 13 }}>
              {editRow.school.name} · {editRow.indicator.name} · {editRow.period}/{editRow.year}
            </p>
            <Field label="Valor">
              <Input type="number" step="0.01" value={editRow.value} onChange={(e) => setEditRow((r) => ({ ...r, value: e.target.value }))} />
            </Field>
            <Field label="Observação">
              <Input value={editRow.notes || ''} onChange={(e) => setEditRow((r) => ({ ...r, notes: e.target.value }))} />
            </Field>
          </>
        )}
      </Modal>
    </>
  );
}
