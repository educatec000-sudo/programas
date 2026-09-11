import React, { useState, useMemo, useRef } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { parcApi, schoolsApi } from '../../services/resources.js';
import { Badge, Button, Field, LoadingBlock, Select } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

function normalizeSearchText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Linha de resolução de escola não identificada com busca em tempo real e sugestões de 1 clique.
 */
function UnmatchedSchoolRow({
  unmatched,
  currentMappedId,
  availableSchools,
  onMapSchool,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const matchedSchoolObj = useMemo(() => {
    if (!currentMappedId) return null;
    return availableSchools.find((s) => s.id === currentMappedId) || null;
  }, [currentMappedId, availableSchools]);

  // Filtra as opções do dropdown com base no termo digitado
  const filteredSchools = useMemo(() => {
    if (!searchTerm.trim()) {
      return availableSchools;
    }
    const q = normalizeSearchText(searchTerm);
    return availableSchools.filter((s) => {
      const nameNorm = normalizeSearchText(s.name);
      const inep = String(s.inep || '');
      return nameNorm.includes(q) || inep.includes(q);
    });
  }, [availableSchools, searchTerm]);

  return (
    <div
      style={{
        background: currentMappedId ? '#f0fdf4' : '#fff',
        padding: '12px 14px',
        borderRadius: 8,
        border: currentMappedId ? '1.5px solid #86efac' : '1px solid #fde68a',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'all 0.15s ease',
      }}
    >
      {/* Cabeçalho da Linha */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>{currentMappedId ? '✅' : '⚠️'}</span>
            <strong style={{ fontSize: 14.5, color: currentMappedId ? '#166534' : '#1e293b' }}>
              {unmatched.schoolNameRaw}
            </strong>
            {currentMappedId ? (
              <Badge cls="badge-green" style={{ fontSize: 11, fontWeight: 700 }}>
                Vinculada
              </Badge>
            ) : (
              <Badge cls="badge-yellow" style={{ fontSize: 11, fontWeight: 600 }}>
                Pendente
              </Badge>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Linha {unmatched.rowNumber} · INEP na planilha: <strong>{unmatched.inepRaw || 'Não informado'}</strong>
            <span style={{ marginLeft: 8, color: '#b45309' }}>• {unmatched.error}</span>
          </div>
        </div>

        {currentMappedId && (
          <Button
            variant="ghost"
            size="sm"
            style={{ color: '#ef4444', fontSize: 12, padding: '2px 8px' }}
            onClick={() => {
              onMapSchool(unmatched.rowNumber, '');
              setSearchTerm('');
            }}
          >
            ✕ Desfazer Vínculo
          </Button>
        )}
      </div>

      {/* Sugestões Automáticas Rápidas (1 Clique) */}
      {unmatched.candidateSchools?.length > 0 && !currentMappedId && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, background: '#fffbeb', padding: '6px 10px', borderRadius: 6, border: '1px dashed #fde68a' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>Sugestão Sugerida:</span>
          {unmatched.candidateSchools.map((cand) => (
            <button
              key={cand.id}
              type="button"
              onClick={() => {
                onMapSchool(unmatched.rowNumber, cand.id);
                setSearchTerm('');
              }}
              style={{
                background: '#fff',
                border: '1px solid #f59e0b',
                color: '#92400e',
                borderRadius: 14,
                padding: '3px 10px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
              title="Clique para vincular imediatamente esta escola"
            >
              ✨ {cand.name} {cand.inep ? `(INEP: ${cand.inep})` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Controles de Busca e Seleção */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(280px, 1.4fr)', gap: 10, alignItems: 'center', marginTop: 2 }}>
        {/* Campo de Busca Rápida */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className="input"
            placeholder="🔎 Digite para filtrar a lista..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              fontSize: 13,
              background: currentMappedId ? '#f0fdf4' : '#fff',
              borderColor: searchTerm ? '#f59e0b' : currentMappedId ? '#86efac' : '#cbd5e1',
              paddingRight: searchTerm ? 26 : 10,
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: 13,
                padding: 0,
              }}
              title="Limpar busca"
            >
              ✕
            </button>
          )}
        </div>

        {/* Dropdown com as escolas filtradas */}
        <div>
          <Select
            value={currentMappedId || ''}
            onChange={(e) => onMapSchool(unmatched.rowNumber, e.target.value)}
            style={{
              fontSize: 13,
              fontWeight: currentMappedId ? 600 : 400,
              color: currentMappedId ? '#166534' : 'inherit',
              borderColor: currentMappedId ? '#86efac' : searchTerm ? '#f59e0b' : '#cbd5e1',
            }}
          >
            <option value="">
              {searchTerm
                ? `-- ${filteredSchools.length} escola(s) encontrada(s) para "${searchTerm}" --`
                : `-- Selecione a escola do CPE (${availableSchools.length} disponíveis) --`}
            </option>

            {/* Sugestões por similaridade quando a busca estiver vazia */}
            {!searchTerm && unmatched.candidateSchools?.length > 0 && (
              <optgroup label="✨ Sugestões por similaridade">
                {unmatched.candidateSchools.map((cand) => (
                  <option key={`sug-${cand.id}`} value={cand.id}>
                    ✨ {cand.name} (INEP: {cand.inep || '—'})
                  </option>
                ))}
              </optgroup>
            )}

            {/* Lista Filtrada ou Completa */}
            <optgroup label={searchTerm ? `Resultados da busca (${filteredSchools.length})` : 'Todas as escolas da rede'}>
              {filteredSchools.map((sch) => (
                <option key={sch.id} value={sch.id}>
                  {sch.name} (INEP: {sch.inep || '—'})
                </option>
              ))}
            </optgroup>
          </Select>
        </div>
      </div>

      {/* Confirmação Visual da Escola Vinculada */}
      {matchedSchoolObj && (
        <div style={{ fontSize: 12.5, color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🎯 Vinculada ao cadastro CPE:</span>
          <span>{matchedSchoolObj.name}</span>
          <span className="mono" style={{ opacity: 0.8 }}>(INEP: {matchedSchoolObj.inep || '—'})</span>
        </div>
      )}
    </div>
  );
}

export default function ParcImport({ program, onImportSuccess }) {
  // Controle de Modo: Planilha ou Lançamento Manual
  const [activeTab, setActiveTab] = useState('SPREADSHEET'); // 'SPREADSHEET' | 'MANUAL'

  // ==========================================
  // ESTADOS DO MODO PLANILHA
  // ==========================================
  const [file, setFile] = useState(null);
  const [cycle, setCycle] = useState('AUTO');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [manualMappings, setManualMappings] = useState({});
  const [searchUnmatched, setSearchUnmatched] = useState('');
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  // ==========================================
  // ESTADOS DO MODO MANUAL
  // ==========================================
  const [manualSchoolMode, setManualSchoolMode] = useState('EXISTING'); // 'EXISTING' | 'NEW'
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [schoolSearchQuery, setSchoolSearchQuery] = useState('');

  // Formulário de Nova Escola
  const [newSchoolForm, setNewSchoolForm] = useState({
    name: '',
    inep: '',
    schoolType: 'E.M.E.F.',
    zone: 'URBANA',
    district: '',
  });

  // Formulário de Métricas do PARC
  const [manualCycle, setManualCycle] = useState('ENTRADA');
  const [manualYear, setManualYear] = useState(program.year || 2026);
  const [enrolledInput, setEnrolledInput] = useState('');
  const [evaluatedInput, setEvaluatedInput] = useState('');
  const [partRateInput, setPartRateInput] = useState('');
  const [partRateOverridden, setPartRateOverridden] = useState(false);

  // Níveis de Fluência
  const [p1Input, setP1Input] = useState('');
  const [p2Input, setP2Input] = useState('');
  const [p3Input, setP3Input] = useState('');
  const [p4Input, setP4Input] = useState('');
  const [beginnerInput, setBeginnerInput] = useState('');
  const [fluentInput, setFluentInput] = useState('');
  const [manualDraft, setManualDraft] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [manualSuccessMsg, setManualSuccessMsg] = useState('');
  const [manualErrorMsg, setManualErrorMsg] = useState('');

  // Busca as escolas participantes do programa PARC para o seletor manual
  const { data: participatingData, reload: reloadSchools } = useApi(
    () => parcApi.participatingSchools(program.id),
    [program.id],
  );
  const participatingSchools = participatingData?.participatingSchools || participatingData?.schools || [];

  const filteredParticipatingSchools = useMemo(() => {
    if (!schoolSearchQuery.trim()) return participatingSchools;
    const q = normalizeSearchText(schoolSearchQuery);
    return participatingSchools.filter((s) => {
      const nameNorm = normalizeSearchText(s.name || s.school?.name);
      const inep = String(s.inep || s.school?.inep || '');
      const zone = normalizeSearchText(s.zone || s.school?.zone || '');
      const district = normalizeSearchText(s.district || s.school?.district || '');
      return nameNorm.includes(q) || inep.includes(q) || zone.includes(q) || district.includes(q);
    });
  }, [participatingSchools, schoolSearchQuery]);

  const selectedSchoolObj = useMemo(() => {
    if (!selectedSchoolId) return null;
    return participatingSchools.find((s) => (s.id || s.schoolId) === selectedSchoolId) || null;
  }, [selectedSchoolId, participatingSchools]);

  // Auto-cálculo da taxa de participação
  const handleEnrolledChange = (val) => {
    setEnrolledInput(val);
    const enr = parseFloat(val);
    const ev = parseFloat(evaluatedInput);
    if (!partRateOverridden && enr > 0 && ev >= 0) {
      setPartRateInput(String(Math.min(100, Math.round((ev / enr) * 1000) / 10)));
    }
  };

  const handleEvaluatedChange = (val) => {
    setEvaluatedInput(val);
    const ev = parseFloat(val);
    const enr = parseFloat(enrolledInput);
    if (!partRateOverridden && enr > 0 && ev >= 0) {
      setPartRateInput(String(Math.min(100, Math.round((ev / enr) * 1000) / 10)));
    }
  };

  // Cálculo da soma dos percentuais e IFL
  const preTotalCalc = useMemo(() => {
    const p1 = parseFloat(p1Input) || 0;
    const p2 = parseFloat(p2Input) || 0;
    const p3 = parseFloat(p3Input) || 0;
    const p4 = parseFloat(p4Input) || 0;
    return Math.round((p1 + p2 + p3 + p4) * 10) / 10;
  }, [p1Input, p2Input, p3Input, p4Input]);

  const totalPercentageCalc = useMemo(() => {
    const beg = parseFloat(beginnerInput) || 0;
    const flu = parseFloat(fluentInput) || 0;
    return Math.round((preTotalCalc + beg + flu) * 10) / 10;
  }, [preTotalCalc, beginnerInput, fluentInput]);

  const estimatedIfl = useMemo(() => {
    const p1 = parseFloat(p1Input) || 0;
    const p2 = parseFloat(p2Input) || 0;
    const p3 = parseFloat(p3Input) || 0;
    const p4 = parseFloat(p4Input) || 0;
    const beg = parseFloat(beginnerInput) || 0;
    const flu = parseFloat(fluentInput) || 0;
    const sumPct = p1 + p2 + p3 + p4 + beg + flu;
    if (sumPct === 0) return 0;
    const weighted = (0 * p1 + 1.0 * p2 + 2.0 * p3 + 3.5 * p4 + 7.0 * beg + 10.0 * flu) / sumPct;
    return Math.round(weighted * 10) / 10;
  }, [p1Input, p2Input, p3Input, p4Input, beginnerInput, fluentInput]);

  // Gravação Manual
  async function handleSaveManualResult(e) {
    if (e) e.preventDefault();
    setManualErrorMsg('');
    setManualSuccessMsg('');

    // Validação da Escola
    if (manualSchoolMode === 'EXISTING' && !selectedSchoolId) {
      setManualErrorMsg('Selecione uma escola cadastrada no CPE para associar o resultado.');
      return;
    }

    if (manualSchoolMode === 'NEW' && !newSchoolForm.name.trim()) {
      setManualErrorMsg('Informe o nome da nova escola para cadastrá-la no CPE.');
      return;
    }

    if (!enrolledInput || !evaluatedInput) {
      setManualErrorMsg('Preencha os campos de Alunos Previstos e Alunos Avaliados.');
      return;
    }

    const payload = {
      cycle: manualCycle,
      year: Number(manualYear) || 2026,
      asDraft: manualDraft,
      enrolled: Number(enrolledInput),
      evaluated: Number(evaluatedInput),
      participationRate: partRateInput !== '' ? Number(partRateInput) : undefined,
      preReaderTotal: preTotalCalc,
      preReaderLevel1: p1Input !== '' ? Number(p1Input) : null,
      preReaderLevel2: p2Input !== '' ? Number(p2Input) : null,
      preReaderLevel3: p3Input !== '' ? Number(p3Input) : null,
      preReaderLevel4: p4Input !== '' ? Number(p4Input) : null,
      beginnerReader: beginnerInput !== '' ? Number(beginnerInput) : null,
      fluentReader: fluentInput !== '' ? Number(fluentInput) : null,
    };

    if (manualSchoolMode === 'EXISTING') {
      payload.schoolId = selectedSchoolId;
    } else {
      payload.newSchool = newSchoolForm;
    }

    setSavingManual(true);
    try {
      const res = await parcApi.createManualResult(program.id, payload);
      setManualSuccessMsg(res.message || 'Resultado de Fluência Leitora salvo com sucesso!');
      if (reloadSchools) reloadSchools();
      if (typeof onImportSuccess === 'function') onImportSuccess();

      // Limpa dados de resultado mas preserva a seleção caso queira lançar outro ciclo
      setP1Input('');
      setP2Input('');
      setP3Input('');
      setP4Input('');
      setBeginnerInput('');
      setFluentInput('');
      setEnrolledInput('');
      setEvaluatedInput('');
      setPartRateInput('');
      setPartRateOverridden(false);
      if (manualSchoolMode === 'NEW') {
        setNewSchoolForm({ name: '', inep: '', schoolType: 'E.M.E.F.', zone: 'URBANA', district: '' });
      }
    } catch (err) {
      setManualErrorMsg(err.message || 'Erro ao salvar resultado de Fluência Leitora.');
    } finally {
      setSavingManual(false);
    }
  }

  // ==========================================
  // FUNÇÕES DO MODO PLANILHA
  // ==========================================
  function handleFileChange(e) {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPreviewData(null);
      setImportResult(null);
      setErrorMsg('');
      setManualMappings({});
      setSearchUnmatched('');
    }
  }

  async function handleGeneratePreview(e) {
    if (e) e.preventDefault();
    if (!file) {
      setErrorMsg('Selecione um arquivo de planilha (.csv ou .xlsx) para importar.');
      return;
    }

    setLoadingPreview(true);
    setErrorMsg('');
    setPreviewData(null);
    setImportResult(null);

    const form = new FormData();
    form.append('file', file);
    if (cycle !== 'AUTO') {
      form.append('cycle', cycle);
    }
    form.append('year', String(program.year || 2026));

    try {
      const res = await parcApi.previewImport(program.id, form);
      setPreviewData(res);
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao processar prévia da planilha oficial do PARC.');
    } finally {
      setLoadingPreview(false);
    }
  }

  function handleManualMappingChange(rowNumber, targetSchoolId) {
    setManualMappings((prev) => ({
      ...prev,
      [rowNumber]: targetSchoolId || undefined,
    }));
  }

  function handleAutoApplyTopSuggestions() {
    if (!previewData?.summary?.unidentifiedSchools) return;
    const newMappings = { ...manualMappings };

    for (const unmatched of previewData.summary.unidentifiedSchools) {
      if (!newMappings[unmatched.rowNumber] && unmatched.candidateSchools?.length > 0) {
        newMappings[unmatched.rowNumber] = unmatched.candidateSchools[0].id;
      }
    }

    setManualMappings(newMappings);
  }

  async function handleConfirmImport() {
    if (!previewData) return;

    setConfirming(true);
    setErrorMsg('');

    try {
      const body = {
        records: previewData.rows,
        year: program.year || 2026,
        asDraft: saveAsDraft,
        manualMappings,
      };
      const res = await parcApi.confirmImport(program.id, body);
      setImportResult(res);
      setPreviewData(null);
      setFile(null);
      if (typeof onImportSuccess === 'function') {
        onImportSuccess();
      }
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao confirmar importação do PARC.');
    } finally {
      setConfirming(false);
    }
  }

  const summary = previewData?.summary || {};
  const unidentifiedSchools = summary.unidentifiedSchools || [];
  const availableSchools = summary.availableSchoolsForMapping || [];

  const filteredUnidentifiedSchools = useMemo(() => {
    if (!searchUnmatched.trim()) return unidentifiedSchools;
    const q = normalizeSearchText(searchUnmatched);
    return unidentifiedSchools.filter((u) => {
      const rawNorm = normalizeSearchText(u.schoolNameRaw);
      const inep = String(u.inepRaw || '');
      const hasCand = u.candidateSchools?.some((c) => normalizeSearchText(c.name).includes(q) || String(c.inep || '').includes(q));
      return rawNorm.includes(q) || inep.includes(q) || hasCand;
    });
  }, [unidentifiedSchools, searchUnmatched]);

  const suggestionsAvailableCount = useMemo(() => {
    return unidentifiedSchools.filter((u) => !manualMappings[u.rowNumber] && u.candidateSchools?.length > 0).length;
  }, [unidentifiedSchools, manualMappings]);

  const mappedCount = useMemo(() => {
    return unidentifiedSchools.filter((u) => Boolean(manualMappings[u.rowNumber])).length;
  }, [unidentifiedSchools, manualMappings]);

  const effectiveRows = (previewData?.rows || []).map((row) => {
    const mappedId = manualMappings[row.rowNumber];
    if (mappedId) {
      const mappedSchool = availableSchools.find((s) => s.id === mappedId);
      if (mappedSchool) {
        return {
          ...row,
          matchedSchool: { id: mappedSchool.id, inep: mappedSchool.inep, name: mappedSchool.name },
          status: 'VALIDO',
          error: null,
          isManuallyMapped: true,
        };
      }
    }
    return row;
  });

  const validRowCount = effectiveRows.filter((r) => r.status === 'VALIDO' && !r.isDuplicate).length;
  const invalidRowCount = effectiveRows.filter((r) => r.status === 'INVALIDO').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Alerta de Escopo e Regras */}
      <div className="alert alert-info" style={{ margin: 0 }}>
        <strong>Importação e Lançamento Oficial PARC (Fluência Leitora · 2º Ano):</strong>
        <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
          <li>Você pode importar planilhas oficiais (<code>DADOS_ESCOLA ...csv</code> / <code>.xlsx</code>) ou fazer o <strong>lançamento manual</strong> escola por escola.</li>
          <li><strong>Preservação do Cadastro:</strong> Escolas existentes são sincronizadas sem duplicação; novas escolas podem ser cadastradas quando necessário.</li>
          <li><strong>Ciclos Independentes:</strong> Resultados do Ciclo de Entrada e de Saída coexistem na mesma escola para alimentar o painel de evolução.</li>
        </ul>
      </div>

      {/* Seletor de Modo: Upload de Planilha vs Cadastro Manual */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '2px solid #e2e8f0', paddingBottom: 12 }}>
        <button
          type="button"
          onClick={() => setActiveTab('SPREADSHEET')}
          style={{
            background: activeTab === 'SPREADSHEET' ? 'var(--primary)' : '#f1f5f9',
            color: activeTab === 'SPREADSHEET' ? '#ffffff' : 'var(--text-2)',
            border: 'none',
            borderRadius: 6,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s ease',
          }}
        >
          <span>📂</span> Upload de Planilha Oficial (.csv / .xlsx)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('MANUAL')}
          style={{
            background: activeTab === 'MANUAL' ? 'var(--primary)' : '#f1f5f9',
            color: activeTab === 'MANUAL' ? '#ffffff' : 'var(--text-2)',
            border: 'none',
            borderRadius: 6,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s ease',
          }}
        >
          <span>✍️</span> Lançamento / Cadastro Manual de Resultados
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: UPLOAD DE PLANILHA OFICIAL                                         */}
      {/* ========================================================================= */}
      {activeTab === 'SPREADSHEET' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {errorMsg && (
            <div className="alert alert-danger" style={{ margin: 0 }}>
              <strong>Atenção:</strong> {errorMsg}
            </div>
          )}

          {/* Tela de Sucesso */}
          {importResult && (
            <div className="card card-pad" style={{ background: '#f0fdf4', borderColor: '#86efac' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 32 }}>🎉</span>
                <div>
                  <h3 style={{ margin: 0, color: '#166534' }}>Importação Concluída com Sucesso!</h3>
                  <p style={{ margin: '4px 0 0 0', color: '#15803d', fontSize: 13.5 }}>
                    Foram processados <strong>{importResult.total}</strong> resultados de Fluência ({importResult.createdCount} novos, {importResult.updatedCount} atualizados).
                    {importResult.isDraft ? ' Salvos como rascunho.' : ' Publicados no painel oficial.'}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Button variant="primary" onClick={() => setImportResult(null)}>
                  📥 Importar Nova Planilha
                </Button>
              </div>
            </div>
          )}

          {/* Formulário de Envio de Arquivo */}
          {!previewData && !importResult && (
            <div className="card card-pad">
              <div className="card-header-row" style={{ marginBottom: 16 }}>
                <div>
                  <div className="card-title">Upload de Planilha Oficial de Fluência do PARC</div>
                  <div className="card-subtitle">
                    Selecione o arquivo exportado da plataforma de avaliação para gerar a prévia de importação.
                  </div>
                </div>
              </div>

              <form onSubmit={handleGeneratePreview} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                  <Field label="Ciclo da Avaliação">
                    <Select value={cycle} onChange={(e) => setCycle(e.target.value)}>
                      <option value="AUTO">✨ Detectar automaticamente pelo arquivo</option>
                      <option value="ENTRADA">📥 Ciclo de Entrada (Diagnóstica)</option>
                      <option value="SAIDA">📤 Ciclo de Saída (Final)</option>
                    </Select>
                  </Field>

                  <Field label="Ano de Referência">
                    <input
                      type="text"
                      className="input"
                      value={String(program.year || 2026)}
                      disabled
                      style={{ background: '#f8fafc' }}
                    />
                  </Field>
                </div>

                {/* Zona de Drop / Seleção de Arquivo */}
                <div
                  style={{
                    border: '2px dashed #cbd5e1',
                    borderRadius: 8,
                    padding: '30px 20px',
                    textAlign: 'center',
                    background: file ? '#f0fdf4' : '#f8fafc',
                    cursor: 'pointer',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.tsv"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                  {file ? (
                    <div>
                      <strong style={{ color: '#166534', fontSize: 15 }}>{file.name}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                        {(file.size / 1024).toFixed(1)} KB · Clique para trocar o arquivo
                      </div>
                    </div>
                  ) : (
                    <div>
                      <strong style={{ fontSize: 14, color: 'var(--text-1)' }}>
                        Clique ou arraste o arquivo da planilha aqui
                      </strong>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                        Suporta arquivos oficiais .csv (UTF-8 / Windows-1252) ou planilhas Excel .xlsx
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!file || loadingPreview}
                  >
                    {loadingPreview ? 'Processando Prévia...' : '🔍 Analisar Planilha e Gerar Prévia'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Fase da Prévia e Resolução de Escolas */}
          {previewData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Resumo da Análise */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div className="card card-pad" style={{ borderLeft: '4px solid var(--primary)' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Total de Linhas
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{summary.totalRows}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Ciclo: {summary.cycle}</div>
                </div>

                <div className="card card-pad" style={{ borderLeft: '4px solid #10b981' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Linhas Válidas
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981', marginTop: 4 }}>
                    {validRowCount}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{summary.matchedSchoolsCount} escolas identificadas</div>
                </div>

                <div className="card card-pad" style={{ borderLeft: '4px solid #f59e0b' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Novos / Atualizações
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b', marginTop: 4 }}>
                    {summary.newRows} / {summary.updatedRows}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>No banco de dados</div>
                </div>

                {invalidRowCount > 0 && (
                  <div className="card card-pad" style={{ borderLeft: '4px solid #ef4444', background: '#fef2f2' }}>
                    <div style={{ fontSize: 11.5, color: '#991b1b', textTransform: 'uppercase', fontWeight: 600 }}>
                      Não Identificadas
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444', marginTop: 4 }}>
                      {invalidRowCount}
                    </div>
                    <div style={{ fontSize: 11, color: '#991b1b' }}>Exigem mapeamento</div>
                  </div>
                )}
              </div>

              {/* Painel de Resolução de Escolas Não Identificadas */}
              {unidentifiedSchools.length > 0 && (
                <div className="card card-pad" style={{ border: '2px solid #fed7aa', background: '#fffbeb' }}>
                  <div className="card-header-row" style={{ marginBottom: 14 }}>
                    <div>
                      <div className="card-title" style={{ color: '#9a3412', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>⚠️</span> Escolas Não Identificadas Automaticamente ({unidentifiedSchools.length})
                      </div>
                      <div className="card-subtitle" style={{ color: '#c2410c' }}>
                        O PARC nunca cria novas escolas automaticamente no cadastro do CPE. Faça a vinculação manual selecionando ou pesquisando a escola correspondente abaixo:
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {suggestionsAvailableCount > 0 && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleAutoApplyTopSuggestions}
                          style={{ background: '#ea580c', borderColor: '#c2410c' }}
                        >
                          ✨ Aplicar Sugestões Automáticas ({suggestionsAvailableCount})
                        </Button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14, background: '#fff', padding: '10px 12px', borderRadius: 6, border: '1px solid #fde68a' }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <input
                        type="text"
                        className="input"
                        placeholder="🔎 Filtrar escolas pendentes na lista abaixo (digite qualquer parte do nome)..."
                        value={searchUnmatched}
                        onChange={(e) => setSearchUnmatched(e.target.value)}
                        style={{ fontSize: 13.5, borderColor: '#fcd34d' }}
                      />
                    </div>
                    {searchUnmatched && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSearchUnmatched('')}
                      >
                        Limpar Filtro
                      </Button>
                    )}
                    <div style={{ fontSize: 12.5, color: '#92400e', fontWeight: 600 }}>
                      Mostrando {filteredUnidentifiedSchools.length} de {unidentifiedSchools.length} ({mappedCount} vinculadas)
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
                    {filteredUnidentifiedSchools.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 24, color: '#92400e', background: '#fff', borderRadius: 6 }}>
                        Nenhuma escola não identificada corresponde ao filtro "{searchUnmatched}".
                      </div>
                    ) : (
                      filteredUnidentifiedSchools.map((unmatched) => (
                        <UnmatchedSchoolRow
                          key={unmatched.rowNumber}
                          unmatched={unmatched}
                          currentMappedId={manualMappings[unmatched.rowNumber] || ''}
                          availableSchools={availableSchools}
                          onMapSchool={handleManualMappingChange}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Tabela de Prévia das Linhas */}
              <div className="card card-pad">
                <div className="card-header-row" style={{ marginBottom: 14 }}>
                  <div>
                    <div className="card-title">Prévia dos Dados Mapeados ({effectiveRows.length} linhas)</div>
                    <div className="card-subtitle">
                      Verifique os dados extraídos da planilha antes de confirmar a gravação.
                    </div>
                  </div>
                </div>

                <DataTable
                  columns={[
                    { key: 'rowNumber', label: '#', align: 'center', width: '40px' },
                    {
                      key: 'school',
                      label: 'Escola Mapeada (CPE)',
                      render: (r) => (
                        <div>
                          <strong>{r.matchedSchool?.name || r.schoolName}</strong>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            INEP: {r.matchedSchool?.inep || r.inep || '—'}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: 'cycle',
                      label: 'Ciclo',
                      render: (r) => (
                        <Badge cls={r.cycle === 'SAIDA' ? 'badge-green' : 'badge-blue'}>
                          {r.cycle === 'SAIDA' ? '📤 Saída' : '📥 Entrada'}
                        </Badge>
                      ),
                    },
                    { key: 'enrolled', label: 'Previstos', align: 'right', render: (r) => fmtInt(r.enrolled) },
                    { key: 'evaluated', label: 'Avaliados', align: 'right', render: (r) => fmtInt(r.evaluated) },
                    { key: 'part', label: 'Part. %', align: 'right', render: (r) => `${fmt(r.participationRate, 1)}%` },
                    {
                      key: 'preReaderTotal',
                      label: 'Pré-leitor (Total)',
                      align: 'right',
                      render: (r) => (
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>
                          {r.preReaderTotal != null ? `${fmt(r.preReaderTotal, 0)}%` : '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'preReaderLevel1',
                      label: 'Nível 1',
                      align: 'right',
                      render: (r) => (
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>
                          {r.preReaderLevel1 != null ? `${fmt(r.preReaderLevel1, 0)}%` : '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'preReaderLevel2',
                      label: 'Nível 2',
                      align: 'right',
                      render: (r) => (
                        <span style={{ color: '#ea580c', fontWeight: 600 }}>
                          {r.preReaderLevel2 != null ? `${fmt(r.preReaderLevel2, 0)}%` : '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'preReaderLevel3',
                      label: 'Nível 3',
                      align: 'right',
                      render: (r) => (
                        <span style={{ color: '#d97706', fontWeight: 600 }}>
                          {r.preReaderLevel3 != null ? `${fmt(r.preReaderLevel3, 0)}%` : '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'preReaderLevel4',
                      label: 'Nível 4',
                      align: 'right',
                      render: (r) => (
                        <span style={{ color: '#65a30d', fontWeight: 600 }}>
                          {r.preReaderLevel4 != null ? `${fmt(r.preReaderLevel4, 0)}%` : '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'beginner',
                      label: 'Iniciante %',
                      align: 'right',
                      render: (r) => (
                        <span style={{ color: '#2563eb', fontWeight: 600 }}>
                          {r.beginnerReader != null ? `${fmt(r.beginnerReader, 0)}%` : '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'fluent',
                      label: 'Fluente %',
                      align: 'right',
                      render: (r) => (
                        <span style={{ color: '#16a34a', fontWeight: 700 }}>
                          {r.fluentReader != null ? `${fmt(r.fluentReader, 0)}%` : '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'status',
                      label: 'Status',
                      align: 'center',
                      render: (r) => {
                        if (r.isDuplicate) {
                          return <Badge cls="badge-yellow">Duplicata no arquivo</Badge>;
                        }
                        if (r.status === 'VALIDO') {
                          return <Badge cls="badge-green">{r.action === 'ATUALIZAR' ? 'Atualizar' : 'Novo'}</Badge>;
                        }
                        return <Badge cls="badge-red">Não Identificada</Badge>;
                      },
                    },
                  ]}
                  rows={effectiveRows}
                  emptyTitle="Nenhum dado na prévia"
                  emptyIcon="📄"
                />
              </div>

              {/* Opções e Confirmação */}
              <div className="card card-pad" style={{ background: '#f8fafc', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={saveAsDraft}
                    onChange={(e) => setSaveAsDraft(e.target.checked)}
                  />
                  <span>Salvar importação como <strong>Rascunho</strong> (não exibir imediatamente no dashboard oficial)</span>
                </label>

                <div style={{ display: 'flex', gap: 10 }}>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setPreviewData(null);
                      setFile(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    disabled={validRowCount === 0 || confirming}
                    onClick={handleConfirmImport}
                  >
                    {confirming ? 'Gravando Dados...' : `Confirmar Importação de ${validRowCount} Escolas`}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: LANÇAMENTO / CADASTRO MANUAL DE RESULTADOS                         */}
      {/* ========================================================================= */}
      {activeTab === 'MANUAL' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {manualSuccessMsg && (
            <div className="alert alert-success" style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong>Sucesso!</strong> {manualSuccessMsg}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setManualSuccessMsg('')}>✕</Button>
            </div>
          )}

          {manualErrorMsg && (
            <div className="alert alert-danger" style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong>Atenção:</strong> {manualErrorMsg}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setManualErrorMsg('')}>✕</Button>
            </div>
          )}

          <form onSubmit={handleSaveManualResult} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ETAPA 1: ESCOLA (SELECIONAR OU CADASTRAR NOVA) */}
            <div className="card card-pad">
              <div className="card-header-row" style={{ marginBottom: 14 }}>
                <div>
                  <div className="card-title">1. Identificação da Escola</div>
                  <div className="card-subtitle">
                    Escolha uma escola participante do programa PARC ou informe os dados para cadastrar uma nova escola.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setManualSchoolMode('EXISTING');
                      setManualErrorMsg('');
                    }}
                    style={{
                      background: manualSchoolMode === 'EXISTING' ? '#0284c7' : '#e2e8f0',
                      color: manualSchoolMode === 'EXISTING' ? '#fff' : '#334155',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🏫 Escola do Programa ({participatingSchools.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualSchoolMode('NEW');
                      setManualErrorMsg('');
                    }}
                    style={{
                      background: manualSchoolMode === 'NEW' ? '#16a34a' : '#e2e8f0',
                      color: manualSchoolMode === 'NEW' ? '#fff' : '#334155',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ➕ Cadastrar Nova Escola
                  </button>
                </div>
              </div>

              {/* MODO A: SELECIONAR ESCOLA EXISTENTE NO PROGRAMA */}
              {manualSchoolMode === 'EXISTING' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(320px, 2fr)', gap: 12, alignItems: 'center' }}>
                    <div>
                      <input
                        type="text"
                        className="input"
                        placeholder="🔎 Filtrar escola participante por nome ou INEP..."
                        value={schoolSearchQuery}
                        onChange={(e) => setSchoolSearchQuery(e.target.value)}
                        style={{ fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <Select
                        value={selectedSchoolId}
                        onChange={(e) => setSelectedSchoolId(e.target.value)}
                        style={{ fontSize: 13.5, fontWeight: selectedSchoolId ? 600 : 400 }}
                      >
                        <option value="">
                          {schoolSearchQuery
                            ? `-- ${filteredParticipatingSchools.length} escola(s) encontrada(s) no programa --`
                            : `-- Selecione uma escola do programa (${participatingSchools.length} participantes) --`}
                        </option>
                        {filteredParticipatingSchools.map((s) => {
                          const sId = s.id || s.schoolId;
                          const sName = s.name || s.school?.name;
                          const sInep = s.inep || s.school?.inep;
                          const sZone = s.zone || s.school?.zone;
                          const sDist = s.district || s.school?.district;
                          return (
                            <option key={sId} value={sId}>
                              {sName} {sInep ? `(INEP: ${sInep})` : ''} — {sZone || 'Zona não informada'} {sDist ? `· ${sDist}` : ''}
                            </option>
                          );
                        })}
                      </Select>
                    </div>
                  </div>

                  {selectedSchoolObj && (
                    <div style={{ background: '#f0fdf4', padding: '10px 14px', borderRadius: 8, border: '1px solid #86efac', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                      <span style={{ fontSize: 18 }}>🏫</span>
                      <div>
                        <strong style={{ fontSize: 14, color: '#166534' }}>{selectedSchoolObj.name || selectedSchoolObj.school?.name}</strong>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                          INEP: <span className="mono">{selectedSchoolObj.inep || selectedSchoolObj.school?.inep || '—'}</span> · Zona: <strong>{selectedSchoolObj.zone || selectedSchoolObj.school?.zone || '—'}</strong> {(selectedSchoolObj.district || selectedSchoolObj.school?.district) ? `· Distrito: ${selectedSchoolObj.district || selectedSchoolObj.school?.district}` : ''}
                        </div>
                      </div>
                      <Badge cls="badge-green" style={{ marginLeft: 'auto', fontWeight: 700 }}>
                        Escola Participante do PARC
                      </Badge>
                    </div>
                  )}
                </div>
              )}

              {/* MODO B: CADASTRAR NOVA ESCOLA */}
              {manualSchoolMode === 'NEW' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: '#f8fafc', padding: '14px 16px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <Field label="Nome da Escola *">
                      <input
                        type="text"
                        className="input"
                        placeholder="Ex: E.M.E.F. Monteiro Lobato"
                        value={newSchoolForm.name}
                        onChange={(e) => setNewSchoolForm({ ...newSchoolForm, name: e.target.value })}
                        required
                      />
                    </Field>

                    <Field label="Código INEP (8 dígitos)">
                      <input
                        type="text"
                        className="input"
                        placeholder="Ex: 15123456"
                        maxLength={8}
                        value={newSchoolForm.inep}
                        onChange={(e) => setNewSchoolForm({ ...newSchoolForm, inep: e.target.value.replace(/\D/g, '') })}
                      />
                    </Field>

                    <Field label="Tipo da Escola">
                      <Select
                        value={newSchoolForm.schoolType}
                        onChange={(e) => setNewSchoolForm({ ...newSchoolForm, schoolType: e.target.value })}
                      >
                        <option value="E.M.E.F.">E.M.E.F. (Ensino Fundamental)</option>
                        <option value="E.M.E.I.F.">E.M.E.I.F. (Infantil e Fundamental)</option>
                        <option value="E.M.E.I.">E.M.E.I. (Educação Infantil)</option>
                        <option value="OUTRO">Outro Segmento</option>
                      </Select>
                    </Field>

                    <Field label="Localização / Zona">
                      <Select
                        value={newSchoolForm.zone}
                        onChange={(e) => setNewSchoolForm({ ...newSchoolForm, zone: e.target.value })}
                      >
                        <option value="SEDE">🏙️ Sede</option>
                        <option value="ILHAS">⛵ Ilhas</option>
                        <option value="ESTRADAS">🛣️ Estradas</option>
                        <option value="URBANA">🏙️ Urbana</option>
                        <option value="RURAL">🌳 Rural</option>
                      </Select>
                    </Field>

                    <Field label="Distrito / Bairro">
                      <input
                        type="text"
                        className="input"
                        placeholder="Ex: Centro, Francilândia, Beja..."
                        value={newSchoolForm.district}
                        onChange={(e) => setNewSchoolForm({ ...newSchoolForm, district: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div style={{ fontSize: 12, color: '#0369a1' }}>
                    ℹ️ A nova escola será gravada no cadastro do CPE e vinculada automaticamente ao programa PARC.
                  </div>
                </div>
              )}
            </div>

            {/* ETAPA 2: CICLO, MATRÍCULAS E PARTICIPAÇÃO */}
            <div className="card card-pad">
              <div className="card-header-row" style={{ marginBottom: 14 }}>
                <div>
                  <div className="card-title">2. Ciclo e Dados de Participação</div>
                  <div className="card-subtitle">
                    Fluência Leitora · 2º Ano do Ensino Fundamental
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <Field label="Ciclo da Avaliação *">
                  <Select
                    value={manualCycle}
                    onChange={(e) => setManualCycle(e.target.value)}
                    style={{ fontWeight: 700, color: manualCycle === 'SAIDA' ? '#16a34a' : '#0284c7' }}
                  >
                    <option value="ENTRADA">📥 Ciclo de Entrada (Diagnóstica)</option>
                    <option value="SAIDA">📤 Ciclo de Saída (Final)</option>
                  </Select>
                </Field>

                <Field label="Ano de Referência">
                  <input
                    type="number"
                    className="input"
                    value={manualYear}
                    onChange={(e) => setManualYear(e.target.value)}
                  />
                </Field>

                <Field label="Alunos Previstos *">
                  <input
                    type="number"
                    className="input"
                    placeholder="Ex: 50"
                    min="1"
                    value={enrolledInput}
                    onChange={(e) => handleEnrolledChange(e.target.value)}
                    required
                  />
                </Field>

                <Field label="Alunos Avaliados *">
                  <input
                    type="number"
                    className="input"
                    placeholder="Ex: 48"
                    min="0"
                    value={evaluatedInput}
                    onChange={(e) => handleEvaluatedChange(e.target.value)}
                    required
                  />
                </Field>

                <Field label="Taxa de Participação (%)">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      className="input"
                      placeholder="Auto"
                      value={partRateInput}
                      onChange={(e) => {
                        setPartRateInput(e.target.value);
                        setPartRateOverridden(true);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setPartRateOverridden(false);
                        const enr = parseFloat(enrolledInput);
                        const ev = parseFloat(evaluatedInput);
                        if (enr > 0 && ev >= 0) {
                          setPartRateInput(String(Math.min(100, Math.round((ev / enr) * 1000) / 10)));
                        }
                      }}
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '0 8px' }}
                      title="Recalcular automaticamente"
                    >
                      🔄
                    </button>
                  </div>
                </Field>
              </div>
            </div>

            {/* ETAPA 3: NÍVEIS DE FLUÊNCIA LEITORA (%) */}
            <div className="card card-pad">
              <div className="card-header-row" style={{ marginBottom: 14 }}>
                <div>
                  <div className="card-title">3. Distribuição dos Níveis de Fluência (%)</div>
                  <div className="card-subtitle">
                    Informe os percentuais obtidos por perfil de leitor. O sistema calcula o total e o IFL estimado.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Badge cls={Math.abs(totalPercentageCalc - 100) < 0.5 ? 'badge-green' : 'badge-yellow'} style={{ fontSize: 13, fontWeight: 700 }}>
                    Soma: {totalPercentageCalc}% {Math.abs(totalPercentageCalc - 100) < 0.5 ? '✅' : '⚠️'}
                  </Badge>
                  <Badge cls="badge-blue" style={{ fontSize: 13, fontWeight: 700 }}>
                    IFL Estimado: {fmt(estimatedIfl, 1)} / 10
                  </Badge>
                </div>
              </div>

              {/* Grid dos 6 Níveis de Fluência */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div style={{ background: '#fffbeb', padding: 10, borderRadius: 8, border: '1px solid #fde68a' }}>
                  <Field label="Pré-leitor 1 (Não Leu %)" style={{ margin: 0 }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      className="input"
                      placeholder="0"
                      value={p1Input}
                      onChange={(e) => setP1Input(e.target.value)}
                    />
                  </Field>
                </div>

                <div style={{ background: '#fffbeb', padding: 10, borderRadius: 8, border: '1px solid #fde68a' }}>
                  <Field label="Pré-leitor 2 (Soletrou %)" style={{ margin: 0 }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      className="input"
                      placeholder="0"
                      value={p2Input}
                      onChange={(e) => setP2Input(e.target.value)}
                    />
                  </Field>
                </div>

                <div style={{ background: '#fffbeb', padding: 10, borderRadius: 8, border: '1px solid #fde68a' }}>
                  <Field label="Pré-leitor 3 (Silabou %)" style={{ margin: 0 }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      className="input"
                      placeholder="0"
                      value={p3Input}
                      onChange={(e) => setP3Input(e.target.value)}
                    />
                  </Field>
                </div>

                <div style={{ background: '#fffbeb', padding: 10, borderRadius: 8, border: '1px solid #fde68a' }}>
                  <Field label="Pré-leitor 4 (Leu até 10 %)" style={{ margin: 0 }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      className="input"
                      placeholder="0"
                      value={p4Input}
                      onChange={(e) => setP4Input(e.target.value)}
                    />
                  </Field>
                </div>

                <div style={{ background: '#f0fdf4', padding: 10, borderRadius: 8, border: '1px solid #bbf7d0' }}>
                  <Field label="Leitor Iniciante (%)" style={{ margin: 0 }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      className="input"
                      placeholder="0"
                      value={beginnerInput}
                      onChange={(e) => setBeginnerInput(e.target.value)}
                    />
                  </Field>
                </div>

                <div style={{ background: '#f0fdf4', padding: 10, borderRadius: 8, border: '1px solid #86efac' }}>
                  <Field label="Leitor Fluente (%)" style={{ margin: 0 }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      className="input"
                      placeholder="0"
                      value={fluentInput}
                      onChange={(e) => setFluentInput(e.target.value)}
                    />
                  </Field>
                </div>
              </div>

              {/* Resumo Agregado de Pré-leitores e Fluentes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 14 }}>
                <div style={{ background: '#fef2f2', padding: '10px 14px', borderRadius: 6, border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: 12, color: '#991b1b', fontWeight: 600 }}>Pré-leitor (Total Calculado)</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#dc2626', marginTop: 2 }}>
                    {preTotalCalc}%
                    {evaluatedInput && Number(evaluatedInput) > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 6, color: '#991b1b' }}>
                        (~{Math.round(Number(evaluatedInput) * (preTotalCalc / 100))} alunos)
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ background: '#eff6ff', padding: '10px 14px', borderRadius: 6, border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: 12, color: '#1e40af', fontWeight: 600 }}>Iniciantes + Fluentes</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#2563eb', marginTop: 2 }}>
                    {Math.round(((parseFloat(beginnerInput) || 0) + (parseFloat(fluentInput) || 0)) * 10) / 10}%
                    {evaluatedInput && Number(evaluatedInput) > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 6, color: '#1e40af' }}>
                        (~{Math.round(Number(evaluatedInput) * (((parseFloat(beginnerInput) || 0) + (parseFloat(fluentInput) || 0)) / 100))} alunos)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Ações e Confirmação */}
            <div className="card card-pad" style={{ background: '#f8fafc', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
                <input
                  type="checkbox"
                  checked={manualDraft}
                  onChange={(e) => setManualDraft(e.target.checked)}
                />
                <span>Salvar como <strong>Rascunho</strong> (não exibir no ranking oficial até ser publicado)</span>
              </label>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setP1Input('');
                    setP2Input('');
                    setP3Input('');
                    setP4Input('');
                    setBeginnerInput('');
                    setFluentInput('');
                    setEnrolledInput('');
                    setEvaluatedInput('');
                    setPartRateInput('');
                    setPartRateOverridden(false);
                    setManualErrorMsg('');
                    setManualSuccessMsg('');
                  }}
                >
                  Limpar Campos
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={savingManual}
                  style={{ background: '#16a34a', borderColor: '#15803d' }}
                >
                  {savingManual ? 'Gravando Resultado...' : '💾 Salvar Resultado da Escola'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}


