import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { programsApi, indicatorsApi, schoolsApi, rankingsApi, analyticsApi, resultsApi, goalsApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Button, Field, Input, Modal, Badge, LoadingBlock, Tabs, Select, ConfirmDialog } from '../components/ui.jsx';
import { EvolutionChart, ClassificationDonut } from '../components/charts.jsx';
import { PROGRAM_STATUS, CLASSIFICATION_INFO, fmt, fmtDateTime, PERIODS, yearsRange } from '../utils/format.js';

export default function ProgramDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const { toast, success, error } = useToast();
  const [tab, setTab] = useState('informacoes');

  const { data: program, loading, refresh } = useApi(() => programsApi.get(id), [id]);

  // seleção de período para ranking/análises
  const [year, setYear] = useState('');
  const [period, setPeriod] = useState('');
  const activeYear = year || program?.year || new Date().getFullYear();

  const { data: ranking, loading: rankingLoading } = useApi(
    () => (tab === 'ranking' || tab === 'analises' ? rankingsApi.get({ programId: id, year: activeYear, period: period || undefined }) : Promise.resolve(null)),
    [id, activeYear, period, tab],
  );
  const { data: evolution } = useApi(
    () => (tab === 'analises' ? analyticsApi.evolution({ programId: id, year: activeYear }) : Promise.resolve(null)),
    [id, activeYear, tab],
  );

  // modais
  const [schoolsModal, setSchoolsModal] = useState(false);
  const [indModal, setIndModal] = useState(false);
  const [resultModal, setResultModal] = useState(false);
  const [goalModal, setGoalModal] = useState(false);

  if (loading) return <LoadingBlock />;
  if (!program) return <div className="centered">Programa não encontrado</div>;

  const statusInfo = PROGRAM_STATUS[program.status];
  const availablePeriods = [...new Set((ranking?.rows || []).length >= 0 && (ranking?.periods || []).filter((p) => p.year === activeYear).map((p) => p.period))];

  return (
    <>
      <PageHeader
        title={program.name}
        subtitle={`${program.code} · ${program.year} · ${program.organ || '—'} · ${program.indicators.length} indicadores · ${program.schools.length} escolas`}
        actions={
          <>
            <Badge cls={statusInfo?.cls} >{statusInfo?.label}</Badge>
            <Link to="/programas" className="btn btn-secondary btn-sm">← Voltar</Link>
          </>
        }
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'informacoes', label: 'Informações' },
          { key: 'escolas', label: 'Escolas participantes', count: program.schools.length },
          { key: 'indicadores', label: 'Indicadores', count: program.indicators.length },
          { key: 'resultados', label: 'Resultados' },
          { key: 'metas', label: 'Metas' },
          { key: 'ranking', label: 'Ranking' },
          { key: 'analises', label: 'Análises' },
        ]}
      />

      {(tab === 'ranking' || tab === 'analises') && (
        <div className="filter-bar">
          <Field label="Ano">
            <Select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value={program.year}>{program.year} (do programa)</option>
              {yearsRange(2023).filter((y) => y !== program.year).map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>
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

      {tab === 'informacoes' && <InfoTab program={program} />}

      {tab === 'escolas' && (
        <SchoolsTab
          program={program}
          can={can}
          refresh={refresh}
          modalOpen={schoolsModal}
          setModalOpen={setSchoolsModal}
          success={success}
          error={error}
        />
      )}

      {tab === 'indicadores' && (
        <IndicatorsTab
          program={program}
          can={can}
          refresh={refresh}
          modalOpen={indModal}
          setModalOpen={setIndModal}
          success={success}
          error={error}
        />
      )}

      {tab === 'resultados' && (
        <ResultsTab program={program} can={can} modalOpen={resultModal} setModalOpen={setResultModal} success={success} error={error} />
      )}

      {tab === 'metas' && (
        <GoalsTab program={program} can={can} modalOpen={goalModal} setModalOpen={setGoalModal} success={success} error={error} />
      )}

      {tab === 'ranking' && (
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

      {tab === 'analises' && (
        <>
          {rankingLoading || !ranking ? (
            <LoadingBlock />
          ) : (
            <div className="chart-grid">
              <EvolutionChart
                title="Evolução do programa"
                subtitle="Pontuação média das escolas por período"
                data={evolution || []}
              />
              <ClassificationDonut
                title="Classificação das escolas"
                subtitle={`${ranking.period || '—'}/${ranking.year}`}
                distribution={ranking.rows.reduce((acc, r) => ({ ...acc, [r.classification]: (acc[r.classification] || 0) + 1 }), {})}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ---------------- Abas ---------------- */

function InfoTab({ program }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
      <div className="card card-pad">
        <div className="card-title">Objetivo e descrição</div>
        <p style={{ color: 'var(--text-2)', fontSize: 13.5 }}>{program.objective || 'Sem objetivo cadastrado.'}</p>
        <p style={{ color: 'var(--text-2)', fontSize: 13.5 }}>{program.description || 'Sem descrição cadastrada.'}</p>
      </div>
      <div className="card card-pad">
        <div className="card-title">Dados do programa</div>
        <dl className="kv-list">
          <dt>Código</dt><dd><span className="mono">{program.code}</span></dd>
          <dt>Ano</dt><dd>{program.year}</dd>
          <dt>Período</dt><dd>{program.periodLabel || '—'}</dd>
          <dt>Órgão</dt><dd>{program.organ || '—'}</dd>
          <dt>Meta global</dt><dd>{program.globalGoal != null ? `${fmt(program.globalGoal)}%` : '—'}</dd>
          <dt>Escolas</dt><dd>{program.schools.length}</dd>
          <dt>Indicadores</dt><dd>{program.indicators.length}</dd>
          <dt>Resultados</dt><dd>{program.resultsCount}</dd>
          <dt>Metas cadastradas</dt><dd>{program.goalsCount}</dd>
          <dt>Criado em</dt><dd>{fmtDateTime(program.createdAt)}</dd>
        </dl>
      </div>
    </div>
  );
}

function SchoolsTab({ program, can, refresh, modalOpen, setModalOpen, success, error }) {
  const { data: allSchools } = useApi(() => schoolsApi.list({ pageSize: 200 }), []);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);

  const linkedIds = new Set(program.schools.map((s) => s.id));
  const available = (allSchools?.data || []).filter((s) => !linkedIds.has(s.id));

  const addSchools = async () => {
    if (!selected.length) return;
    setBusy(true);
    try {
      const res = await programsApi.addSchools(program.id, selected);
      success(`${res.added} escola(s) vinculada(s) ao programa.`);
      setModalOpen(false);
      setSelected([]);
      refresh();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeSchool = async () => {
    setBusy(true);
    try {
      await programsApi.removeSchool(program.id, confirmRemove.id);
      success('Escola removida do programa.');
      setConfirmRemove(null);
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
          { key: 'municipality', label: 'Município' },
          { key: 'zone', label: 'Zona', render: (s) => (s.zone === 'RURAL' ? 'Rural' : 'Urbana') },
          { key: 'linkActive', label: 'Participação', render: (s) => s.linkActive ? <Badge cls="badge-green">Ativa</Badge> : <Badge cls="badge-yellow">Inativa</Badge> },
          { key: 'joinedAt', label: 'Desde', render: (s) => fmtDateTime(s.joinedAt) },
          {
            key: 'actions', label: '', align: 'right',
            render: (s) => (
              <div onClick={(e) => e.stopPropagation()}>
                {can('programs:write') && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(s)} title="Desvincilar">🗑</Button>
                )}
              </div>
            ),
          },
        ]}
        rows={program.schools}
        emptyTitle="Nenhuma escola vinculada"
        emptyHint="Vincule escolas para habilitar o lançamento de resultados."
        emptyIcon="🏫"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Vincular escolas ao programa"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={addSchools} disabled={busy || !selected.length}>{busy ? 'Vinculando...' : `Vincular ${selected.length} escola(s)`}</Button>
          </>
        }
      >
        <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 9 }}>
          {available.map((s) => (
            <label key={s.id} className="dropdown-item" style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
              <input
                type="checkbox"
                style={{ width: 17, height: 17, accentColor: 'var(--primary)', marginTop: 2 }}
                checked={selected.includes(s.id)}
                onChange={(e) =>
                  setSelected((sel) => (e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id)))
                }
              />
              <div>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>INEP {s.inep} · {s.municipality}</div>
              </div>
            </label>
          ))}
          {!available.length && <div className="table-empty">Todas as escolas já estão vinculadas.</div>}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmRemove)}
        onClose={() => setConfirmRemove(null)}
        onConfirm={removeSchool}
        title="Desvincular escola"
        message={`Remover "${confirmRemove?.name}" do programa? Os resultados já lançados são preservados.`}
        danger
        confirmLabel="Desvincular"
        busy={busy}
      />
    </>
  );
}

