import React, { useState, useRef } from 'react';
import { useApi, clearApiCache } from '../../hooks/useApi.js';
import { pactoAdminApi } from '../../services/resources.js';
import { resolvePactoPublicLink } from './link.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { Badge, Button, Field, Input, LoadingBlock, Modal, Select } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';
import { formatGradeLabel } from './dashboard.js';

const ALL_ASSESSMENTS = ['A0', 'A1', 'A2', 'A3'];

export default function PactoImport({ program, onSelectTab }) {
  const { success, error: toastError } = useToast();
  const fileInputRef = useRef(null);
  const resultRef = useRef(null);

  const [activeSubtab, setActiveSubtab] = useState('PLANILHA'); // 'PLANILHA' | 'LINKS' | 'TURMAS'
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewState, setPreviewState] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Overview data para Gestão de Links e Turmas
  const { data: overview, loading: overviewLoading, refresh: refreshOverview } = useApi(
    () => pactoAdminApi.overview(program.id),
    [program.id],
  );

  // Estados para Gestão de Links
  const [linkModal, setLinkModal] = useState(null);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [expiresAt, setExpiresAt] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));

  // Estados para Gestão de Turmas
  const [classModal, setClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [classForm, setClassForm] = useState({
    schoolId: '',
    grade: 1,
    shift: 'M',
    name: '',
    enabledAssessments: ALL_ASSESSMENTS,
  });

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = async (file) => {
    setSelectedFile(file);
    setPreviewState(null);
    setImportResult(null);
    setErrorMsg(null);
    setLoadingPreview(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const preview = await pactoAdminApi.previewImport(program.id, formData);
      setPreviewState(preview);
    } catch (err) {
      const msg = err.message || 'Erro ao processar a prévia da planilha do Pacto.';
      setErrorMsg(msg);
      toastError(msg);
      setSelectedFile(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewState?.records?.length) {
      toastError('Nenhum dado válido na prévia para confirmar.');
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const result = await pactoAdminApi.confirmImport(program.id, {
        records: previewState.records,
        component: previewState.component,
      });

      clearApiCache();
      setImportResult(result);
      setPreviewState(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      success(
        `Importação concluída com sucesso! ${result.totalRecords || result.importedAssessmentsCount} registros processados em ${result.importedSchoolsCount || 0} escolas.`,
      );

      if (typeof refreshOverview === 'function') refreshOverview();

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } catch (err) {
      const msg = err.message || 'Erro ao confirmar a importação dos dados do Pacto.';
      setErrorMsg(msg);
      toastError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const generateLink = async () => {
    if (!linkModal) return;
    try {
      const endOfDay = new Date(`${expiresAt}T23:59:59`);
      const result = await pactoAdminApi.generateLink(program.id, linkModal.id, endOfDay.toISOString());
      const publicLink = resolvePactoPublicLink(result.path, window.location.origin);
      setGeneratedLink(publicLink.url);
      success('Link exclusivo gerado com sucesso!');
      refreshOverview();
    } catch (err) {
      toastError(err.message || 'Erro ao gerar link.');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      success('Link copiado para a área de transferência!');
    } catch {
      toastError('Não foi possível copiar automaticamente.');
    }
  };

  const handleSaveClass = async (e) => {
    e.preventDefault();
    if (!classForm.schoolId || !classForm.name.trim()) {
      toastError('Informe a escola e a identificação da turma.');
      return;
    }

    try {
      if (editingClass) {
        await pactoAdminApi.updateClass(program.id, editingClass.id, {
          grade: Number(classForm.grade),
          shift: classForm.shift,
          name: classForm.name.toUpperCase().trim(),
          enabledAssessments: classForm.enabledAssessments,
        });
        success('Turma atualizada com sucesso!');
      } else {
        await pactoAdminApi.createClass(program.id, {
          schoolId: classForm.schoolId,
          grade: Number(classForm.grade),
          shift: classForm.shift,
          name: classForm.name.toUpperCase().trim(),
          enabledAssessments: classForm.enabledAssessments,
        });
        success('Turma cadastrada com sucesso!');
      }
      setClassModal(false);
      setEditingClass(null);
      setClassForm({
        schoolId: '',
        grade: 1,
        shift: 'M',
        name: '',
        enabledAssessments: ALL_ASSESSMENTS,
      });
      refreshOverview();
    } catch (err) {
      toastError(err.message || 'Erro ao salvar turma.');
    }
  };

  // Filtragem de linhas da prévia por termo de busca
  const filteredPreviewRows = (previewState?.previewRows || []).filter((r) => {
    if (!searchFilter) return true;
    const term = searchFilter.toLowerCase();
    return (
      (r.schoolName && r.schoolName.toLowerCase().includes(term)) ||
      (r.schoolInep && r.schoolInep.toLowerCase().includes(term)) ||
      (r.className && r.className.toLowerCase().includes(term)) ||
      (r.assessment && r.assessment.toLowerCase().includes(term))
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Subabas de Navegação Interna */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border, #e2e8f0)', paddingBottom: 10 }}>
        <button
          type="button"
          className={`btn ${activeSubtab === 'PLANILHA' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubtab('PLANILHA')}
          style={{ fontWeight: 700 }}
        >
          📁 Importação por Planilha Geral da Rede
        </button>
        <button
          type="button"
          className={`btn ${activeSubtab === 'LINKS' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubtab('LINKS')}
          style={{ fontWeight: 700 }}
        >
          🔗 Links de Coleta por Escola
        </button>
        <button
          type="button"
          className={`btn ${activeSubtab === 'TURMAS' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubtab('TURMAS')}
          style={{ fontWeight: 700 }}
        >
          🏫 Gestão de Turmas
        </button>
      </div>

      {/* SUBABA 1: IMPORTAÇÃO POR PLANILHA */}
      {activeSubtab === 'PLANILHA' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Mensagem de Erro Global */}
          {errorMsg && (
            <div
              className="alert alert-error"
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 13,
              }}
            >
              <span>⛔ {errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Feedback de Sucesso */}
          {importResult && (
            <div
              ref={resultRef}
              className="card"
              style={{
                padding: '24px 28px',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.15) 100%)',
                borderRadius: 14,
                border: '2px solid rgba(16, 185, 129, 0.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 32 }}>🎉</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#047857' }}>
                    Dados do Pacto pela Alfabetização Consolidados com Sucesso!
                  </h3>
                  <p style={{ margin: '3px 0 0 0', fontSize: 13, color: 'var(--text-2, #475569)' }}>
                    As avaliações e turmas de todas as escolas municipais foram atualizadas e vinculadas com precisão.
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  flexWrap: 'wrap',
                  fontSize: 13,
                  background: 'var(--surface, #ffffff)',
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--border, #e2e8f0)',
                }}
              >
                <span>Escolas Processadas: <strong>{importResult.importedSchoolsCount || 0}</strong></span>
                <span>Turmas Atualizadas/Criadas: <strong>{(importResult.createdClassesCount || 0) + (importResult.updatedClassesCount || 0)}</strong></span>
                <span>Avaliações Gravadas: <strong>{importResult.importedAssessmentsCount || 0}</strong></span>
                <span>Total de Registros: <strong>{importResult.totalRecords || 0}</strong></span>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                {onSelectTab && (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => onSelectTab('overview')}
                      style={{ fontWeight: 700 }}
                    >
                      📊 Ver Dashboard Geral
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => onSelectTab('pacto-resultados')}
                      style={{ fontWeight: 700 }}
                    >
                      🏫 Resultados por Escola
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => onSelectTab('pacto-ranking')}
                      style={{ fontWeight: 700 }}
                    >
                      🏆 Ranking Municipal
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setImportResult(null);
                    setPreviewState(null);
                    setSelectedFile(null);
                  }}
                  style={{ fontWeight: 600 }}
                >
                  📁 Importar Próxima Planilha
                </button>
              </div>
            </div>
          )}

          {/* Estado Inicial: Upload de Arquivo */}
          {!previewState && !loadingPreview && (
            <div>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: 16, fontWeight: 750, color: 'var(--text, #0f172a)', margin: '0 0 2px 0' }}>
                  Importação Consolidada Municipal — 1º Ano (e demais etapas)
                </h3>
                <span style={{ fontSize: 12.5, color: 'var(--text-2, #64748b)' }}>
                  Faça o upload da planilha oficial com todas as escolas da rede contendo os códigos de avaliação (A1, A2 ou A3).
                </span>
              </div>

              <div className="pacto-import-layout">
                {/* Zona de Drag & Drop */}
                <div
                  className="pacto-drop-zone"
                  style={{ borderColor: dragActive ? 'var(--primary, #0284c7)' : 'var(--border, #cbd5e1)' }}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  <div className="pacto-drop-zone-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <strong className="pacto-drop-zone-title" style={{ fontSize: 15 }}>
                    Arraste a planilha aqui ou clique para selecionar
                  </strong>
                  <span className="pacto-drop-zone-sub" style={{ fontSize: 12 }}>
                    Formatos suportados: CSV (.csv com separador ponto-e-vírgula) e Excel (.xlsx, .xls)
                  </span>
                  <div style={{ marginTop: 14 }}>
                    <Button size="sm">Selecionar Arquivo no Computador</Button>
                  </div>
                </div>

                {/* Orientações Técnicas */}
                <div className="pacto-guidelines-box">
                  <h4>Orientações para o Formato Consolidado</h4>
                  <ul className="pacto-guidelines-list">
                    <li>
                      <span className="check">✓</span>
                      <span>
                        <strong>Multi-Escola Automático:</strong> A planilha pode conter todas as escolas da rede municipal em um único arquivo. O sistema identifica cada escola pelo código INEP presente no nome.
                      </span>
                    </li>
                    <li>
                      <span className="check">✓</span>
                      <span>
                        <strong>Identificação de Avaliações (CodA):</strong> O sistema lê automaticamente a coluna <code>CodA</code> (A1, A2, A3) e vincula às etapas correspondentes.
                      </span>
                    </li>
                    <li>
                      <span className="check">✓</span>
                      <span>
                        <strong>Componentes Curriculares:</strong> Suporta tanto a planilha de <strong>Língua Portuguesa</strong> (Leitura: PL/LI/LF, Escrita: NC/CO/CA, Oralidade: PA/AI/AC) quanto a planilha de <strong>Matemática</strong> (Proficiência: NP/PI/P).
                      </span>
                    </li>
                    <li>
                      <span className="check">✓</span>
                      <span>
                        <strong>Criação Automática de Turmas:</strong> As turmas e turnos que ainda não existirem no sistema serão cadastradas e vinculadas de forma automática.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Loading da Prévia */}
          {loadingPreview && (
            <div className="card card-pad" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <LoadingBlock message="Processando planilha oficial, identificando escolas e validando critérios do Pacto..." />
            </div>
          )}

          {/* Prévia da Importação */}
          {previewState && !loadingPreview && (
            <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text, #0f172a)', margin: 0 }}>
                      Prévia da Importação — Pacto 2026
                    </h3>
                    <span
                      style={{
                        background: previewState.component === 'PORTUGUES' ? 'rgba(2, 132, 199, 0.15)' : 'rgba(147, 51, 234, 0.15)',
                        color: previewState.component === 'PORTUGUES' ? '#0284c7' : '#9333ea',
                        padding: '3px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {previewState.component === 'PORTUGUES' ? '📖 Língua Portuguesa' : '📐 Matemática'}
                    </span>
                    <span
                      style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#15803d',
                        padding: '3px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      Avaliações: {previewState.assessments?.join(', ') || 'A1, A2'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-2, #64748b)', marginTop: 4 }}>
                    Arquivo: <strong>{previewState.file?.name}</strong> ({previewState.file?.size}) · {previewState.summary?.validRows} registros válidos
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setPreviewState(null);
                      setSelectedFile(null);
                    }}
                    disabled={isUploading}
                  >
                    ← Cancelar
                  </Button>
                  <Button
                    onClick={handleConfirmImport}
                    disabled={isUploading || previewState.summary?.validRows === 0}
                    style={{
                      background: '#10b981',
                      borderColor: '#10b981',
                      fontWeight: 800,
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                    }}
                  >
                    {isUploading ? 'Gravando dados na Rede...' : '💾 Confirmar e Consolidar Dados'}
                  </Button>
                </div>
              </div>

              {/* 4 Cards de Resumo da Prévia */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div style={{ padding: '12px 16px', background: 'var(--surface-2, #f8fafc)', borderRadius: 10, border: '1px solid var(--border, #e2e8f0)' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2, #64748b)', fontWeight: 600 }}>Total de Registros Válidos</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text, #0f172a)' }}>
                    {previewState.summary?.validRows}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3, #94a3b8)' }}>
                    {previewState.summary?.skippedRows || 0} linhas de planejamento ignoradas
                  </div>
                </div>

                <div style={{ padding: '12px 16px', background: 'rgba(2, 132, 199, 0.08)', borderRadius: 10, border: '1px solid rgba(2, 132, 199, 0.25)' }}>
                  <div style={{ fontSize: 11.5, color: '#0369a1', fontWeight: 600 }}>Escolas Identificadas</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#0284c7' }}>
                    {previewState.summary?.identifiedSchoolsCount || previewState.summary?.schoolsCount} escolas
                  </div>
                  <div style={{ fontSize: 11, color: '#0369a1' }}>
                    Reconciliadas por código INEP / Nome
                  </div>
                </div>

                <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.08)', borderRadius: 10, border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                  <div style={{ fontSize: 11.5, color: '#15803d', fontWeight: 600 }}>Turmas Mapeadas</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>
                    {previewState.summary?.classesCount} turmas
                  </div>
                  <div style={{ fontSize: 11, color: '#15803d' }}>
                    1º Ano EF (Turnos M / T)
                  </div>
                </div>

                <div style={{ padding: '12px 16px', background: 'var(--surface-2, #f8fafc)', borderRadius: 10, border: '1px solid var(--border, #e2e8f0)' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2, #64748b)', fontWeight: 600 }}>Alunos Avaliados / Matrícula</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text, #0f172a)' }}>
                    {previewState.summary?.totalEvaluated} / {previewState.summary?.totalEnrolled}
                  </div>
                  <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>
                    Taxa de Participação: {previewState.summary?.participationRate}%
                  </div>
                </div>
              </div>

              {/* Filtro de Busca na Tabela */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <input
                  type="text"
                  className="input input-sm"
                  placeholder="🔍 Filtrar por escola, INEP ou turma na prévia..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{ maxWidth: 360 }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-2, #64748b)' }}>
                  Exibindo {filteredPreviewRows.length} de {previewState.summary?.validRows} registros
                </span>
              </div>

              {/* Tabela de Amostra Detalhada */}
              <div style={{ overflowX: 'auto', border: '1px solid var(--border, #e2e8f0)', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2, #f8fafc)', borderBottom: '1px solid var(--border, #e2e8f0)', color: 'var(--text-2, #475569)' }}>
                      <th style={{ padding: '9px 12px', fontWeight: 700, width: 40 }}>#</th>
                      <th style={{ padding: '9px 12px', fontWeight: 700 }}>Escola Oficial</th>
                      <th style={{ padding: '9px 12px', fontWeight: 700, width: 95 }}>INEP</th>
                      <th style={{ padding: '9px 12px', fontWeight: 700, width: 110 }}>Etapa & Turma</th>
                      <th style={{ padding: '9px 12px', fontWeight: 700, textAlign: 'center', width: 60 }}>Aval.</th>
                      <th style={{ padding: '9px 12px', fontWeight: 700, textAlign: 'center', width: 90 }}>Mat / Aval</th>
                      <th style={{ padding: '9px 12px', fontWeight: 700 }}>Critérios de Desempenho</th>
                      <th style={{ padding: '9px 12px', fontWeight: 700, textAlign: 'center', width: 80 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPreviewRows.slice(0, 100).map((row, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid var(--border, #f1f5f9)',
                          background: idx % 2 === 0 ? 'transparent' : 'var(--surface-2, rgba(0,0,0,0.01))',
                        }}
                      >
                        <td style={{ padding: '9px 12px', color: 'var(--text-3, #94a3b8)' }}>{row.rowNumber}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text, #0f172a)' }}>
                          {row.schoolName}
                        </td>
                        <td style={{ padding: '9px 12px', color: '#0284c7', fontWeight: 600 }}>
                          {row.schoolInep || '—'}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{ fontWeight: 600 }}>{formatGradeLabel(row.grade)}</span> · Turma {row.className} ({row.shift})
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: 4, fontWeight: 800, fontSize: 11 }}>
                            {row.assessment}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600 }}>
                          {row.enrolled} / <strong>{row.evaluated}</strong>
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          {previewState.component === 'PORTUGUES' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
                              <span><strong>Leitura:</strong> {row.displaySkills?.leitura}</span>
                              <span><strong>Compreensão de Texto:</strong> {row.displaySkills?.compreensao}</span>
                              <span><strong>Escrita:</strong> {row.displaySkills?.escrita}</span>
                            </div>
                          ) : (
                            <div style={{ fontSize: 11.5 }}>
                              <strong>Proficiência:</strong> {row.displaySkills?.proficiencia}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          <span style={{ background: '#d1fae5', color: '#065f46', padding: '2px 6px', borderRadius: 4, fontSize: 10.5, fontWeight: 700 }}>
                            PRONTA
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBABA 2: LINKS DE COLETA */}
      {activeSubtab === 'LINKS' && (
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 750, color: 'var(--text, #0f172a)', margin: 0 }}>
              Links Exclusivos de Coleta por Escola
            </h3>
            <div style={{ fontSize: 12.5, color: 'var(--text-2, #64748b)', marginTop: 2 }}>
              Gere links diretos e seguros para diretores e coordenadores pedagógicos lançarem ou consultarem os dados de suas escolas.
            </div>
          </div>

          {overviewLoading ? (
            <LoadingBlock message="Carregando escolas e links de coleta..." />
          ) : (
            <DataTable
              columns={[
                { key: 'inep', label: 'INEP', width: 120, render: (item) => <strong>{item.inep || '—'}</strong> },
                { key: 'name', label: 'Escola Municipal', render: (item) => <strong>{item.name}</strong> },
                { key: 'classes', label: 'Turmas Cadastradas', align: 'center', width: 160, render: (item) => item.classes?.length || 0 },
                {
                  key: 'status',
                  label: 'Status da Coleta',
                  align: 'center',
                  width: 140,
                  render: (item) => {
                    const sent = item.sentAssessmentsCount || 0;
                    return (
                      <Badge cls={sent > 0 ? 'badge-green' : 'badge-yellow'}>
                        {sent > 0 ? `${sent} enviadas` : 'Pendente'}
                      </Badge>
                    );
                  },
                },
                {
                  key: 'actions',
                  label: 'Ações',
                  align: 'right',
                  width: 130,
                  render: (item) => (
                    <Button size="sm" onClick={() => setLinkModal(item)}>
                      🔗 Gerar Link
                    </Button>
                  ),
                },
              ]}
              rows={overview?.schools || []}
              rowKey={(item) => item.id}
            />
          )}
        </div>
      )}

      {/* SUBABA 3: GESTÃO DE TURMAS */}
      {activeSubtab === 'TURMAS' && (
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 750, color: 'var(--text, #0f172a)', margin: 0 }}>
                Cadastro e Gestão de Turmas
              </h3>
              <div style={{ fontSize: 12.5, color: 'var(--text-2, #64748b)', marginTop: 2 }}>
                Consulte as turmas cadastradas por escola ou adicione turmas manualmente quando necessário.
              </div>
            </div>
            <Button
              onClick={() => {
                setEditingClass(null);
                setClassForm({
                  schoolId: overview?.schools?.[0]?.id || '',
                  grade: 1,
                  shift: 'M',
                  name: '',
                  enabledAssessments: ALL_ASSESSMENTS,
                });
                setClassModal(true);
              }}
            >
              + Cadastrar Turma
            </Button>
          </div>

          {overviewLoading ? (
            <LoadingBlock message="Carregando turmas cadastradas..." />
          ) : (
            <DataTable
              columns={[
                {
                  key: 'school',
                  label: 'Escola',
                  render: (item) => <strong>{item.schoolName}</strong>,
                },
                {
                  key: 'grade',
                  label: 'Etapa / Ano',
                  render: (item) => formatGradeLabel(item.grade),
                },
                {
                  key: 'shift',
                  label: 'Turno',
                  render: (item) => (item.shift === 'M' ? 'Manhã (M)' : item.shift === 'T' ? 'Tarde (T)' : item.shift),
                },
                {
                  key: 'name',
                  label: 'Turma',
                  render: (item) => <strong>Turma {item.name}</strong>,
                },
                {
                  key: 'assessments',
                  label: 'Avaliações Habilitadas',
                  render: (item) => (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(item.enabledAssessments || ALL_ASSESSMENTS).map((code) => (
                        <span key={code} style={{ background: 'var(--surface-2, #f1f5f9)', padding: '1px 5px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                          {code}
                        </span>
                      ))}
                    </div>
                  ),
                },
              ]}
              rows={(overview?.schools || []).flatMap((s) => (s.classes || []).map((c) => ({ ...c, schoolName: s.name })))}
              rowKey={(item) => item.id}
            />
          )}
        </div>
      )}

      {/* Modal de Geração de Link */}
      <Modal
        open={Boolean(linkModal)}
        onClose={() => {
          setLinkModal(null);
          setGeneratedLink(null);
        }}
        title={`Link Exclusivo de Coleta — ${linkModal?.name || ''}`}
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setLinkModal(null);
                setGeneratedLink(null);
              }}
            >
              Fechar
            </Button>
            {!generatedLink && <Button onClick={generateLink}>Gerar Link Exclusivo</Button>}
          </>
        }
      >
        {generatedLink ? (
          <div>
            <div className="alert alert-success" style={{ marginBottom: 12 }}>
              Link exclusivo gerado com sucesso para a escola <strong>{linkModal?.name}</strong>.
            </div>
            <Field label="Endereço exclusivo de coleta">
              <div style={{ display: 'flex', gap: 8 }}>
                <Input value={generatedLink} readOnly />
                <Button onClick={copyLink}>Copiar Link</Button>
              </div>
            </Field>
          </div>
        ) : (
          <Field label="Válido até" required>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
        )}
      </Modal>

      {/* Modal de Cadastro de Turma */}
      <Modal
        open={classModal}
        onClose={() => {
          setClassModal(false);
          setEditingClass(null);
        }}
        title={editingClass ? 'Editar Turma' : 'Cadastrar Nova Turma'}
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setClassModal(false);
                setEditingClass(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveClass}>Salvar Turma</Button>
          </>
        }
      >
        <form onSubmit={handleSaveClass} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Escola" required>
            <Select
              value={classForm.schoolId}
              onChange={(e) => setClassForm({ ...classForm, schoolId: e.target.value })}
            >
              <option value="">Selecione uma escola...</option>
              {(overview?.schools || []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Etapa / Ano Escolar" required>
            <Select
              value={classForm.grade}
              onChange={(e) => setClassForm({ ...classForm, grade: Number(e.target.value) })}
            >
              <option value={0}>Educação Infantil (PII)</option>
              <option value={1}>1º Ano do Ensino Fundamental</option>
              <option value={2}>2º Ano do Ensino Fundamental</option>
            </Select>
          </Field>

          <Field label="Turno" required>
            <Select
              value={classForm.shift}
              onChange={(e) => setClassForm({ ...classForm, shift: e.target.value })}
            >
              <option value="M">Manhã (M)</option>
              <option value="T">Tarde (T)</option>
            </Select>
          </Field>

          <Field label="Identificação da Turma (Letra ou Nome)" required hint="Ex.: A, B, C, Única">
            <Input
              value={classForm.name}
              onChange={(e) => setClassForm({ ...classForm, name: e.target.value.toUpperCase() })}
              placeholder="Ex.: A"
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
