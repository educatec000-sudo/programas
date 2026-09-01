import React, { useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { programsApi, schoolsApi, rankingsApi, analyticsApi, resultsApi, goalsApi, reportsApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Button, Field, Input, Modal, Badge, LoadingBlock, Tabs, Select, ConfirmDialog } from '../components/ui.jsx';
import { EvolutionChart, ClassificationDonut } from '../components/charts.jsx';
import { PROGRAM_STATUS, CLASSIFICATION_INFO, SCHOOL_ZONE, fmt, fmtDateTime, PERIODS, yearsRange } from '../utils/format.js';
import { getProgramImplementation } from '../programs/registry.js';

export default function ProgramDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { can } = useAuth();
  const { toast, success, error } = useToast();
  const [tab, setTab] = useState(searchParams.get('tab') || 'resumo');

  const { data: program, loading, refresh } = useApi(() => programsApi.get(id), [id]);

  // seleção de período para ranking/análises
  const [year, setYear] = useState('');
  const [period, setPeriod] = useState('');
  const activeYear = year || program?.year || new Date().getFullYear();

  const { data: ranking, loading: rankingLoading } = useApi(
    () => ((tab === 'ranking' || tab === 'graficos') && can('rankings:read') ? rankingsApi.get({ programId: id, year: activeYear, period: period || undefined }) : Promise.resolve(null)),
    [id, activeYear, period, tab],
  );
  const { data: evolution } = useApi(
    () => (tab === 'graficos' && can('analytics:read') ? analyticsApi.evolution({ programId: id, year: activeYear }) : Promise.resolve(null)),
    [id, activeYear, tab],
  );
  const { data: evaluations, loading: evaluationsLoading } = useApi(
    () => (tab === 'avaliacoes' && can('rankings:read') ? rankingsApi.evaluations({ programId: id }) : Promise.resolve(null)),
    [id, tab],
  );
  const { data: history, loading: historyLoading } = useApi(
    () => (tab === 'historico' ? programsApi.history(id, { page: 1, pageSize: 100 }) : Promise.resolve(null)),
    [id, tab],
  );

  // modais
  const [schoolsModal, setSchoolsModal] = useState(false);
  const [resultModal, setResultModal] = useState(false);

  if (loading) return <LoadingBlock />;
  if (!program) return <div className="centered">Programa não encontrado</div>;

  const statusInfo = PROGRAM_STATUS[program.status];
  const implementation = getProgramImplementation(program);
  const specificTabs = implementation?.adminTabs || [];
  const activeSpecificTab = specificTabs.find((item) => item.key === tab);
  const availablePeriods = [...new Set((ranking?.rows || []).length >= 0 && (ranking?.periods || []).filter((p) => p.year === activeYear).map((p) => p.period))];

  return (
    <>
      <PageHeader
        title={program.name}
        subtitle={`${program.code} · ${program.year} · ${program.organ || '—'} · ${program.indicators.length} critérios · ${program.schools.length} escolas`}
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
          { key: 'resumo', label: 'Visão geral' },
          ...specificTabs.map((item) => ({ key: item.key, label: item.label })),
          { key: 'escolas', label: 'Escolas participantes', count: program.schools.length },
          can('indicators:read') ? { key: 'criterios', label: 'Critérios de avaliação', count: program.indicators.length } : null,
          can('rankings:read') ? { key: 'avaliacoes', label: 'Avaliações', count: program.evaluationsCount } : null,
          can('results:read') ? { key: 'resultados', label: 'Resultados' } : null,
          can('rankings:read') ? { key: 'ranking', label: 'Ranking' } : null,
          can('analytics:read') ? { key: 'graficos', label: 'Gráficos' } : null,
          { key: 'historico', label: 'Histórico' },
          can('reports:read') ? { key: 'relatorios', label: 'Relatórios' } : null,
        ].filter(Boolean)}
      />

      {(tab === 'ranking' || tab === 'graficos') && (
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

      {tab === 'resumo' && <InfoTab program={program} implementation={implementation} />}

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
        />
      )}

      {tab === 'criterios' && <IndicatorsTab program={program} />}

      {tab === 'avaliacoes' && (
        <EvaluationsTab program={program} evaluations={evaluations} loading={evaluationsLoading} />
      )}

      {tab === 'resultados' && (
        <ResultsTab program={program} can={can} modalOpen={resultModal} setModalOpen={setResultModal} success={success} error={error} />
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

      {tab === 'graficos' && (
        <>
          {rankingLoading || !ranking ? (
            <LoadingBlock />
          ) : (
            <div className="chart-grid">
              <EvolutionChart
                title={`Evolução — ${program.name}`}
                subtitle="Pontuação média das escolas por período, sem combinar outros programas"
                data={evolution || []}
              />
              <ClassificationDonut
                title={`Classificação — ${program.name}`}
                subtitle={`${ranking.period || '—'}/${ranking.year}`}
                distribution={ranking.rows.reduce((acc, r) => ({ ...acc, [r.classification]: (acc[r.classification] || 0) + 1 }), {})}
              />
            </div>
          )}
        </>
      )}

      {tab === 'historico' && <HistoryTab history={history} loading={historyLoading} />}

      {tab === 'relatorios' && (
        <ReportsTab program={program} year={activeYear} period={period || ranking?.period} toast={toast} error={error} />
      )}
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
        <div className={`alert ${implementation ? 'alert-success' : 'alert-warn'}`} style={{ marginTop: 18, marginBottom: 0 }}>
          {implementation
            ? 'O ambiente específico deste programa está registrado conforme sua documentação oficial.'
            : 'Instrumento específico ainda não registrado. As abas disponíveis exibem somente a infraestrutura e os dados compartilhados já existentes no CPE.'}
        </div>
      </div>
      <div className="card card-pad">
        <div className="card-title">Dados do programa</div>
        <dl className="kv-list">
          <dt>Código</dt><dd><span className="mono">{program.code}</span></dd>
          <dt>Ano</dt><dd>{program.year}</dd>
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
          { key: 'zone', label: 'Zona', render: (s) => SCHOOL_ZONE[s.zone]?.label || '—' },
          { key: 'linkActive', label: 'Participação', render: (s) => s.linkActive ? <Badge cls="badge-green">Ativa</Badge> : <Badge cls="badge-yellow">Inativa</Badge> },
          { key: 'joinedAt', label: 'Desde', render: (s) => fmtDateTime(s.joinedAt) },
          {
            key: 'actions', label: '', align: 'right',
            render: (s) => (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                {can('rankings:read') && can('results:read') && (
                  <Link to={`/programas/${program.id}/escolas/${s.id}`} className="btn btn-secondary btn-sm">
                    Ver avaliação
                  </Link>
                )}
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
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>INEP {s.inep}</div>
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
