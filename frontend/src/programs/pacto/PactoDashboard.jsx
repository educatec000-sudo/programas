import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApi } from '../../hooks/useApi.js';
import { pactoAdminApi } from '../../services/resources.js';
import DataTable from '../../components/DataTable.jsx';
import { Badge, Button, Field, LoadingBlock, Select, StatCard } from '../../components/ui.jsx';
import { buildPactoDashboard, dashboardAssessmentCodes } from './dashboard.js';

const COMPONENTS = [
  { value: 'PORTUGUES', label: 'Língua Portuguesa' },
  { value: 'MATEMATICA', label: 'Matemática' },
];

const LEVEL_COLORS = {
  red: '#dc2626',
  yellow: '#eab308',
  green: '#16a34a',
  gray: '#64748b',
};

const STATUS = {
  RASCUNHO: { label: 'Rascunho', cls: 'badge-yellow' },
  ENVIADO: { label: 'Enviado', cls: 'badge-green' },
  REABERTO: { label: 'Reaberto', cls: 'badge-blue' },
};

function metricValue(value, suffix = '') {
  return `${Number(value || 0).toLocaleString('pt-BR')}${suffix}`;
}

function ResultsCell({ value }) {
  return <span className="pacto-dashboard-results" title={value}>{value}</span>;
}

