import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { dashboardApi, programsApi } from '../services/resources.js';
import { Alert, LoadingBlock, Select, StatCard, Badge, Button } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { EvolutionChart, ComparisonBarChart, ClassificationDonut } from '../components/charts.jsx';
import { CLASSIFICATION_INFO, fmt, fmtInt, yearsRange, PROGRAM_STATUS } from '../utils/format.js';
import { Icon } from '../components/icons.jsx';
import SchoolMap from '../components/SchoolMap.jsx';
import DataTable from '../components/DataTable.jsx';

export default function Dashboard() {
  const [year, setYear] = useState('');
  const [programId, setProgramId] = useState('');
  const { data: programs } = useApi(() => programsApi.list({ pageSize: 1000 }), []);
  const { data, loading } = useApi(
    () => dashboardApi.get({ year: year || undefined, programId: programId || undefined }),
    [year, programId],
  );

  const selectedProgram = data?.selectedProgram;
  const isPacto = selectedProgram?.isPacto || Boolean(data?.pacto);

  return (
    <>
      <PageHeader
        title="Dashboard — Estatística"
        subtitle="Visão gerencial consolidada e estatísticas oficiais de todos os programas educacionais"
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select
              value={programId}
              onChange={(event) => {
                const newId = event.target.value;
                setProgramId(newId);
                const p = (programs?.data || []).find((item) => item.id === newId);
                if (p?.year) setYear(String(p.year));
              }}
              style={{ minWidth: 260 }}
            >
              <option value="">Visão consolidada — Todos os programas</option>
              {(programs?.data || []).map((program) => (
                <option key={program.id} value={program.id}>
                  {program.code} — {program.name} ({program.year})
                </option>
              ))}
            </Select>
            <Select value={year} onChange={(event) => setYear(event.target.value)} style={{ width: 130 }}>
              <option value="">Ano automático</option>
              {yearsRange(2023).map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </div>
        }
      />

      {loading || !data ? (
        <LoadingBlock label="Calculando indicadores consolidados..." />
      ) : (
        <>
          {/* Alerta de contexto */}
          {!selectedProgram ? (
            <Alert type="info">
              Visão consolidada da rede municipal: acompanhamento unificado de escolas participantes, dados avaliativos e alunos atendidos em todos os programas. Selecione um programa acima para analisar seus critérios, gráficos e ranking detalhado.
            </Alert>
          ) : isPacto ? (
            <div style={{ padding: '12px 16px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong style={{ color: '#065f46', fontSize: 14 }}>📘 Programa em exibição: {selectedProgram.name}</strong>
                <div style={{ fontSize: 12.5, color: '#047857', marginTop: 2 }}>
                  Instrumento com coleta de turmas em 3 etapas (PII, 1º Ano e 2º Ano) e avaliação formativa de habilidades.
                </div>
              </div>
              <Link to={`/programas/${selectedProgram.id}`} className="btn btn-primary btn-sm">
                Abrir painel completo do Pacto →
              </Link>
            </div>
          ) : (
            <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong style={{ color: '#1e40af', fontSize: 14 }}>📊 Programa em exibição: {selectedProgram.name} ({selectedProgram.year})</strong>
                <div style={{ fontSize: 12.5, color: '#1d4ed8', marginTop: 2 }}>
                  Acompanhamento de metas e critérios avaliativos cadastrados no programa.
                </div>
              </div>
              <Link to={`/programas/${selectedProgram.id}`} className="btn btn-primary btn-sm">
                Ver detalhes do programa →
              </Link>
            </div>
          )}

          {/* Cards de KPIs */}
          <div className="stats-grid">
            <StatCard
              icon={Icon.program()}
              label="Programas ativos"
              value={data.kpis.programsActive}
              hint={`${data.kpis.programsTotal} cadastrados no catálogo`}
              tone="blue"
            />
            <StatCard
              icon={Icon.school()}
              label="Escolas no município"
              value={fmtInt(data.kpis.schoolsTotal)}
              hint="Cadastro oficial"
              tone="cyan"
            />
            <StatCard
              icon={Icon.check()}
              label={selectedProgram ? `Escolas em ${selectedProgram.name.split(' ')[0]}` : 'Escolas participantes'}
              value={fmtInt(data.kpis.participatingSchools)}
              hint={data.kpis.schoolsTotal > 0 ? `${Math.round((data.kpis.participatingSchools / data.kpis.schoolsTotal) * 100)}% da rede atendida` : undefined}
              tone="violet"
            />
            <StatCard
              icon={Icon.users()}
              label="Alunos avaliados"
              value={fmtInt(data.kpis.studentsEvaluated)}
              hint={data.kpis.studentsEnrolled > 0 ? `${fmtInt(data.kpis.studentsEnrolled)} matriculados (${Math.round((data.kpis.studentsEvaluated / data.kpis.studentsEnrolled) * 100)}%)` : 'Dados consolidados'}
              tone="green"
            />
            <StatCard
              icon={Icon.result()}
              label="Resultados lançados"
              value={fmtInt(data.kpis.resultsTotal)}
              hint={`${data.kpis.resultsThisYear} no ciclo ${data.year}`}
              tone="yellow"
            />
            {isPacto ? (
              <StatCard
                icon={Icon.trophy()}
                label="Índice de proficiência"
                value={data.kpis.pactoScore != null ? `${data.kpis.pactoScore}%` : '—'}
                hint={`${data.kpis.pactoParticipation ?? 0}% de participação`}
                tone="green"
              />
            ) : selectedProgram ? (
              <StatCard
                icon={Icon.goal()}
                label="Metas atingidas"
                value={fmtInt(data.kpis.goalsMet)}
                hint={`${data.kpis.goalsNotMet} não atingidas`}
                tone={data.kpis.goalsMet >= data.kpis.goalsNotMet ? 'green' : 'red'}
              />
            ) : (
              <StatCard
                icon={Icon.indicator()}
                label="Critérios e habilidades"
                value={fmtInt(data.kpis.indicatorsActive)}
                hint="Critérios ativos"
                tone="blue"
              />
            )}
          </div>

          {/* Mapa de escolas */}
          <SchoolMap schools={data.map?.schools || []} />

          {/* Gráfico Geral: Comparação de Desempenho entre todos os Programas */}
          {!selectedProgram && (
            <>
              <div style={{ marginBottom: 16 }}>
                <ComparisonBarChart
                  title="Desempenho por programa"
                  subtitle="Pontuação média de cada programa calculada com base em seus critérios e avaliações oficiais"
                  data={data.charts.performanceByProgram.map((program) => ({
                    name: program.fullName || program.name,
                    score: program.score,
                  }))}
                />
              </div>

              {/* Tabela de Programas Cadastrados */}
              <div className="card card-pad" style={{ marginBottom: 16 }}>
                <div className="card-header-row">
                  <div>
                    <div className="card-title">📋 Programas educacionais em execução</div>
                    <div className="card-subtitle">Visão consolidada de escolas participantes e resultados por programa.</div>
                  </div>
                  <Link to="/programas" className="btn btn-secondary btn-sm">
                    Gerenciar programas →
                  </Link>
                </div>

                <DataTable
                  columns={[
                    { key: 'code', label: 'Código', render: (p) => <span className="mono">{p.code}</span> },
                    { key: 'name', label: 'Programa', render: (p) => <strong>{p.name}</strong> },
                    { key: 'year', label: 'Ciclo', align: 'center', render: (p) => p.year },
                    {
                      key: 'status', label: 'Status', align: 'center',
                      render: (p) => {
                        const info = PROGRAM_STATUS[p.status];
                        return <Badge cls={info?.cls}>{info?.label || p.status}</Badge>;
                      },
                    },
                    { key: 'schoolsCount', label: 'Escolas', align: 'center', render: (p) => fmtInt(p.schoolsCount) },
                    {
                      key: 'students', label: 'Alunos avaliados', align: 'center',
                      render: (p) => p.studentsEvaluated != null ? <strong>{fmtInt(p.studentsEvaluated)}</strong> : '—',
                    },
                    { key: 'resultsCount', label: 'Resultados', align: 'center', render: (p) => fmtInt(p.resultsCount) },
                    {
                      key: 'actions', label: '', align: 'right',
                      render: (p) => (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <Button size="sm" variant="secondary" onClick={() => setProgramId(p.id)}>
                            Ver no painel
                          </Button>
                          <Link to={`/programas/${p.id}`} className="btn btn-ghost btn-sm">
                            Detalhes
                          </Link>
                        </div>
                      ),
                    },
                  ]}
                  rows={data.programsSummary || []}
                  emptyTitle="Nenhum programa cadastrado"
                  emptyIcon="📋"
                />
              </div>
            </>
          )}

          {/* Seção Específica do Pacto pela Alfabetização */}
          {selectedProgram && isPacto && (
            <>
              <div className="chart-grid" style={{ marginBottom: 16 }}>
                <ClassificationDonut
                  title="Distribuição dos alunos por nível"
                  subtitle={`Consolidado de habilidades em ${data.year}`}
                  distribution={Object.fromEntries(
                    data.charts.distribution.map((entry) => [entry.classification, entry.count]),
                  )}
                />
                <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div className="card-title">📈 Síntese pedagógica do Pacto</div>
                  <div className="card-subtitle" style={{ marginBottom: 14 }}>
                    Resultados obtidos nas turmas de Pré-Escola II (PII), 1º Ano e 2º Ano do Ensino Fundamental.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>ALUNOS AVALIADOS</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>
                        {fmtInt(data.pacto?.evaluated || data.kpis.studentsEvaluated)}
                      </div>
                    </div>
                    <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>TAXA DE PARTICIPAÇÃO</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--success)' }}>
                        {data.pacto?.participationPercentage ?? data.kpis.pactoParticipation ?? 0}%
                      </div>
                    </div>
                    <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>TURMAS CADASTRADAS</div>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>
                        {data.pacto?.classesCount || 0}
                      </div>
                    </div>
                    <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>ESCOLAS PARTICIPANTES</div>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>
                        {data.pacto?.participatingSchools || data.kpis.participatingSchools}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ranking Escolar do Pacto */}
              <div className="card card-pad" style={{ marginBottom: 16 }}>
                <div className="card-header-row">
                  <div>
                    <div className="card-title">🏆 Top Escolas — {selectedProgram.name}</div>
                    <div className="card-subtitle">
                      Classificação calculada por proficiência (50%), participação (20%) e completude das etapas (30%).
                    </div>
                  </div>
                  <Link to={`/programas/${selectedProgram.id}`} className="btn btn-secondary btn-sm">
                    Ver dashboard completo do Pacto →
                  </Link>
                </div>

                {data.charts.topSchools?.length ? (
                  <div className="pacto-ranking-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginTop: 12 }}>
                    {data.charts.topSchools.map((school) => (
                      <div
                        key={school.schoolId}
                        className={`pacto-ranking-card ${school.position === 1 ? 'rank-1' : school.position === 2 ? 'rank-2' : school.position === 3 ? 'rank-3' : ''}`}
                      >
                        <div>
                          <div className="pacto-rank-top">
                            <span className="pacto-rank-badge">
                              {school.position === 1 ? '🥇 1º' : school.position === 2 ? '🥈 2º' : school.position === 3 ? '🥉 3º' : `${school.position}º`}
                            </span>
                            <div style={{ textAlign: 'right' }}>
                              <span
                                className="pacto-rank-score"
                                style={{ background: school.situation?.cls === 'badge-green' ? '#dcfce7' : '#fef3c7', color: school.situation?.cls === 'badge-green' ? '#15803d' : '#b45309' }}
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

                          <h4 style={{ margin: '8px 0 4px', fontSize: 14 }}>{school.name}</h4>
                          <div style={{ color: 'var(--text-3)', fontSize: 11 }}>INEP {school.inep || '—'}</div>

                          <div style={{ margin: '8px 0', padding: '6px 10px', background: school.isComplete ? '#ecfdf5' : '#fffbeb', borderRadius: 6, border: `1px solid ${school.isComplete ? '#a7f3d0' : '#fde68a'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
                              <span><strong>Avaliações:</strong> {school.completenessLabel || '—'}</span>
                              <Badge cls={school.isComplete ? 'badge-green' : 'badge-yellow'}>
                                {school.isComplete ? '✅ Completo' : '⚠️ Incompleto'}
                              </Badge>
                            </div>
                            {!school.isComplete && school.missingAssessments?.length > 0 && (
                              <div style={{ fontSize: 10.5, color: '#b45309', marginTop: 3, fontWeight: 500 }}>
                                ⏳ Pendente: {school.missingAssessments.join(', ')}
                              </div>
                            )}
                          </div>

                          <div className="pacto-rank-stats" style={{ fontSize: 11.5 }}>
                            <div>👥 <strong>{school.enrolled || 0}</strong> matriculados · 📝 <strong>{school.evaluated || 0}</strong> avaliados</div>
                            <div>📈 <strong>{school.participationPercentage ?? 0}%</strong> de participação</div>
                          </div>
                        </div>

                        <Link
                          to={`/programas/${selectedProgram.id}`}
                          className="btn btn-secondary btn-sm"
                          style={{ width: '100%', textAlign: 'center', marginTop: 10 }}
                        >
                          Ver no programa
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="card card-pad table-empty">
                    Nenhuma escola com dados avaliativos consolidados no momento. O ranking será gerado automaticamente quando as planilhas do Pacto forem importadas.
                  </div>
                )}
              </div>
            </>
          )}

          {/* Seção de Programas Genéricos */}
          {selectedProgram && !isPacto && (
            <>
              <div className="chart-grid" style={{ marginBottom: 16 }}>
                <EvolutionChart
                  title={`Evolução — ${selectedProgram.name}`}
                  subtitle={`Percentual de atingimento das metas configuradas · ${data.year}`}
                  data={data.charts.evolution}
                />
                <ClassificationDonut
                  title={`Classificação — ${selectedProgram.name}`}
                  subtitle={`Último período de ${data.year}`}
                  distribution={Object.fromEntries(
                    data.charts.distribution.map((entry) => [entry.classification, entry.count]),
                  )}
                />
              </div>

              <div className="card card-pad">
                <div className="card-header-row">
                  <div>
                    <div className="card-title">Ranking — {selectedProgram.name}</div>
                    <div className="card-subtitle">Escolas avaliadas com base nos critérios e metas deste programa</div>
                  </div>
                  <Link to={`/rankings?programId=${selectedProgram.id}`} className="btn btn-secondary btn-sm">
                    Ver ranking completo →
                  </Link>
                </div>

                {data.charts.topSchools?.length ? (
                  data.charts.topSchools.map((school) => (
                    <div key={school.schoolId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px dashed var(--border)' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', fontWeight: 800, background: school.position === 1 ? '#fde68a' : school.position === 2 ? '#e2e8f0' : school.position === 3 ? '#fed7aa' : '#f1f5f9' }}>
                        {school.position}
                      </div>
                      <div style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{school.name}</div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{fmt(school.score)}%</div>
                        <Badge cls={CLASSIFICATION_INFO[school.classification]?.cls}>
                          {school.classification} · {CLASSIFICATION_INFO[school.classification]?.label}
                        </Badge>
                      </div>
                      <Link to={`/programas/${selectedProgram.id}/escolas/${school.schoolId}`} className="btn btn-ghost btn-sm">
                        Abrir
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">Sem resultados e metas suficientes cadastrados neste programa.</div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

