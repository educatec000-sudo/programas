import React, { useRef, useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { importsApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Button, Badge, Tabs, Modal, LoadingBlock, Alert } from '../components/ui.jsx';
import { IMPORT_STATUS, ROW_STATUS, fmtDateTime } from '../utils/format.js';

const TYPES = [
  { key: 'ESCOLAS', label: 'Escolas', icon: '🏫', desc: 'INEP, nome, município, endereço... (aceita colunas do Censo Escolar)' },
  { key: 'PROGRAMAS', label: 'Programas', icon: '📋', desc: 'Código, nome, ano, status, meta global...' },
  { key: 'INDICADORES', label: 'Indicadores', icon: '📊', desc: 'Código, nome, categoria, polaridade, peso, meta...' },
  { key: 'RESULTADOS', label: 'Resultados', icon: '📈', desc: 'Programa, INEP, indicador, ano, período e valor' },
];

export default function Imports() {
  const { can } = useAuth();
  const { toast, success, error } = useToast();
  const [tab, setTab] = useState('escolas');
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, loading, refresh } = useApi(
    () => importsApi.list({ page, pageSize: 12, type: typeFilter, status: statusFilter }),
    [page, typeFilter, statusFilter],
  );

  const fileRef = useRef(null);
  const [uploadType, setUploadType] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const openUpload = (type) => {
    setUploadType(type);
    setPreview(null);
  };

  const doUpload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const job = await importsApi.upload(file, uploadType);
      if (job.status === 'FALHOU') {
        error(job.error || 'Falha ao processar o arquivo.');
        setPreview(job);
      } else {
        setPreview(job);
        toast('Arquivo validado. Revise a prévia antes de confirmar.', { type: 'info', title: 'Prévia gerada' });
      }
      refresh();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    setBusy(true);
    try {
      const res = await importsApi.confirm(preview.id);
      success(`Importação concluída: ${res.created} criado(s), ${res.updated} atualizado(s).`);
      setPreview(null);
      refresh();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelImport = async () => {
    setBusy(true);
    try {
      await importsApi.cancel(preview.id);
      toast('Importação cancelada.', { type: 'warning' });
      setPreview(null);
      refresh();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id) => {
    try {
      const job = await importsApi.get(id);
      setPreview(job);
      setUploadType(null);
    } catch (err) {
      error(err.message);
    }
  };

  const currentType = TYPES.find((t) => t.key === uploadType);

  return (
    <>
      <PageHeader
        title="Importações"
        subtitle="Arquivo → leitura → validação → prévia → confirmação — nada é gravado sem sua revisão"
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'escolas', label: 'Nova importação' },
          { key: 'historico', label: 'Histórico', count: data?.pagination?.total },
        ]}
      />

      {tab === 'escolas' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
          {TYPES.map((t) => (
            <div key={t.key} className="card card-pad">
              <div style={{ fontSize: 26 }}>{t.icon}</div>
              <div className="card-title" style={{ marginTop: 6 }}>{t.label}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', minHeight: 40 }}>{t.desc}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {can('imports:write') && (
                  <Button size="sm" onClick={() => openUpload(t.key)}>Importar</Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => importsApi.template(t.key, 'csv').catch((e) => error(e.message))}
                >
                  Modelo
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'historico' && (
        <>
          <div className="filter-bar">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Tipo</label>
              <select className="select" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
                <option value="">Todos</option>
                {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Status</label>
              <select className="select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                <option value="">Todos</option>
                {Object.entries(IMPORT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <DataTable
            columns={[
              { key: 'createdAt', label: 'Data', render: (j) => fmtDateTime(j.createdAt) },
              { key: 'type', label: 'Tipo' },
              { key: 'filename', label: 'Arquivo', render: (j) => <span className="mono" style={{ fontSize: 12 }}>{j.filename}</span> },
              { key: 'user', label: 'Usuário', render: (j) => j.user?.name || '—' },
              { key: 'totalRows', label: 'Linhas', align: 'center' },
              { key: 'newRows', label: 'Novos', align: 'center', render: (j) => <strong style={{ color: 'var(--success)' }}>{j.newRows}</strong> },
              { key: 'updatedRows', label: 'Atualizados', align: 'center', render: (j) => <strong style={{ color: 'var(--primary)' }}>{j.updatedRows}</strong> },
              { key: 'duplicateRows', label: 'Duplicados', align: 'center' },
              { key: 'errorRows', label: 'Erros', align: 'center', render: (j) => (j.errorRows ? <strong style={{ color: 'var(--danger)' }}>{j.errorRows}</strong> : 0) },
              {
                key: 'status', label: 'Status',
                render: (j) => { const info = IMPORT_STATUS[j.status]; return <Badge cls={info?.cls}>{info?.label}</Badge>; },
              },
              {
                key: 'open', label: '', align: 'right',
                render: (j) => <Button size="sm" variant="ghost" onClick={() => openDetail(j.id)}>Detalhes</Button>,
              },
            ]}
            rows={data?.data || []}
            loading={loading}
            pagination={data?.pagination}
            onPageChange={setPage}
            emptyTitle="Nenhuma importação realizada"
            emptyIcon="📥"
          />
        </>
      )}

      {/* modal de upload + prévia */}
      <Modal
        open={Boolean(uploadType) || Boolean(preview)}
        onClose={() => { setUploadType(null); setPreview(null); }}
        title={preview ? `Prévia — ${preview.filename}` : `Importar ${currentType?.label}`}
        size="xl"
        footer={
          uploadType && !preview ? (
            <>
              <Button variant="secondary" onClick={() => setUploadType(null)}>Cancelar</Button>
              <Button onClick={() => fileRef.current?.click()} disabled={busy}>
                {busy ? 'Validando...' : 'Selecionar arquivo CSV/XLSX'}
              </Button>
            </>
          ) : preview?.status === 'PENDENTE' ? (
            <>
              <Button variant="danger" onClick={cancelImport} disabled={busy}>Cancelar importação</Button>
              <Button variant="success" onClick={confirmImport} disabled={busy || preview.validRows === 0}>
                {busy ? 'Gravando...' : `Confirmar ${preview.validRows} linha(s) válida(s)`}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => { setUploadType(null); setPreview(null); }}>Fechar</Button>
          )
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => doUpload(e.target.files?.[0])}
        />

        {!preview && (
          <>
            <div className="card-title">{currentType?.icon} {currentType?.label}</div>
            <p style={{ color: 'var(--text-2)', fontSize: 13.5 }}>{currentType?.desc}</p>
            <Alert type="info">
              Pipeline: <strong>Arquivo → Leitura → Validação → Prévia → Confirmação</strong>.
              Linhas inválidas nunca são gravadas silenciosamente — você verá o erro exato de cada linha antes de confirmar.
            </Alert>
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={() => importsApi.template(uploadType, 'xlsx').catch((e) => error(e.message))}>
                ⬇ Baixar modelo XLSX
              </Button>
            </div>
          </>
        )}

        {preview && (
          <>
            <div className="import-summary">
              <div className="cell"><div className="num">{preview.totalRows}</div><div className="lbl">Linhas</div></div>
              <div className="cell" style={{ borderColor: 'var(--success)', borderWidth: 2 }}><div className="num" style={{ color: 'var(--success)' }}>{preview.newRows}</div><div className="lbl">Novos</div></div>
              <div className="cell" style={{ borderColor: 'var(--primary)', borderWidth: 2 }}><div className="num" style={{ color: 'var(--primary)' }}>{preview.updatedRows}</div><div className="lbl">Atualizar</div></div>
              <div className="cell"><div className="num" style={{ color: 'var(--warning)' }}>{preview.duplicateRows}</div><div className="lbl">Duplicados</div></div>
              <div className="cell" style={{ borderColor: 'var(--danger)', borderWidth: 2 }}><div className="num" style={{ color: 'var(--danger)' }}>{preview.errorRows}</div><div className="lbl">Erros</div></div>
            </div>

            {preview.error && <Alert type="error">{preview.error}</Alert>}
            {preview.validRows === 0 && preview.status === 'PENDENTE' && (
              <Alert type="warn">Nenhuma linha válida — corrija os erros no arquivo e envie novamente.</Alert>
            )}
            {preview.status === 'IMPORTADO' && (
              <Alert type="success">
                Importação concluída em {fmtDateTime(preview.confirmedAt)} por {preview.summary?.confirmedBy || '—'} —
                {' '}{preview.summary?.created ?? preview.newRows} criado(s), {preview.summary?.updated ?? preview.updatedRows} atualizado(s).
              </Alert>
            )}

            {preview.rows?.length > 0 && (
              <div style={{ maxHeight: 380, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 9 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Status</th>
                      <th>Dados</th>
                      <th>Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 200).map((r) => {
                      const info = ROW_STATUS[r.status];
                      const dataStr = r.data
                        ? Object.entries(r.data)
                            .filter(([k, v]) => v !== null && v !== undefined && v !== '' && !k.startsWith('_'))
                            .slice(0, 6)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(' · ')
                        : '—';
                      return (
                        <tr key={r.rowNumber}>
                          <td>{r.rowNumber}</td>
                          <td><Badge cls={info?.cls}>{info?.label || r.status}</Badge></td>
                          <td style={{ fontSize: 12, maxWidth: 480 }}>{dataStr}</td>
                          <td style={{ fontSize: 12, color: 'var(--danger)' }}>
                            {(r.errors || []).map((e) => e.message).join(' · ') || (r.status === 'DUPLICADO' ? 'chave repetida no arquivo' : '—')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
