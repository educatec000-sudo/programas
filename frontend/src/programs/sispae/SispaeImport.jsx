import React, { useState, useRef, useEffect } from 'react';
import { useApi, clearApiCache } from '../../hooks/useApi.js';
import { sispaeApi, schoolsApi } from '../../services/resources.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { Badge, LoadingBlock } from '../../components/ui.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

export default function SispaeImport({ program = {}, refreshProgram, onSelectTab }) {
  const { success, error: toastError } = useToast();
  const [selectedAppMode, setSelectedAppMode] = useState('EXISTING'); // 'EXISTING' | 'NEW'
  const [selectedAppId, setSelectedAppId] = useState('');
  const [newAppName, setNewAppName] = useState('Simulado Pará 2026 – Alfabetização');
  const [newAppType, setNewAppType] = useState('SIMULADO');
  const [newAppStage, setNewAppStage] = useState('Alfabetização');
  const [componentOverride, setComponentOverride] = useState('AUTO');
  const [gradeOverride, setGradeOverride] = useState('2º Ano');

  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const fileInputRef = useRef(null);
  const resultRef = useRef(null);
  const programId = program?.id;
  const programYear = program?.year || 2026;

  // Busca aplicações existentes
  const { data: appsData, refetch: refetchApps } = useApi(
    () => (programId ? sispaeApi.applications(programId) : Promise.resolve({ applications: [] })),
    [programId],
  );

  // Busca escolas cadastradas no CPE para o mapeador manual
  const { data: allSchoolsData } = useApi(
    () => schoolsApi.list({ pageSize: 500 }),
    [],
  );

  const applications = appsData?.applications || [];
  const dbSchools = allSchoolsData?.data || [];

  // Se não houver aplicações existentes, padroniza automaticamente para criar nova
  useEffect(() => {
    if (applications.length === 0 && selectedAppMode === 'EXISTING') {
      setSelectedAppMode('NEW');
    }
  }, [applications.length, selectedAppMode]);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPreviewData(null);
      setImportResult(null);
      setErrorMsg(null);
    }
  };

  const handleGeneratePreview = async () => {
    if (!file) return;
    setLoadingPreview(true);
    setErrorMsg(null);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (componentOverride !== 'AUTO') formData.append('component', componentOverride);
      if (gradeOverride) formData.append('grade', gradeOverride);
      formData.append('year', programYear);

      if (selectedAppMode === 'NEW' && newAppName.trim()) {
        formData.append('applicationName', newAppName.trim());
        formData.append('applicationType', newAppType);
      }

      const preview = await sispaeApi.previewImport(programId, formData);
      setPreviewData(preview);

      // Sugestão automática de nome e tipo da aplicação vinda da planilha
      if (preview.suggestedApplication) {
        if (!selectedAppId && selectedAppMode === 'NEW') {
          setNewAppName(preview.suggestedApplication.name || 'Simulado Pará 2026 – Alfabetização');
          setNewAppType(preview.suggestedApplication.type || 'SIMULADO');
        }
      }
    } catch (err) {
      const msg = err.message || 'Erro ao processar prévia da planilha.';
      setErrorMsg(msg);
      toastError(msg);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleManualSchoolMatch = (index, targetSchoolId) => {
    if (!previewData?.records) return;
    const targetSchool = dbSchools.find((s) => s.id === targetSchoolId);
    if (!targetSchool) return;

    const updatedRecords = [...previewData.records];
    updatedRecords[index] = {
      ...updatedRecords[index],
      matchedSchool: {
        id: targetSchool.id,
        name: targetSchool.name,
        inep: targetSchool.inep,
        zone: targetSchool.zone,
      },
      matchMethod: 'MANUAL_OVERRIDE',
      status: 'VALIDO',
      statusMessage: 'Escola vinculada manualmente.',
    };

    setPreviewData({
      ...previewData,
      records: updatedRecords,
      summary: {
        ...previewData.summary,
        validRows: updatedRecords.filter((r) => r.status === 'VALIDO').length,
        unidentifiedRows: updatedRecords.filter((r) => r.status === 'NAO_IDENTIFICADA').length,
      },
    });
  };

  const handleConfirmImport = async () => {
    if (!previewData?.records?.length) {
      setErrorMsg('Gere a prévia da planilha antes de confirmar.');
      return;
    }

    const validRowsCount = previewData.records.filter((r) => r.matchedSchool || r.schoolId).length;
    if (validRowsCount === 0) {
      const msg = 'Nenhuma escola identificada para importar. Vincule as escolas pendentes antes de continuar.';
      setErrorMsg(msg);
      toastError(msg);
      return;
    }

    setConfirming(true);
    setErrorMsg(null);
    try {
      let appPayload = {};

      if (selectedAppMode === 'EXISTING' && applications.length > 0) {
        const targetApp = applications.find((a) => a.id === selectedAppId) || applications[0];
        appPayload = {
          id: selectedAppId || targetApp?.id,
          name: targetApp?.name,
          type: targetApp?.type || 'SIMULADO',
          year: targetApp?.year || programYear,
        };
      } else {
        // Modo nova aplicação ou fallback automático
        const nameToUse = newAppName.trim() || previewData.suggestedApplication?.name || 'Simulado Pará 2026 – Alfabetização';
        const typeToUse = newAppType || previewData.suggestedApplication?.type || 'SIMULADO';
        appPayload = {
          name: nameToUse,
          type: typeToUse,
          stage: newAppStage || 'Alfabetização',
          year: programYear,
        };
      }

      const result = await sispaeApi.confirmImport(programId, {
        application: appPayload,
        records: previewData.records,
        year: programYear,
      });

      // Limpa cache de requisições para atualização instantânea
      clearApiCache();

      setImportResult(result);
      setPreviewData(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      success(`Importação concluída! ${result.total || result.createdCount} registros gravados com sucesso.`);
      refetchApps();
      refreshProgram?.();

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      const msg = err.message || 'Erro ao confirmar importação dos dados do SisPAE.';
      setErrorMsg(msg);
      toastError(msg);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* MENSAGEM DE ERRO GLOBAL */}
      {errorMsg && (
        <div
          className="alert alert-error"
          style={{
            padding: '14px 18px',
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: 12,
            border: '1px solid #fca5a5',
            fontWeight: 600,
            fontSize: 13.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>⛔ {errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* FEEDBACK DE SUCESSO DA IMPORTAÇÃO */}
      {importResult && (
        <div
          ref={resultRef}
          className="card"
          style={{
            padding: '26px 30px',
            background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
            borderRadius: 16,
            border: '2px solid #86efac',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            boxShadow: '0 4px 16px rgba(16, 185, 129, 0.12)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 36 }}>🎉</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#064e3b' }}>
                Importação Concluída com Sucesso!
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: 13.5, color: '#047857' }}>
                Os resultados foram vinculados à aplicação <strong>{importResult.applicationName}</strong> ({importResult.applicationType === 'SIMULADO' ? 'Simulado' : 'Avaliação Oficial'}).
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 18, fontSize: 13.5, color: '#065f46', background: 'rgba(255,255,255,0.7)', padding: '12px 18px', borderRadius: 10 }}>
            <span>Registros Novos: <strong>{importResult.createdCount}</strong></span>
            <span>Registros Atualizados: <strong>{importResult.updatedCount}</strong></span>
            <span>Total Gravado: <strong>{importResult.total}</strong></span>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
            {onSelectTab && (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onSelectTab('sispae-dashboard')}
                  style={{ fontWeight: 700, padding: '9px 18px' }}
                >
                  📊 Ver Painel da Aplicação
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onSelectTab('sispae-ranking')}
                  style={{ fontWeight: 700, padding: '9px 18px' }}
                >
                  🏆 Ver Ranking de Escolas
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onSelectTab('sispae-resultados')}
                  style={{ fontWeight: 700, padding: '9px 18px' }}
                >
                  🏫 Ver Resultados por Escola
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setImportResult(null); setErrorMsg(null); }}
              style={{ fontWeight: 600, padding: '9px 14px' }}
            >
              + Importar Outra Planilha
            </button>
          </div>
        </div>
      )}

      {/* 1. PAINEL DE CONFIGURAÇÃO DA IMPORTAÇÃO */}
      <div
        className="card"
        style={{
          padding: '24px 28px',
          background: 'var(--surface, #ffffff)',
          borderRadius: 14,
          border: '1px solid var(--border, #e2e8f0)',
          boxShadow: 'var(--shadow)',
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text, #0f172a)' }}>
            Importar Resultados do SisPAE
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-2, #64748b)' }}>
            Importe planilhas oficiais MEC/CAEd ou padrão municipal vinculando os dados à aplicação correspondente (Simulado ou Avaliação Oficial).
          </p>
        </div>

        {/* Escolha da Aplicação Alvo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #334155)' }}>
            1. Aplicação de Destino dos Resultados:
          </label>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 8,
                border: `1.5px solid ${selectedAppMode === 'EXISTING' ? '#0284c7' : 'var(--border, #cbd5e1)'}`,
                background: selectedAppMode === 'EXISTING' ? 'rgba(2, 132, 199, 0.08)' : 'var(--surface, #ffffff)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: selectedAppMode === 'EXISTING' ? '#0284c7' : 'var(--text, #475569)',
              }}
            >
              <input
                type="radio"
                name="appMode"
                checked={selectedAppMode === 'EXISTING'}
                onChange={() => setSelectedAppMode('EXISTING')}
              />
              Vincular a uma Aplicação Existente
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 8,
                border: `1.5px solid ${selectedAppMode === 'NEW' ? '#0284c7' : 'var(--border, #cbd5e1)'}`,
                background: selectedAppMode === 'NEW' ? 'rgba(2, 132, 199, 0.08)' : 'var(--surface, #ffffff)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: selectedAppMode === 'NEW' ? '#0284c7' : 'var(--text, #475569)',
              }}
            >
              <input
                type="radio"
                name="appMode"
                checked={selectedAppMode === 'NEW'}
                onChange={() => setSelectedAppMode('NEW')}
              />
              Criar Nova Aplicação
            </label>
          </div>

          {selectedAppMode === 'EXISTING' ? (
            <div style={{ maxWidth: 520 }}>
              <select
                value={selectedAppId || applications[0]?.id || ''}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="select"
                style={{ width: '100%', padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}
              >
                {applications.length > 0 ? (
                  applications.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name} ({app.type === 'SIMULADO' ? 'Simulado' : 'Oficial'}) · {app.resultsCount || 0} registros
                    </option>
                  ))
                ) : (
                  <option value="">Nenhuma aplicação existente — preencha abaixo para criar</option>
                )}
              </select>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, maxWidth: 800 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-2, #64748b)', marginBottom: 4 }}>
                  Nome da Aplicação *
                </label>
                <input
                  type="text"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  placeholder="Ex: Simulado Pará 2026 – Alfabetização"
                  className="input"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-2, #64748b)', marginBottom: 4 }}>
                  Tipo da Aplicação *
                </label>
                <select
                  value={newAppType}
                  onChange={(e) => setNewAppType(e.target.value)}
                  className="select"
                >
                  <option value="SIMULADO">Simulado Preparatório</option>
                  <option value="AVALIACAO_OFICIAL">Avaliação Oficial SisPAE</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-2, #64748b)', marginBottom: 4 }}>
                  Etapa / Segmento
                </label>
                <input
                  type="text"
                  value={newAppStage}
                  onChange={(e) => setNewAppStage(e.target.value)}
                  placeholder="Ex: Alfabetização ou 2º Ano"
                  className="input"
                />
              </div>
            </div>
          )}
        </div>

        {/* Upload do Arquivo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #334155)' }}>
            2. Selecione o Arquivo (.csv ou .xlsx):
          </label>

          <div
            style={{
              border: '2px dashed var(--border, #cbd5e1)',
              borderRadius: 10,
              padding: '24px 20px',
              textAlign: 'center',
              background: file ? 'rgba(2, 132, 199, 0.04)' : 'transparent',
              cursor: 'pointer',
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <div style={{ fontSize: 28, marginBottom: 6 }}>📁</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text, #0f172a)' }}>
              {file ? file.name : 'Clique para selecionar a planilha de Língua Portuguesa ou Matemática'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2, #64748b)', marginTop: 2 }}>
              {file
                ? `${(file.size / 1024).toFixed(1)} KB · Arquivo selecionado`
                : 'Formatos suportados: CSV (padrão MEC/CAEd delimitado por ;) ou XLSX'}
            </div>
          </div>
        </div>

        {/* Botão de Análise de Prévia */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGeneratePreview}
            disabled={!file || loadingPreview}
            style={{ padding: '9px 20px', fontWeight: 700, fontSize: 13.5 }}
          >
            {loadingPreview ? 'Processando Estrutura...' : '🔍 Analisar e Gerar Prévia'}
          </button>
        </div>
      </div>

      {/* 2. PRÉVIA INTERATIVA DA IMPORTAÇÃO */}
      {previewData && (
        <div
          className="card"
          style={{
            padding: '24px 28px',
            background: 'var(--surface, #ffffff)',
            borderRadius: 14,
            border: '1px solid var(--border, #e2e8f0)',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text, #0f172a)' }}>
                Prévia da Importação — {previewData.filename}
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: 12.5, color: 'var(--text-2, #64748b)' }}>
                Valide as {previewData.summary?.validRows || 0} escolas identificadas antes de gravar.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirmImport}
              disabled={confirming || previewData.summary.validRows === 0}
              style={{
                background: '#10b981',
                borderColor: '#10b981',
                padding: '10px 24px',
                fontWeight: 800,
                fontSize: 14,
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              }}
            >
              {confirming ? 'Gravando no SisPAE...' : '💾 Confirmar Importação'}
            </button>
          </div>

          {/* Cards de Resumo da Prévia */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <div style={{ padding: '12px 16px', background: 'var(--surface-2, #f8fafc)', borderRadius: 8, border: '1px solid var(--border, #e2e8f0)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-2, #64748b)', fontWeight: 600 }}>Total de Linhas</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text, #0f172a)' }}>{previewData.summary.totalRows}</div>
            </div>

            <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <div style={{ fontSize: 11.5, color: '#166534', fontWeight: 600 }}>Escolas Identificadas</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#15803d' }}>
                {previewData.summary.identifiedSchools} escolas ({previewData.summary.validRows} válidos)
              </div>
            </div>

            <div style={{ padding: '12px 16px', background: previewData.summary.duplicateRows > 0 ? 'rgba(245, 158, 11, 0.1)' : 'var(--surface-2, #f8fafc)', borderRadius: 8, border: '1px solid var(--border, #e2e8f0)' }}>
              <div style={{ fontSize: 11.5, color: '#92400e', fontWeight: 600 }}>Duplicatas Deduplicadas</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#b45309' }}>{previewData.summary.duplicateRows}</div>
            </div>

            <div style={{ padding: '12px 16px', background: previewData.summary.unidentifiedRows > 0 ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface-2, #f8fafc)', borderRadius: 8, border: '1px solid var(--border, #e2e8f0)' }}>
              <div style={{ fontSize: 11.5, color: '#991b1b', fontWeight: 600 }}>Escolas Não Identificadas</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#b91c1c' }}>{previewData.summary.unidentifiedRows}</div>
            </div>
          </div>

          {/* Tabela de Linhas da Prévia */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--border, #e2e8f0)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2, #f8fafc)', borderBottom: '1px solid var(--border, #e2e8f0)', color: 'var(--text-2, #475569)' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 700, width: 45 }}>#</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Nome na Planilha</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Escola Vinculada (CPE)</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Componente</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'center' }}>Participação</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700 }}>Níveis de Desempenho</th>
                  <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {previewData.records.slice(0, 50).map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid var(--border, #f1f5f9)',
                      background: row.isDuplicate ? 'rgba(0,0,0,0.02)' : !row.matchedSchool ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 14px', color: 'var(--text-3, #94a3b8)' }}>{row.rowNumber}</td>

                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text, #0f172a)' }}>
                      {row.rawSchoolName}
                      {row.inep && <div style={{ fontSize: 11, color: 'var(--text-2, #64748b)' }}>INEP: {row.inep}</div>}
                    </td>

                    <td style={{ padding: '10px 14px' }}>
                      {row.matchedSchool ? (
                        <div>
                          <span style={{ fontWeight: 700, color: '#047857' }}>{row.matchedSchool.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-2, #64748b)', marginLeft: 6 }}>
                            ({row.matchMethod === 'INEP_EXACT' ? 'INEP exato' : 'Nome aproximado'})
                          </span>
                        </div>
                      ) : (
                        <select
                          onChange={(e) => handleManualSchoolMatch(idx, e.target.value)}
                          className="select"
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid #fca5a5',
                            fontSize: 11.5,
                            color: '#991b1b',
                          }}
                        >
                          <option value="">Selecione a escola correspondente...</option>
                          {dbSchools.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.inep || 's/ INEP'})
                            </option>
                          ))}
                        </select>
                      )}
                    </td>

                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          background: row.component === 'LINGUA_PORTUGUESA' ? 'rgba(2, 132, 199, 0.15)' : 'rgba(147, 51, 234, 0.15)',
                          color: row.component === 'LINGUA_PORTUGUESA' ? '#0284c7' : '#9333ea',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {row.component === 'LINGUA_PORTUGUESA' ? '📖 Língua Portuguesa' : '📐 Matemática'}
                      </span>
                    </td>

                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>
                      {fmt(row.participationRate)}%
                    </td>

                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
                        {row.performanceLevels?.map((lvl, lIdx) => (
                          <span key={lIdx} style={{ color: 'var(--text-2, #475569)' }}>
                            <strong>{lvl.level}:</strong> {fmt(lvl.percentage)}%
                          </span>
                        ))}
                      </div>
                    </td>

                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {row.isDuplicate ? (
                        <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: 4, fontSize: 10.5, fontWeight: 700 }}>
                          DUPLICADO
                        </span>
                      ) : row.matchedSchool ? (
                        <span style={{ background: '#d1fae5', color: '#065f46', padding: '2px 6px', borderRadius: 4, fontSize: 10.5, fontWeight: 700 }}>
                          PRONTO
                        </span>
                      ) : (
                        <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: 4, fontSize: 10.5, fontWeight: 700 }}>
                          PENDENTE
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Botão de Confirmação no Rodapé da Prévia */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-2, #64748b)' }}>
              {previewData.records.length > 50 && `Exibindo 50 de ${previewData.records.length} registros. `}
              Clique no botão verde para gravar os resultados no SisPAE.
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirmImport}
              disabled={confirming || previewData.summary.validRows === 0}
              style={{
                background: '#10b981',
                borderColor: '#10b981',
                padding: '10px 24px',
                fontWeight: 800,
                fontSize: 14,
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              }}
            >
              {confirming ? 'Gravando no SisPAE...' : '💾 Confirmar Importação'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
