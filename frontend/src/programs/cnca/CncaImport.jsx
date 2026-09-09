import React, { useState, useRef, useMemo } from 'react';
import { cncaApi } from '../../services/resources.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { Button, Field, Modal, Select, Badge, Input } from '../../components/ui.jsx';
import { fmtInt } from '../../utils/format.js';

function isSchoolColumn(colName) {
  const norm = (colName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    norm === 'escola' ||
    norm === 'nome da escola' ||
    norm === 'nome escola' ||
    norm === 'unidade escolar' ||
    norm === 'nm_escola' ||
    norm === 'ds_escola' ||
    (norm.includes('escola') && !norm.includes('ano') && !norm.includes('serie') && !norm.includes('etapa') && !norm.includes('cod') && !norm.includes('inep'))
  );
}

const GRADES_OPTIONS = ['1º Ano', '2º Ano', '3º Ano', '4º Ano', '5º Ano'];
const ASSESSMENTS_OPTIONS = ['Diagnóstica', 'Formativa 1', 'Formativa 2', 'Somativa'];
const COMPONENTS_OPTIONS = [
  { key: 'MATEMATICA', label: 'Matemática', icon: '📐' },
  { key: 'LEITURA', label: 'Leitura (Língua Portuguesa)', icon: '📖' },
  { key: 'ESCRITA', label: 'Escrita (Produção Textual)', icon: '✍️' },
  { key: 'FLUENCIA', label: 'Fluência em Leitura', icon: '🗣️' },
];

