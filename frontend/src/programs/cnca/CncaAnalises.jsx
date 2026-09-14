import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { useApi } from '../../hooks/useApi.js';
import { cncaApi } from '../../services/resources.js';
import { Badge, Field, LoadingBlock, Select, Button, Input } from '../../components/ui.jsx';
import { fmt, fmtInt } from '../../utils/format.js';
import DataTable from '../../components/DataTable.jsx';

const COMPONENT_INFO = {
  MATEMATICA: {
    label: 'Matemática',
    shortLabel: 'Matemática',
    icon: '📐',
    color: '#0284c7',
    bg: '#f0f9ff',
    border: '#bae6fd',
    badgeCls: 'badge-blue',
  },
  LEITURA: {
    label: 'Leitura',
    shortLabel: 'Leitura',
    icon: '📖',
    color: '#6366f1',
    bg: '#eef2ff',
    border: '#c7d2fe',
    badgeCls: 'badge-indigo',
  },
  ESCRITA: {
    label: 'Escrita',
    shortLabel: 'Escrita',
    icon: '✍️',
    color: '#8b5cf6',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    badgeCls: 'badge-purple',
  },
  FLUENCIA: {
    label: 'Fluência em Leitura',
    shortLabel: 'Fluência',
    icon: '🗣️',
    color: '#0ea5e9',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    badgeCls: 'badge-cyan',
  },
};

/**
 * Retorna as configurações visuais de cor, fundo e borda para cada nível/padrão oficial de desempenho.
 */