function IndicatorsTab({ program, can, refresh, modalOpen, setModalModal, setModalOpen, success, error }) {
  const { data: allIndicators } = useApi(() => indicatorsApi.list({ pageSize: 200, status: 'ATIVO' }), []);
  const [selected, setSelected] = useState([]);
  const [weight, setWeight] = useState('');
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const linkedIds = new Set(program.indicators.map((i) => i.id));
  const available = (allIndicators?.data || []).filter((i) => !linkedIds.has(i.id));

  const addIndicators = async () => {
    if (!selected.length) return;
    setBusy(true);
    try {
      const items = selected.map((indicatorId) => ({
        indicatorId,
        weight: weight === '' ? null : Number(weight),
        goal: goal === '' ? null : Number(goal),
      }));
      const res = await programsApi.addIndicators(program.id, items);
      success(`${res.added} indicador(es) vinculado(s).`);
      setModalOpen(false);
      setSelected([]);
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
      await programsApi.updateIndicator(program.id, editItem.id, {
        weight: editItem.weight === '' ? null : Number(editItem.weight),
        goal: editItem.goal === '' ? null : Number(editItem.goal),
      });
      success('Indicador atualizado no programa.');
      setEditItem(null);
      refresh();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeIndicator = async (indicator) => {
    try {
      await programsApi.removeIndicator(program.id, indicator.id);
      success('Indicador removido do programa.');
      refresh();
    } catch (err) {
      error(err.message);
    }
  };

  return (
    <>
      {can('programs:write') && (
        <div style={{ marginBottom: 12, textAlign: 'right' }}>
          <Button onClick={() => setModalOpen(true)}>+ Vincular indicadores</Button>
        </div>
      )}
      <DataTable
        columns={[
          { key: 'code', label: 'Código', render: (i) => <span className="mono">{i.code}</span> },
          { key: 'name', label: 'Indicador', render: (i) => <strong>{i.name}</strong> },
          { key: 'categoryName', label: 'Categoria' },
          { key: 'polarity', label: 'Polaridade', render: (i) => (i.polarity === 'MENOR_MELHOR' ? <Badge cls="badge-yellow">Menor é melhor</Badge> : <Badge cls="badge-blue">Maior é melhor</Badge>) },
          { key: 'unit', label: 'Unidade' },
          { key: 'weight', label: 'Peso no programa', align: 'center', render: (i) => <strong>{fmt(i.weight, 2)}</strong> },
          { key: 'goal', label: 'Meta no programa', align: 'right', render: (i) => fmt(i.goal, 2) },
          {
            key: 'actions', label: '', align: 'right',
            render: (i) => (
              <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                {can('programs:write') && <Button size="sm" variant="secondary" onClick={() => setEditItem({ ...i, weight: i.weight ?? '', goal: i.goal ?? '' })}>Ajustar</Button>}
                {can('programs:write') && <Button size="sm" variant="ghost" onClick={() => removeIndicator(i)}>🗑</Button>}
              </div>
            ),
          },
        ]}
        rows={program.indicators}
        emptyTitle="Nenhum indicador vinculado"
        emptyIcon="📊"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Vincular indicadores"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={addIndicators} disabled={busy || !selected.length}>{busy ? 'Vinculando...' : 'Vincular'}</Button>
          </>
        }
      >
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <Field label="Peso padrão (opcional)" hint="Aplicado a todos os selecionados">
            <Input type="number" step="0.1" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="usa peso do indicador" />
          </Field>
          <Field label="Meta padrão (opcional)" hint="Aplicada a todos os selecionados">
            <Input type="number" step="0.1" min="0" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="usa meta do indicador" />
          </Field>
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 9 }}>
          {available.map((i) => (
            <label key={i.id} className="dropdown-item" style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
              <input
                type="checkbox"
                style={{ width: 17, height: 17, accentColor: 'var(--primary)', marginTop: 2 }}
                checked={selected.includes(i.id)}
                onChange={(e) => setSelected((sel) => (e.target.checked ? [...sel, i.id] : sel.filter((x) => x !== i.id)))}
              />
              <div>
                <div style={{ fontWeight: 600 }}>{i.code} — {i.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{i.category?.name} · peso {i.weight} · meta {fmt(i.defaultGoal, 2)}</div>
              </div>
            </label>
          ))}
          {!available.length && <div className="table-empty">Todos os indicadores ativos já estão vinculados.</div>}
        </div>
      </Modal>

      <Modal
        open={Boolean(editItem)}
        onClose={() => setEditItem(null)}
        title={`Ajustar "${editItem?.name}"`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={busy}>Salvar</Button>
          </>
        }
      >
        <Field label="Peso no programa">
          <Input type="number" step="0.1" min="0" value={editItem?.weight ?? ''} onChange={(e) => setEditItem((it) => ({ ...it, weight: e.target.value }))} />
        </Field>
        <Field label="Meta no programa">
          <Input type="number" step="0.1" min="0" value={editItem?.goal ?? ''} onChange={(e) => setEditItem((it) => ({ ...it, goal: e.target.value }))} />
        </Field>
      </Modal>
    </>
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
          { key: 'municipality', label: 'Município' },
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
        ]}
        rows={ranking.rows}
        emptyTitle="Sem resultados/metas para o período"
        emptyHint="Lance resultados e cadastre metas para gerar o ranking."
        emptyIcon="🏆"
      />
    </>
  );
}
