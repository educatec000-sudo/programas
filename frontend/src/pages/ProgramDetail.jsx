import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { programsApi, schoolsApi, rankingsApi, analyticsApi, resultsApi, goalsApi, reportsApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Button, Field, Input, Modal, Badge, LoadingBlock, Tabs, Select, ConfirmDialog } from '../components/ui.jsx';
import { EvolutionChart, ClassificationDonut } from '../components/charts.jsx';
import { PROGRAM_STATUS, CLASSIFICATION_INFO, SCHOOL_ZONE, fmt, fmtDateTime, PERIODS } from '../utils/format.js';
import { getProgramImplementation } from '../programs/registry.js';

const DELETION_IMPACT_LABELS = {
  schools: 'Escolas vinculadas',
  indicators: 'Indicadores vinculados',
  results: 'Resultados',
  goals: 'Metas',
  evaluations: 'Avaliações consolidadas',
  collectionLinks: 'Links de coleta',
  pactoClasses: 'Turmas do Pacto',
  pactoAssessments: 'Avaliações do Pacto',
  pactoComponents: 'Componentes avaliados',
  pactoSkillResults: 'Resultados por habilidade',
  cncaResults: 'Resultados do CNCA',
  documents: 'Documentos vinculados',
};

export default function ProgramDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { can } = useAuth();
  const { toast, success, error } = useToast();
  const [tab, setTab] = useState(searchParams.get('tab') || 'resumo');

  const { data: program, loading, refresh } = useApi(() => programsApi.get(id), [id]);
  const implementation = getProgramImplementation(program);
  const sharedTabEnabled = (key) => !implementation?.disabledSharedTabs?.includes(key);

  useEffect(() => {
    if (implementation?.disabledSharedTabs?.includes(tab)) setTab('resumo');
  }, [implementation, tab]);

  // O ano é definido pelo ciclo selecionado; somente o período varia dentro dele.
  const [period, setPeriod] = useState('');
  useEffect(() => setPeriod(''), [id]);
  const activeYear = program?.year || new Date().getFullYear();

  const { data: ranking, loading: rankingLoading } = useApi(
    () => ((tab === 'ranking' || tab === 'graficos') && sharedTabEnabled(tab) && can('rankings:read') ? rankingsApi.get({ programId: id, year: activeYear, period: period || undefined }) : Promise.resolve(null)),
    [id, activeYear, period, tab, program?.code],
  );
  const { data: evolution } = useApi(
    () => (tab === 'graficos' && sharedTabEnabled('graficos') && can('analytics:read') ? analyticsApi.evolution({ programId: id, year: activeYear }) : Promise.resolve(null)),
    [id, activeYear, tab, program?.code],
  );
  const { data: evaluations, loading: evaluationsLoading } = useApi(
    () => (tab === 'avaliacoes' && sharedTabEnabled('avaliacoes') && can('rankings:read') ? rankingsApi.evaluations({ programId: id }) : Promise.resolve(null)),
    [id, tab, program?.code],
  );
  const { data: history, loading: historyLoading } = useApi(
    () => (tab === 'historico' ? programsApi.history(id, { page: 1, pageSize: 100 }) : Promise.resolve(null)),
    [id, tab],
  );

  // modais
  const [schoolsModal, setSchoolsModal] = useState(false);
  const [resultModal, setResultModal] = useState(false);
  const [cycleModal, setCycleModal] = useState(false);
  const [cycleForm, setCycleForm] = useState({ year: '', periodLabel: 'Anual', status: 'PLANEJAMENTO' });
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState(null);
  const [managementBusy, setManagementBusy] = useState(false);

  if (loading) return <LoadingBlock />;
  if (!program) return <div className="centered">Programa não encontrado</div>;

  const statusInfo = PROGRAM_STATUS[program.status];
  const specificTabs = implementation?.adminTabs || [];
  const activeSpecificTab = specificTabs.find((item) => item.key === tab);
  const availablePeriods = [...new Set((ranking?.rows || []).length >= 0 && (ranking?.periods || []).filter((p) => p.year === activeYear).map((p) => p.period))];

  const openCycleModal = () => {
    const latestYear = Math.max(activeYear, ...(program.cycles || []).map((cycle) => cycle.year));
    setCycleForm({ year: latestYear + 1, periodLabel: 'Anual', status: 'PLANEJAMENTO' });
    setCycleModal(true);
  };
  const createCycle = async () => {
    setManagementBusy(true);
    try {
      const cycle = await programsApi.createCycle(program.id, {
        ...cycleForm,
        year: Number(cycleForm.year),
      });
      success(`Ciclo ${cycle.year} criado sem copiar escolas ou dados de outros anos.`);
      setCycleModal(false);
      navigate(`/programas/${cycle.id}`);
    } catch (err) {
      error(err.message);
    } finally {
      setManagementBusy(false);
    }
  };
  const openDeleteModal = async () => {
    setDeleteModal(true);
    setDeleteImpact(null);
    try {
      setDeleteImpact(await programsApi.deletionImpact(program.id));
    } catch (err) {
      error(err.message);
      setDeleteModal(false);
    }
  };
  const deleteProgram = async () => {
    if (!deleteImpact?.canDelete) return;
    setManagementBusy(true);
    try {
      await programsApi.remove(program.id);
      success('Programa vazio e seus ciclos foram arquivados com segurança.');
      navigate('/programas');
    } catch (err) {
      if (err.details) setDeleteImpact(err.details);
      error(err.message);
    } finally {
      setManagementBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={program.catalog?.name || program.name}
        subtitle={
          implementation?.catalogCode === 'CNCA' || implementation?.code?.startsWith('CNCA') || implementation?.code === 'CNCA-2026'
            ? `${program.catalog?.code || program.code} · Ciclo ${program.year} · ${program.catalog?.organ || program.organ || 'MEC / SEMED'} · ${program.schools.length} escolas participantes`
            : `${program.catalog?.code || program.code} · Ciclo ${program.year} · ${program.catalog?.organ || program.organ || '—'} · ${program.indicators.length} critérios · ${program.schools.length} escolas`
        }
        actions={
          <>
            <Badge cls={statusInfo?.cls} >{statusInfo?.label}</Badge>
            <Link to="/programas" className="btn btn-secondary btn-sm">← Voltar</Link>
          </>
        }
      />

      <div className="card card-pad program-cycle-context">
        <div>
          <div className="card-title">Ano/ciclo do programa</div>
          <div className="card-subtitle">Cada ciclo possui escolas, turmas, avaliações e resultados independentes.</div>
        </div>
        <Field label="Ciclo em uso" className="program-cycle-selector">
          <Select value={program.id} onChange={(event) => navigate(`/programas/${event.target.value}`)}>
            {(program.cycles || []).map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.year}{cycle.periodLabel ? ` · ${cycle.periodLabel}` : ''} · {PROGRAM_STATUS[cycle.status]?.label || cycle.status}
              </option>
            ))}
          </Select>
        </Field>
        <div className="program-cycle-actions">
          {can('programs:write') && <Button size="sm" variant="secondary" onClick={openCycleModal}>+ Adicionar ciclo</Button>}
          {can('programs:delete') && <Button size="sm" variant="danger" onClick={openDeleteModal}>Excluir programa</Button>}
        </div>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'resumo', label: 'Visão geral' },
          ...specificTabs.map((item) => ({ key: item.key, label: item.label })),
          sharedTabEnabled('escolas') ? { key: 'escolas', label: 'Escolas participantes', count: program.schools.length } : null,
          sharedTabEnabled('criterios') && can('indicators:read') ? { key: 'criterios', label: 'Critérios de avaliação', count: program.indicators.length } : null,
          sharedTabEnabled('avaliacoes') && can('rankings:read') ? { key: 'avaliacoes', label: 'Avaliações', count: program.evaluationsCount } : null,
          sharedTabEnabled('resultados') && can('results:read') ? { key: 'resultados', label: 'Resultados' } : null,
          sharedTabEnabled('ranking') && can('rankings:read') ? { key: 'ranking', label: 'Ranking' } : null,
          sharedTabEnabled('graficos') && can('analytics:read') ? { key: 'graficos', label: 'Gráficos' } : null,
          sharedTabEnabled('historico') ? { key: 'historico', label: 'Histórico' } : null,
          sharedTabEnabled('relatorios') && can('reports:read') ? { key: 'relatorios', label: 'Relatórios' } : null,
        ].filter(Boolean)}
      />

      {((tab === 'ranking' && sharedTabEnabled('ranking')) || (tab === 'graficos' && sharedTabEnabled('graficos'))) && (
        <div className="filter-bar">
          <Field label="Período">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="">Mais recente</option>
              {(availablePeriods.length ? availablePeriods : PERIODS).map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          {ranking?.period && <div style={{ fontSize: 12.5, color: 'var(--text-2)', alignSelf: 'flex-end', paddingBottom: 8 }}>
            Exibindo: <strong>{ranking.period}/{ranking.year}</strong>
          </div>}
        </div>
      )}

      {tab === 'resumo' && (
        implementation?.OverviewComponent
          ? React.createElement(implementation.OverviewComponent, { program })
          : <InfoTab program={program} implementation={implementation} />
      )}

      {activeSpecificTab && React.createElement(activeSpecificTab.Component, { program, refreshProgram: refresh })}

      {tab === 'escolas' && (
        <SchoolsTab
          program={program}
          can={can}
          refresh={refresh}
          modalOpen={schoolsModal}
          setModalOpen={setSchoolsModal}
          success={success}
          error={error}
          genericEvaluationEnabled={sharedTabEnabled('avaliacoes') && sharedTabEnabled('resultados')}
        />
      )}

      {tab === 'criterios' && sharedTabEnabled('criterios') && <IndicatorsTab program={program} />}

      {tab === 'avaliacoes' && sharedTabEnabled('avaliacoes') && (
        <EvaluationsTab program={program} evaluations={evaluations} loading={evaluationsLoading} />
      )}

      {tab === 'resultados' && sharedTabEnabled('resultados') && (
        <ResultsTab program={program} can={can} modalOpen={resultModal} setModalOpen={setResultModal} success={success} error={error} />
      )}

      {tab === 'ranking' && sharedTabEnabled('ranking') && (
        <RankingTab
          program={program}
          ranking={ranking}
          loading={rankingLoading}
          can={can}
          year={activeYear}
          period={period}
          success={success}
          error={error}
        />
      )}

      {tab === 'graficos' && sharedTabEnabled('graficos') && (
        <>
          {rankingLoading || !ranking ? (
            <LoadingBlock />
          ) : (
            <div className="chart-grid">
              <EvolutionChart
                title={`Evolução — ${program.catalog?.name || program.name} · ${program.year}`}
                subtitle="Pontuação média das escolas por período, sem combinar outros programas"
                data={evolution || []}
              />
              <ClassificationDonut
                title={`Classificação — ${program.catalog?.name || program.name} · ${program.year}`}
                subtitle={`${ranking.period || '—'}/${ranking.year}`}
                distribution={ranking.rows.reduce((acc, r) => ({ ...acc, [r.classification]: (acc[r.classification] || 0) + 1 }), {})}
              />
            </div>
          )}
        </>
      )}

      {tab === 'historico' && <HistoryTab history={history} loading={historyLoading} />}

      {tab === 'relatorios' && sharedTabEnabled('relatorios') && (
        <ReportsTab program={program} year={activeYear} period={period || ranking?.period} toast={toast} error={error} />
      )}

      <Modal
        open={cycleModal}
        onClose={() => setCycleModal(false)}
        title="Adicionar ano/ciclo"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCycleModal(false)} disabled={managementBusy}>Cancelar</Button>
            <Button onClick={createCycle} disabled={managementBusy || !cycleForm.year}>
              {managementBusy ? 'Criando...' : 'Criar ciclo'}
            </Button>
          </>
        }
      >
        <div className="alert alert-info" style={{ marginTop: 0 }}>
          O novo ciclo será criado vazio. Escolas, indicadores, turmas, avaliações e resultados não serão copiados de {program.year}.
        </div>
        <Field label="Ano" required>
          <Input
            type="number"
            min="2000"
            max="2100"
            value={cycleForm.year}
            onChange={(event) => setCycleForm((current) => ({ ...current, year: event.target.value }))}
          />
        </Field>
        <Field label="Período/identificação">
          <Input
            value={cycleForm.periodLabel}
            maxLength={60}
            placeholder="Ex.: Anual"
            onChange={(event) => setCycleForm((current) => ({ ...current, periodLabel: event.target.value }))}
          />
        </Field>
        <Field label="Status inicial">
          <Select
            value={cycleForm.status}
            onChange={(event) => setCycleForm((current) => ({ ...current, status: event.target.value }))}
          >
            {Object.entries(PROGRAM_STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
          </Select>
        </Field>
      </Modal>

      <Modal
        open={deleteModal}
        onClose={() => !managementBusy && setDeleteModal(false)}
        title="Excluir programa?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteModal(false)} disabled={managementBusy}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={deleteProgram}
              disabled={managementBusy || !deleteImpact?.canDelete}
            >
              {managementBusy ? 'Excluindo...' : 'Excluir'}
            </Button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>
          Essa ação arquivará o programa e todos os seus ciclos. Deseja continuar?
        </p>
        {!deleteImpact ? (
          <LoadingBlock label="Verificando vínculos e dados relacionados..." />
        ) : (
          <>
            <div className="program-delete-impact">
              <div><strong>{deleteImpact.cycles.length}</strong><span>Ciclos: {deleteImpact.cycles.map((cycle) => cycle.year).join(', ')}</span></div>
              {Object.entries(DELETION_IMPACT_LABELS).map(([key, label]) => (
                <div key={key}><strong>{deleteImpact.counts[key] || 0}</strong><span>{label}</span></div>
              ))}
            </div>
            {deleteImpact.canDelete ? (
              <div className="alert alert-warn" style={{ marginBottom: 0 }}>
                Nenhum dado relacionado foi encontrado. A exclusão será lógica e poderá ser auditada.
              </div>
            ) : (
              <div className="alert alert-error" style={{ marginBottom: 0 }}>
                Exclusão bloqueada: existem {deleteImpact.relatedRecords} registros relacionados. Nenhum dado será removido silenciosamente.
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}

/* ---------------- Abas ---------------- */

function InfoTab({ program, implementation }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
      <div className="card card-pad">
        <div className="card-title">Objetivo e descrição</div>
        <p style={{ color: 'var(--text-2)', fontSize: 13.5 }}>{program.objective || 'Sem objetivo cadastrado.'}</p>
        <p style={{ color: 'var(--text-2)', fontSize: 13.5 }}>{program.description || 'Sem descrição cadastrada.'}</p>
        <div className={`alert ${implementation && !implementation.unavailableCycle ? 'alert-success' : 'alert-warn'}`} style={{ marginTop: 18, marginBottom: 0 }}>
          {implementation?.unavailableCycle
            ? `O ciclo ${program.year} existe no catálogo, mas ainda não possui instrumento oficial implementado. Coleta, resultados genéricos e ranking permanecem desabilitados para evitar regras inventadas.`
            : implementation
              ? 'O ambiente específico deste programa está registrado conforme sua documentação oficial.'
              : 'Instrumento específico ainda não registrado. As abas disponíveis exibem somente a infraestrutura e os dados compartilhados já existentes no CPE.'}
        </div>
      </div>
      <div className="card card-pad">
        <div className="card-title">Dados do programa</div>
        <dl className="kv-list">
          <dt>Programa no catálogo</dt><dd>{program.catalog?.name || program.name}</dd>
          <dt>Código do catálogo</dt><dd><span className="mono">{program.catalog?.code || '—'}</span></dd>
          <dt>Código do ciclo</dt><dd><span className="mono">{program.code}</span></dd>
          <dt>Ano/ciclo</dt><dd>{program.year}</dd>
          <dt>Período</dt><dd>{program.periodLabel || '—'}</dd>
          <dt>Órgão</dt><dd>{program.organ || '—'}</dd>
          <dt>Referência geral (não usada na pontuação)</dt><dd>{program.globalGoal != null ? `${fmt(program.globalGoal)}%` : '—'}</dd>
          <dt>Escolas</dt><dd>{program.schools.length}</dd>
          <dt>Critérios de avaliação</dt><dd>{program.indicators.length}</dd>
          <dt>Resultados</dt><dd>{program.resultsCount}</dd>
          <dt>Avaliações consolidadas</dt><dd>{program.evaluationsCount}</dd>
          <dt>Metas cadastradas</dt><dd>{program.goalsCount}</dd>
          <dt>Criado em</dt><dd>{fmtDateTime(program.createdAt)}</dd>
        </dl>
      </div>
    </div>
  );
}

function RemoveSchoolModal({ program, school, open, onClose, onSuccess, notifyError }) {
  const [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);

  useEffect(() => {
    if (!open || !school) {
      setImpact(null);
      setConfirmPurge(false);
      return;
    }
    let isMounted = true;
    setLoadingImpact(true);
    programsApi.schoolDeletionImpact(program.id, school.id)
      .then((data) => {
        if (isMounted) setImpact(data);
      })
      .catch((err) => {
        if (isMounted) notifyError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoadingImpact(false);
      });
    return () => { isMounted = false; };
  }, [open, school, program.id]);

  if (!open || !school) return null;

  const handleDeactivate = async () => {
    setBusy(true);
    try {
      await programsApi.updateSchoolLink(program.id, school.id, false);
      onSuccess(`Participação da escola "${school.name}" desativada. Os dados históricos foram preservados.`);
      onClose();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (purge = false) => {
    setBusy(true);
    try {
      await programsApi.removeSchool(program.id, school.id, { purgeData: purge });
      onSuccess(
        purge
          ? `Escola "${school.name}" e todos os seus dados vinculados foram excluídos do programa com sucesso.`
          : `Escola "${school.name}" desvinculada do programa.`,
      );
      onClose();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={`Remover escola — ${school.name}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
          {impact?.hasData ? (
            <>
              <Button
                variant="secondary"
                onClick={handleDeactivate}
                disabled={busy}
                title="Mantém todos os resultados e histórico salvos, apenas inativando novos lançamentos"
              >
                {busy ? 'Processando...' : 'Apenas desativar participação'}
              </Button>
              <Button
                variant="danger"
                onClick={() => handleRemove(true)}
                disabled={busy || !confirmPurge}
              >
                {busy ? 'Excluindo...' : '🗑 Excluir escola e todos os dados'}
              </Button>
            </>
          ) : (
            <Button
              variant="danger"
              onClick={() => handleRemove(false)}
              disabled={busy || loadingImpact}
            >
              {busy ? 'Removendo...' : 'Remover escola'}
            </Button>
          )}
        </>
      }
    >
      {loadingImpact ? (
        <LoadingBlock label="Verificando registros vinculados a esta escola..." />
      ) : impact?.hasData ? (
        <>
          <div className="alert alert-warn" style={{ marginTop: 0 }}>
            <strong>Atenção:</strong> A escola <strong>{school.name}</strong> já possui <strong>{impact.totalRelated} registros cadastrados</strong> neste ciclo do programa ({program.year}).
          </div>

          <div className="program-delete-impact" style={{ marginTop: 12, marginBottom: 16 }}>
            {impact.counts.results > 0 && (
              <div><strong>{impact.counts.results}</strong><span>Resultados lançados</span></div>
            )}
            {impact.counts.pactoClasses > 0 && (
              <div><strong>{impact.counts.pactoClasses}</strong><span>Turmas do Pacto</span></div>
            )}
            {impact.counts.pactoAssessments > 0 && (
              <div><strong>{impact.counts.pactoAssessments}</strong><span>Avaliações do Pacto</span></div>
            )}
            {impact.counts.cncaResults > 0 && (
              <div><strong>{impact.counts.cncaResults}</strong><span>Resultados do CNCA</span></div>
            )}
            {impact.counts.goals > 0 && (
              <div><strong>{impact.counts.goals}</strong><span>Metas vinculadas</span></div>
            )}
            {impact.counts.evaluations > 0 && (
              <div><strong>{impact.counts.evaluations}</strong><span>Avaliações consolidadas</span></div>
            )}
            {impact.counts.collectionLinks > 0 && (
              <div><strong>{impact.counts.collectionLinks}</strong><span>Links de coleta</span></div>
            )}
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
            O que você deseja fazer com esta escola?
          </p>
          <ul style={{ fontSize: 12.5, color: 'var(--text-2)', paddingLeft: 20, margin: '8px 0 14px' }}>
            <li><strong>Apenas desativar:</strong> bloqueia novos preenchimentos e coletas, mas <em>preserva integralmente</em> o histórico e os resultados salvos.</li>
            <li><strong>Excluir tudo:</strong> apaga permanentemente a escola e <em>todos os seus resultados, turmas e avaliações</em> deste ciclo.</li>
          </ul>

          <label className="checkbox-row" style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 17, height: 17, accentColor: '#dc2626' }}
              checked={confirmPurge}
              onChange={(e) => setConfirmPurge(e.target.checked)}
            />
            <span style={{ color: '#991b1b', fontWeight: 600, fontSize: 12.5 }}>
              Confirmar exclusão permanente: desejo apagar a escola e TODOS os dados cadastrados listados acima.
            </span>
          </label>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 13.5 }}>
          Deseja remover <strong>"{school.name}"</strong> deste programa? Nenhum dado ou avaliação foi lançado para esta escola neste ciclo, portanto a remoção é segura.
        </p>
      )}
    </Modal>
  );
}

function SchoolsTab({ program, can, refresh, modalOpen, setModalOpen, success, error, genericEvaluationEnabled }) {
  const { data: allSchools, loading: loadingSchools } = useApi(() => (modalOpen ? schoolsApi.list({ pageSize: 1000 }) : Promise.resolve(null)), [modalOpen]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('available'); // 'available' | 'all' | 'linked'
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);

  const linkedIds = useMemo(() => new Set((program?.schools || []).map((s) => s.id)), [program?.schools]);

  const normalizedSearch = useMemo(
    () => search.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    [search],
  );

  const filteredSchools = useMemo(() => {
    const list = allSchools?.data || [];
    return list.filter((s) => {
      const isLinked = linkedIds.has(s.id);
      if (filterStatus === 'available' && isLinked) return false;
      if (filterStatus === 'linked' && !isLinked) return false;
      if (!normalizedSearch) return true;
      const nameNorm = String(s.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const inep = String(s.inep || '');
      const districtNorm = String(s.district || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const addressNorm = String(s.address || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return (
        nameNorm.includes(normalizedSearch)
        || inep.includes(normalizedSearch)
        || districtNorm.includes(normalizedSearch)
        || addressNorm.includes(normalizedSearch)
      );
    });
  }, [allSchools, linkedIds, filterStatus, normalizedSearch]);

  const availableFiltered = useMemo(
    () => filteredSchools.filter((s) => !linkedIds.has(s.id)),
    [filteredSchools, linkedIds],
  );

  const selectAllFiltered = () => {
    const idsToAdd = availableFiltered.map((s) => s.id);
    setSelected((current) => Array.from(new Set([...current, ...idsToAdd])));
  };

  const deselectAll = () => {
    setSelected([]);
  };

  const addSchools = async () => {
    if (!selected.length) return;
    setBusy(true);
    try {
      const res = await programsApi.addSchools(program.id, selected);
      success(`${res.added} escola(s) vinculada(s) ao programa com sucesso.`);
      setModalOpen(false);
      setSelected([]);
      setSearch('');
      refresh();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {can('programs:write') && (
        <div style={{ marginBottom: 12, textAlign: 'right' }}>
          <Button onClick={() => setModalOpen(true)}>+ Vincular escolas</Button>
        </div>
      )}
      <DataTable
        columns={[
          { key: 'inep', label: 'INEP', render: (s) => <span className="mono">{s.inep}</span> },
          { key: 'name', label: 'Escola', render: (s) => <strong>{s.name}</strong> },
          { key: 'zone', label: 'Zona', render: (s) => SCHOOL_ZONE[s.zone]?.label || '—' },
          { key: 'linkActive', label: 'Participação', render: (s) => s.linkActive ? <Badge cls="badge-green">Ativa</Badge> : <Badge cls="badge-yellow">Inativa</Badge> },
          { key: 'joinedAt', label: 'Desde', render: (s) => fmtDateTime(s.joinedAt) },
          {
            key: 'actions', label: '', align: 'right',
            render: (s) => (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                {genericEvaluationEnabled && can('rankings:read') && can('results:read') && (
                  <Link to={`/programas/${program.id}/escolas/${s.id}`} className="btn btn-secondary btn-sm">
                    Ver avaliação
                  </Link>
                )}
                {can('programs:write') && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(s)} title="Desvincular escola">🗑</Button>
                )}
              </div>
            ),
          },
        ]}
        rows={program?.schools || []}
        emptyTitle="Nenhuma escola vinculada"
        emptyHint={genericEvaluationEnabled ? 'Vincule escolas para habilitar o lançamento de resultados.' : 'Vincule escolas para habilitar a coleta específica do programa.'}
        emptyIcon="🏫"
      />

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSearch(''); }}
        title="Vincular escolas ao programa"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setModalOpen(false); setSearch(''); }} disabled={busy}>Cancelar</Button>
            <Button onClick={addSchools} disabled={busy || !selected.length}>
              {busy ? 'Vinculando...' : `Vincular ${selected.length} escola(s)`}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Input
                placeholder="🔎 Pesquisar escola por nome (ex.: Santa Anastacia), INEP ou endereço..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-3)',
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                  title="Limpar pesquisa"
                >
                  ✕
                </button>
              )}
            </div>
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 220 }}>
              <option value="available">Não vinculadas (disponíveis)</option>
              <option value="all">Todas as escolas</option>
              <option value="linked">Já vinculadas</option>
            </Select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, color: 'var(--text-2)', padding: '4px 2px' }}>
            <span>
              Exibindo <strong>{filteredSchools.length}</strong> de <strong>{allSchools?.data?.length || 0}</strong> escolas
              {selected.length > 0 && <span style={{ color: 'var(--primary)', fontWeight: 600 }}> · {selected.length} selecionada(s)</span>}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {availableFiltered.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={selectAllFiltered}
                  style={{ fontSize: 11.5 }}
                >
                  Selecionar {availableFiltered.length > 1 ? `todas as ${availableFiltered.length}` : 'esta'}
                </button>
              )}
              {selected.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={deselectAll}
                  style={{ fontSize: 11.5 }}
                >
                  Desmarcar todas
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 9, background: '#fff' }}>
          {loadingSchools ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>Carregando escolas cadastradas...</div>
          ) : filteredSchools.map((s) => {
            const isLinked = linkedIds.has(s.id);
            const isChecked = isLinked || selected.includes(s.id);

            return (
              <label
                key={s.id}
                className="dropdown-item"
                style={{
                  cursor: isLinked ? 'default' : 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: isLinked ? '#f8fafc' : selected.includes(s.id) ? '#eff6ff' : '#fff',
                  opacity: isLinked ? 0.75 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                }}
              >
                <input
                  type="checkbox"
                  style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: isLinked ? 'not-allowed' : 'pointer' }}
                  checked={isChecked}
                  disabled={isLinked}
                  onChange={(e) => {
                    if (isLinked) return;
                    setSelected((sel) => (e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id)));
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 13.5 }}>{s.name}</strong>
                    {isLinked ? (
                      <Badge cls="badge-green" style={{ fontSize: 10.5 }}>🟢 Já vinculada</Badge>
                    ) : (
                      <Badge cls="badge-gray" style={{ fontSize: 10.5 }}>⚪ Disponível</Badge>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    INEP <span className="mono">{s.inep}</span>
                    {s.zone ? ` · ${SCHOOL_ZONE[s.zone]?.label || s.zone}` : ''}
                    {s.district ? ` · ${s.district}` : ''}
                    {s.address ? ` · ${s.address}` : ''}
                  </div>
                </div>
              </label>
            );
          })}
          {!loadingSchools && !filteredSchools.length && (
            <div className="table-empty" style={{ padding: 28, textAlign: 'center' }}>
              {search ? (
                <>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>🔍</div>
                  Nenhuma escola encontrada para a pesquisa <strong>"{search}"</strong>.
                </>
              ) : filterStatus === 'available' ? (
                <>Todas as escolas cadastradas já estão vinculadas ao programa.</>
              ) : (
                <>Nenhuma escola encontrada.</>
              )}
            </div>
          )}
        </div>
      </Modal>

      <RemoveSchoolModal
        program={program}
        school={confirmRemove}
        open={Boolean(confirmRemove)}
        onClose={() => setConfirmRemove(null)}
        onSuccess={(msg) => {
          success(msg);
          refresh();
        }}
        notifyError={error}
      />
    </>
  );
}

function IndicatorsTab({ program }) {
  return (
    <>
      <div className="alert alert-info">
        Os critérios e instrumentos desta área são definidos durante a implementação oficial do programa. Não há construtor ou configuração manual disponível para o usuário final.
      </div>
      <DataTable
        columns={[
          { key: 'code', label: 'Código', render: (item) => <span className="mono">{item.code}</span> },
          { key: 'name', label: 'Critério/indicador', render: (item) => <strong>{item.name}</strong> },
          { key: 'categoryName', label: 'Categoria' },
          {
            key: 'polarity',
            label: 'Referência',
            render: (item) => (
              item.polarity === 'MENOR_MELHOR'
                ? <Badge cls="badge-yellow">Menor é melhor</Badge>
                : <Badge cls="badge-blue">Maior é melhor</Badge>
            ),
          },
          { key: 'unit', label: 'Unidade' },
          { key: 'weight', label: 'Peso implementado', align: 'center', render: (item) => fmt(item.weight, 2) },
          { key: 'goal', label: 'Meta implementada', align: 'right', render: (item) => fmt(item.goal, 2) },
        ]}
        rows={program.indicators}
        emptyTitle="Instrumento ainda não implementado"
        emptyHint="Os critérios serão incorporados após a análise da documentação oficial deste programa."
        emptyIcon="📋"
      />
    </>
  );
}

function EvaluationsTab({ program, evaluations, loading }) {
  return (
    <DataTable
      columns={[
        { key: 'school', label: 'Escola', render: (row) => <strong>{row.school.name}</strong> },
        { key: 'year', label: 'Ano' },
        { key: 'period', label: 'Período' },
        { key: 'score', label: 'Pontuação', align: 'right', render: (row) => `${fmt(row.score)}%` },
        {
          key: 'classification', label: 'Classificação',
          render: (row) => {
            const info = CLASSIFICATION_INFO[row.classification];
            return <Badge cls={info?.cls}>{row.classification} · {info?.label}</Badge>;
          },
        },
        { key: 'position', label: 'Posição', align: 'center' },
        { key: 'consolidatedAt', label: 'Consolidada em', render: (row) => fmtDateTime(row.consolidatedAt) },
        {
          key: 'open', label: '', align: 'right',
          render: (row) => (
            <Link
              to={`/programas/${program.id}/escolas/${row.school.id}?year=${row.year}&period=${encodeURIComponent(row.period)}`}
              className="btn btn-secondary btn-sm"
            >
              Abrir avaliação
            </Link>
          ),
        },
      ]}
      rows={evaluations?.data || []}
      loading={loading}
      emptyTitle="Nenhuma avaliação consolidada neste programa"
      emptyHint="A consolidação ficará disponível quando o instrumento oficial e os dados do período estiverem implementados."
      emptyIcon="📝"
    />
  );
}

function HistoryTab({ history, loading }) {
  if (loading) return <LoadingBlock label="Carregando histórico..." />;
  return (
    <div className="card card-pad">
      <div className="card-title">Histórico do programa</div>
      <div className="card-subtitle">Cadastro, vínculos, critérios e consolidações registrados pela auditoria.</div>
      <ul className="timeline">
        {(history?.data || []).map((entry) => (
          <li key={entry.id}>
            <div className="when" style={{ minWidth: 145 }}>{fmtDateTime(entry.createdAt)}</div>
            <div>
              <strong>{entry.action}</strong>
              <span style={{ color: 'var(--text-2)' }}>
                {entry.userName ? ` · ${entry.userName}` : ''}
                {entry.metadata?.operation ? ` · ${entry.metadata.operation}` : ''}
              </span>
            </div>
          </li>
        ))}
        {!history?.data?.length && <li style={{ color: 'var(--text-3)' }}>Sem registros para este programa.</li>}
      </ul>
    </div>
  );
}

function ReportsTab({ program, year, period, toast, error }) {
  const [busy, setBusy] = useState('');
  const generate = async (type) => {
    setBusy(type);
    try {
      const filename = await reportsApi.generate(type, {
        programId: program.id,
        year,
        ...(period && { period }),
        format: 'pdf',
      });
      toast(`Relatório gerado: ${filename}`, { type: 'success', title: 'Download iniciado' });
    } catch (err) {
      error(err.message);
    } finally {
      setBusy('');
    }
  };

  const reports = [
    ['programa', '📋', 'Relatório do programa', 'Ranking e desempenho das escolas neste programa.'],
    ['resultados', '🧾', 'Resultados', 'Lançamentos pertencentes somente a este programa.'],
    ['metas', '🎯', 'Metas x resultados', 'Atingimento dos critérios configurados no programa.'],
    ['ranking', '🏆', 'Ranking', 'Classificação das escolas apenas neste programa.'],
    ['evolucao', '📉', 'Evolução', 'Evolução temporal do programa selecionado.'],
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
      {reports.map(([type, icon, title, description]) => (
        <div key={type} className="card card-pad">
          <div style={{ fontSize: 24 }}>{icon}</div>
          <div className="card-title" style={{ marginTop: 6 }}>{title}</div>
          <div className="card-subtitle" style={{ minHeight: 36 }}>{description}</div>
          <Button size="sm" onClick={() => generate(type)} disabled={Boolean(busy)}>
            {busy === type ? 'Gerando...' : 'Baixar PDF'}
          </Button>
        </div>
      ))}
    </div>
  );
}

function ResultsTab({ program, can }) {
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const { data, loading } = useApi(
    () => resultsApi.list({ programId: program.id, page, pageSize: 15 }),
    [program.id, page],
  );

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
          Lançamentos deste programa — <Link to="/resultados">gerenciar em Resultados</Link>
        </span>
        {can('results:write') && (
          <Link to={`/resultados?programId=${program.id}`} className="btn btn-primary btn-sm">+ Lançar resultado</Link>
        )}
      </div>
      <DataTable
        columns={[
          { key: 'year', label: 'Ano' },
          { key: 'period', label: 'Período' },
          { key: 'school', label: 'Escola', render: (r) => r.school.name },
          { key: 'indicator', label: 'Indicador', render: (r) => r.indicator.name },
          { key: 'value', label: 'Resultado', align: 'right', render: (r) => <strong>{fmt(r.value, 2)}</strong> },
          { key: 'unit', label: 'Unid.', render: (r) => r.indicator.unit || '—' },
          { key: 'source', label: 'Origem', render: (r) => <Badge cls={r.source === 'IMPORTACAO' ? 'badge-cyan' : 'badge-gray'}>{r.source === 'IMPORTACAO' ? 'Importação' : 'Manual'}</Badge> },
          { key: 'updatedAt', label: 'Atualizado', render: (r) => fmtDateTime(r.updatedAt) },
        ]}
        rows={data?.data || []}
        loading={loading}
        pagination={data?.pagination}
        onPageChange={setPage}
        emptyTitle="Nenhum resultado lançado"
        emptyHint="Use a aba Resultados ou a importação em lote."
        emptyIcon="📈"
      />
    </>
  );
}

function GoalsTab({ program, can, modalOpen, setModalOpen, success, error }) {
  const [page, setPage] = useState(1);
  const { data, loading, refresh } = useApi(
    () => goalsApi.list({ programId: program.id, page, pageSize: 15 }),
    [program.id, page],
  );

  return (
    <>
      <div style={{ marginBottom: 12, textAlign: 'right' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-2)', marginRight: 10 }}>
          Metas aplicadas a este programa — <Link to="/metas">gerenciar em Metas</Link>
        </span>
      </div>
      <DataTable
        columns={[
          { key: 'year', label: 'Ano' },
          { key: 'period', label: 'Período', render: (g) => g.period || 'Todo o ano' },
          { key: 'scope', label: 'Escopo', render: (g) => <Badge cls="badge-gray">{g.scope}</Badge> },
          { key: 'school', label: 'Escola', render: (g) => g.school?.name || '—' },
          { key: 'indicator', label: 'Indicador', render: (g) => g.indicator?.name || '—' },
          { key: 'value', label: 'Meta', align: 'right', render: (g) => <strong>{fmt(g.value, 2)}</strong> },
          { key: 'description', label: 'Descrição' },
        ]}
        rows={data?.data || []}
        loading={loading}
        pagination={data?.pagination}
        onPageChange={setPage}
        emptyTitle="Nenhuma meta para este programa"
        emptyIcon="🎯"
      />
    </>
  );
}

function RankingTab({ program, ranking, loading, can, year, period, success, error }) {
  const [busy, setBusy] = useState(false);
  const consolidate = async () => {
    const currentPeriod = ranking?.period;
    if (!currentPeriod) return;
    setBusy(true);
    try {
      const res = await rankingsApi.consolidate({ programId: program.id, year, period: currentPeriod });
      success(`Avaliação consolidada: ${res.consolidated} escolas em ${res.period}/${res.year}.`);
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingBlock />;
  if (!ranking) return null;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, gap: 10 }}>
        {can('evaluations:write') && (
          <Button variant="success" onClick={consolidate} disabled={busy || !ranking.rows.length}>
            📸 Consolidar avaliação do período
          </Button>
        )}
      </div>
      <DataTable
        columns={[
          { key: 'position', label: '#', width: 60, align: 'center', render: (r) => <strong>{r.position}</strong> },
          { key: 'schoolName', label: 'Escola', render: (r) => <strong>{r.schoolName}</strong> },
          { key: 'schoolInep', label: 'INEP', render: (r) => <span className="mono">{r.schoolInep}</span> },
          { key: 'score', label: 'Pontuação', align: 'right', render: (r) => <strong style={{ fontSize: 14 }}>{fmt(r.score)}%</strong> },
          {
            key: 'classification', label: 'Classificação',
            render: (r) => {
              const info = CLASSIFICATION_INFO[r.classification];
              return <Badge cls={info?.cls}>{r.classification} · {info?.label}</Badge>;
            },
          },
          { key: 'previousScore', label: 'Período anterior', align: 'right', render: (r) => fmt(r.previousScore) },
          {
            key: 'scoreDiff', label: 'Evolução', align: 'right',
            render: (r) =>
              r.scoreDiff === null || r.scoreDiff === undefined ? (
                '—'
              ) : (
                <span className={r.scoreDiff >= 0 ? 'pos-up' : 'pos-down'}>
                  {r.scoreDiff >= 0 ? '▲' : '▼'} {fmt(Math.abs(r.scoreDiff))}
                </span>
              ),
          },
          {
            key: 'positionDiff', label: 'Pos.', align: 'center',
            render: (r) =>
              r.positionDiff === null || r.positionDiff === undefined ? (
                '—'
              ) : (
                <span className={r.positionDiff >= 0 ? 'pos-up' : 'pos-down'}>
                  {r.positionDiff >= 0 ? '↑' : '↓'} {Math.abs(r.positionDiff)}
                </span>
              ),
          },
          {
            key: 'open', label: '', align: 'right',
            render: (r) => (
              <Link
                to={`/programas/${program.id}/escolas/${r.schoolId}?year=${year}&period=${encodeURIComponent(ranking.period || period || '')}`}
                className="btn btn-ghost btn-sm"
              >
                Ver avaliação
              </Link>
            ),
          },
        ]}
        rows={ranking.rows}
        emptyTitle="Sem resultados/metas para o período"
        emptyHint="Lance resultados e cadastre metas para gerar o ranking."
        emptyIcon="🏆"
      />
    </>
  );
}