export function getLevelColor(levelName = '') {
  const norm = String(levelName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // 6. Avançado / Fluente / Alfabético / Ortográfico / Excelente / Muito Alto / Alto
  if (
    norm.includes('avancado') ||
    norm.includes('fluente') ||
    norm.includes('alfabetico') ||
    norm.includes('ortografico') ||
    norm.includes('excelente') ||
    norm === 'alto' ||
    norm.includes('muito alto')
  ) {
    return { bg: '#059669', text: '#065f46', badgeCls: 'badge-green', lightBg: '#ecfdf5', border: '#a7f3d0' };
  }

  // 5. Satisfatório / Adequado / Proficiente
  if (
    (norm.includes('satisfatorio') && !norm.includes('insatisfatorio')) ||
    norm.includes('adequado') ||
    norm.includes('proficiente')
  ) {
    return { bg: '#16a34a', text: '#166534', badgeCls: 'badge-green', lightBg: '#f0fdf4', border: '#bbf7d0' };
  }

  // 4. Intermediário / Silábico-Alfabético / Médio
  if (
    norm.includes('intermediario') ||
    norm.includes('silabico-alfabetico') ||
    norm === 'medio'
  ) {
    return { bg: '#0284c7', text: '#075985', badgeCls: 'badge-blue', lightBg: '#f0f9ff', border: '#bae6fd' };
  }

  // 3. Insatisfatório / Básico / Silábico / Iniciante / Baixo
  if (
    norm.includes('insatisfatorio') ||
    norm.includes('basico') ||
    norm.includes('iniciante') ||
    norm.includes('silabico') ||
    norm === 'baixo'
  ) {
    return { bg: '#d97706', text: '#92400e', badgeCls: 'badge-yellow', lightBg: '#fffbeb', border: '#fde68a' };
  }

  // 2. Insuficiente / Crítico
  if (
    norm.includes('insuficiente') ||
    norm.includes('critico')
  ) {
    return { bg: '#ea580c', text: '#9a3412', badgeCls: 'badge-yellow', lightBg: '#fff7ed', border: '#fed7aa' };
  }

  // 1. Inadequado / Muito Crítico / Muito Baixo / Abaixo do Básico / Não Leitor / Pré-leitor / Pré-silábico / Defasagem
  if (
    norm.includes('inadequado') ||
    norm.includes('abaixo') ||
    norm.includes('nao leitor') ||
    norm.includes('pre-leitor') ||
    norm.includes('pre-silabico') ||
    norm.includes('defasagem') ||
    norm.includes('muito baixo') ||
    norm.includes('muito critico')
  ) {
    return { bg: '#dc2626', text: '#991b1b', badgeCls: 'badge-red', lightBg: '#fef2f2', border: '#fecaca' };
  }

  return { bg: '#64748b', text: '#334155', badgeCls: 'badge-gray', lightBg: '#f8fafc', border: '#e2e8f0' };
}

/**
 * Retorna a ordem pedagógica padrão de um nível de desempenho (1 = mais crítico a 6 = mais avançado).
 */
export function getLevelRank(levelName = '') {
  const norm = String(levelName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (
    norm.includes('inadequado') ||
    norm.includes('muito critico') ||
    norm.includes('muito baixo') ||
    norm.includes('abaixo') ||
    norm.includes('nao leitor') ||
    norm.includes('pre-leitor') ||
    norm.includes('pre-silabico') ||
    norm.includes('defasagem')
  ) {
    return 1;
  }
  if (norm.includes('insuficiente') || norm.includes('critico')) {
    return 2;
  }
  if (
    norm.includes('insatisfatorio') ||
    norm.includes('basico') ||
    norm.includes('iniciante') ||
    norm.includes('silabico') ||
    norm === 'baixo'
  ) {
    return 3;
  }
  if (
    norm.includes('intermediario') ||
    norm.includes('silabico-alfabetico') ||
    norm === 'medio'
  ) {
    return 4;
  }
  if (
    (norm.includes('satisfatorio') && !norm.includes('insatisfatorio')) ||
    norm.includes('adequado') ||
    norm.includes('proficiente')
  ) {
    return 5;
  }
  if (
    norm.includes('avancado') ||
    norm.includes('fluente') ||
    norm.includes('alfabetico') ||
    norm.includes('ortografico') ||
    norm.includes('excelente') ||
    norm === 'alto' ||
    norm.includes('muito alto')
  ) {
    return 6;
  }
  return 10;
}

export default function CncaAnalises({ program }) {
  const [component, setComponent] = useState('TODOS');
  const [grade, setGrade] = useState('TODOS');
  const [assessment, setAssessment] = useState('TODOS');
  const [chartComponent, setChartComponent] = useState('MATEMATICA');
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [tableSort, setTableSort] = useState('score');
  const [tableDir, setTableDir] = useState('desc');

  const { data: filtersData } = useApi(() => cncaApi.filters(program.id), [program.id]);

  const activeFilters = useMemo(
    () => ({
      year: program.year,
      component,
      grade,
      assessment,
    }),
    [program.year, component, grade, assessment],
  );

  const { data: dashboard, loading } = useApi(
    () => cncaApi.dashboard(program.id, activeFilters),
    [program.id, activeFilters],
  );

  const skillsPerformance = dashboard?.skillsPerformance || [];
  const criticalSkills = dashboard?.criticalSkills || [];
  const levelsByComponent = dashboard?.levelsByComponent || {};
  const levelsDistribution = dashboard?.levelsDistribution || [];
  const schoolSummaries = dashboard?.schoolSummaries || [];

  const displayedSkills = showAllSkills ? skillsPerformance : skillsPerformance.slice(0, 8);

  const activeLevels = useMemo(() => {
    let list = [];
    const targetComp = component !== 'TODOS' ? component : chartComponent;
    if (levelsByComponent && levelsByComponent[targetComp] && levelsByComponent[targetComp].length > 0) {
      list = levelsByComponent[targetComp];
    } else if (levelsDistribution.length > 0) {
      const filtered = levelsDistribution.filter((l) => l.component === targetComp);
      if (filtered.length > 0) list = filtered;
      else if (component !== 'TODOS') list = levelsDistribution;
      else list = levelsDistribution;
    }

    // Ordenação pedagógica: Inadequado -> Insuficiente -> Insatisfatório -> Intermediário -> Satisfatório -> Avançado
    return [...list].sort((a, b) => getLevelRank(a.level) - getLevelRank(b.level));
  }, [component, chartComponent, levelsByComponent, levelsDistribution]);

  // Lista única de nomes de níveis presentes para renderizar colunas dinâmicas na tabela de escolas
  const presentLevelNames = useMemo(() => {
    const namesSet = new Set();
    for (const lvl of activeLevels) {
      if (lvl.level) namesSet.add(lvl.level);
    }
    for (const sc of schoolSummaries) {
      if (Array.isArray(sc.performanceLevels)) {
        for (const pl of sc.performanceLevels) {
          if (pl.level) namesSet.add(pl.level);
        }
      }
    }
    return Array.from(namesSet).sort((a, b) => getLevelRank(a) - getLevelRank(b));
  }, [activeLevels, schoolSummaries]);

  // Filtro e ordenação das escolas na tabela comparativa
  const filteredSchoolSummaries = useMemo(() => {
    let list = [...schoolSummaries];
    if (schoolSearch.trim()) {
      const q = schoolSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      list = list.filter((s) => {
        const name = (s.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const inep = String(s.inep || '');
        return name.includes(q) || inep.includes(q);
      });
    }

    list.sort((a, b) => {
      let valA = a[tableSort];
      let valB = b[tableSort];

      // Se ordenando por uma coluna de nível específico
      if (presentLevelNames.includes(tableSort)) {
        const lvlA = (a.performanceLevels || []).find((l) => l.level === tableSort);
        const lvlB = (b.performanceLevels || []).find((l) => l.level === tableSort);
        valA = lvlA?.percentage ?? -1;
        valB = lvlB?.percentage ?? -1;
      }

      if (valA == null) valA = -999;
      if (valB == null) valB = -999;

      if (typeof valA === 'string' && typeof valB === 'string') {
        return tableDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return tableDir === 'asc' ? valA - valB : valB - valA;
    });

    return list;
  }, [schoolSummaries, schoolSearch, tableSort, tableDir, presentLevelNames]);

  // Definição das colunas da tabela de escolas
  const schoolTableColumns = useMemo(() => {
    const cols = [
      {
        key: 'name',
        label: 'Escola / Unidade',
        sortable: true,
        render: (row) => (
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{row.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
              INEP: {row.inep || '—'} {row.zone ? `· Zona ${row.zone}` : ''}
            </div>
          </div>
        ),
      },
      {
        key: 'evaluated',
        label: 'Avaliados',
        align: 'right',
        sortable: true,
        width: 110,
        render: (row) => (
          <div>
            <strong>{fmtInt(row.evaluated)}</strong>
            {row.enrolled != null && row.enrolled > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>de {fmtInt(row.enrolled)}</div>
            )}
          </div>
        ),
      },
      {
        key: 'participationRate',
        label: 'Participação',
        align: 'right',
        sortable: true,
        width: 120,
        render: (row) =>
          row.participationRate != null ? (
            <Badge variant={row.participationRate >= 80 ? 'green' : row.participationRate >= 60 ? 'yellow' : 'red'}>
              {fmt(row.participationRate, 1)}%
            </Badge>
          ) : (
            '—'
          ),
      },
    ];

    // Adiciona uma coluna para cada nível de desempenho oficial presente (Inadequado, Insuficiente, Insatisfatório, Intermediário, Satisfatório, Avançado)
    for (const lvlName of presentLevelNames) {
      const styling = getLevelColor(lvlName);
      cols.push({
        key: lvlName,
        label: lvlName,
        align: 'right',
        sortable: true,
        width: 130,
        render: (row) => {
          const pl = (row.performanceLevels || []).find((l) => l.level === lvlName);
          if (!pl || pl.percentage == null) return <span style={{ color: 'var(--text-3)' }}>—</span>;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span style={{ fontWeight: 700, color: styling.bg, fontSize: 13 }}>
                {fmt(pl.percentage, 1)}%
              </span>
              {pl.count != null && (
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  {pl.count} al.
                </span>
              )}
            </div>
          );
        },
      });
    }

    cols.push({
      key: 'score',
      label: 'Desempenho Geral',
      align: 'right',
      sortable: true,
      width: 140,
      render: (row) =>
        row.score != null ? (
          <strong style={{ fontSize: 14, color: 'var(--primary)' }}>
            {fmt(row.score, 1)}
          </strong>
        ) : (
          '—'
        ),
    });

    return cols;
  }, [presentLevelNames]);

  if (loading && !dashboard) {
    return <LoadingBlock label="Carregando análises detalhadas do CNCA..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Barra de Filtros */}
      <div className="card card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', background: '#f8fafc' }}>
        <Field label="Ano Escolar / Etapa" style={{ minWidth: 180 }}>
          <Select value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="TODOS">Todas as etapas</option>
            {(filtersData?.grades || ['1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano']).map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </Select>
        </Field>

        <Field label="Avaliação" style={{ minWidth: 180 }}>
          <Select value={assessment} onChange={(e) => setAssessment(e.target.value)}>
            <option value="TODOS">Todas as avaliações</option>
            {(filtersData?.assessments || ['Diagnóstica', 'Formativa 1', 'Formativa 2', 'Somativa']).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </Field>

        <Field label="Componente" style={{ minWidth: 200 }}>
          <Select value={component} onChange={(e) => setComponent(e.target.value)}>
            <option value="TODOS">Todos os componentes</option>
            {Object.entries(COMPONENT_INFO).map(([k, info]) => (
              <option key={k} value={k}>{info.icon} {info.label}</option>
            ))}
          </Select>
        </Field>

        <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setGrade('TODOS'); setAssessment('TODOS'); setComponent('TODOS'); }}
          >
            Limpar filtros
          </Button>
        </div>
      </div>

      {/* 1. DISTRIBUIÇÃO POR NÍVEIS DE DESEMPENHO */}
      <div className="card card-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <div className="card-title">Distribuição Detalhada por Padrões / Níveis de Desempenho</div>
            <div className="card-subtitle">
              Visualização da proporção de estudantes em cada um dos estágios oficiais de desenvolvimento.
            </div>
          </div>

          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 3, gap: 4 }}>
            {Object.entries(COMPONENT_INFO).map(([k, info]) => {
              const isSelected = (component !== 'TODOS' ? component : chartComponent) === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (component !== 'TODOS') setComponent(k);
                    else setChartComponent(k);
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: isSelected ? '#fff' : 'transparent',
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? info.color : 'var(--text-2)',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  {info.icon} {info.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mini Cards dos Níveis / Padrões Detectados */}
        {activeLevels.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(${activeLevels.length >= 6 ? '150px' : '180px'}, 1fr))`,
              gap: 12,
              marginBottom: 20,
            }}
          >
            {activeLevels.map((lvl, idx) => {
              const styling = getLevelColor(lvl.level);
              return (
                <div
                  key={idx}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: styling.lightBg,
                    border: `1px solid ${styling.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: styling.text }}>
                      {lvl.level}
                    </span>
                    <strong style={{ fontSize: 16, color: styling.bg }}>
                      {fmt(lvl.percentage, 1)}%
                    </strong>
                  </div>
                  <div style={{ width: '100%', height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, lvl.percentage || 0))}%`,
                        height: '100%',
                        background: styling.bg,
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  {lvl.count != null && (
                    <div style={{ fontSize: 11, color: styling.text, opacity: 0.85, textAlign: 'right' }}>
                      {fmtInt(lvl.count)} estudante(s)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Gráfico de Barras Horizontais com todos os níveis */}
        {activeLevels.length > 0 ? (
          <div style={{ width: '100%', height: Math.max(220, activeLevels.length * 48 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={activeLevels} margin={{ top: 10, right: 30, left: 30, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis type="category" dataKey="level" tick={{ fontSize: 12.5, fill: '#334155', fontWeight: 600 }} width={160} axisLine={false} />
                <Tooltip
                  formatter={(v, name, props) => [
                    `${fmt(v, 1)}% ${props.payload?.count != null ? `(${fmtInt(props.payload.count)} alunos)` : ''}`,
                    'Distribuição',
                  ]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Bar dataKey="percentage" radius={[0, 6, 6, 0]} maxBarSize={26}>
                  {activeLevels.map((entry, index) => {
                    const styling = getLevelColor(entry.level);
                    return <Cell key={`cell-${index}`} fill={styling.bg} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>
            Nenhum nível com dados disponível para o filtro selecionado.
          </div>
        )}
      </div>

      {/* 2. TABELA COMPARATIVA DETALHADA POR ESCOLA (TODOS OS NÍVEIS) */}
      {schoolSummaries.length > 0 && (
        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div>
              <div className="card-title">Distribuição dos Padrões de Desempenho por Escola</div>
              <div className="card-subtitle">
                Acompanhamento detalhado de cada unidade escolar da rede em todos os padrões e níveis avaliados.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="text"
                className="input"
                placeholder="🔎 Buscar escola ou INEP..."
                value={schoolSearch}
                onChange={(e) => setSchoolSearch(e.target.value)}
                style={{ width: 240, fontSize: 13 }}
              />
            </div>
          </div>

          <DataTable
            columns={schoolTableColumns}
            rows={filteredSchoolSummaries}
            sort={tableSort}
            dir={tableDir}
            onSort={(key, dir) => {
              setTableSort(key);
              setTableDir(dir);
            }}
            emptyTitle="Nenhuma escola encontrada"
            emptyHint="Verifique o termo buscado ou ajuste os filtros acima."
            footer={
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 12, color: 'var(--text-3)' }}>
                <span>{filteredSchoolSummaries.length} de {schoolSummaries.length} escola(s) listada(s)</span>
                <span>Clique nos cabeçalhos para ordenar por qualquer nível de desempenho</span>
              </div>
            }
          />
        </div>
      )}

      {/* 3. PONTOS DE ATENÇÃO PRIORITÁRIA */}
      {criticalSkills.length > 0 && (
        <div className="card card-pad" style={{ background: '#fffafa', borderColor: '#fecaca' }}>
          <div className="card-header-row" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <div className="card-title" style={{ color: '#991b1b', margin: 0 }}>
                  Pontos de Atenção Pedagógica ({criticalSkills.length} habilidades &lt; 50%)
                </div>
                <div className="card-subtitle" style={{ margin: 0 }}>
                  Habilidades com percentual de acerto crítico que demandam reforço escolar prioritário.
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {criticalSkills.map((sk) => (
              <div key={sk.code} style={{ background: '#fff', border: '1px solid #fecaca', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13, color: '#991b1b' }}>{sk.code}</strong>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#dc2626' }}>{fmt(sk.percentage, 1)}%</span>
                </div>
                {sk.name && sk.name !== sk.code && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>{sk.name}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. MATRIZ COMPLETA DE HABILIDADES */}
      {skillsPerformance.length > 0 && (
        <div className="card card-pad">
          <div className="card-header-row" style={{ marginBottom: 14 }}>
            <div>
              <div className="card-title">Habilidades e Descritores da Matriz Oficial</div>
              <div className="card-subtitle">Percentual médio de acertos obtido em cada habilidade avaliada.</div>
            </div>
            {skillsPerformance.length > 8 && (
              <Button variant="secondary" size="sm" onClick={() => setShowAllSkills(!showAllSkills)}>
                {showAllSkills ? 'Recolher' : `Exibir todas (${skillsPerformance.length})`}
              </Button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayedSkills.map((sk) => {
              const isCrit = sk.percentage < 50;
              const barColor = isCrit ? '#dc2626' : sk.percentage >= 70 ? '#16a34a' : '#0284c7';
              return (
                <div key={sk.code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border)', gap: 16 }}>
                  <div style={{ minWidth: 260, flex: 1 }}>
                    <strong style={{ fontSize: 13, color: isCrit ? '#991b1b' : 'var(--text-1)' }}>{sk.code}</strong>
                    {sk.name && sk.name !== sk.code && <span style={{ fontSize: 12.5, color: 'var(--text-2)', marginLeft: 8 }}>· {sk.name}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 200, flex: 1 }}>
                    <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, Math.max(0, sk.percentage))}%`, height: '100%', background: barColor, borderRadius: 999 }} />
                    </div>
                    <strong style={{ fontSize: 13.5, color: barColor, width: 50, textAlign: 'right' }}>{fmt(sk.percentage, 1)}%</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