export default function CncaImport({ program, refreshProgram }) {
  const { toast, success, error } = useToast();
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [componentOverride, setComponentOverride] = useState('');
  const [gradeOverride, setGradeOverride] = useState('');
  const [assessmentOverride, setAssessmentOverride] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [importing, setImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Filtros internos na modal de prévia
  const [searchFilter, setSearchFilter] = useState('');
  const [viewFilter, setViewFilter] = useState('UNIQUE_VALID'); // 'UNIQUE_VALID' | 'ALL' | 'DUPLICATES' | 'INVALID'

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    const name = selectedFile.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      error('Por favor, selecione um arquivo Excel (.xlsx, .xls) ou CSV (.csv).');
      return;
    }
    setFile(selectedFile);
    setPreviewData(null);
    setSearchFilter('');
    setViewFilter('UNIQUE_VALID');
  };

  const handleAnalyze = async () => {
    if (!file) {
      error('Selecione um arquivo para analisar.');
      return;
    }

    setAnalyzing(true);
    const form = new FormData();
    form.append('file', file);
    if (componentOverride) {
      form.append('component', componentOverride);
    }
    if (gradeOverride) {
      form.append('grade', gradeOverride);
    }
    if (assessmentOverride) {
      form.append('assessment', assessmentOverride);
    }

    try {
      const res = await cncaApi.previewImport(program.id, form);
      setPreviewData(res);
      setSearchFilter('');
      setViewFilter('UNIQUE_VALID');

      if (res.summary?.invalidRows > 0) {
        toast(`Arquivo analisado: ${res.summary.validRows} registros únicos prontos e ${res.summary.invalidRows} inconsistência(s).`, { type: 'warning' });
      } else {
        success(`Arquivo analisado! ${res.summary?.validRows || 0} registros únicos de ${res.summary?.detectedGrade || 'Etapa'} identificados (${res.summary?.duplicateCount || 0} duplicatas descartadas).`);
      }
    } catch (err) {
      error(err.message || 'Erro ao processar planilha oficial.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Permite ao usuário alterar o componente, etapa ou avaliação diretamente na modal de prévia
  const handleModalGradeChange = (newGrade) => {
    if (!previewData) return;
    setPreviewData((prev) => {
      const updatedRows = prev.rows.map((r) => ({
        ...r,
        grade: newGrade,
      }));
      return {
        ...prev,
        summary: {
          ...prev.summary,
          detectedGrade: newGrade,
        },
        rows: updatedRows,
      };
    });
  };

  const handleModalComponentChange = (newComp) => {
    if (!previewData) return;
    setPreviewData((prev) => {
      const updatedRows = prev.rows.map((r) => ({
        ...r,
        component: newComp,
      }));
      return {
        ...prev,
        summary: {
          ...prev.summary,
          detectedComponent: newComp,
        },
        rows: updatedRows,
      };
    });
  };

  const handleModalAssessmentChange = (newAssess) => {
    if (!previewData) return;
    setPreviewData((prev) => {
      const updatedRows = prev.rows.map((r) => ({
        ...r,
        assessment: newAssess,
      }));
      return {
        ...prev,
        summary: {
          ...prev.summary,
          detectedAssessment: newAssess,
        },
        rows: updatedRows,
      };
    });
  };

  const handleConfirm = async (asDraft = false) => {
    if (!previewData || !previewData.rows) return;

    // Garante o envio apenas de registros válidos e únicos (duplicatas excluídas da publicação)
    const validUniqueRows = previewData.rows.filter(
      (r) => r.status === 'VALIDO' && !r.isDuplicate && !r.isExcludedFromPublish,
    );

    if (!validUniqueRows.length) {
      error('Não há registros válidos para importar.');
      return;
    }

    setImporting(true);
    try {
      const res = await cncaApi.confirmImport(program.id, {
        records: validUniqueRows,
        year: program.year,
        asDraft,
      });
      success(
        res.message ||
          (asDraft
            ? `${validUniqueRows.length} registros salvos como rascunho com sucesso!`
            : `${validUniqueRows.length} registros de ${previewData.summary?.detectedGrade} consolidados e publicados!`),
      );
      setFile(null);
      setPreviewData(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (refreshProgram) refreshProgram();
    } catch (err) {
      error(err.message || 'Erro ao confirmar importação.');
    } finally {
      setImporting(false);
    }
  };

  const summary = previewData?.summary;
  const importedColumns = summary?.importedColumns || [];

  // Filtragem interativa das linhas exibidas na prévia
  const filteredRows = useMemo(() => {
    if (!previewData?.rows) return [];
    let rows = previewData.rows;

    if (viewFilter === 'UNIQUE_VALID') {
      rows = rows.filter((r) => r.status === 'VALIDO' && !r.isDuplicate);
    } else if (viewFilter === 'DUPLICATES') {
      rows = rows.filter((r) => r.isDuplicate);
    } else if (viewFilter === 'INVALID') {
      rows = rows.filter((r) => r.status === 'INVALIDO');
    }

    if (searchFilter.trim()) {
      const term = searchFilter.toLowerCase().trim();
      rows = rows.filter((r) => {
        const inepMatch = r.inep && String(r.inep).includes(term);
        const nameMatch = r.schoolName && r.schoolName.toLowerCase().includes(term);
        const cpeMatch = r.matchedSchool?.name && r.matchedSchool.name.toLowerCase().includes(term);
        const rawMatch =
          r.displayValues &&
          Object.values(r.displayValues).some((v) => String(v).toLowerCase().includes(term));
        return inepMatch || nameMatch || cpeMatch || rawMatch;
      });
    }

    return rows;
  }, [previewData, viewFilter, searchFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Card de Upload e Instruções */}
      <div className="card card-pad">
        <div className="card-header-row" style={{ marginBottom: 14 }}>
          <div>
            <div className="card-title">Importação de Planilhas Oficiais do CNCA</div>
            <div className="card-subtitle">
              Envio das exportações oficiais consolidadas por escola dos quatro componentes: <strong>Escrita, Leitura, Matemática e Fluência</strong>.
            </div>
          </div>
        </div>

        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <strong>Regras Fundamentais de Integridade e Importação Dinâmica:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12.5 }}>
            <li><strong>Colunas Ignoradas:</strong> As colunas de contexto administrativo (<code>REDE</code>, <code>ESTADO</code>, <code>REGIONAL</code>, <code>MUNICÍPIO</code>) são ignoradas automaticamente.</li>
            <li><strong>Preservação Fiel:</strong> Todas as demais colunas do arquivo são mantidas individualmente com seus nomes e valores reais originais.</li>
            <li><strong>Deduplicação Automática:</strong> Linhas duplicadas na planilha para a mesma escola/etapa são automaticamente identificadas e descartadas na publicação.</li>
            <li><strong>Etapa e Componente Flexíveis:</strong> Você pode especificar o <strong>Ano de Ensino (1º ao 5º Ano)</strong>, Componente e Avaliação antes da análise ou ajustar diretamente na prévia.</li>
          </ul>
        </div>

        {/* Área de Seleção de Arquivo (Drag & Drop) */}
        <div
          style={{
            border: `2px dashed ${isDragOver ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 12,
            padding: 30,
            textAlign: 'center',
            background: isDragOver ? '#eff6ff' : '#fafafa',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: 16,
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".xlsx,.xls,.csv"
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
          />
          <div style={{ fontSize: 40, marginBottom: 6 }}>📁</div>
          <strong style={{ fontSize: 15, display: 'block' }}>
            {file ? file.name : 'Arraste a planilha oficial do CNCA (.xlsx ou .csv) aqui ou clique para selecionar'}
          </strong>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4, display: 'block' }}>
            {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Suporta exportações do 1º ao 5º Ano, Matemática, Leitura, Escrita e Fluência'}
          </span>
        </div>

        {/* Configurações de Envio (Componente, Etapa e Avaliação) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'flex-end', background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}>
          <Field label="Ano Escolar / Etapa" style={{ margin: 0 }}>
            <Select
              value={gradeOverride}
              onChange={(e) => setGradeOverride(e.target.value)}
              style={{ fontSize: 13, height: 36 }}
            >
              <option value="">🔍 Identificar automaticamente</option>
              {GRADES_OPTIONS.map((g) => (
                <option key={g} value={g}>🎓 {g}</option>
              ))}
            </Select>
          </Field>

          <Field label="Componente Curricular" style={{ margin: 0 }}>
            <Select
              value={componentOverride}
              onChange={(e) => setComponentOverride(e.target.value)}
              style={{ fontSize: 13, height: 36 }}
            >
              <option value="">🔍 Identificar automaticamente</option>
              {COMPONENTS_OPTIONS.map((c) => (
                <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Avaliação / Edição" style={{ margin: 0 }}>
            <Select
              value={assessmentOverride}
              onChange={(e) => setAssessmentOverride(e.target.value)}
              style={{ fontSize: 13, height: 36 }}
            >
              <option value="">🔍 Identificar automaticamente</option>
              {ASSESSMENTS_OPTIONS.map((a) => (
                <option key={a} value={a}>📝 {a}</option>
              ))}
            </Select>
          </Field>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              onClick={handleAnalyze}
              disabled={!file || analyzing}
              style={{ width: '100%', height: 36, fontWeight: 600 }}
            >
              {analyzing ? 'Analisando...' : '📊 Gerar Prévia'}
            </Button>
          </div>
        </div>
      </div>

      {/* Modal de Prévia Visual Polida e Fiel */}
      {previewData && (
        <Modal
          open={Boolean(previewData)}
          onClose={() => setPreviewData(null)}
          title={`Prévia de Importação: ${file?.name || 'Planilha Oficial CNCA'}`}
          size="xl"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <Button variant="secondary" onClick={() => setPreviewData(null)} disabled={importing}>
                Cancelar
              </Button>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Button
                  variant="secondary"
                  onClick={() => handleConfirm(true)}
                  disabled={importing || !summary?.validRows}
                  style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#b45309', fontWeight: 600 }}
                  title="Salva os dados únicos com status de Rascunho para conferência prévia"
                >
                  {importing ? 'Salvando...' : `💾 Salvar como Rascunho (${summary?.validRows || 0})`}
                </Button>
                <Button
                  onClick={() => handleConfirm(false)}
                  disabled={importing || !summary?.validRows}
                  style={{ minWidth: 220, fontWeight: 600 }}
                  title={`Salva e publica os registros únicos de ${summary?.detectedGrade} como dados oficiais`}
                >
                  {importing ? 'Importando registros...' : `🚀 Confirmar e Publicar (${summary?.validRows || 0})`}
                </Button>
              </div>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: '100%', minWidth: 0 }}>
            
            {/* 1. Painel de Indicadores da Análise */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, width: '100%', minWidth: 0 }}>
              
              {/* Bloco Origem do Arquivo */}
              <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid var(--border)', padding: '12px 14px', minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                  📄 Estrutura da Planilha
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Total Linhas</div>
                    <strong style={{ fontSize: 16 }}>{fmtInt(summary?.totalRows || 0)}</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#15803d' }}>A Importar</div>
                    <strong style={{ fontSize: 16, color: '#15803d' }}>{summary?.importedColumnsCount || 0} col.</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#c2410c' }}>Ignoradas</div>
                    <strong style={{ fontSize: 16, color: '#c2410c' }}>{summary?.ignoredColumnsCount || 0} col.</strong>
                    <div style={{ fontSize: 9.5, color: '#9a3412', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={summary?.ignoredColumns?.join(', ')}>
                      {summary?.ignoredColumns?.join(', ') || 'Nenhuma'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloco Conciliação com o CPE */}
              <div style={{ background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0', padding: '12px 14px', minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                  🎯 Conciliação com Cadastro CPE
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#166534' }}>Escolas CPE</div>
                    <strong style={{ fontSize: 16, color: '#166534' }}>{fmtInt(summary?.matchedSchoolsCount || 0)}</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#15803d' }}>Prontos</div>
                    <strong style={{ fontSize: 16, color: '#15803d' }}>{fmtInt(summary?.validRows || 0)}</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#b45309' }}>Duplicatas</div>
                    <strong style={{ fontSize: 16, color: '#b45309' }}>{fmtInt(summary?.duplicateCount || 0)}</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: summary?.invalidRows > 0 ? '#b91c1c' : '#64748b' }}>Erros</div>
                    <strong style={{ fontSize: 16, color: summary?.invalidRows > 0 ? '#b91c1c' : '#64748b' }}>{summary?.invalidRows || 0}</strong>
                  </div>
                </div>
              </div>

            </div>

            {/* Alerta de Duplicidades Filtradas */}
            {summary?.duplicateCount > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0 }}>
                <span>✨</span>
                <span>
                  <strong>Deduplicação Ativa:</strong> Foram identificadas <strong>{summary.duplicateCount} linhas repetidas</strong> no arquivo. Elas foram automaticamente descartadas para evitar duplicar dados na publicação.
                </span>
              </div>
            )}

            {/* Metadados e Ajuste de Etapa/Componente/Avaliação com Seletores Rápidos */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', width: '100%', minWidth: 0 }}>
              
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>Destino dos Dados:</span>
                
                {/* Seletor Rápido de Etapa / Ano */}
                <select
                  value={summary?.detectedGrade || '2º Ano'}
                  onChange={(e) => handleModalGradeChange(e.target.value)}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid #93c5fd',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    cursor: 'pointer',
                  }}
                  title="Alterar o ano escolar/etapa destes dados"
                >
                  {GRADES_OPTIONS.map((g) => (
                    <option key={g} value={g}>🎓 {g}</option>
                  ))}
                </select>

                {/* Seletor Rápido de Componente */}
                <select
                  value={summary?.detectedComponent || 'MATEMATICA'}
                  onChange={(e) => handleModalComponentChange(e.target.value)}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid #bae6fd',
                    background: '#e0f2fe',
                    color: '#0369a1',
                    cursor: 'pointer',
                  }}
                  title="Alterar o componente curricular destes dados"
                >
                  <option value="MATEMATICA">📐 Matemática</option>
                  <option value="LEITURA">📖 Leitura</option>
                  <option value="ESCRITA">✍️ Escrita</option>
                  <option value="FLUENCIA">🗣️ Fluência</option>
                </select>

                {/* Seletor Rápido de Avaliação */}
                <select
                  value={summary?.detectedAssessment || 'Diagnóstica'}
                  onChange={(e) => handleModalAssessmentChange(e.target.value)}
                  style={{
                    fontSize: 12,
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border-2)',
                    background: '#fff',
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                  title="Alterar a edição da avaliação"
                >
                  {ASSESSMENTS_OPTIONS.map((a) => (
                    <option key={a} value={a}>📝 {a}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 6, padding: 2, gap: 2 }}>
                  <button
                    type="button"
                    onClick={() => setViewFilter('UNIQUE_VALID')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: 'none',
                      background: viewFilter === 'UNIQUE_VALID' ? '#fff' : 'transparent',
                      fontWeight: viewFilter === 'UNIQUE_VALID' ? 600 : 400,
                      color: viewFilter === 'UNIQUE_VALID' ? '#15803d' : 'var(--text-2)',
                      cursor: 'pointer',
                      fontSize: 12,
                      boxShadow: viewFilter === 'UNIQUE_VALID' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    🟢 Prontos para Publicar ({summary?.validRows || 0})
                  </button>
                  {summary?.duplicateCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setViewFilter('DUPLICATES')}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 4,
                        border: 'none',
                        background: viewFilter === 'DUPLICATES' ? '#fff' : 'transparent',
                        fontWeight: viewFilter === 'DUPLICATES' ? 600 : 400,
                        color: viewFilter === 'DUPLICATES' ? '#b45309' : 'var(--text-2)',
                        cursor: 'pointer',
                        fontSize: 12,
                        boxShadow: viewFilter === 'DUPLICATES' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      🟡 Duplicatas ({summary.duplicateCount})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setViewFilter('ALL')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: 'none',
                      background: viewFilter === 'ALL' ? '#fff' : 'transparent',
                      fontWeight: viewFilter === 'ALL' ? 600 : 400,
                      color: viewFilter === 'ALL' ? 'var(--primary)' : 'var(--text-2)',
                      cursor: 'pointer',
                      fontSize: 12,
                      boxShadow: viewFilter === 'ALL' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    Todas ({previewData.rows.length})
                  </button>
                </div>

                <Input
                  type="text"
                  placeholder="🔍 Buscar..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{ width: 130, fontSize: 12, padding: '3px 8px', height: 28 }}
                />
              </div>
            </div>

            {/* Tabela de Prévia Completa com Rolagem Horizontal e Cabeçalho Fixo */}
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflowX: 'auto',
                overflowY: 'auto',
                maxHeight: 400,
                width: '100%',
                minWidth: 0,
                background: '#fff',
                position: 'relative',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 12,
                  textAlign: 'left',
                }}
              >
                <thead>
                  <tr style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f1f5f9', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                    {/* Coluna 1: Status */}
                    <th
                      style={{
                        padding: '8px 10px',
                        borderBottom: '2px solid var(--border)',
                        borderRight: '1px solid var(--border)',
                        fontWeight: 600,
                        color: 'var(--text-1)',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        background: '#f1f5f9',
                        minWidth: 100,
                      }}
                    >
                      STATUS
                    </th>

                    {/* Demais colunas fiéis e individuais da planilha */}
                    {importedColumns.map((col, idx) => {
                      const isSchool = isSchoolColumn(col);
                      return (
                        <th
                          key={idx}
                          title={col}
                          style={{
                            padding: '8px 10px',
                            borderBottom: '2px solid var(--border)',
                            borderRight: '1px solid #e2e8f0',
                            fontWeight: 600,
                            color: 'var(--text-1)',
                            whiteSpace: 'nowrap',
                            minWidth: isSchool ? 260 : 110,
                            background: '#f1f5f9',
                          }}
                        >
                          {col}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={importedColumns.length + 1}
                        style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)' }}
                      >
                        Nenhum registro encontrado para a visualização selecionada.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((r, rowIdx) => {
                      const isEven = rowIdx % 2 === 0;
                      const isDup = r.isDuplicate;
                      return (
                        <tr
                          key={r.rowNumber || rowIdx}
                          style={{
                            background: isDup
                              ? '#fffbeb'
                              : r.status === 'INVALIDO'
                              ? '#fff5f5'
                              : isEven
                              ? '#ffffff'
                              : '#fafafa',
                            opacity: isDup ? 0.8 : 1,
                            borderBottom: '1px solid #e2e8f0',
                          }}
                        >
                          {/* Coluna Status */}
                          <td
                            style={{
                              padding: '6px 10px',
                              textAlign: 'center',
                              borderRight: '1px solid var(--border)',
                              whiteSpace: 'nowrap',
                              verticalAlign: 'middle',
                            }}
                          >
                            {isDup ? (
                              <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                                🟡 Duplicata (Fora)
                              </span>
                            ) : r.status === 'VALIDO' ? (
                              <Badge cls={r.action === 'ATUALIZAR' ? 'badge-blue' : 'badge-green'}>
                                {r.action === 'ATUALIZAR' ? '🔵 Atualizar' : '🟢 Novo'}
                              </Badge>
                            ) : (
                              <Badge cls="badge-red" title={r.error}>❌ Inconsistente</Badge>
                            )}
                          </td>

                          {/* Células fiéis das colunas */}
                          {importedColumns.map((col, colIdx) => {
                            const val = r.displayValues?.[col] ?? r.rawDetails?.[col] ?? '';
                            const isSchool = isSchoolColumn(col);

                            return (
                              <td
                                key={colIdx}
                                style={{
                                  padding: '6px 10px',
                                  borderRight: '1px solid #e2e8f0',
                                  verticalAlign: 'middle',
                                  whiteSpace: isSchool ? 'normal' : 'nowrap',
                                }}
                              >
                                {isSchool ? (
                                  <div>
                                    <strong style={{ fontSize: 12 }}>{val || r.schoolName || '—'}</strong>
                                    {r.matchedSchool && (
                                      <div style={{ fontSize: 11, color: '#15803d', marginTop: 1, fontWeight: 500 }}>
                                        ✓ CPE: {r.matchedSchool.name} {r.matchedSchool.inep ? `(${r.matchedSchool.inep})` : ''}
                                      </div>
                                    )}
                                    {r.error && (
                                      <div style={{ fontSize: 11, color: '#dc2626', marginTop: 1 }}>
                                        ⚠️ {r.error}
                                      </div>
                                    )}
                                    {isDup && (
                                      <div style={{ fontSize: 10.5, color: '#b45309', marginTop: 1 }}>
                                        ⚠️ Registro repetido na planilha — desconsiderado na publicação
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className={!isNaN(Number(String(val).replace(',', '.'))) ? 'mono' : ''}>
                                    {val !== '' ? val : '—'}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-3)' }}>
              <span>
                Exibindo <strong>{filteredRows.length}</strong> registro(s) de <strong>{summary?.detectedGrade}</strong> ({summary?.detectedComponent}) {viewFilter === 'UNIQUE_VALID' ? 'prontos para publicação' : `de ${previewData.rows.length} no arquivo`}
              </span>
              <span>{importedColumns.length} colunas importáveis ativas</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
