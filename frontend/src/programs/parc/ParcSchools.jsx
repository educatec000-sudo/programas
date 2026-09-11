import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { parcApi } from '../../services/resources.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { Badge, Button, Field, Modal, Select, StatCard, LoadingBlock, Input } from '../../components/ui.jsx';
import { fmtInt } from '../../utils/format.js';

export default function ParcSchools({ program, refreshProgram }) {
  const { success, error } = useToast();
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('TODAS');
  const [dataFilter, setDataFilter] = useState('TODAS');

  // Seleção múltipla para ações em lote
  const [selectedSchoolIds, setSelectedSchoolIds] = useState(new Set());

  // Modal de Adicionar Escola
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState('EXISTING'); // 'EXISTING' | 'NEW'
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [modalSearch, setModalSearch] = useState('');
  const [modalZoneFilter, setModalZoneFilter] = useState('TODAS');

  // Formulário para cadastrar nova escola
  const [newSchoolForm, setNewSchoolForm] = useState({
    inep: '',
    name: '',
    schoolType: 'E.M.E.F.',
    zone: 'URBANA',
    district: '',
  });

  const [adding, setAdding] = useState(false);

  // Modal de Remoção Individual
  const [schoolToRemove, setSchoolToRemove] = useState(null);
  const [removing, setRemoving] = useState(false);

  // Modal de Remoção em Lote
  const [bulkRemoveModalOpen, setBulkRemoveModalOpen] = useState(false);
  const [bulkRemoveType, setBulkRemoveType] = useState('SELECTED'); // 'SELECTED' | 'WITHOUT_DATA'
  const [bulkRemoving, setBulkRemoving] = useState(false);

  // Busca escolas participantes do PARC
  const { data: schoolsData, loading, refresh: reload } = useApi(
    () => parcApi.participatingSchools(program.id),
    [program.id],
  );

  // Busca escolas disponíveis na rede geral para adicionar (sempre carregado para prontidão imediata)
  const { data: availableData, refresh: reloadAvailable } = useApi(
    () => parcApi.availableSchools(program.id),
    [program.id],
  );

  const schools = schoolsData?.schools || schoolsData?.participatingSchools || [];
  const totalNetwork = schoolsData?.totalNetworkSchools || availableData?.totalNetworkSchools || 0;
  const totalParticipating = schoolsData?.totalParticipatingSchools || schools.length;
  const withDataCount = schoolsData?.schoolsWithData || schools.filter((s) => s.hasData).length;
  const pendingCount = schoolsData?.schoolsWithoutData ?? Math.max(0, totalParticipating - withDataCount);

  const availableSchools = availableData?.availableSchools || availableData?.schools || [];

  // Zonas disponíveis dinamicamente para o filtro principal
  const availableZones = useMemo(() => {
    const set = new Set(schoolsData?.distinctZones || []);
    schools.forEach((s) => {
      const z = s.zone || s.school?.zone;
      if (z) set.add(z);
    });
    return Array.from(set).sort();
  }, [schoolsData, schools]);

  // Lista filtrada de escolas disponíveis para seleção no Modal
  const modalFilteredAvailable = useMemo(() => {
    return availableSchools.filter((s) => {
      if (modalZoneFilter !== 'TODAS' && s.zone !== modalZoneFilter) return false;
      if (!modalSearch.trim()) return true;
      const q = modalSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const name = (s.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const inep = String(s.inep || '');
      const dist = String(s.district || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return name.includes(q) || inep.includes(q) || dist.includes(q);
    });
  }, [availableSchools, modalSearch, modalZoneFilter]);

  const selectedAvailableSchool = useMemo(() => {
    if (!selectedSchoolId) return null;
    return availableSchools.find((s) => s.id === selectedSchoolId) || null;
  }, [selectedSchoolId, availableSchools]);

  // Filtro da tabela principal de escolas participantes
  const filteredSchools = useMemo(() => {
    return schools.filter((s) => {
      const schZone = s.zone || s.school?.zone;
      const schName = s.name || s.school?.name || '';
      const schInep = String(s.inep || s.school?.inep || '');
      const schDist = String(s.district || s.school?.district || '');

      if (zoneFilter !== 'TODAS' && schZone !== zoneFilter) return false;
      if (dataFilter === 'COM_DADOS' && !s.hasData) return false;
      if (dataFilter === 'SEM_DADOS' && s.hasData) return false;
      if (!search.trim()) return true;

      const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const nameNorm = schName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const distNorm = schDist.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return nameNorm.includes(q) || schInep.includes(q) || distNorm.includes(q);
    });
  }, [schools, search, zoneFilter, dataFilter]);

  // Checkbox: Selecionar Todos / Desmarcar Todos
  const toggleSelectAll = () => {
    if (!filteredSchools.length) return;
    if (selectedSchoolIds.size === filteredSchools.length) {
      setSelectedSchoolIds(new Set());
    } else {
      setSelectedSchoolIds(new Set(filteredSchools.map((s) => s.schoolId || s.id)));
    }
  };

  const toggleSelectRow = (id) => {
    const next = new Set(selectedSchoolIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedSchoolIds(next);
  };

  // Abrir Modal de Adicionar Escola
  const handleOpenAddModal = () => {
    setAddMode('EXISTING');
    setSelectedSchoolId(availableSchools[0]?.id || '');
    setModalSearch('');
    setModalZoneFilter('TODAS');
    setNewSchoolForm({
      inep: '',
      name: '',
      schoolType: 'E.M.E.F.',
      zone: 'URBANA',
      district: '',
    });
    setIsAddModalOpen(true);
  };

  // Adicionar Escola Participante (Existente ou Nova)
  const handleAddSchool = async () => {
    setAdding(true);
    try {
      if (addMode === 'EXISTING') {
        if (!selectedSchoolId) {
          error('Por favor, selecione uma escola da rede para vincular.');
          setAdding(false);
          return;
        }
        const res = await parcApi.addSchool(program.id, { schoolId: selectedSchoolId });
        success(res.message || 'Escola participante vinculada com sucesso!');
      } else {
        if (!newSchoolForm.name.trim()) {
          error('Por favor, informe o nome da escola.');
          setAdding(false);
          return;
        }
        const res = await parcApi.addSchool(program.id, newSchoolForm);
        success(res.message || 'Nova escola cadastrada e vinculada com sucesso!');
      }

      setIsAddModalOpen(false);
      setSelectedSchoolId('');
      reload();
      reloadAvailable();
      if (refreshProgram) refreshProgram();
    } catch (err) {
      error(err.message || 'Erro ao vincular escola participante.');
    } finally {
      setAdding(false);
    }
  };

  // Remoção Individual
  const handleRemoveSchool = async () => {
    if (!schoolToRemove) return;

    setRemoving(true);
    try {
      const sid = schoolToRemove.schoolId || schoolToRemove.id;
      const res = await parcApi.removeSchool(program.id, sid);
      success(res.message || 'Escola desvinculada com sucesso deste ciclo.');
      setSchoolToRemove(null);
      setSelectedSchoolIds((prev) => {
        const next = new Set(prev);
        next.delete(sid);
        return next;
      });
      reload();
      reloadAvailable();
      if (refreshProgram) refreshProgram();
    } catch (err) {
      error(err.message || 'Erro ao desvincular escola participante.');
    } finally {
      setRemoving(false);
    }
  };

  // Remoção em Lote
  const handleBulkRemoveConfirm = async () => {
    setBulkRemoving(true);
    try {
      let payload = {};
      if (bulkRemoveType === 'SELECTED') {
        payload = { schoolIds: Array.from(selectedSchoolIds) };
      }

      const res = await parcApi.bulkRemoveSchools(program.id, payload);
      success(res.message || 'Escolas desvinculadas com sucesso!');
      setBulkRemoveModalOpen(false);
      setSelectedSchoolIds(new Set());
      reload();
      reloadAvailable();
      if (refreshProgram) refreshProgram();
    } catch (err) {
      error(err.message || 'Erro ao desvincular escolas em lote.');
    } finally {
      setBulkRemoving(false);
    }
  };

  if (loading && !schoolsData) {
    return <LoadingBlock label="Carregando escolas participantes do PARC..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Header Card */}
      <div className="card card-pad">
        <div className="card-header-row" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="card-title">Escolas Participantes — PARC {program.year}</div>
            <div className="card-subtitle">
              Conjunto dinâmico de escolas vinculadas à avaliação de Fluência Leitora do 2º Ano (PARC).
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button onClick={handleOpenAddModal}>
              + Adicionar escola participante
            </Button>
          </div>
        </div>

        {/* Resumo Dinâmico das Participantes */}
        <div className="stats-grid" style={{ marginTop: 14, marginBottom: 0 }}>
          <StatCard
            icon="🏫"
            label="Participantes no Ciclo"
            value={fmtInt(totalParticipating)}
            hint={totalNetwork ? `${Math.round((totalParticipating / totalNetwork) * 100)}% das ${totalNetwork} escolas da rede` : undefined}
            tone="blue"
          />
          <StatCard
            icon="✅"
            label="Com Dados Importados"
            value={fmtInt(withDataCount)}
            hint={totalParticipating ? `${Math.round((withDataCount / totalParticipating) * 100)}% de cobertura` : undefined}
            tone="green"
          />
          <StatCard
            icon="⏳"
            label="Aguardando Importação"
            value={fmtInt(pendingCount)}
            hint="Sem resultados neste ciclo"
            tone="orange"
          />
          <StatCard
            icon="🌐"
            label="Rede Municipal Geral"
            value={fmtInt(totalNetwork)}
            hint="Total de escolas cadastradas"
            tone="violet"
          />
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="card card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', flex: 1 }}>
          <Field label="Buscar escola participante" style={{ margin: 0, minWidth: 260, flex: 1 }}>
            <Input
              type="text"
              placeholder="🔎 Digite o nome da escola, INEP ou bairro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ fontSize: 13, height: 36 }}
            />
          </Field>

          <Field label="Localização / Zona" style={{ margin: 0, minWidth: 160 }}>
            <Select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} style={{ fontSize: 13, height: 36 }}>
              <option value="TODAS">Todas as zonas</option>
              {availableZones.map((z) => (
                <option key={z} value={z}>
                  {z === 'SEDE' ? '🏙️ Sede' : z === 'RURAL' ? '🌳 Rural' : z === 'URBANA' ? '🏙️ Urbana' : z === 'ILHAS' ? '⛵ Ilhas' : z === 'ESTRADAS' ? '🛣️ Estradas' : z}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status dos Dados" style={{ margin: 0, minWidth: 180 }}>
            <Select value={dataFilter} onChange={(e) => setDataFilter(e.target.value)} style={{ fontSize: 13, height: 36 }}>
              <option value="TODAS">Todos os status</option>
              <option value="COM_DADOS">🟢 Com dados registrados ({withDataCount})</option>
              <option value="SEM_DADOS">🟡 Sem dados no ciclo ({pendingCount})</option>
            </Select>
          </Field>
        </div>

        {(search || zoneFilter !== 'TODAS' || dataFilter !== 'TODAS') && (
          <Button
            variant="secondary"
            onClick={() => {
              setSearch('');
              setZoneFilter('TODAS');
              setDataFilter('TODAS');
            }}
            style={{ fontSize: 12.5, height: 36 }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Barra de Ações em Massa */}
      {selectedSchoolIds.size > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px 14px', borderRadius: 8 }}>
          <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>
            {selectedSchoolIds.size} escola(s) selecionada(s)
          </span>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="secondary"
              onClick={() => {
                setBulkRemoveType('SELECTED');
                setBulkRemoveModalOpen(true);
              }}
              disabled={bulkRemoving}
              style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca', fontSize: 12.5 }}
            >
              🗑️ Desvincular Selecionadas ({selectedSchoolIds.size})
            </Button>
            <Button
              variant="secondary"
              onClick={() => setSelectedSchoolIds(new Set())}
              style={{ fontSize: 12.5 }}
            >
              Desmarcar
            </Button>
          </div>
        </div>
      )}

      {/* Tabela de Escolas Participantes */}
      <div className="card card-pad" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ maxHeight: 560, overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, zIndex: 5, background: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '10px 12px', width: 40, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={filteredSchools.length > 0 && selectedSchoolIds.size === filteredSchools.length}
                    onChange={toggleSelectAll}
                    title="Selecionar todas"
                  />
                </th>
                <th style={{ padding: '10px 12px', width: 110 }}>Código INEP</th>
                <th style={{ padding: '10px 12px', minWidth: 240 }}>Nome da Escola</th>
                <th style={{ padding: '10px 12px', width: 110 }}>Zona</th>
                <th style={{ padding: '10px 12px', minWidth: 180 }}>Ciclos Avaliados</th>
                <th style={{ padding: '10px 12px', width: 140, textAlign: 'center' }}>Status no Ciclo</th>
                <th style={{ padding: '10px 12px', width: 100, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchools.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
                    Nenhuma escola participante encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredSchools.map((s, rowIdx) => {
                  const sid = s.schoolId || s.id;
                  const isSelected = selectedSchoolIds.has(sid);
                  const schName = s.name || s.school?.name;
                  const schInep = s.inep || s.school?.inep;
                  const schZone = s.zone || s.school?.zone;
                  const schDist = s.district || s.school?.district;

                  const hasEntrada = s.hasEntrada || s.resultsSummary?.hasEntrada;
                  const hasSaida = s.hasSaida || s.resultsSummary?.hasSaida;

                  return (
                    <tr
                      key={sid}
                      style={{
                        background: isSelected ? '#eff6ff' : (rowIdx % 2 === 0 ? '#fff' : '#fafafa'),
                        borderBottom: '1px solid #e2e8f0',
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(sid)}
                        />
                      </td>

                      {/* INEP */}
                      <td style={{ padding: '8px 12px' }}>
                        <span className="mono" style={{ fontWeight: 600 }}>{schInep || '—'}</span>
                      </td>

                      {/* Nome */}
                      <td style={{ padding: '8px 12px' }}>
                        <div>
                          <strong>{schName}</strong>
                          {schDist && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{schDist}</div>}
                        </div>
                      </td>

                      {/* Zona */}
                      <td style={{ padding: '8px 12px' }}>
                        <Badge cls={schZone === 'RURAL' ? 'badge-yellow' : schZone === 'ILHAS' ? 'badge-cyan' : 'badge-blue'}>
                          {schZone || '—'}
                        </Badge>
                      </td>

                      {/* Ciclos Avaliados */}
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {hasEntrada && <Badge cls="badge-blue">📥 Entrada</Badge>}
                          {hasSaida && <Badge cls="badge-green">📤 Saída</Badge>}
                          {!hasEntrada && !hasSaida && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Nenhum dado</span>}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {s.hasData ? (
                          <Badge cls="badge-green">🟢 Com dados</Badge>
                        ) : (
                          <Badge cls="badge-yellow">🟡 Aguardando importação</Badge>
                        )}
                      </td>

                      {/* Ações */}
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ color: '#dc2626', borderColor: '#fecaca', fontSize: 12, padding: '4px 8px' }}
                          onClick={() => setSchoolToRemove(s)}
                          title="Desvincular escola deste ciclo"
                        >
                          ✕ Desvincular
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)' }}>
          <span>Exibindo <strong>{filteredSchools.length}</strong> de <strong>{totalParticipating}</strong> escolas participantes</span>
          <span>{withDataCount} escolas com dados consolidados ({Math.round((withDataCount / (totalParticipating || 1)) * 100)}% de cobertura)</span>
        </div>
      </div>

      {/* Modal de Adicionar Escola Participante */}
      {isAddModalOpen && (
        <Modal
          open={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title={`Adicionar Escola ao PARC ${program.year}`}
          size="lg"
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsAddModalOpen(false)} disabled={adding}>
                Cancelar
              </Button>
              <Button
                onClick={handleAddSchool}
                disabled={adding || (addMode === 'EXISTING' ? !selectedSchoolId : !newSchoolForm.name.trim())}
              >
                {adding ? 'Processando...' : addMode === 'EXISTING' ? 'Vincular Escola' : 'Cadastrar e Vincular Escola'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Abas do Modal: Existente vs Nova */}
            <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              <button
                type="button"
                className={`btn btn-sm ${addMode === 'EXISTING' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setAddMode('EXISTING')}
                style={{ fontSize: 13 }}
              >
                🏫 Selecionar da Rede Municipal ({availableSchools.length} disponíveis)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${addMode === 'NEW' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setAddMode('NEW')}
                style={{ fontSize: 13 }}
              >
                ✨ Cadastrar Nova Escola na Rede
              </button>
            </div>

            {addMode === 'EXISTING' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
                  Selecione uma unidade escolar cadastrada na rede municipal para vincular à avaliação de <strong>Fluência Leitora do PARC {program.year}</strong>.
                </p>

                {/* Filtros de busca rápida dentro do modal */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10 }}>
                  <Field label="Buscar escola disponível" style={{ margin: 0 }}>
                    <Input
                      type="text"
                      placeholder="🔎 Digite nome, INEP ou bairro..."
                      value={modalSearch}
                      onChange={(e) => setModalSearch(e.target.value)}
                      style={{ fontSize: 12.5 }}
                    />
                  </Field>

                  <Field label="Zona" style={{ margin: 0 }}>
                    <Select
                      value={modalZoneFilter}
                      onChange={(e) => setModalZoneFilter(e.target.value)}
                      style={{ fontSize: 12.5 }}
                    >
                      <option value="TODAS">Todas</option>
                      <option value="URBANA">Urbana</option>
                      <option value="RURAL">Rural</option>
                      <option value="SEDE">Sede</option>
                      <option value="ILHAS">Ilhas</option>
                      <option value="ESTRADAS">Estradas</option>
                    </Select>
                  </Field>
                </div>

                <Field label={`Selecione a Escola (${modalFilteredAvailable.length} encontradas)`}>
                  <Select
                    value={selectedSchoolId}
                    onChange={(e) => setSelectedSchoolId(e.target.value)}
                    style={{ width: '100%', fontSize: 13 }}
                    size={modalFilteredAvailable.length > 5 ? 6 : undefined}
                  >
                    {modalFilteredAvailable.length === 0 ? (
                      <option value="" disabled>Nenhuma escola disponível encontrada para os filtros.</option>
                    ) : (
                      modalFilteredAvailable.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.inep ? `(INEP: ${s.inep})` : ''} — {s.zone} {s.district ? `(${s.district})` : ''}
                        </option>
                      ))
                    )}
                  </Select>
                </Field>

                {selectedAvailableSchool && (
                  <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-3)' }}>Nome da Escola:</span>
                      <strong>{selectedAvailableSchool.name}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-3)' }}>Código INEP:</span>
                      <strong className="mono">{selectedAvailableSchool.inep || 'Não informado'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-3)' }}>Localização / Zona:</span>
                      <Badge cls="badge-blue">{selectedAvailableSchool.zone || 'URBANA'}</Badge>
                    </div>
                    {selectedAvailableSchool.district && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-3)' }}>Bairro / Distrito:</span>
                        <span>{selectedAvailableSchool.district}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
                  Preencha os dados abaixo para cadastrar uma nova escola na <strong>Rede Municipal</strong> e vinculá-la imediatamente ao <strong>PARC {program.year}</strong>.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Nome da Escola" required>
                    <Input
                      type="text"
                      placeholder="Ex.: E.M.E.F. Prof. Francisco Silva"
                      value={newSchoolForm.name}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, name: e.target.value })}
                      required
                    />
                  </Field>

                  <Field label="Código INEP (8 dígitos)">
                    <Input
                      type="text"
                      placeholder="Ex.: 15001234"
                      value={newSchoolForm.inep}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, inep: e.target.value })}
                    />
                  </Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <Field label="Zona / Localização">
                    <Select
                      value={newSchoolForm.zone}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, zone: e.target.value })}
                    >
                      <option value="URBANA">🏙️ Urbana</option>
                      <option value="RURAL">🌳 Rural</option>
                      <option value="SEDE">🏙️ Sede</option>
                      <option value="ILHAS">⛵ Ilhas</option>
                      <option value="ESTRADAS">🛣️ Estradas</option>
                    </Select>
                  </Field>

                  <Field label="Tipo de Unidade">
                    <Select
                      value={newSchoolForm.schoolType}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, schoolType: e.target.value })}
                    >
                      <option value="E.M.E.F.">E.M.E.F.</option>
                      <option value="E.M.E.I.F.">E.M.E.I.F.</option>
                      <option value="CRECHE">Creche</option>
                      <option value="ESCOLA">Escola</option>
                    </Select>
                  </Field>

                  <Field label="Bairro / Distrito">
                    <Input
                      type="text"
                      placeholder="Ex.: Centro"
                      value={newSchoolForm.district}
                      onChange={(e) => setNewSchoolForm({ ...newSchoolForm, district: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal de Confirmação: Desvinculação Individual */}
      {schoolToRemove && (
        <Modal
          open={Boolean(schoolToRemove)}
          onClose={() => setSchoolToRemove(null)}
          title="Desvincular Escola do PARC"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setSchoolToRemove(null)} disabled={removing}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={handleRemoveSchool} disabled={removing}>
                {removing ? 'Desvinculando...' : 'Confirmar Desvinculação'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 13.5, margin: 0 }}>
              Deseja remover <strong>{schoolToRemove.name || schoolToRemove.school?.name}</strong> (INEP: {schoolToRemove.inep || schoolToRemove.school?.inep || '—'}) das escolas participantes do ciclo <strong>PARC {program.year}</strong>?
            </p>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              A escola continuará existindo no cadastro geral da rede municipal ({totalNetwork} escolas).
            </span>
          </div>
        </Modal>
      )}

      {/* Modal de Confirmação: Desvinculação em Lote */}
      {bulkRemoveModalOpen && (
        <Modal
          open={bulkRemoveModalOpen}
          onClose={() => setBulkRemoveModalOpen(false)}
          title="Confirmar Desvinculação em Lote"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setBulkRemoveModalOpen(false)} disabled={bulkRemoving}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={handleBulkRemoveConfirm} disabled={bulkRemoving}>
                {bulkRemoving ? 'Desvinculando...' : 'Confirmar Desvinculação'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="alert alert-warn" style={{ margin: 0 }}>
              <strong>Atenção</strong>
            </div>
            <p style={{ fontSize: 13.5, margin: 0 }}>
              Deseja desvincular as <strong>{selectedSchoolIds.size} escolas selecionadas</strong> deste ciclo do PARC?
            </p>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              As escolas continuarão preservadas no cadastro geral da rede ({totalNetwork} escolas).
            </span>
          </div>
        </Modal>
      )}
    </div>
  );
}
