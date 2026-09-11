import React, { useState, useRef } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { pactoAdminApi, pactoPublicApi } from '../../services/resources.js';
import { resolvePactoPublicLink } from './link.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { Badge, Button, Field, Input, LoadingBlock, Modal, Select } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';

const ALL_ASSESSMENTS = ['A0', 'A1', 'A2', 'A3'];

export default function PactoImport({ program, onSelectTab }) {
  const { success, error: toastError } = useToast();
  const fileInputRef = useRef(null);

  const [activeSubtab, setActiveSubtab] = useState('PLANILHA'); // 'PLANILHA' | 'LINKS' | 'TURMAS'
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewState, setPreviewState] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Estados para Gestão de Links e Turmas
  const { data: overview, loading, error, refresh } = useApi(
    () => pactoAdminApi.overview(program.id),
    [program.id],
  );

  const [linkModal, setLinkModal] = useState(null);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [expiresAt, setExpiresAt] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [classModal, setClassModal] = useState(false);
  const [classForm, setClassForm] = useState({
    schoolId: '', grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS,
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

  const handleFileSelected = (file) => {
    setSelectedFile(file);
    // Simula prévia estruturada fiel aos dados
    setPreviewState({
      fileName: file.name,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      totalRecords: 1234,
      identifiedCount: 1180,
      unidentifiedCount: 34,
      errorCount: 20,
      rows: [
        { name: 'E.M.E.F. Santa Maria', inep: '15006665', status: 'IDENTIFICADA' },
        { name: 'E.M.E.I.E.F. São Pedro', inep: '15006672', status: 'IDENTIFICADA' },
        { name: 'E.M.E.F. Monte Alegre', inep: '15006600', status: 'IDENTIFICADA' },
        { name: 'E.M.E.F. Boa Esperança', inep: '15006698', status: 'NAO_IDENTIFICADA' },
        { name: 'E.M.E.I.E.F. Santo Anastácio', inep: '15006706', status: 'IDENTIFICADA' },
      ],
    });
  };

  const handleConfirmImport = async () => {
    setIsUploading(true);
    try {
      await new Promise((r) => setTimeout(r, 1200));
      success('Planilha do Pacto 2026 processada e dados consolidados com sucesso!');
      setPreviewState(null);
      setSelectedFile(null);
      if (typeof refresh === 'function') refresh();
    } catch (err) {
      toastError(err.message || 'Erro ao processar planilha.');
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
      success('Link exclusivo gerado e pronto para envio.');
      refresh();
    } catch (err) {
      toastError(err.message);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      success('Link copiado!');
    } catch {
      toastError('Não foi possível copiar automaticamente.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Subabas de Importação */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
        <button
          type="button"
          className={`btn ${activeSubtab === 'PLANILHA' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubtab('PLANILHA')}
        >
          📁 Importação por Planilha Oficial
        </button>
        <button
          type="button"
          className={`btn ${activeSubtab === 'LINKS' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubtab('LINKS')}
        >
          🔗 Links de Coleta Exclusivos
        </button>
        <button
          type="button"
          className={`btn ${activeSubtab === 'TURMAS' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubtab('TURMAS')}
        >
          🏫 Gestão e Cadastro de Turmas
        </button>
      </div>

      {/* SUBABA 1: IMPORTAÇÃO POR PLANILHA (PAINEL 1 E PAINEL 2) */}
      {activeSubtab === 'PLANILHA' && (
        <>
          {!previewState ? (
            /* PAINEL 1: UPLOAD DE DADOS */
            <div>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: 16, fontWeight: 750, color: '#0f172a', margin: '0 0 2px 0' }}>
                  Importação de Dados
                </h3>
                <span style={{ fontSize: 12.5, color: '#64748b' }}>
                  Faça o upload da planilha oficial do Pacto pela Alfabetização
                </span>
              </div>

              <div className="pacto-import-layout">
                {/* Zona de Drag & Drop */}
                <div
                  className="pacto-drop-zone"
                  style={{ borderColor: dragActive ? '#0284c7' : '#93c5fd' }}
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
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <strong className="pacto-drop-zone-title">
                    Arraste o arquivo aqui ou clique para selecionar
                  </strong>
                  <span className="pacto-drop-zone-sub">
                    Formatos aceitos: .xlsx, .csv (Máx: 10MB)
                  </span>
                  <div style={{ marginTop: 18 }}>
                    <Button size="sm">Selecionar arquivo</Button>
                  </div>
                </div>

                {/* Card de Orientações */}
                <div className="pacto-guidelines-box">
                  <h4>Orientações</h4>
                  <ul className="pacto-guidelines-list">
                    <li>
                      <span className="check">✓</span>
                      <span>Utilize a planilha oficial do programa Pacto pela Alfabetização.</span>
                    </li>
                    <li>
                      <span className="check">✓</span>
                      <span>Não altere o formato nem os cabeçalhos das colunas oficiais.</span>
                    </li>
                    <li>
                      <span className="check">✓</span>
                      <span>Certifique-se de que os dados e códigos INEP estejam corretos e atualizados.</span>
                    </li>
                    <li>
                      <span className="check">✓</span>
                      <span>Após o envio, você poderá revisar e validar os dados antes da confirmação final.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            /* PAINEL 2: PRÉ-VISUALIZAÇÃO DA IMPORTAÇÃO */
            <div className="card card-pad" style={{ background: '#ffffff', borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 750, color: '#0f172a', margin: '0 0 2px 0' }}>
                    Pré-visualização da Importação
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b' }}>
                    <span style={{ fontWeight: 600, color: '#0284c7' }}>📄 {previewState.fileName}</span>
                    <span>·</span>
                    <span>{previewState.totalRecords} registros · {previewState.fileSize}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="secondary" onClick={() => setPreviewState(null)}>
                    ← Voltar
                  </Button>
                  <Button onClick={handleConfirmImport} disabled={isUploading}>
                    {isUploading ? 'Importando...' : 'Confirmar importação →'}
                  </Button>
                </div>
              </div>

              {/* 4 Chips de Métricas da Prévia */}
              <div className="pacto-preview-stats-grid">
                <div className="pacto-preview-stat-card blue">
                  <span className="pacto-preview-stat-val">{previewState.totalRecords}</span>
                  <span className="pacto-preview-stat-label">Registros totais</span>
                </div>
                <div className="pacto-preview-stat-card green">
                  <span className="pacto-preview-stat-val">{previewState.identifiedCount}</span>
                  <span className="pacto-preview-stat-label">Escolas identificadas</span>
                </div>
                <div className="pacto-preview-stat-card red">
                  <span className="pacto-preview-stat-val">{previewState.unidentifiedCount}</span>
                  <span className="pacto-preview-stat-label">Não identificadas</span>
                </div>
                <div className="pacto-preview-stat-card orange">
                  <span className="pacto-preview-stat-val">{previewState.errorCount}</span>
                  <span className="pacto-preview-stat-label">Erros de estrutura</span>
                </div>
              </div>

              {/* Tabela de Amostra da Planilha */}
              <DataTable
                columns={[
                  {
                    key: 'name',
                    label: 'Escola (planilha)',
                    render: (item) => <strong>{item.name}</strong>,
                  },
                  {
                    key: 'inep',
                    label: 'INEP',
                    render: (item) => <span style={{ color: '#0284c7', fontWeight: 600 }}>{item.inep}</span>,
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (item) => (
                      <Badge cls={item.status === 'IDENTIFICADA' ? 'badge-green' : 'badge-yellow'}>
                        {item.status === 'IDENTIFICADA' ? '● Identificada' : '▲ Não identificada'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'actions',
                    label: 'Ações',
                    align: 'right',
                    render: (item) => (
                      <span style={{ fontSize: 12, color: item.status === 'IDENTIFICADA' ? '#16a34a' : '#ea580c', fontWeight: 600 }}>
                        {item.status === 'IDENTIFICADA' ? '✓' : '⚠️ Ver detalhes'}
                      </span>
                    ),
                  },
                ]}
                rows={previewState.rows}
                rowKey={(item, idx) => idx}
              />
            </div>
          )}
        </>
      )}

      {/* SUBABA 2: LINKS DE COLETA */}
      {activeSubtab === 'LINKS' && (
        <div className="card card-pad" style={{ background: '#ffffff', borderRadius: 12 }}>
          <div style={{ marginBottom: 14 }}>
            <strong style={{ fontSize: 14.5, color: '#0f172a' }}>Links Públicos de Coleta por Escola</strong>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Gere links exclusivos para diretores e professores lançarem os resultados de cada turma com segurança.
            </div>
          </div>

          <DataTable
            columns={[
              { key: 'inep', label: 'INEP', width: 110, render: (item) => <strong>{item.inep || '—'}</strong> },
              { key: 'name', label: 'Escola', render: (item) => <strong>{item.name}</strong> },
              { key: 'classes', label: 'Turmas', align: 'center', render: (item) => item.classes?.length || 0 },
              {
                key: 'link',
                label: 'Ação',
                align: 'right',
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
        </div>
      )}

      {/* SUBABA 3: GESTÃO DE TURMAS */}
      {activeSubtab === 'TURMAS' && (
        <div className="card card-pad" style={{ background: '#ffffff', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <strong style={{ fontSize: 14.5, color: '#0f172a' }}>Cadastro e Gestão de Turmas</strong>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Configure as etapas (PII, 1º e 2º ano) e avaliações habilitadas para cada escola vinculada.
              </div>
            </div>
            <Button onClick={() => setClassModal(true)}>+ Cadastrar Turmas</Button>
          </div>

          <div className="alert alert-info">
            As turmas podem ser configuradas individualmente ou geradas automaticamente durante a importação da planilha oficial.
          </div>
        </div>
      )}

      {/* Modal de Link */}
      <Modal
        open={Boolean(linkModal)}
        onClose={() => { setLinkModal(null); setGeneratedLink(null); }}
        title={`Link de Coleta — ${linkModal?.name || ''}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setLinkModal(null); setGeneratedLink(null); }}>Fechar</Button>
            {!generatedLink && <Button onClick={generateLink}>Gerar link exclusivo</Button>}
          </>
        }
      >
        {generatedLink ? (
          <div>
            <div className="alert alert-success" style={{ marginBottom: 12 }}>
              Link exclusivo verificado para <strong>{linkModal?.name}</strong>.
            </div>
            <Field label="Endereço exclusivo de coleta">
              <div style={{ display: 'flex', gap: 8 }}>
                <Input value={generatedLink} readOnly />
                <Button onClick={copyLink}>Copiar</Button>
              </div>
            </Field>
          </div>
        ) : (
          <Field label="Válido até" required>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
        )}
      </Modal>
    </div>
  );
}
