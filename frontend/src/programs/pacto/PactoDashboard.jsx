import React, { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { pactoAdminApi } from '../../services/resources.js';
import DataTable from '../../components/DataTable.jsx';
import { Badge, Button, Field, Input, LoadingBlock, Modal, Select, StatCard } from '../../components/ui.jsx';
import { buildPactoDashboard, dashboardAssessmentCodes, formatGradeLabel } from './dashboard.js';

const COMPONENTS = [
  { value: 'PORTUGUES', label: 'Língua Portuguesa' },
  { value: 'MATEMATICA', label: 'Matemática' },
  { value: 'INICIAL', label: 'Habilidades Iniciais' },
];

const LEVEL_COLORS = {
  red: '#dc2626',
  yellow: '#eab308',
  green: '#16a34a',
  gray: '#94a3b8',
};

const STATUS_MAP = {
  RASCUNHO: { label: 'Rascunho', cls: 'badge-yellow' },
  ENVIADO: { label: 'Enviado', cls: 'badge-green' },
  REABERTO: { label: 'Reaberto', cls: 'badge-blue' },
};

function metricValue(value, suffix = '') {
  return `${Number(value || 0).toLocaleString('pt-BR')}${suffix}`;
}

function MiniProgressBar({ score, color = 'var(--primary)' }) {
  if (score == null) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  return (
    <div className="pacto-mini-progress">
      <div className="pacto-mini-progress-bar">
        <div
          className="pacto-mini-progress-fill"
          style={{ width: `${Math.min(100, Math.max(0, score))}%`, background: color }}
        />
      </div>
      <strong style={{ fontSize: 12.5, minWidth: 36, textAlign: 'right' }}>{score}%</strong>
    </div>
  );
}

function SkillCardModern({ chart }) {
  const redLevel = chart.levels.find((l) => l.color === 'red');
  const yellowLevel = chart.levels.find((l) => l.color === 'yellow');
  const greenLevel = chart.levels.find((l) => l.color === 'green');

  return (
    <div className="pacto-skill-card-modern">
      <div>
        <div className="pacto-skill-header-row">
          <div>
            <strong>{chart.skillLabel}</strong>
            <div style={{ color: 'var(--text-3)', fontSize: 11.5, marginTop: 2 }}>
              {chart.componentLabel} · base: <strong>{metricValue(chart.evaluated)}</strong> avaliados
            </div>
          </div>
          <Badge cls={chart.status.cls}>{chart.status.label}</Badge>
        </div>

        <div className="pacto-distribution-bar" style={{ height: 10, marginTop: 8, marginBottom: 8 }}>
          {chart.levels.map((lvl) => {
            const pct = lvl.percentage ?? 0;
            if (pct <= 0) return null;
            return (
              <span
                key={lvl.code}
                style={{
                  width: `${pct}%`,
                  background: LEVEL_COLORS[lvl.color] || LEVEL_COLORS.gray,
                }}
                title={`${lvl.label}: ${pct}% (${lvl.count || 0})`}
              />
            );
          })}
        </div>

        <div className="pacto-skill-levels-breakdown">
          {chart.levels.map((lvl) => (
            <div key={lvl.code} className="pacto-skill-level-row">
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                <i
                  className="level-dot"
                  style={{ background: LEVEL_COLORS[lvl.color] || LEVEL_COLORS.gray }}
                />
                {lvl.label}
              </span>
              <span>
                <strong>{lvl.percentage != null ? `${lvl.percentage}%` : '—'}</strong>
                <span style={{ color: 'var(--text-3)', fontSize: 11, marginLeft: 4 }}>
                  ({lvl.count != null ? metricValue(lvl.count) : '0'})
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="pacto-skill-footer">
        <span style={{ color: 'var(--text-2)' }}>Índice de proficiência:</span>
        <strong style={{ fontSize: 13, color: chart.score != null ? 'var(--text)' : 'var(--text-3)' }}>
          {chart.score != null ? `${chart.score}%` : 'Sem dados'}
        </strong>
      </div>
    </div>
  );
}

function FullRankingModal({ open, onClose, schoolRanking, onSelectSchool }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return schoolRanking;
    return schoolRanking.filter((s) => (
      s.school.toLowerCase().includes(q)
      || (s.inep && String(s.inep).includes(q))
    ));
  }, [schoolRanking, search]);

  const rankedCount = schoolRanking.filter((s) => s.score !== null).length;
  const avgScore = rankedCount > 0
    ? Math.round(schoolRanking.filter((s) => s.score !== null).reduce((sum, s) => sum + s.score, 0) / rankedCount)
    : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🏆 Ranking Completo das Escolas — Pacto pela Alfabetização"
      size="xl"
      footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}
    >
      <div className="pacto-modal-kpi-grid">
        <div className="pacto-modal-kpi-item">
          <strong>{schoolRanking.length}</strong>
          <span>Escolas no programa</span>
        </div>
        <div className="pacto-modal-kpi-item">
          <strong>{rankedCount}</strong>
          <span>Escolas avaliadas</span>
        </div>
        <div className="pacto-modal-kpi-item">
          <strong>{avgScore}%</strong>
          <span>Média geral de proficiência</span>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Input
          type="search"
          placeholder="🔎 Buscar escola por nome ou INEP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable
        columns={[
          {
            key: 'positionBadge',
            label: 'Posição',
            width: 80,
            align: 'center',
            render: (item) => <strong>{item.positionBadge}</strong>,
          },
          {
            key: 'school',
            label: 'Escola',
            render: (item) => (
              <div>
                <strong>{item.school}</strong>
                <span className="pacto-table-subtitle">INEP {item.inep || '—'}</span>
              </div>
            ),
          },
          {
            key: 'completeness',
            label: 'Completude',
            render: (item) => (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <strong>{item.completenessLabel || '—'}</strong>
                  <Badge cls={item.isComplete ? 'badge-green' : 'badge-yellow'}>
                    {item.isComplete ? '✅ Completo' : '⚠️ Incompleto'}
                  </Badge>
                </div>
                {!item.isComplete && item.missingAssessments?.length > 0 && (
                  <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                    Pendente: {item.missingAssessments.join(', ')}
                  </div>
                )}
              </div>
            ),
          },
          { key: 'enrolled', label: 'Matriculados', align: 'center', render: (item) => metricValue(item.enrolled) },
          { key: 'evaluated', label: 'Avaliados', align: 'center', render: (item) => metricValue(item.evaluated) },
          {
            key: 'participationPercentage',
            label: '% Participação',
            align: 'center',
            render: (item) => `${item.participationPercentage ?? 0}%`,
          },
          {
            key: 'score',
            label: 'Proficiência',
            width: 150,
            render: (item) => (
              <MiniProgressBar
                score={item.score}
                color={item.situation?.color || 'var(--primary)'}
              />
            ),
          },
          {
            key: 'rankingScore',
            label: 'Score Final',
            align: 'center',
            render: (item) => item.rankingScore != null ? <strong style={{ color: 'var(--primary)', fontSize: 13.5 }}>{item.rankingScore} pts</strong> : '—',
          },
          {
            key: 'situation',
            label: 'Situação',
            render: (item) => <Badge cls={item.situation?.cls}>{item.situation?.label}</Badge>,
          },
          {
            key: 'actions',
            label: '',
            align: 'right',
            render: (item) => (
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSchool(item);
                }}
              >
                Ver detalhes
              </Button>
            ),
          },
        ]}
        rows={filtered}
        emptyTitle="Nenhuma escola encontrada"
        emptyHint="Tente buscar por outro termo."
        emptyIcon="🏫"
      />
    </Modal>
  );
}