function SkillChart({ chart }) {
  const rows = chart.levels.map((level) => ({
    name: level.label,
    count: level.count,
    percentage: level.percentage,
    color: level.color,
  }));
  const renderLabel = ({ x, y, width, height, index }) => {
    const row = rows[index];
    if (!row || row.count == null) return null;
    return (
      <text x={x + width + 5} y={y + (height / 2)} dominantBaseline="middle" fill="var(--text-2)" fontSize="10">
        {row.percentage == null ? row.count.toLocaleString('pt-BR') : `${row.percentage}% (${row.count.toLocaleString('pt-BR')})`}
      </text>
    );
  };
  return (
    <div className="card card-pad pacto-dashboard-chart">
      <div className="card-title">{chart.skillLabel}</div>
      <div className="card-subtitle">{chart.componentLabel} · base: {chart.evaluated.toLocaleString('pt-BR')} avaliados</div>
      <div className="pacto-chart-legend">
        {rows.map((row) => (
          <span key={row.name}><i style={{ background: LEVEL_COLORS[row.color] || LEVEL_COLORS.gray }} />{row.name}</span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 70, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" unit="%" domain={[0, 100]} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={142} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value, _name, item) => [
              item.payload.count == null
                ? 'Sem dado salvo'
                : `${value == null ? 'Sem percentual' : `${value}%`} · ${item.payload.count.toLocaleString('pt-BR')} aluno(s)`,
              'Resultado',
            ]}
          />
          <Bar dataKey="percentage" name="Percentual" radius={[0, 5, 5, 0]}>
            {rows.map((row) => (
              <Cell key={row.name} fill={LEVEL_COLORS[row.color] || LEVEL_COLORS.gray} />
            ))}
            <LabelList dataKey="percentage" content={renderLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
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

  if (loading) return <LoadingBlock label="Carregando painel gerencial do Pacto..." />;
  if (error) return <div className="alert alert-error">{error.message}</div>;
  if (!data) return null;

  const { metrics } = dashboard;
  return (
    <>
      <div className="card card-pad pacto-dashboard-filters">
        <div className="card-header-row">
          <div>
            <div className="card-title">Filtros do painel</div>
            <div className="card-subtitle">Todos os indicadores, gráficos e tabelas respondem ao mesmo recorte.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={clearFilters}>Limpar filtros</Button>
            <Button size="sm" variant="secondary" onClick={refresh}>Atualizar dados</Button>
          </div>
        </div>
        <div className="pacto-dashboard-filter-grid">
          <Field label="Escola">
            <Select value={filters.schoolId} onChange={(event) => setFilter('schoolId', event.target.value)}>
              <option value="">Todas</option>
              {data.schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
            </Select>
          </Field>
          <Field label="Ano escolar">
            <Select value={filters.grade} onChange={(event) => setFilter('grade', event.target.value)}>
              <option value="">Todos</option>
              {data.config.grades.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}
            </Select>
          </Field>
          <Field label="Componente curricular">
            <Select value={filters.component} onChange={(event) => setFilter('component', event.target.value)}>
              <option value="">Todos</option>
              {COMPONENTS.map((component) => <option key={component.value} value={component.value}>{component.label}</option>)}
            </Select>
          </Field>
          <Field label="Avaliação">
            <Select value={filters.assessment} onChange={(event) => setFilter('assessment', event.target.value)}>
              <option value="">Todas</option>
              {dashboardAssessmentCodes().map((code) => <option key={code} value={code}>{code}</option>)}
            </Select>
          </Field>
          <Field label="Turno">
            <Select value={filters.shift} onChange={(event) => setFilter('shift', event.target.value)}>
              <option value="">Todos</option>
              {data.config.shifts.map((shift) => <option key={shift.value} value={shift.value}>{shift.label}</option>)}
            </Select>
          </Field>
          <Field label="Turma">
            <Select value={filters.classId} onChange={(event) => setFilter('classId', event.target.value)}>
              <option value="">Todas</option>
              {classOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {filters.schoolId ? '' : `${item.school.name} · `}{item.grade}º ano · {item.shift} · {item.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="stats-grid pacto-dashboard-metrics">
        <StatCard icon="🏫" tone="blue" value={metricValue(metrics.participatingSchools)} label="Escolas participantes" />
        <StatCard icon="▦" tone="violet" value={metricValue(metrics.registeredClasses)} label="Turmas cadastradas" />
        <StatCard icon="✓" tone="green" value={metricValue(metrics.classesWithData)} label="Turmas que preencheram" />
        <StatCard icon="👥" tone="cyan" value={metricValue(metrics.enrolled)} label="Alunos matriculados" />
        <StatCard icon="◎" tone="cyan" value={metricValue(metrics.evaluated)} label="Alunos avaliados" />
        <StatCard icon="%" tone="yellow" value={metricValue(metrics.completionPercentage, '%')} label="Percentual de preenchimento" />
        <StatCard icon="%" tone="yellow" value={metricValue(metrics.participationPercentage, '%')} label="Percentual de participação dos alunos" />
        <StatCard icon="✓" tone="green" value={metricValue(metrics.completedAssessments)} label="Avaliações concluídas" />
      </div>

      <div className="alert alert-info">
        Matrículas e avaliações são somadas nos registros de componente do recorte atual. Para evitar sobreposição entre Língua Portuguesa, Matemática ou diferentes avaliações, selecione o componente e a avaliação desejados.
        Rascunhos salvos entram no acompanhamento; “Avaliações concluídas” considera somente envios definitivos.
      </div>

      <section style={{ marginTop: 18 }}>
        <div className="pacto-dashboard-section-title">Resultados por habilidade e nível</div>
        <div className="pacto-dashboard-section-subtitle">Percentuais calculados sobre os alunos avaliados em cada habilidade.</div>
        {dashboard.charts.length ? (
          <div className="pacto-dashboard-chart-grid">
            {dashboard.charts.map((chart) => <SkillChart key={`${chart.component}:${chart.skill}`} chart={chart} />)}
          </div>
        ) : (
          <div className="card card-pad table-empty">Não há resultados salvos para o recorte selecionado.</div>
        )}
      </section>

      <section className="card card-pad" style={{ marginTop: 18 }}>
        <div className="card-title">Comparação entre escolas</div>
        <div className="card-subtitle">Participação e distribuição real dos níveis no recorte selecionado.</div>
        <DataTable
          columns={[
            { key: 'school', label: 'Escola', render: (item) => <div><strong>{item.school}</strong><span className="pacto-table-subtitle">INEP {item.inep || '—'}</span></div> },
            { key: 'enrolled', label: 'Matriculados', align: 'center' },
            { key: 'evaluated', label: 'Avaliados', align: 'center' },
            { key: 'participationPercentage', label: '% participação', align: 'center', render: (item) => `${item.participationPercentage ?? 0}%` },
            { key: 'results', label: 'Resultados por nível', render: (item) => <ResultsCell value={item.results} /> },
          ]}
          rows={dashboard.schoolComparison}
          emptyTitle="Sem escolas com resultados neste recorte"
          emptyHint="Ajuste os filtros ou aguarde o preenchimento das avaliações."
          emptyIcon="🏫"
        />
      </section>

      <section className="card card-pad" style={{ marginTop: 18 }}>
        <div className="card-title">Comparação por turma</div>
        <div className="card-subtitle">Detalhamento por escola, turma, avaliação e componente.</div>
        <DataTable
          columns={[
            { key: 'school', label: 'Escola', render: (item) => <strong>{item.school}</strong> },
            { key: 'grade', label: 'Ano', align: 'center', render: (item) => `${item.grade}º` },
            { key: 'shift', label: 'Turno', align: 'center' },
            { key: 'className', label: 'Turma', align: 'center' },
            { key: 'assessment', label: 'Avaliação', align: 'center' },
            { key: 'componentLabel', label: 'Componente' },
            { key: 'status', label: 'Status', render: (item) => <Badge cls={STATUS[item.status]?.cls}>{STATUS[item.status]?.label || item.status}</Badge> },
            { key: 'enrolled', label: 'Matriculados', align: 'center' },
            { key: 'evaluated', label: 'Avaliados', align: 'center' },
            { key: 'participationPercentage', label: '% participação', align: 'center', render: (item) => `${item.participationPercentage ?? 0}%` },
            { key: 'results', label: 'Resultados e percentuais', render: (item) => <ResultsCell value={item.results} /> },
          ]}
          rows={dashboard.classComparison}
          emptyTitle="Sem turmas com resultados neste recorte"
          emptyHint="Os dados aparecerão depois que a escola salvar uma avaliação."
          emptyIcon="▦"
        />
      </section>
    </>
  );
}
