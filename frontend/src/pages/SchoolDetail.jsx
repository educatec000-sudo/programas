import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { schoolsApi, techniciansApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { LoadingBlock, Tabs, Badge, EmptyState, Button, Modal, Select, Input, Field, ConfirmDialog, Alert } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import { SCHOOL_SITUATION, DEPENDENCY, fmtDateTime, AUDIT_ACTION_LABELS, ENTITY_LABELS, PROGRAM_STATUS } from '../utils/format.js';

const SECTION = {
  fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
  color: 'var(--primary-dark)', margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid var(--border)',
};

function KV({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 13.5, wordBreak: 'break-word' }}>{children ?? '—'}</div>
    </div>
  );
}

export default function SchoolDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const { success, error } = useToast();
  const [tab, setTab] = useState('dados');

  const { data: school, loading, refresh } = useApi(() => schoolsApi.get(id), [id]);
  const { data: history } = useApi(() => schoolsApi.history(id, { pageSize: 25 }), [id]);
  const { data: techDetail, refresh: refreshTechs } = useApi(() => techniciansApi.bySchool(id), [id]);
  const { data: eligible } = useApi(() => techniciansApi.eligible(), []);

  const [addOpen, setAddOpen] = useState(false);
  const [selectedTechs, setSelectedTechs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);

  if (loading) return <LoadingBlock />;
  if (!school) return <EmptyState title="Escola não encontrada" />;

  const situation = SCHOOL_SITUATION[school.situation];
  const hasCoords = school.latitude != null && school.longitude != null;
  const technicians = techDetail?.technicians || [];
  const eligibleOptions = (eligible?.data || []).filter((t) => !technicians.some((x) => x.userId === t.id));

  const addTechnicians = async () => {
    setBusy(true);
    try {
      const res = await techniciansApi.create({ schoolId: id, technicianIds: selectedTechs });
      success(`${res.created} técnico(s) vinculado(s)${res.duplicates ? `, ${res.duplicates} já estava(m) vinculado(s)` : ''}.`);
      setAddOpen(false);
      setSelectedTechs([]);
      refreshTechs();
    } catch (err) {
      error(err.details?.map((d) => d.message).join(' · ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    setBusy(true);
    try {
      await techniciansApi.remove(removeTarget.linkId);
      success(`Técnico "${removeTarget.name}" removido da escola.`);
      setRemoveTarget(null);
      refreshTechs();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={school.name}
        subtitle={`INEP ${school.inep || '—'} · ${school.municipality}${school.uf ? `/${school.uf}` : ''}`}
        actions={
          <>
            {situation && <Badge cls={situation.cls}>{situation.label}</Badge>}
            <Link to="/escolas" className="btn btn-secondary btn-sm">← Voltar</Link>
          </>
        }
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'dados', label: 'Dados' },
          { key: 'tecnicos', label: 'Técnicos responsáveis', count: technicians.length },
          { key: 'programas', label: 'Programas', count: school.programs.length },
          { key: 'historico', label: 'Histórico' },
        ]}
      />

      {tab === 'dados' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
          <div className="card card-pad">
            <div style={SECTION}>Identificação</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <KV label="INEP"><span className="mono">{school.inep || '—'}</span></KV>
              <KV label="Tipo de escola">{school.schoolType}</KV>
              <KV label="Situação">{situation && <Badge cls={situation.cls}>{situation.label}</Badge>}</KV>
              <KV label="Dependência">{DEPENDENCY[school.adminDependency]}</KV>
            </div>
          </div>

          <div className="card card-pad">
            <div style={SECTION}>Endereço</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <KV label="Endereço">{[school.address, school.addressNumber].filter(Boolean).join(', ')}</KV>
              <KV label="Complemento">{school.addressComplement}</KV>
              <KV label="Bairro">{school.district}</KV>
              <KV label="CEP">{school.cep ? school.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : '—'}</KV>
              <KV label="Município">{school.municipality}</KV>
              <KV label="UF">{school.uf}</KV>
              <KV label="Zona">{school.zone === 'URBANA' ? 'Urbana' : school.zone === 'RURAL' ? 'Rural' : '—'}</KV>
            </div>
          </div>

          <div className="card card-pad">
            <div style={SECTION}>Gestão</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <KV label="Gestor(a) / Direção">{school.responsible}</KV>
              <KV label="Telefone">{school.phone}</KV>
              <KV label="E-mail">{school.email}</KV>
            </div>
          </div>

          <div className="card card-pad">
            <div style={SECTION}>Localização</div>
            {hasCoords ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <KV label="Latitude"><span className="mono">{school.latitude}</span></KV>
                  <KV label="Longitude"><span className="mono">{school.longitude}</span></KV>
                </div>
                <a className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}
                  href={`https://www.google.com/maps?q=${school.latitude},${school.longitude}`} target="_blank" rel="noreferrer">
                  🗺 Ver no mapa
                </a>
              </>
            ) : (
              <Alert type="warn">Sem coordenadas cadastradas — importe a planilha LOCALIZAÇÃO ESCOLAS.xlsx para preencher automaticamente.</Alert>
            )}
            {school.notes && <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '12px 0 0' }}>{school.notes}</p>}
          </div>
        </div>
      )}

      {tab === 'tecnicos' && (
        <div className="card card-pad" style={{ maxWidth: 760 }}>
          <div className="card-header-row">
            <div>
              <div className="card-title">Técnicos responsáveis</div>
              <div className="card-subtitle">Usuários responsáveis por esta escola</div>
            </div>
            {can('technicians:write') && (
              <Button size="sm" onClick={() => setAddOpen(true)} disabled={!eligibleOptions.length}>+ Adicionar técnico</Button>
            )}
          </div>
          {technicians.length === 0 ? (
            <Alert type="warn">Esta escola ainda não possui técnico responsável.</Alert>
          ) : (
            technicians.map((t) => (
              <div key={t.linkId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px dashed var(--border)' }}>
                <div className="avatar">{t.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <strong style={{ fontSize: 13.5 }}>{t.name}</strong>
                    <Badge cls="badge-gray">{t.role}</Badge>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                    {t.email}{t.phone ? ` · ${t.phone}` : ''}
                  </div>
                </div>
                {can('technicians:delete') && (
                  <Button size="sm" variant="ghost" title="Remover" onClick={() => setRemoveTarget(t)}>🗑</Button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'programas' && (
        <DataTable
          columns={[
            { key: 'code', label: 'Código', render: (p) => <span className="mono">{p.program.code}</span> },
            { key: 'name', label: 'Programa', render: (p) => <strong>{p.program.name}</strong> },
            { key: 'year', label: 'Ano', render: (p) => p.program.year },
            { key: 'status', label: 'Status', render: (p) => { const info = PROGRAM_STATUS[p.program.status]; return <Badge cls={info?.cls}>{info?.label}</Badge>; } },
            { key: 'open', label: '', align: 'right', render: (p) => <Link to={`/programas/${p.program.id}`} className="btn btn-secondary btn-sm">Abrir</Link> },
          ]}
          rows={school.programs}
          rowKey={(p) => `${p.program.id}-${p.joinedAt}`}
          emptyTitle="A escola não participa de programas"
          emptyIcon="📋"
        />
      )}

      {tab === 'historico' && (
        <div className="card card-pad" style={{ maxWidth: 760 }}>
          <div className="card-title">Histórico de alterações (auditoria)</div>
          <ul className="timeline">
            {(history?.data || []).map((log) => (
              <li key={log.id}>
                <div className="when" style={{ minWidth: 120 }}>{fmtDateTime(log.createdAt)}</div>
                <div>
                  <strong>{AUDIT_ACTION_LABELS[log.action] || log.action}</strong>{' '}
                  <span style={{ color: 'var(--text-2)' }}>
                    {ENTITY_LABELS[log.entity] || log.entity}{log.userName ? ` · ${log.userName}` : ''}
                  </span>
                </div>
              </li>
            ))}
            {!history?.data?.length && <li style={{ color: 'var(--text-3)' }}>Sem registros.</li>}
          </ul>
        </div>
      )}

      {/* adicionar técnicos */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Adicionar técnicos"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={addTechnicians} disabled={busy || !selectedTechs.length}>
              {busy ? 'Vinculando...' : `Vincular ${selectedTechs.length}`}
            </Button>
          </>
        }
      >
        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 9 }}>
          {eligibleOptions.map((t) => (
            <label key={t.id} className="dropdown-item" style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
              <input type="checkbox" style={{ width: 16, height: 16, accentColor: 'var(--primary)', marginTop: 2 }}
                checked={selectedTechs.includes(t.id)}
                onChange={(e) => setSelectedTechs((sel) => (e.target.checked ? [...sel, t.id] : sel.filter((x) => x !== t.id)))} />
              <div>
                <div style={{ fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t.email}</div>
              </div>
            </label>
          ))}
          {!eligibleOptions.length && <div className="table-empty">Todos os técnicos elegíveis já estão vinculados.</div>}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={confirmRemove}
        title="Remover técnico"
        message={`Remover "${removeTarget?.name}" desta escola?`}
        danger confirmLabel="Remover" busy={busy}
      />
    </>
  );
}