function SchoolDetailModal({ school, open, onClose }) {
  const [tab, setTab] = useState('habilidades');

  if (!school) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Detalhamento da Escola — ${school.school}`}
      size="xl"
      footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Código INEP: </span>
          <span className="mono" style={{ fontWeight: 600 }}>{school.inep || '—'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge cls="badge-blue">Posição: {school.positionBadge}</Badge>
          <Badge cls={school.isComplete ? 'badge-green' : 'badge-yellow'}>
            {school.isComplete ? '✅ Avaliações completas' : '⚠️ Incompleto'} ({school.completenessLabel})
          </Badge>
          <Badge cls={school.situation?.cls}>{school.situation?.label}</Badge>
        </div>
      </div>

      {!school.isComplete && school.missingAssessments?.length > 0 && (
        <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, marginBottom: 14, fontSize: 12.5, color: '#92400e' }}>
          ⚠️ <strong>Atenção:</strong> Esta escola possui dados parciais no recorte ({school.completenessLabel}). Avaliações pendentes para completar o ciclo avaliativo: <strong>{school.missingAssessments.join(', ')}</strong>. O score de classificação ({school.rankingScore} pts) é ponderado considerando essa completude ({school.completenessPercentage}%).
        </div>
      )}

      <div className="pacto-modal-kpi-grid">
        <div className="pacto-modal-kpi-item">
          <strong>{school.score != null ? `${school.score}%` : '—'}</strong>
          <span>Índice de proficiência</span>
        </div>
        <div className="pacto-modal-kpi-item">
          <strong>{school.rankingScore != null ? `${school.rankingScore} pts` : '—'}</strong>
          <span>Score final de ranking</span>
        </div>
        <div className="pacto-modal-kpi-item">
          <strong>{metricValue(school.enrolled)}</strong>
          <span>Matriculados</span>
        </div>
        <div className="pacto-modal-kpi-item">
          <strong>{metricValue(school.evaluated)}</strong>
          <span>Avaliados</span>
        </div>
        <div className="pacto-modal-kpi-item">
          <strong>{school.participationPercentage ?? 0}%</strong>
          <span>Taxa de participação</span>
        </div>
        <div className="pacto-modal-kpi-item">
          <strong>{school.completenessLabel || '—'}</strong>
          <span>Completude do ciclo</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        <button
          type="button"
          className={`tab ${tab === 'habilidades' ? 'active' : ''}`}
          onClick={() => setTab('habilidades')}
        >
          📈 Habilidades avaliadas ({school.skills?.length || 0})
        </button>
        <button
          type="button"
          className={`tab ${tab === 'turmas' ? 'active' : ''}`}
          onClick={() => setTab('turmas')}
        >
          ▦ Turmas da escola ({school.classes?.length || 0})
        </button>
      </div>

      {tab === 'habilidades' && (
        <>
          {school.skills?.length ? (
            <div className="pacto-dashboard-chart-grid">
              {school.skills.map((skill) => (
                <SkillCardModern key={`${skill.component}:${skill.skill}`} chart={skill} />
              ))}
            </div>
          ) : (
            <div className="card card-pad table-empty">
              Nenhuma avaliação com resultados lançados para esta escola no recorte atual.
            </div>
          )}
        </>
      )}

      {tab === 'turmas' && (
        <DataTable
          columns={[
            { key: 'grade', label: 'Etapa / Ano', align: 'center', render: (item) => formatGradeLabel(item.grade) },
            { key: 'shift', label: 'Turno', align: 'center' },
            { key: 'name', label: 'Turma', render: (item) => <strong>{item.name}</strong> },
            {
              key: 'assessments',
              label: 'Avaliações',
              render: (item) => (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(item.assessments || []).map((a) => (
                    <Badge key={a.code} cls={STATUS_MAP[a.status]?.cls || 'badge-gray'}>
                      {a.code} · {STATUS_MAP[a.status]?.label || a.status}
                    </Badge>
                  ))}
                  {!item.assessments?.length && <span style={{ color: 'var(--text-3)' }}>Sem registros</span>}
                </div>
              ),
            },
          ]}
          rows={school.classes || []}
          emptyTitle="Nenhuma turma vinculada"
          emptyHint="Cadastre turmas para esta escola na aba Coleta do Pacto."
          emptyIcon="▦"
        />
      )}
    </Modal>
  );
}

export default function PactoDashboard({ program }) {
  const { data, loading, error, refresh } = useApi(() => pactoAdminApi.overview(program.id), [program.id]);
  const [filters, setFilters] = useState({
    schoolId: '',
    grade: '',
    component: '',
    assessment: '',
    shift: '',
    classId: '',
  });

  const [fullRankingOpen, setFullRankingOpen] = useState(false);
  const [selectedSchoolDetail, setSelectedSchoolDetail] = useState(null);

  const allClasses = useMemo(() => (data?.schools || []).flatMap((school) => (
    (school.classes || []).map((pactoClass) => ({ ...pactoClass, school }))
  )), [data]);

  const classOptions = useMemo(() => allClasses.filter((item) => (
    (!filters.schoolId || item.schoolId === filters.schoolId)
    && (!filters.grade || String(item.grade) === String(filters.grade))
    && (!filters.shift || item.shift === filters.shift)
    && (!filters.assessment || (item.enabledAssessments || dashboardAssessmentCodes()).includes(filters.assessment))
  )), [allClasses, filters.schoolId, filters.grade, filters.shift, filters.assessment]);

  const dashboard = useMemo(() => buildPactoDashboard(data, filters), [data, filters]);

  const setFilter = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(['schoolId', 'grade', 'assessment', 'shift'].includes(key) ? { classId: '' } : {}),
    }));
  };

  const clearFilters = () => setFilters({
    schoolId: '', grade: '', component: '', assessment: '', shift: '', classId: '',
  });

  const hasActiveFilters = Boolean(
    filters.schoolId || filters.grade || filters.component || filters.assessment || filters.shift || filters.classId,
  );

  if (loading) return <LoadingBlock label="Carregando painel gerencial do Pacto..." />;
  if (error) return <div className="alert alert-error">{error.message}</div>;
  if (!data) return null;

  const { metrics } = dashboard;

  const selectedSchoolObj = data.schools.find((s) => s.id === filters.schoolId);
  const selectedGradeObj = data.config.grades.find((g) => String(g.value) === String(filters.grade));
  const selectedComponentObj = COMPONENTS.find((c) => c.value === filters.component);
  const selectedShiftObj = data.config.shifts.find((s) => s.value === filters.shift);
  const selectedClassObj = allClasses.find((c) => c.id === filters.classId);

  return (
    <>
      {/* Resumo do Programa & Progresso */}
      <section className="pacto-section" style={{ marginTop: 0 }}>
        <div className="pacto-section-header">
          <div>
            <div className="pacto-dashboard-section-title">📊 Resumo do programa</div>
            <div className="pacto-dashboard-section-subtitle">
              Indicadores consolidados de participação e progresso no ciclo {program.year}.
            </div>
          </div>
        </div>

        <div className="stats-grid pacto-dashboard-metrics">
          <StatCard icon="🏫" tone="blue" value={metricValue(metrics.participatingSchools)} label="Escolas participantes" />
          <StatCard icon="👥" tone="violet" value={metricValue(metrics.enrolled)} label="Alunos matriculados" />
          <StatCard icon="📝" tone="cyan" value={metricValue(metrics.evaluated)} label="Alunos avaliados" />
          <StatCard icon="📊" tone="yellow" value={metricValue(metrics.completionPercentage, '%')} label="Taxa de preenchimento" />
          <StatCard icon="📈" tone="green" value={metricValue(metrics.participationPercentage, '%')} label="Taxa de participação" />
          <StatCard
            icon="✅"
            tone="green"
            value={`${metrics.completedAssessments}/${metrics.expectedAssessments}`}
            label="Avaliações concluídas"
          />
        </div>

        <div className="pacto-progress-card">
          <div className="pacto-progress-header">
            <div>
              <strong>Progresso geral das avaliações</strong>
              <div style={{ color: 'var(--text-3)', fontSize: 11.5, marginTop: 1 }}>
                Relação entre avaliações enviadas definitivamente, em rascunho e pendentes de início.
              </div>
            </div>
            <Badge cls={metrics.completionPercentage >= 80 ? 'badge-green' : metrics.completionPercentage >= 40 ? 'badge-yellow' : 'badge-gray'}>
              {metrics.completionPercentage}% concluído
            </Badge>
          </div>

          <div className="pacto-progress-bar">
            {dashboard.progress.completedPct > 0 && (
              <span
                className="pacto-progress-segment green"
                style={{ width: `${dashboard.progress.completedPct}%` }}
                title={`Concluídas: ${dashboard.progress.completed} (${dashboard.progress.completedPct}%)`}
              />
            )}
            {dashboard.progress.draftPct > 0 && (
              <span
                className="pacto-progress-segment yellow"
                style={{ width: `${dashboard.progress.draftPct}%` }}
                title={`Em rascunho: ${dashboard.progress.draft} (${dashboard.progress.draftPct}%)`}
              />
            )}
            {dashboard.progress.pendingPct > 0 && (
              <span
                className="pacto-progress-segment gray"
                style={{ width: `${dashboard.progress.pendingPct}%` }}
                title={`Pendentes: ${dashboard.progress.pending} (${dashboard.progress.pendingPct}%)`}
              />
            )}
          </div>

          <div className="pacto-progress-legend">
            <span>
              <i style={{ background: '#16a34a' }} /> Concluídas: <strong>{metrics.completedAssessments}</strong> ({dashboard.progress.completedPct}%)
            </span>
            <span>
              <i style={{ background: '#eab308' }} /> Em rascunho: <strong>{dashboard.progress.draft}</strong> ({dashboard.progress.draftPct}%)
            </span>
            <span>
              <i style={{ background: '#cbd5e1' }} /> Pendentes: <strong>{dashboard.progress.pending}</strong> ({dashboard.progress.pendingPct}%)
            </span>
            <span style={{ marginLeft: 'auto', color: 'var(--text-3)' }}>
              Total esperado: <strong>{metrics.expectedAssessments}</strong> avaliações
            </span>
          </div>
        </div>
      </section>

      {/* Filtros da Análise */}
      <section className="card card-pad pacto-dashboard-filters">
        <div className="card-header-row">
          <div>
            <div className="card-title">🔎 Filtros da análise</div>
            <div className="card-subtitle">Filtre todos os indicadores, rankings e habilidades pelo recorte desejado.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
              Limpar filtros
            </Button>
            <Button size="sm" variant="secondary" onClick={refresh}>
              Atualizar dados
            </Button>
          </div>
        </div>

        <div className="pacto-dashboard-filter-grid">
          <Field label="Escola">
            <Select value={filters.schoolId} onChange={(event) => setFilter('schoolId', event.target.value)}>
              <option value="">Todas as escolas</option>
              {data.schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
            </Select>
          </Field>
          <Field label="Etapa / Ano">
            <Select value={filters.grade} onChange={(event) => setFilter('grade', event.target.value)}>
              <option value="">Todas as etapas</option>
              {data.config.grades.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}
            </Select>
          </Field>
          <Field label="Componente curricular">
            <Select value={filters.component} onChange={(event) => setFilter('component', event.target.value)}>
              <option value="">Todos os componentes</option>
              {COMPONENTS.map((component) => <option key={component.value} value={component.value}>{component.label}</option>)}
            </Select>
          </Field>
          <Field label="Avaliação">
            <Select value={filters.assessment} onChange={(event) => setFilter('assessment', event.target.value)}>
              <option value="">Todas as avaliações</option>
              {dashboardAssessmentCodes().map((code) => <option key={code} value={code}>{code}</option>)}
            </Select>
          </Field>
          <Field label="Turno">
            <Select value={filters.shift} onChange={(event) => setFilter('shift', event.target.value)}>
              <option value="">Todos os turnos</option>
              {data.config.shifts.map((shift) => <option key={shift.value} value={shift.value}>{shift.label}</option>)}
            </Select>
          </Field>
          <Field label="Turma">
            <Select value={filters.classId} onChange={(event) => setFilter('classId', event.target.value)}>
              <option value="">Todas as turmas</option>
              {classOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {filters.schoolId ? '' : `${item.school.name} · `}{formatGradeLabel(item.grade)} · {item.shift} · {item.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {hasActiveFilters && (
          <div className="pacto-filter-chips">
            <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>Filtros ativos:</span>
            {selectedSchoolObj && (
              <span className="pacto-filter-chip">
                Escola: {selectedSchoolObj.name}
                <button type="button" onClick={() => setFilter('schoolId', '')}>✕</button>
              </span>
            )}
            {selectedGradeObj && (
              <span className="pacto-filter-chip">
                Etapa: {selectedGradeObj.label}
                <button type="button" onClick={() => setFilter('grade', '')}>✕</button>
              </span>
            )}
            {selectedComponentObj && (
              <span className="pacto-filter-chip">
                Componente: {selectedComponentObj.label}
                <button type="button" onClick={() => setFilter('component', '')}>✕</button>
              </span>
            )}
            {filters.assessment && (
              <span className="pacto-filter-chip">
                Avaliação: {filters.assessment}
                <button type="button" onClick={() => setFilter('assessment', '')}>✕</button>
              </span>
            )}
            {selectedShiftObj && (
              <span className="pacto-filter-chip">
                Turno: {selectedShiftObj.label}
                <button type="button" onClick={() => setFilter('shift', '')}>✕</button>
              </span>
            )}
            {selectedClassObj && (
              <span className="pacto-filter-chip">
                Turma: {selectedClassObj.name}
                <button type="button" onClick={() => setFilter('classId', '')}>✕</button>
              </span>
            )}
          </div>
        )}
      </section>

      {/* Top 5 Ranking de Escolas */}
      <section className="pacto-section">
        <div className="pacto-section-header">
          <div>
            <div className="pacto-dashboard-section-title">🏆 Ranking das escolas</div>
            <div className="pacto-dashboard-section-subtitle">
              Classificação geral ponderada considerando proficiência (50%), taxa de participação (20%) e completude das avaliações esperadas (30%).
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setFullRankingOpen(true)}>
            Ver ranking completo ({dashboard.schoolRanking.length}) →
          </Button>
        </div>

        {dashboard.top5.length > 0 ? (
          <div className="pacto-ranking-grid">
            {dashboard.top5.map((school) => (
              <div
                key={school.schoolId}
                className={`pacto-ranking-card ${school.position === 1 ? 'rank-1' : school.position === 2 ? 'rank-2' : school.position === 3 ? 'rank-3' : ''}`}
              >
                <div>
                  <div className="pacto-rank-top">
                    <span className="pacto-rank-badge">{school.positionBadge}</span>
                    <div style={{ textAlign: 'right' }}>
                      <span
                        className="pacto-rank-score"
                        style={{ background: school.situation?.bg, color: school.situation?.color }}
                        title="Índice de proficiência"
                      >
                        {school.score != null ? `${school.score}%` : '—'}
                      </span>
                      {school.rankingScore != null && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, marginTop: 2 }}>
                          {school.rankingScore} pts
                        </div>
                      )}
                    </div>
                  </div>

                  <h4>{school.school}</h4>
                  <div style={{ color: 'var(--text-3)', fontSize: 11 }}>INEP {school.inep || '—'}</div>

                  <div style={{ margin: '8px 0', padding: '6px 10px', background: school.isComplete ? '#ecfdf5' : '#fffbeb', borderRadius: 6, border: `1px solid ${school.isComplete ? '#a7f3d0' : '#fde68a'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
                      <span><strong>Avaliações:</strong> {school.completenessLabel}</span>
                      <Badge cls={school.isComplete ? 'badge-green' : 'badge-yellow'}>
                        {school.isComplete ? '✅ Completo' : '⚠️ Incompleto'}
                      </Badge>
                    </div>
                    {!school.isComplete && school.missingAssessments?.length > 0 && (
                      <div style={{ fontSize: 10.5, color: '#b45309', marginTop: 2, fontWeight: 500 }}>
                        ⏳ Pendente: {school.missingAssessments.join(', ')}
                      </div>
                    )}
                  </div>

                  <div className="pacto-rank-stats">
                    <div>
                      👥 <strong>{metricValue(school.enrolled)}</strong> matriculados · 📝 <strong>{metricValue(school.evaluated)}</strong> avaliados
                    </div>
                    <div>
                      📈 <strong>{school.participationPercentage ?? 0}%</strong> de participação
                    </div>
                    <div>
                      ▦ <strong>{school.classesCount}</strong> turma(s) · ✅ <strong>{school.completedAssessments}</strong> enviada(s)
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  block
                  onClick={() => setSelectedSchoolDetail(school)}
                >
                  Ver detalhes
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="card card-pad table-empty">
            Nenhuma escola com dados avaliativos consolidados no momento. O ranking será gerado automaticamente quando as avaliações forem salvas.
          </div>
        )}
      </section>

      {/* Desempenho dos Alunos por Habilidade */}
      <section className="pacto-section">
        <div className="pacto-section-header">
          <div>
            <div className="pacto-dashboard-section-title">📈 Desempenho dos alunos por habilidade</div>
            <div className="pacto-dashboard-section-subtitle">
              Distribuição percentual dos alunos avaliados por nível de desenvolvimento em cada competência.
            </div>
          </div>
        </div>

        {dashboard.charts.length > 0 ? (
          <div className="pacto-dashboard-chart-grid">
            {dashboard.charts.map((chart) => (
              <SkillCardModern key={`${chart.component}:${chart.skill}`} chart={chart} />
            ))}
          </div>
        ) : (
          <div className="card card-pad table-empty">
            Não há resultados salvos para o recorte selecionado.
          </div>
        )}
      </section>

      {/* Pontos de Atenção & Diagnóstico */}
      <section className="pacto-section">
        <div className="pacto-section-header">
          <div>
            <div className="pacto-dashboard-section-title">⚠️ Pontos de atenção e diagnóstico</div>
            <div className="pacto-dashboard-section-subtitle">
              Alertas automáticos de proficiência, participação e envios que demandam intervenção pedagógica.
            </div>
          </div>
        </div>

        <div className="pacto-attention-grid">
          {dashboard.attentionPoints.map((point) => (
            <div key={point.id} className={`pacto-attention-card ${point.severity}`}>
              <div className="pacto-attention-header">
                <span className="pacto-attention-title">{point.title}</span>
                <Badge
                  cls={
                    point.severity === 'critical'
                      ? 'badge-red'
                      : point.severity === 'warning'
                        ? 'badge-yellow'
                        : point.severity === 'success'
                          ? 'badge-green'
                          : 'badge-blue'
                  }
                >
                  {point.badgeLabel}
                </Badge>
              </div>
              <p className="pacto-attention-msg">{point.message}</p>
              {point.recommendation && (
                <div className="pacto-attention-rec">
                  💡 {point.recommendation}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Desempenho por Escola (Tabela Comparativa) */}
      <section className="card card-pad pacto-section">
        <div className="card-header-row">
          <div>
            <div className="card-title">🏫 Desempenho por escola</div>
            <div className="card-subtitle">Lista comparativa completa de todas as unidades escolares participantes.</div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setFullRankingOpen(true)}>
            Ver ranking completo
          </Button>
        </div>

        <DataTable
          columns={[
            {
              key: 'positionBadge',
              label: '#',
              width: 60,
              align: 'center',
              render: (item) => <strong>{item.positionBadge}</strong>,
            },
            {
              key: 'school',
              label: 'Escola',
              render: (item) => (
                <div>
                  <strong>{item.school}</strong>
                  <span className="pacto-table-subtitle">INEP {item.inep || '—'}</span>
                </div>
              ),
            },
            {
              key: 'completeness',
              label: 'Completude',
              render: (item) => (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <strong>{item.completenessLabel || '—'}</strong>
                    <Badge cls={item.isComplete ? 'badge-green' : 'badge-yellow'}>
                      {item.isComplete ? '✅ Completo' : '⚠️ Incompleto'}
                    </Badge>
                  </div>
                  {!item.isComplete && item.missingAssessments?.length > 0 && (
                    <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                      Pendente: {item.missingAssessments.join(', ')}
                    </div>
                  )}
                </div>
              ),
            },
            { key: 'enrolled', label: 'Matriculados', align: 'center', render: (item) => metricValue(item.enrolled) },
            { key: 'evaluated', label: 'Avaliados', align: 'center', render: (item) => metricValue(item.evaluated) },
            {
              key: 'participationPercentage',
              label: '% Participação',
              align: 'center',
              render: (item) => `${item.participationPercentage ?? 0}%`,
            },
            {
              key: 'score',
              label: 'Proficiência',
              width: 150,
              render: (item) => (
                <MiniProgressBar
                  score={item.score}
                  color={item.situation?.color || 'var(--primary)'}
                />
              ),
            },
            {
              key: 'rankingScore',
              label: 'Score Final',
              align: 'center',
              render: (item) => item.rankingScore != null ? <strong style={{ color: 'var(--primary)', fontSize: 13 }}>{item.rankingScore} pts</strong> : '—',
            },
            {
              key: 'situation',
              label: 'Situação',
              render: (item) => <Badge cls={item.situation?.cls}>{item.situation?.label}</Badge>,
            },
            {
              key: 'actions',
              label: '',
              align: 'right',
              render: (item) => (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSchoolDetail(item);
                  }}
                >
                  Ver detalhes
                </Button>
              ),
            },
          ]}
          rows={dashboard.schoolComparison}
          emptyTitle="Sem escolas com resultados neste recorte"
          emptyHint="Ajuste os filtros ou aguarde o preenchimento das avaliações."
          emptyIcon="🏫"
        />
      </section>

      {/* Comparação por Turma */}
      <section className="card card-pad pacto-section">
        <div className="card-title">▦ Detalhamento por turma</div>
        <div className="card-subtitle">Acompanhamento granular por escola, turma, avaliação e componente curricular.</div>
        <DataTable
          columns={[
            { key: 'school', label: 'Escola', render: (item) => <strong>{item.school}</strong> },
            { key: 'grade', label: 'Etapa / Ano', align: 'center', render: (item) => formatGradeLabel(item.grade) },
            { key: 'shift', label: 'Turno', align: 'center' },
            { key: 'className', label: 'Turma', align: 'center' },
            { key: 'assessment', label: 'Avaliação', align: 'center' },
            { key: 'componentLabel', label: 'Componente' },
            {
              key: 'status',
              label: 'Status',
              render: (item) => <Badge cls={STATUS_MAP[item.status]?.cls}>{STATUS_MAP[item.status]?.label || item.status}</Badge>,
            },
            { key: 'enrolled', label: 'Matriculados', align: 'center', render: (item) => metricValue(item.enrolled) },
            { key: 'evaluated', label: 'Avaliados', align: 'center', render: (item) => metricValue(item.evaluated) },
            {
              key: 'participationPercentage',
              label: '% Participação',
              align: 'center',
              render: (item) => `${item.participationPercentage ?? 0}%`,
            },
            {
              key: 'results',
              label: 'Resultados e percentuais',
              render: (item) => <span className="pacto-dashboard-results" title={item.results}>{item.results}</span>,
            },
          ]}
          rows={dashboard.classComparison}
          emptyTitle="Sem turmas com resultados neste recorte"
          emptyHint="Os dados aparecerão depois que a escola salvar uma avaliação."
          emptyIcon="▦"
        />
      </section>

      {/* Modais */}
      <FullRankingModal
        open={fullRankingOpen}
        onClose={() => setFullRankingOpen(false)}
        schoolRanking={dashboard.schoolRanking}
        onSelectSchool={(school) => {
          setFullRankingOpen(false);
          setSelectedSchoolDetail(school);
        }}
      />

      <SchoolDetailModal
        school={selectedSchoolDetail}
        open={Boolean(selectedSchoolDetail)}
        onClose={() => setSelectedSchoolDetail(null)}
      />
    </>
  );
}
