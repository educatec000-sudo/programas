import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useDebounce } from '../hooks/useApi.js';
import { techniciansApi, schoolsApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Button, Field, Input, Select, Modal, Badge, ConfirmDialog, LoadingBlock, Alert } from '../components/ui.jsx';
import { SCHOOL_SITUATION, fmtDateTime } from '../utils/format.js';
import { Icon } from '../components/icons.jsx';

const VIEWS = [
  { key: 'geral', label: 'Geral' },
  { key: 'escola', label: 'Escola' },
  { key: 'tecnico', label: 'Técnico' },
];

export default function TechnicianSchools() {
  const { can } = useAuth();
  const { success, error, toast } = useToast();

  const [view, setView] = useState('geral');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [situation, setSituation] = useState('');
  const [unassigned, setUnassigned] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('name');
  const [dir, setDir] = useState('asc');

  const isTechView = view === 'tecnico';

  const filters = {
    search: debouncedSearch,
    ...(isTechView ? {} : { ...(situation && { situation }) }),
    ...(unassigned ? { unassigned: 'true' } : {}),
    page,
    pageSize: 15,
    sort,
    dir,
  };

  const { data: stats, refresh: refreshStats } = useApi(() => techniciansApi.stats(), []);

  const { data: geral, loading: loadingGeral, refresh: refreshGeral } = useApi(
    () => (view !== 'tecnico' ? techniciansApi.geral(filters) : Promise.resolve(null)),
    [view, debouncedSearch, situation, unassigned, page, sort, dir],
  );
  const { data: techs, loading: loadingTechs, refresh: refreshTechs } = useApi(
    () => (view === 'tecnico' ? techniciansApi.technicians(filters) : Promise.resolve(null)),
    [view, debouncedSearch, unassigned, page, sort, dir],
  );

  const refreshAll = () => {
    refreshGeral();
    refreshTechs();
    refreshStats();
  };

  const clearFilters = () => {
    setSearch('');
    setSituation('');
    setUnassigned(false);
    setPage(1);
  };

  // ---- modais ----
  const [schoolModal, setSchoolModal] = useState(null); // dados getBySchool
  const [techModal, setTechModal] = useState(null); // dados getByTechnician
  const [linkModal, setLinkModal] = useState(null); // { schoolId? }
  const [removeTarget, setRemoveTarget] = useState(null); // { linkId, label }

  const openSchool = async (school) => {
    try {
      setSchoolModal(await techniciansApi.bySchool(school.id));
    } catch (err) {
      error(err.message);
    }
  };
  const openTechnician = async (tech) => {
    try {
      setTechModal(await techniciansApi.byTechnician(tech.userId || tech.id));
    } catch (err) {
      error(err.message);
    }
  };

  const doRemove = async () => {
    try {
      await techniciansApi.remove(removeTarget.linkId);
      success(`Vínculo removido: ${removeTarget.label}`);
      setRemoveTarget(null);
      refreshAll();
      if (schoolModal) setSchoolModal(await techniciansApi.bySchool(schoolModal.id).catch(() => null));
      if (techModal) setTechModal(await techniciansApi.byTechnician(techModal.id).catch(() => null));
    } catch (err) {
      error(err.message);
    }
  };

  // ---- tabela escola/geral ----
  const schoolColumns = [
    { key: 'inep', label: 'INEP', width: 110, sortable: true, render: (s) => <span className="mono">{s.inep}</span> },
    {
      key: 'name', label: 'Escola', sortable: true,
      render: (s) => (
        <div>
          <strong>{s.name}</strong>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{s.address || '—'}</div>
        </div>
      ),
    },
    {
      key: 'situation', label: 'Situação', sortable: true,
      render: (s) => { const info = SCHOOL_SITUATION[s.situation]; return <Badge cls={info?.cls}>{info?.label}</Badge>; },
    },
    {
      key: 'technicians', label: 'Técnicos responsáveis',
      render: (s) =>
        s.techniciansCount === 0 ? (
          <span style={{ color: 'var(--text-3)', fontSize: 12.5 }}>— sem técnico responsável —</span>
        ) : view === 'geral' ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {s.technicians.map((t) => (
              <Badge key={t.linkId} cls="badge-blue">{t.name}</Badge>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {s.technicians.map((t) => (
              <span key={t.linkId} className="badge badge-blue" title={`${t.role}${t.notes ? ` · ${t.notes}` : ''}`}>
                {t.name}
                {can('technicians:delete') && (
                  <span
                    style={{ cursor: 'pointer', marginLeft: 4, opacity: 0.75 }}
                    onClick={(e) => { e.stopPropagation(); setRemoveTarget({ linkId: t.linkId, label: `${t.name} → ${s.name}` }); }}
                    title="Remover vínculo"
                  >
                    ✕
                  </span>
                )}
              </span>
            ))}
          </div>
        ),
    },
    { key: 'techniciansCount', label: 'Qtd.', align: 'center', render: (s) => s.techniciansCount || '—' },
  ];

  // ---- tabela técnico ----
  const techColumns = [
    {
      key: 'name', label: 'Técnico', sortable: true,
      render: (t) => (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="avatar">{t.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</div>
          <div>
            <strong>{t.name}</strong>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'role', label: 'Perfil', render: (t) => <Badge cls="badge-gray">{t.role.name}</Badge> },
    {
      key: 'schools', label: 'Escolas atendidas',
      render: (t) =>
        t.schoolsCount === 0 ? (
          <span style={{ color: 'var(--warning)', fontSize: 12.5 }}>sem escola atribuída</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {t.schools.slice(0, 5).map((s) => (
              <Badge key={s.linkId} cls="badge-gray">{s.name}</Badge>
            ))}
            {t.schoolsCount > 5 && <Badge cls="badge-gray">+{t.schoolsCount - 5}</Badge>}
          </div>
        ),
    },
    { key: 'schoolsCount', label: 'Total', align: 'center', render: (t) => <strong>{t.schoolsCount}</strong> },
    {
      key: 'open', label: '', align: 'right',
      render: (t) => (
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openTechnician(t); }}>
          Detalhes →
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Técnicos por Escola"
        subtitle="Consulte e gerencie os técnicos responsáveis pelas escolas."
        actions={
          <>
            <Button variant="secondary" onClick={refreshAll}>↻ Atualizar</Button>
            <Button variant="ghost" onClick={clearFilters}>Limpar filtros</Button>
            {can('technicians:export') && (
              <>
                <Button variant="secondary" onClick={() => techniciansApi.export({ ...filters, format: 'csv' }).catch((e) => error(e.message))}>⬇ CSV</Button>
                <Button variant="secondary" onClick={() => techniciansApi.export({ ...filters, format: 'xlsx' }).catch((e) => error(e.message))}>⬇ XLSX</Button>
                <Button variant="secondary" onClick={() => techniciansApi.export({ ...filters, format: 'pdf' }).catch((e) => error(e.message))}>⬇ PDF</Button>
              </>
            )}
            {can('technicians:write') && (
              <Button onClick={() => setLinkModal({})}>+ Novo vínculo</Button>
            )}
          </>
        }
      />

      {/* indicadores reais do banco */}
      <div className="stats-grid">
        <StatMini icon="🏫" tone="blue" value={stats?.totalSchools} label="Total de escolas" />
        <StatMini icon="👥" tone="cyan" value={stats?.totalTechnicians} label="Total de técnicos" />
        <StatMini icon="✅" tone="green" value={stats?.schoolsWithTechnician} label="Escolas com técnico" />
        <StatMini icon="⚠️" tone="yellow" value={stats?.schoolsWithoutTechnician} label="Escolas sem técnico" />
        <StatMini icon="📎" tone="violet" value={stats?.techniciansWithSchools} label="Técnicos com escolas" />
        <StatMini icon="🕳" tone="red" value={stats?.techniciansWithoutSchools} label="Técnicos sem escola" />
      </div>

      {/* visão + filtros */}
      <div className="pill-tabs">
        {VIEWS.map((v) => (
          <button key={v.key} className={`pill ${view === v.key ? 'active' : ''}`} onClick={() => { setView(v.key); setPage(1); }} type="button">
            {v.label}
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <div className="field grow">
          <label>{isTechView ? 'Pesquisar técnico' : 'Pesquisar escola'}</label>
          <Input
            placeholder={isTechView ? 'Nome do técnico, e-mail ou escola atendida...' : 'Nome, INEP, endereço ou técnico responsável...'}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        {!isTechView && (
          <>
            <Field label="Situação">
              <Select value={situation} onChange={(e) => { setSituation(e.target.value); setPage(1); }}>
                <option value="">Todas</option>
                {Object.entries(SCHOOL_SITUATION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Field>
          </>
        )}
        <div className="field" style={{ marginBottom: 0, minWidth: 230 }}>
          <label>{isTechView ? 'Filtro especial' : 'Distribuição'}</label>
          <label className="checkbox-row" style={{ height: 38, border: '1px solid var(--border-2)', borderRadius: 8, padding: '0 12px', background: 'var(--surface)' }}>
            <input
              type="checkbox"
              checked={unassigned}
              onChange={(e) => { setUnassigned(e.target.checked); setPage(1); }}
              style={{ width: 16, height: 16 }}
            />
            {isTechView ? 'Somente técnicos sem escola' : 'Somente escolas sem técnico'}
          </label>
        </div>
      </div>

      {isTechView ? (
        <DataTable
          columns={techColumns}
          rows={techs?.data || []}
          loading={loadingTechs}
          pagination={techs?.pagination}
          onPageChange={setPage}
          sort={sort}
          dir={dir}
          onSort={(s, d) => { setSort(s); setDir(d); }}
          onRowClick={openTechnician}
          emptyTitle="Nenhum técnico encontrado"
          emptyIcon="👥"
        />
      ) : (
        <DataTable
          columns={schoolColumns}
          rows={geral?.data || []}
          loading={loadingGeral}
          pagination={geral?.pagination}
          onPageChange={setPage}
          sort={sort}
          dir={dir}
          onSort={(s, d) => { setSort(s); setDir(d); }}
          onRowClick={openSchool}
          emptyTitle={unassigned ? 'Todas as escolas possuem técnico responsável' : 'Nenhuma escola encontrada'}
          emptyIcon="🏫"
        />
      )}

      {/* ---- modal: detalhe da escola + técnicos ---- */}
      <Modal
        open={Boolean(schoolModal)}
        onClose={() => setSchoolModal(null)}
        title={schoolModal?.name || ''}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSchoolModal(null)}>Fechar</Button>
            {can('technicians:write') && (
              <Button onClick={() => setLinkModal({ schoolId: schoolModal.id, schoolName: schoolModal.name })}>
                + Adicionar técnico
              </Button>
            )}
          </>
        }
      >
        {schoolModal && (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
              <Info label="INEP" value={schoolModal.inep} mono />
              <Info label="Situação" value={<Badge cls={SCHOOL_SITUATION[schoolModal.situation]?.cls}>{SCHOOL_SITUATION[schoolModal.situation]?.label}</Badge>} />
              {schoolModal.latitude != null && <Info label="Latitude" value={schoolModal.latitude} />}
              {schoolModal.longitude != null && <Info label="Longitude" value={schoolModal.longitude} />}
            </div>

            <div className="card-title">Técnicos responsáveis ({schoolModal.technicians.length})</div>
            {schoolModal.technicians.length === 0 ? (
              <Alert type="warn">Esta escola ainda não possui técnico responsável.</Alert>
            ) : (
              <div>
                {schoolModal.technicians.map((t) => (
                  <div key={t.linkId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px dashed var(--border)' }}>
                    <div className="avatar">{t.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <strong style={{ fontSize: 13.5 }}>{t.name}</strong>
                        <Badge cls="badge-gray">{t.role}</Badge>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                        {t.email}{t.phone ? ` · ${t.phone}` : ''}{t.notes ? ` · ${t.notes}` : ''} · desde {fmtDateTime(t.linkedAt)}
                      </div>
                    </div>
                    {can('technicians:delete') && (
                      <Button size="sm" variant="ghost" title="Remover vínculo"
                        onClick={() => setRemoveTarget({ linkId: t.linkId, label: `${t.name} → ${schoolModal.name}` })}>
                        🗑
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <Link to={`/escolas/${schoolModal.id}`} onClick={() => setSchoolModal(null)}>Ver cadastro completo da escola →</Link>
            </div>
          </>
        )}
      </Modal>

      {/* ---- modal: detalhe do técnico + escolas ---- */}
      <Modal
        open={Boolean(techModal)}
        onClose={() => setTechModal(null)}
        title={`Técnico: ${techModal?.name || ''}`}
        size="lg"
        footer={<Button variant="secondary" onClick={() => setTechModal(null)}>Fechar</Button>}
      >
        {techModal && (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
              <Info label="Perfil" value={<Badge cls="badge-gray">{techModal.role.name}</Badge>} />
              <Info label="E-mail" value={techModal.email} />
              {techModal.phone && <Info label="Telefone" value={techModal.phone} />}
            </div>
            <div className="card-title">
              Escolas sob responsabilidade — <strong>{techModal.total} escola(s)</strong>
            </div>
            {techModal.total === 0 ? (
              <Alert type="warn">Este técnico ainda não possui escolas atribuídas.</Alert>
            ) : (
              <table className="data-table" style={{ border: '1px solid var(--border)', borderRadius: 9 }}>
                <thead>
                  <tr><th>#</th><th>Escola</th><th>INEP</th><th>Situação</th>{can('technicians:delete') && <th />}</tr>
                </thead>
                <tbody>
                  {techModal.schools.map((s, i) => (
                    <tr key={s.linkId}>
                      <td>{i + 1}</td>
                      <td><strong>{s.name}</strong></td>
                      <td><span className="mono">{s.inep}</span></td>
                      <td><Badge cls={SCHOOL_SITUATION[s.situation]?.cls}>{SCHOOL_SITUATION[s.situation]?.label}</Badge></td>
                      {can('technicians:delete') && (
                        <td className="center">
                          <Button size="sm" variant="ghost" title="Remover vínculo"
                            onClick={() => setRemoveTarget({ linkId: s.linkId, label: `${techModal.name} → ${s.name}` })}>
                            🗑
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Modal>

      {/* ---- modal: novo vínculo ---- */}
      <LinkModal
        open={linkModal}
        onClose={() => setLinkModal(null)}
        onCreated={(res) => {
          toast(
            `${res.created} vínculo(s) criado(s)${res.duplicates ? `, ${res.duplicates} ignorado(s) por duplicidade` : ''}.`,
            { type: res.created ? 'success' : 'warning', title: res.created ? 'Vínculos criados' : 'Nada criado' },
          );
          refreshAll();
          if (schoolModal?.id) techniciansApi.bySchool(schoolModal.id).then(setSchoolModal).catch(() => {});
        }}
      />

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={doRemove}
        title="Remover vínculo"
        message={`Remover o vínculo "${removeTarget?.label}"?`}
        danger
        confirmLabel="Remover"
      />
    </>
  );
}

/** Modal de criação de vínculos (escola + um ou vários técnicos). */
function LinkModal({ open, onClose, onCreated }) {
  const { error } = useToast();
  const { data: schools } = useApi(
    () => (open ? schoolsApi.list({ pageSize: 1000 }) : Promise.resolve(null)),
    [open],
  );
  const { data: eligible } = useApi(
    () => (open ? techniciansApi.eligible() : Promise.resolve(null)),
    [open],
  );

  const [technicianId, setTechnicianId] = useState('');
  const [selectedSchoolIds, setSelectedSchoolIds] = useState([]);
  const [linkedSchoolIds, setLinkedSchoolIds] = useState([]);
  const [notes, setNotes] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState('');
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    setTechnicianId('');
    setSelectedSchoolIds(open?.schoolId ? [open.schoolId] : []);
    setLinkedSchoolIds([]);
    setNotes('');
    setSchoolFilter('');
    setTechnicianFilter('');
  }, [open]);

  React.useEffect(() => {
    let active = true;
    if (!technicianId) {
      setLinkedSchoolIds([]);
      return () => { active = false; };
    }

    setLoadingLinks(true);
    techniciansApi.byTechnician(technicianId)
      .then((technician) => {
        if (!active) return;
        const linked = (technician.schools || []).map((school) => school.id);
        setLinkedSchoolIds(linked);
        setSelectedSchoolIds((ids) => ids.filter((id) => !linked.includes(id)));
      })
      .catch((err) => active && error(err.message))
      .finally(() => active && setLoadingLinks(false));

    return () => { active = false; };
  }, [technicianId]);

  const submit = async () => {
    if (!technicianId || !selectedSchoolIds.length) return;
    setBusy(true);
    try {
      const res = await techniciansApi.create({
        technicianId,
        schoolIds: selectedSchoolIds,
        notes,
      });
      onCreated(res);
      onClose();
    } catch (err) {
      error(err.details?.map((d) => d.message).join(' · ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  const normalizedSchoolFilter = schoolFilter.trim().toLowerCase();
  const schoolOptions = (schools?.data || []).filter((school) =>
    !normalizedSchoolFilter ||
    school.name.toLowerCase().includes(normalizedSchoolFilter) ||
    String(school.inep || '').includes(normalizedSchoolFilter) ||
    String(school.address || '').toLowerCase().includes(normalizedSchoolFilter) ||
    String(school.zone || '').toLowerCase().includes(normalizedSchoolFilter),
  );

  const normalizedTechnicianFilter = technicianFilter.trim().toLowerCase();
  const technicianOptions = (eligible?.data || []).filter((technician) =>
    !normalizedTechnicianFilter ||
    technician.name.toLowerCase().includes(normalizedTechnicianFilter) ||
    technician.email.toLowerCase().includes(normalizedTechnicianFilter),
  );

  const linkedSet = new Set(linkedSchoolIds);
  const selectableFilteredIds = schoolOptions
    .filter((school) => !linkedSet.has(school.id))
    .map((school) => school.id);
  const allFilteredSelected =
    selectableFilteredIds.length > 0 &&
    selectableFilteredIds.every((id) => selectedSchoolIds.includes(id));

  const toggleSchool = (schoolId) => {
    setSelectedSchoolIds((ids) =>
      ids.includes(schoolId) ? ids.filter((id) => id !== schoolId) : [...ids, schoolId],
    );
  };

  const toggleAllFiltered = () => {
    setSelectedSchoolIds((ids) => {
      if (allFilteredSelected) {
        return ids.filter((id) => !selectableFilteredIds.includes(id));
      }
      return [...new Set([...ids, ...selectableFilteredIds])];
    });
  };

  return (
    <Modal
      open={Boolean(open)}
      onClose={onClose}
      title="Novo vínculo — técnico e escolas"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || !technicianId || !selectedSchoolIds.length}>
            {busy ? 'Criando vínculos...' : `Vincular a ${selectedSchoolIds.length} escola(s)`}
          </Button>
        </>
      }
    >
      {!eligible?.data?.length && (
        <Alert type="warn">
          Nenhum usuário elegível. Marque o perfil como “pode ser técnico” em
          {' '}<Link to="/perfis">Perfis e Permissões</Link>.
        </Alert>
      )}

      <Field label="1. Selecione o técnico *" hint="Pesquise pelo nome ou e-mail">
        <Input
          placeholder="Filtrar técnicos..."
          value={technicianFilter}
          onChange={(e) => setTechnicianFilter(e.target.value)}
        />
        <Select
          value={technicianId}
          onChange={(e) => {
            setTechnicianId(e.target.value);
            setSelectedSchoolIds(open?.schoolId ? [open.schoolId] : []);
          }}
          style={{ marginTop: 6 }}
        >
          <option value="">Selecione o técnico...</option>
          {technicianOptions.map((technician) => (
            <option key={technician.id} value={technician.id}>
              {technician.name} — {technician.email}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="2. Selecionar escolas *"
        hint="Escolha várias escolas para o técnico. Filtre por nome, INEP, endereço ou zona."
      >
        <Input
          placeholder="Filtrar todas as escolas..."
          value={schoolFilter}
          onChange={(e) => setSchoolFilter(e.target.value)}
        />

        <label
          className="checkbox-row"
          style={{ marginTop: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}
        >
          <input
            type="checkbox"
            checked={allFilteredSelected}
            disabled={!technicianId || selectableFilteredIds.length === 0 || loadingLinks}
            onChange={toggleAllFiltered}
            style={{ width: 16, height: 16 }}
          />
          <strong>Selecionar todas as {selectableFilteredIds.length} escola(s) filtrada(s)</strong>
        </label>

        <div style={{ marginTop: 6, maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          {schoolOptions.map((school) => {
            const alreadyLinked = linkedSet.has(school.id);
            const checked = alreadyLinked || selectedSchoolIds.includes(school.id);
            return (
              <label
                key={school.id}
                className="dropdown-item"
                style={{ cursor: alreadyLinked || !technicianId ? 'default' : 'pointer', borderBottom: '1px solid var(--border)', opacity: !technicianId ? 0.65 : 1 }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!technicianId || alreadyLinked || loadingLinks}
                  onChange={() => toggleSchool(school.id)}
                  style={{ width: 16, height: 16, accentColor: 'var(--primary)', marginTop: 2 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <strong>{school.name}</strong>
                    {alreadyLinked && <Badge cls="badge-green">já vinculada</Badge>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                    INEP {school.inep || '—'}{school.address ? ` · ${school.address}` : ''}{school.zone ? ` · ${school.zone}` : ''}
                  </div>
                </div>
              </label>
            );
          })}
          {!schoolOptions.length && <div className="table-empty">Nenhuma escola encontrada com esse filtro</div>}
        </div>

        <div style={{ marginTop: 7, fontSize: 12.5, color: 'var(--text-2)' }}>
          <strong>{selectedSchoolIds.length}</strong> nova(s) escola(s) selecionada(s)
          {technicianId && <> · <strong>{linkedSchoolIds.length}</strong> vínculo(s) já existente(s)</>}
        </div>
      </Field>

      <Field label="Observação dos vínculos (opcional)">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: responsável desde 2026" />
      </Field>
    </Modal>
  );
}

function StatMini({ icon, value, label, tone }) {
  const tones = {
    blue: ['var(--primary-soft)', 'var(--primary-dark)'],
    cyan: ['var(--info-bg)', 'var(--info)'],
    green: ['var(--success-bg)', 'var(--success)'],
    yellow: ['var(--warning-bg)', 'var(--warning)'],
    red: ['var(--danger-bg)', 'var(--danger)'],
    violet: ['#ede9fe', '#7c3aed'],
  };
  const [bg, color] = tones[tone] || tones.blue;
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: bg, color }}>{icon}</div>
      <div>
        <div className="stat-value">{value ?? '—'}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

function Info({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontFamily: mono ? 'var(--mono)' : 'inherit' }}>{value}</div>
    </div>
  );
}
