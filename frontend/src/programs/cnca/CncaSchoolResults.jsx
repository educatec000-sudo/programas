import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { cncaApi } from '../../services/resources.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { Badge, Button, Field, LoadingBlock, Modal, Select, StatCard, Input } from '../../components/ui.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

const COMPONENT_TABS = [
  { key: 'MATEMATICA', label: 'Matemática', icon: '📐', color: '#0284c7' },
  { key: 'LEITURA', label: 'Leitura', icon: '📖', color: '#6366f1' },
  { key: 'ESCRITA', label: 'Escrita', icon: '✍️', color: '#8b5cf6' },
  { key: 'FLUENCIA', label: 'Fluência', icon: '🗣️', color: '#0ea5e9' },
];

export default function CncaSchoolResults({ program }) {
  const { toast, success, error } = useToast();

  // Modo de exibição: 'DETAIL' (Análise por Escola) | 'MANAGE' (Gerenciamento em Lote)
  const [viewMode, setViewMode] = useState('DETAIL');

  // Estado da visão detalhada por escola
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedAssessment, setSelectedAssessment] = useState('');
  const [activeComponent, setActiveComponent] = useState('MATEMATICA');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [showRawDetails, setShowRawDetails] = useState(false);

  // Estado da visão em lote
  const [manageComponent, setManageComponent] = useState('TODOS');
  const [manageGrade, setManageGrade] = useState('TODOS');
  const [manageAssessment, setManageAssessment] = useState('TODOS');
  const [manageStatus, setManageStatus] = useState('ALL');
  const [manageSearch, setManageSearch] = useState('');
  const [selectedResultIds, setSelectedResultIds] = useState(new Set());

  // Modais de confirmação de exclusão / publicação
  const [deletingResult, setDeletingResult] = useState(null); // single item
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteType, setBulkDeleteType] = useState('SELECTED'); // 'SELECTED' | 'COMPONENT' | 'DRAFTS' | 'ALL'
  const [isProcessing, setIsProcessing] = useState(false);

  // Filtros gerais e lista de escolas
  const { data: filtersData, loading: loadingFilters, refresh: refreshFilters } = useApi(
    () => cncaApi.filters(program.id),
    [program.id],
  );

  // Lista de todos os resultados da escola selecionada
  const { data: schoolDetail, loading: loadingSchool, refresh: refreshSchool } = useApi(
    () => (selectedSchoolId ? cncaApi.singleSchoolDetail(program.id, selectedSchoolId) : Promise.resolve(null)),
    [program.id, selectedSchoolId],
  );

  // Lista completa de resultados para a visão em lote
  const { data: allResults, loading: loadingAllResults, refresh: refreshAllResults } = useApi(
    () => cncaApi.schoolResults(program.id, {
      component: manageComponent !== 'TODOS' ? manageComponent : undefined,
      grade: manageGrade !== 'TODOS' ? manageGrade : undefined,
      assessment: manageAssessment !== 'TODOS' ? manageAssessment : undefined,
      status: manageStatus !== 'ALL' ? manageStatus : undefined,
      search: manageSearch.trim() || undefined,
    }),
    [program.id, manageComponent, manageGrade, manageAssessment, manageStatus, manageSearch],
  );

  const schools = filtersData?.schools || [];

  // Seleciona primeira escola por padrão quando carregar
  React.useEffect(() => {
    if (!selectedSchoolId && schools.length > 0) {
      setSelectedSchoolId(schools[0].id);
    }
  }, [schools, selectedSchoolId]);

  // Recarrega todos os dados após alterações
  const refreshAll = () => {
    refreshFilters();
    refreshSchool();
    refreshAllResults();
    setSelectedResultIds(new Set());
  };

  // Exclusão individual
  const handleDeleteSingle = async () => {
    if (!deletingResult) return;
    setIsProcessing(true);
    try {
      const res = await cncaApi.deleteResult(program.id, deletingResult.id);
      success(res.message || 'Resultado excluído com sucesso.');
      setDeletingResult(null);
      refreshAll();
    } catch (err) {
      error(err.message || 'Erro ao excluir resultado.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Exclusão em lote
  const handleBulkDeleteConfirm = async () => {
    setIsProcessing(true);
    try {
      let payload = {};
      if (bulkDeleteType === 'SELECTED') {
        payload = { resultIds: Array.from(selectedResultIds) };
      } else if (bulkDeleteType === 'COMPONENT') {
        payload = { component: manageComponent };
      } else if (bulkDeleteType === 'DRAFTS') {
        payload = { status: 'RASCUNHO' };
      } else if (bulkDeleteType === 'ALL') {
        payload = {};
      }

      const res = await cncaApi.bulkDeleteResults(program.id, payload);
      success(res.message || 'Resultados excluídos com sucesso.');
      setBulkDeleteModalOpen(false);
      refreshAll();
    } catch (err) {
      error(err.message || 'Erro ao excluir resultados em lote.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Publicar rascunhos (individual ou em lote)
  const handlePublish = async (resultIds = null) => {
    setIsProcessing(true);
    try {
      const payload = resultIds ? { resultIds } : { resultIds: Array.from(selectedResultIds) };
      const res = await cncaApi.publishResults(program.id, payload);
      success(res.message || 'Rascunhos consolidados com sucesso!');
      refreshAll();
    } catch (err) {
      error(err.message || 'Erro ao publicar rascunhos.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Filtra lista de escolas pelo campo de busca
  const filteredSchoolList = useMemo(() => {
    if (!schoolSearch.trim()) return schools;
    const q = schoolSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return schools.filter((s) => {
      const name = (s.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const inep = String(s.inep || '');
      return name.includes(q) || inep.includes(q);
    });
  }, [schools, schoolSearch]);

  const schoolResults = schoolDetail?.results || [];

  // Etapas disponíveis para a escola selecionada
  const availableGrades = useMemo(() => {
    const set = new Set(schoolResults.map((r) => r.grade));
    const list = Array.from(set).sort();
    return list.length ? list : (filtersData?.grades || ['2º Ano']);
  }, [schoolResults, filtersData]);

  // Avaliações disponíveis para a escola selecionada
  const availableAssessments = useMemo(() => {
    const set = new Set(schoolResults.map((r) => r.assessment));
    const list = Array.from(set);
    return list.length ? list : (filtersData?.assessments || ['Diagnóstica']);
  }, [schoolResults, filtersData]);

  const activeGrade = selectedGrade || availableGrades[0] || '2º Ano';
  const activeAssessment = selectedAssessment || availableAssessments[0] || 'Diagnóstica';

  // Resultado específico para o componente, etapa e avaliação ativos
  const currentResult = useMemo(() => {
    return schoolResults.find(
      (r) =>
        r.component === activeComponent &&
        (r.grade === activeGrade || !selectedGrade) &&
        (r.assessment === activeAssessment || !selectedAssessment),
    ) || schoolResults.find((r) => r.component === activeComponent) || null;
  }, [schoolResults, activeComponent, activeGrade, activeAssessment, selectedGrade, selectedAssessment]);

  // Seleção de linhas em lote
  const toggleSelectAll = () => {
    if (!allResults?.length) return;
    if (selectedResultIds.size === allResults.length) {
      setSelectedResultIds(new Set());
    } else {
      setSelectedResultIds(new Set(allResults.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id) => {
    const next = new Set(selectedResultIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedResultIds(next);
  };

  const selectedDraftsCount = useMemo(() => {
    if (!allResults) return 0;
    return allResults.filter((r) => selectedResultIds.has(r.id) && r.source === 'RASCUNHO').length;
  }, [allResults, selectedResultIds]);

  if (loadingFilters && !filtersData) {
    return <LoadingBlock label="Carregando escolas e resultados do CNCA..." />;
  }

  const selectedSchool = schools.find((s) => s.id === selectedSchoolId) || schoolDetail?.school;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Barra de alternância de modo de visualização */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 8, padding: 3, gap: 4 }}>
          <button
            type="button"
            onClick={() => setViewMode('DETAIL')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: viewMode === 'DETAIL' ? '#fff' : 'transparent',
              fontWeight: viewMode === 'DETAIL' ? 600 : 400,
              color: viewMode === 'DETAIL' ? 'var(--primary)' : 'var(--text-2)',
              cursor: 'pointer',
              fontSize: 13,
              boxShadow: viewMode === 'DETAIL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            📊 Análise por Escola
          </button>
          <button
            type="button"
            onClick={() => setViewMode('MANAGE')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: viewMode === 'MANAGE' ? '#fff' : 'transparent',
              fontWeight: viewMode === 'MANAGE' ? 600 : 400,
              color: viewMode === 'MANAGE' ? 'var(--primary)' : 'var(--text-2)',
              cursor: 'pointer',
              fontSize: 13,
              boxShadow: viewMode === 'MANAGE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            📋 Gerenciamento de Dados Importados (Lote)
          </button>
        </div>

        {viewMode === 'MANAGE' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button
              variant="secondary"
              onClick={() => { setBulkDeleteType('DRAFTS'); setBulkDeleteModalOpen(true); }}
              style={{ fontSize: 12, color: '#c2410c', borderColor: '#fed7aa' }}
            >
              🧹 Limpar Todos os Rascunhos
            </Button>
            {manageComponent !== 'TODOS' && (
              <Button
                variant="secondary"
                onClick={() => { setBulkDeleteType('COMPONENT'); setBulkDeleteModalOpen(true); }}
                style={{ fontSize: 12, color: '#dc2626', borderColor: '#fecaca' }}
              >
                🗑️ Limpar {manageComponent}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* MODO 1: ANÁLISE DETALHADA POR ESCOLA */}
      {viewMode === 'DETAIL' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'flex-start' }}>
          {/* Coluna Esquerda: Lista de Escolas */}
          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div className="card-title" style={{ fontSize: 15 }}>Escolas Participantes</div>
              <div className="card-subtitle">{schools.length} escolas vinculadas ao programa</div>
            </div>

            <input
              type="text"
              className="input"
              placeholder="🔎 Buscar por nome ou INEP..."
              value={schoolSearch}
              onChange={(e) => setSchoolSearch(e.target.value)}
              style={{ fontSize: 12.5 }}
            />

            <div style={{ maxHeight: 600, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filteredSchoolList.map((s) => {
                const isSelected = s.id === selectedSchoolId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSchoolId(s.id)}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                      background: isSelected ? '#eff6ff' : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                  >
                    <strong style={{ fontSize: 13, color: isSelected ? 'var(--primary)' : 'var(--text-1)' }}>
                      {s.name}
                    </strong>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'flex', gap: 8 }}>
                      <span>INEP: {s.inep || '—'}</span>
                      {s.zone && <span>· {s.zone}</span>}
                    </div>
                  </button>
                );
              })}
              {!filteredSchoolList.length && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>
                  Nenhuma escola encontrada.
                </div>
              )}
            </div>
          </div>

          {/* Coluna Direita: Resultados Detalhados da Escola */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selectedSchool ? (
              <>
                {/* Cabeçalho da Escola */}
                <div className="card card-pad" style={{ background: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{selectedSchool.name}</h2>
                        {currentResult && (
                          <Badge cls={currentResult.source === 'RASCUNHO' ? 'badge-yellow' : 'badge-green'}>
                            {currentResult.source === 'RASCUNHO' ? '🟡 Rascunho' : '🟢 Consolidado'}
                          </Badge>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-2)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span>INEP: <strong className="mono">{selectedSchool.inep || '—'}</strong></span>
                        {selectedSchool.zone && <span>Zona: <strong>{selectedSchool.zone}</strong></span>}
                        {selectedSchool.district && <span>Bairro: <strong>{selectedSchool.district}</strong></span>}
                        {selectedSchool.address && <span>Endereço: {selectedSchool.address}</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <Field label="Etapa / Ano Escolar" style={{ margin: 0 }}>
                        <Select value={activeGrade} onChange={(e) => setSelectedGrade(e.target.value)} style={{ fontSize: 12.5 }}>
                          {availableGrades.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Avaliação" style={{ margin: 0 }}>
                        <Select value={activeAssessment} onChange={(e) => setSelectedAssessment(e.target.value)} style={{ fontSize: 12.5 }}>
                          {availableAssessments.map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </Select>
                      </Field>

                      {currentResult && (
                        <div style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                          {currentResult.source === 'RASCUNHO' && (
                            <Button
                              variant="secondary"
                              onClick={() => handlePublish([currentResult.id])}
                              style={{ fontSize: 12, padding: '6px 10px', height: 34, background: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}
                              title="Publicar este rascunho como resultado oficial"
                            >
                              🚀 Publicar
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            onClick={() => setDeletingResult(currentResult)}
                            style={{ fontSize: 12, padding: '6px 10px', height: 34, color: '#dc2626', borderColor: '#fecaca' }}
                            title="Excluir este resultado"
                          >
                            🗑️
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Abas dos 4 Componentes Oficiais */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14, overflowX: 'auto' }}>
                    {COMPONENT_TABS.map((comp) => {
                      const compRes = schoolResults.find((r) => r.component === comp.key);
                      const hasDataForComp = Boolean(compRes);
                      const isActive = activeComponent === comp.key;
                      return (
                        <button
                          key={comp.key}
                          type="button"
                          onClick={() => setActiveComponent(comp.key)}
                          className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 13,
                            fontWeight: isActive ? 600 : 400,
                          }}
                        >
                          <span>{comp.icon}</span>
                          <span>{comp.label}</span>
                          {hasDataForComp ? (
                            <span style={{ fontSize: 10, background: compRes?.source === 'RASCUNHO' ? '#fde68a' : (isActive ? '#ffffff33' : '#e2e8f0'), color: compRes?.source === 'RASCUNHO' ? '#b45309' : 'inherit', padding: '1px 5px', borderRadius: 10 }}>
                              {compRes?.source === 'RASCUNHO' ? 'Rascunho' : '✓'}
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>—</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {loadingSchool ? (
                  <LoadingBlock label="Carregando resultados da escola..." />
                ) : currentResult ? (
                  <>
                    {/* Métricas Principais do Componente */}
                    <div className="stats-grid">
                      {currentResult.evaluated != null && (
                        <StatCard
                          icon="👥"
                          label="Estudantes Avaliados"
                          value={fmtInt(currentResult.evaluated)}
                          hint={currentResult.enrolled ? `de ${fmtInt(currentResult.enrolled)} matriculados` : 'Participantes avaliados'}
                          tone="blue"
                        />
                      )}
                      {currentResult.participationRate != null && (
                        <StatCard
                          icon="📊"
                          label="Taxa de Participação"
                          value={`${fmt(currentResult.participationRate, 1)}%`}
                          hint={currentResult.participationRate >= 80 ? 'Cobertura adequada (≥80%)' : 'Abaixo da meta recomendada'}
                          tone={currentResult.participationRate >= 80 ? 'green' : 'amber'}
                        />
                      )}
                      {currentResult.averageScore != null && (
                        <StatCard
                          icon="🎯"
                          label={activeComponent === 'ESCRITA' ? 'Nota Média' : 'Proficiência Média'}
                          value={fmt(currentResult.averageScore, 1)}
                          hint="Escala oficial da avaliação"
                          tone="indigo"
                        />
                      )}
                      {currentResult.fluentRate != null && (
                        <StatCard
                          icon={activeComponent === 'ESCRITA' ? '✍️' : '🗣️'}
                          label={activeComponent === 'ESCRITA' ? '% Nível Alfabético' : '% Alunos Fluentes'}
                          value={`${fmt(currentResult.fluentRate, 1)}%`}
                          hint="Alcançaram o nível esperado"
                          tone="green"
                        />
                      )}
                      {currentResult.pcpm != null && (
                        <StatCard
                          icon="🗣️"
                          label="PCPM Médio"
                          value={`${fmt(currentResult.pcpm, 1)} ppm`}
                          hint={currentResult.accuracyRate != null ? `${fmt(currentResult.accuracyRate, 1)}% de precisão leitora` : 'Palavras corretas por minuto'}
                          tone="violet"
                        />
                      )}
                    </div>

                    {/* Distribuição dos Níveis de Desempenho Oficiais */}
                    {Array.isArray(currentResult.performanceLevels) && currentResult.performanceLevels.length > 0 && (
                      <div className="card card-pad">
                        <div className="card-title" style={{ marginBottom: 12 }}>
                          Distribuição por Níveis de Desempenho ({currentResult.component})
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                          {currentResult.performanceLevels.map((lvl, idx) => {
                            const norm = (lvl.level || '').toLowerCase();
                            let barColor = '#6b7280';
                            if (norm.includes('avançado') || norm.includes('avancado') || norm.includes('fluente') || norm.includes('alfabético') || norm.includes('alfabetico') || norm === 'alto') {
                              barColor = '#059669';
                            } else if (norm.includes('adequado') || norm.includes('silábico-alfabético') || norm.includes('silabico-alfabetico') || norm === 'médio' || norm === 'medio') {
                              barColor = '#0284c7';
                            } else if (norm.includes('básico') || norm.includes('basico') || norm.includes('iniciante') || norm.includes('silábico') || norm.includes('silabico') || norm === 'baixo') {
                              barColor = '#d97706';
                            } else if (norm.includes('abaixo') || norm.includes('não leitor') || norm.includes('nao leitor') || norm.includes('pré-leitor') || norm.includes('pre-leitor') || norm.includes('pré-silábico') || norm.includes('pre-silabico') || norm.includes('defasagem') || norm.includes('inadequado') || norm.includes('muito baixo')) {
                              barColor = '#dc2626';
                            }

                            return (
                              <div
                                key={idx}
                                style={{
                                  padding: '12px 14px',
                                  borderRadius: 8,
                                  border: '1px solid var(--border)',
                                  background: '#fff',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 6,
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: 13, fontWeight: 600 }}>{lvl.level}</span>
                                  <strong style={{ fontSize: 15, color: barColor }}>{fmt(lvl.percentage, 1)}%</strong>
                                </div>
                                <div style={{ width: '100%', height: 7, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.min(100, Math.max(0, lvl.percentage || 0))}%`, height: '100%', background: barColor }} />
                                </div>
                                {lvl.count != null && (
                                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', textAlign: 'right' }}>
                                    {lvl.count} aluno(s)
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Habilidades e Descritores Oficiais da Matriz */}
                    {Array.isArray(currentResult.skills) && currentResult.skills.length > 0 && (
                      <div className="card card-pad">
                        <div className="card-header-row" style={{ marginBottom: 12 }}>
                          <div>
                            <div className="card-title">Habilidades e Descritores da Matriz Oficial</div>
                            <div className="card-subtitle">
                              Percentual de acerto dos estudantes da escola em cada habilidade avaliada.
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                          {currentResult.skills.map((sk) => {
                            const isCrit = (sk.percentage || 0) < 50;
                            const barColor = isCrit ? '#dc2626' : (sk.percentage || 0) >= 70 ? '#059669' : '#0284c7';
                            return (
                              <div
                                key={sk.code}
                                style={{
                                  padding: '10px 12px',
                                  borderRadius: 8,
                                  border: isCrit ? '1px solid #fecaca' : '1px solid var(--border)',
                                  background: isCrit ? '#fef2f2' : '#fff',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 6,
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: isCrit ? '#991b1b' : 'var(--text-1)' }}>
                                    {sk.code} {sk.name && sk.name !== sk.code ? `· ${sk.name}` : ''}
                                  </span>
                                  <strong style={{ fontSize: 14, color: barColor }}>{fmt(sk.percentage, 1)}%</strong>
                                </div>
                                <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.min(100, Math.max(0, sk.percentage || 0))}%`, height: '100%', background: barColor }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Visualizador de Colunas Oficiais Preservadas */}
                    {currentResult.rawDetails && Object.keys(currentResult.rawDetails).length > 0 && (
                      <div className="card card-pad">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div className="card-title" style={{ fontSize: 14 }}>Dados Brutos da Planilha Oficial</div>
                            <div className="card-subtitle">Todos os campos e colunas originais exportados do sistema oficial.</div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowRawDetails(!showRawDetails)}
                          >
                            {showRawDetails ? 'Ocultar detalhes' : 'Exibir colunas brutas'}
                          </button>
                        </div>

                        {showRawDetails && (
                          <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: '#f8fafc' }}>
                            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-3)' }}>
                                  <th style={{ padding: '6px 8px' }}>Coluna Oficial</th>
                                  <th style={{ padding: '6px 8px' }}>Valor Registrado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(currentResult.rawDetails).map(([k, v]) => (
                                  <tr key={k} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--text-2)' }}>{k}</td>
                                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{String(v)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="card card-pad" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)' }}>
                      Nenhum resultado de {COMPONENT_TABS.find((c) => c.key === activeComponent)?.label} encontrado para esta escola em {activeGrade} ({activeAssessment}).
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      Importe a planilha oficial correspondente na aba <strong>"Importar Planilha Oficial"</strong>.
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="card card-pad" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
                Selecione uma escola ao lado para visualizar os resultados.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* MODO 2: GERENCIAMENTO DE DADOS IMPORTADOS EM LOTE */
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card-header-row">
            <div>
              <div className="card-title">Gerenciamento e Exclusão em Lote dos Dados Importados</div>
              <div className="card-subtitle">
                Selecione linhas individuais ou filtre por componente para excluir registros ou publicar rascunhos.
              </div>
            </div>
          </div>

          {/* Barra de Filtros em Lote */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
            <Field label="Componente" style={{ margin: 0 }}>
              <Select value={manageComponent} onChange={(e) => setManageComponent(e.target.value)} style={{ fontSize: 12.5, height: 34 }}>
                <option value="TODOS">Todos os componentes</option>
                <option value="MATEMATICA">📐 Matemática</option>
                <option value="LEITURA">📖 Leitura</option>
                <option value="ESCRITA">✍️ Escrita</option>
                <option value="FLUENCIA">🗣️ Fluência</option>
              </Select>
            </Field>

            <Field label="Etapa" style={{ margin: 0 }}>
              <Select value={manageGrade} onChange={(e) => setManageGrade(e.target.value)} style={{ fontSize: 12.5, height: 34 }}>
                <option value="TODOS">Todas as etapas</option>
                {(filtersData?.grades || ['1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano']).map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </Select>
            </Field>

            <Field label="Avaliação" style={{ margin: 0 }}>
              <Select value={manageAssessment} onChange={(e) => setManageAssessment(e.target.value)} style={{ fontSize: 12.5, height: 34 }}>
                <option value="TODOS">Todas as avaliações</option>
                {(filtersData?.assessments || ['Diagnóstica', 'Formativa 1', 'Formativa 2', 'Somativa']).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </Select>
            </Field>

            <Field label="Status" style={{ margin: 0 }}>
              <Select value={manageStatus} onChange={(e) => setManageStatus(e.target.value)} style={{ fontSize: 12.5, height: 34 }}>
                <option value="ALL">Todos os status</option>
                <option value="OFICIAL">🟢 Consolidados / Oficiais</option>
                <option value="RASCUNHO">🟡 Rascunhos</option>
              </Select>
            </Field>

            <Field label="Buscar Escola / INEP" style={{ margin: 0, flex: 1, minWidth: 180 }}>
              <Input
                type="text"
                placeholder="🔎 Nome ou INEP..."
                value={manageSearch}
                onChange={(e) => setManageSearch(e.target.value)}
                style={{ fontSize: 12.5, height: 34 }}
              />
            </Field>
          </div>

          {/* Barra de Ações em Massa (quando há itens selecionados) */}
          {selectedResultIds.size > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px 14px', borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>
                {selectedResultIds.size} registro(s) selecionado(s)
              </span>

              <div style={{ display: 'flex', gap: 8 }}>
                {selectedDraftsCount > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => handlePublish()}
                    disabled={isProcessing}
                    style={{ background: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0', fontSize: 12.5 }}
                  >
                    🚀 Publicar Selecionados ({selectedDraftsCount})
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => { setBulkDeleteType('SELECTED'); setBulkDeleteModalOpen(true); }}
                  disabled={isProcessing}
                  style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca', fontSize: 12.5 }}
                >
                  🗑️ Excluir Selecionados ({selectedResultIds.size})
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setSelectedResultIds(new Set())}
                  style={{ fontSize: 12.5 }}
                >
                  Desmarcar
                </Button>
              </div>
            </div>
          )}

          {/* Tabela de Resultados para Gestão */}
          {loadingAllResults ? (
            <LoadingBlock label="Carregando resultados..." />
          ) : !allResults?.length ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
              Nenhum resultado gravado encontrado para os filtros selecionados.
            </div>
          ) : (
            <div style={{ maxHeight: 520, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, zIndex: 5, background: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '10px 12px', width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={allResults.length > 0 && selectedResultIds.size === allResults.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th style={{ padding: '10px 12px', width: 110 }}>Status</th>
                    <th style={{ padding: '10px 12px', width: 100 }}>INEP</th>
                    <th style={{ padding: '10px 12px' }}>Escola</th>
                    <th style={{ padding: '10px 12px', width: 120 }}>Componente</th>
                    <th style={{ padding: '10px 12px', width: 90 }}>Etapa</th>
                    <th style={{ padding: '10px 12px', width: 110 }}>Avaliação</th>
                    <th style={{ padding: '10px 12px', width: 110, textAlign: 'center' }}>Participação</th>
                    <th style={{ padding: '10px 12px', width: 120, textAlign: 'center' }}>Proficiência</th>
                    <th style={{ padding: '10px 12px', width: 100, textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {allResults.map((r, rowIdx) => {
                    const isSelected = selectedResultIds.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        style={{
                          background: isSelected ? '#eff6ff' : (rowIdx % 2 === 0 ? '#fff' : '#fafafa'),
                          borderBottom: '1px solid #e2e8f0',
                        }}
                      >
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(r.id)}
                          />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <Badge cls={r.source === 'RASCUNHO' ? 'badge-yellow' : 'badge-green'}>
                            {r.source === 'RASCUNHO' ? '🟡 Rascunho' : '🟢 Oficial'}
                          </Badge>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span className="mono">{r.school?.inep || '—'}</span>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <strong>{r.school?.name || '—'}</strong>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <Badge cls="badge-blue">{r.component}</Badge>
                        </td>
                        <td style={{ padding: '8px 12px' }}>{r.grade}</td>
                        <td style={{ padding: '8px 12px' }}>{r.assessment}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          {r.participationRate != null ? `${fmt(r.participationRate, 1)}%` : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          {r.averageScore != null ? fmt(r.averageScore, 1) : (r.fluentRate != null ? `${fmt(r.fluentRate, 1)}%` : '—')}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            {r.source === 'RASCUNHO' && (
                              <button
                                type="button"
                                onClick={() => handlePublish([r.id])}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}
                                title="Publicar rascunho"
                              >
                                🚀
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDeletingResult(r)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}
                              title="Excluir este resultado"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal de Confirmação: Exclusão Individual */}
      {deletingResult && (
        <Modal
          open={Boolean(deletingResult)}
          onClose={() => setDeletingResult(null)}
          title="Confirmar Exclusão de Resultado"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeletingResult(null)} disabled={isProcessing}>
                Cancelar
              </Button>
              <Button
                variant="secondary"
                onClick={handleDeleteSingle}
                disabled={isProcessing}
                style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
              >
                {isProcessing ? 'Excluindo...' : 'Sim, Excluir Resultado'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0 }}>
              Tem certeza que deseja excluir o resultado do componente <strong>{deletingResult.component}</strong> da escola:
            </p>
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              <strong>{deletingResult.school?.name || selectedSchool?.name}</strong>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                Etapa: {deletingResult.grade} · Avaliação: {deletingResult.assessment} · Status: {deletingResult.source === 'RASCUNHO' ? 'Rascunho' : 'Oficial'}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: '#dc2626' }}>
              Esta ação removerá este registro específico e atualizará os indicadores do CNCA imediatamente.
            </p>
          </div>
        </Modal>
      )}

      {/* Modal de Confirmação: Exclusão em Lote */}
      {bulkDeleteModalOpen && (
        <Modal
          open={bulkDeleteModalOpen}
          onClose={() => setBulkDeleteModalOpen(false)}
          title="Confirmar Exclusão em Lote"
          footer={
            <>
              <Button variant="secondary" onClick={() => setBulkDeleteModalOpen(false)} disabled={isProcessing}>
                Cancelar
              </Button>
              <Button
                variant="secondary"
                onClick={handleBulkDeleteConfirm}
                disabled={isProcessing}
                style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
              >
                {isProcessing ? 'Excluindo...' : 'Confirmar Exclusão em Lote'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="alert alert-error" style={{ margin: 0 }}>
              <strong>Atenção: Ação Irreversível!</strong>
            </div>
            <p style={{ margin: 0 }}>
              {bulkDeleteType === 'SELECTED' && (
                <>Deseja excluir os <strong>{selectedResultIds.size} registros selecionados</strong>?</>
              )}
              {bulkDeleteType === 'COMPONENT' && (
                <>Deseja excluir <strong>TODOS os resultados do componente {manageComponent}</strong> no ciclo do CNCA?</>
              )}
              {bulkDeleteType === 'DRAFTS' && (
                <>Deseja excluir <strong>TODOS os resultados com status de RASCUNHO</strong> no ciclo do CNCA?</>
              )}
              {bulkDeleteType === 'ALL' && (
                <>Deseja excluir <strong>TODOS os dados importados</strong> deste ciclo do CNCA?</>
              )}
            </p>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-3)' }}>
              Os indicadores e médias do dashboard serão recalculados após a exclusão.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
