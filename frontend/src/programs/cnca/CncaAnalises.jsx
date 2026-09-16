import React, { useState, useMemo } from 'react';
import CncaLevelsDistribution, {
  COMPONENT_INFO,
  getLevelColor,
  getLevelRank,
  pickComponentLevels,
} from './CncaLevelsDistribution.jsx';
import { useApi } from '../../hooks/useApi.js';
import { cncaApi } from '../../services/resources.js';
import { Badge, Field, LoadingBlock, Select, Button, Input } from '../../components/ui.jsx';
import { fmt, fmtInt } from '../../utils/format.js';
import DataTable from '../../components/DataTable.jsx';

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

  const activeLevels = useMemo(
    () =>
      pickComponentLevels({
        levelsByComponent,
        levelsDistribution,
        component,
        chartComponent,
      }),
    [component, chartComponent, levelsByComponent, levelsDistribution],
  );

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
        <CncaLevelsDistribution
          levels={activeLevels}
          selectedComponent={component !== 'TODOS' ? component : chartComponent}
          onSelectComponent={(k) => {
            if (component !== 'TODOS') setComponent(k);
            else setChartComponent(k);
          }}
        />
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
        <div className="card card-pad" style={{ background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <div className="card-header-row" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <div className="card-title" style={{ color: '#ef4444', margin: 0 }}>
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
              <div key={sk.code} style={{ background: 'var(--surface-2)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13, color: 'var(--danger)' }}>{sk.code}</strong>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--danger)' }}>{fmt(sk.percentage, 1)}%</span>
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
                <div key={sk.code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)', gap: 16 }}>
                  <div style={{ minWidth: 260, flex: 1 }}>
                    <strong style={{ fontSize: 13, color: isCrit ? 'var(--danger)' : 'var(--text-1)' }}>{sk.code}</strong>
                    {sk.name && sk.name !== sk.code && <span style={{ fontSize: 12.5, color: 'var(--text-2)', marginLeft: 8 }}>· {sk.name}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 200, flex: 1 }}>
                    <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
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
