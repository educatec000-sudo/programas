import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { cncaApi } from '../../services/resources.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { Badge, Button, Field, Modal, Select, StatCard, LoadingBlock, Input } from '../../components/ui.jsx';
import { fmtInt } from '../../utils/format.js';

const COMPONENT_LABELS = {
  MATEMATICA: { label: 'Matemática', icon: '📐', cls: 'badge-blue' },
  LEITURA: { label: 'Leitura', icon: '📖', cls: 'badge-indigo' },
  ESCRITA: { label: 'Escrita', icon: '✍️', cls: 'badge-purple' },
  FLUENCIA: { label: 'Fluência', icon: '🗣️', cls: 'badge-cyan' },
};

export default function CncaSchools({ program, refreshProgram }) {
  const { success, error } = useToast();
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('TODAS');
  const [dataFilter, setDataFilter] = useState('TODAS');

  // Seleção múltipla
  const [selectedSchoolIds, setSelectedSchoolIds] = useState(new Set());

  // Modal de Adicionar Escola
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [adding, setAdding] = useState(false);

  // Modal de Remoção Individual
  const [schoolToRemove, setSchoolToRemove] = useState(null);
  const [removing, setRemoving] = useState(false);

  // Modal de Remoção em Lote
  const [bulkRemoveModalOpen, setBulkRemoveModalOpen] = useState(false);
  const [bulkRemoveType, setBulkRemoveType] = useState('SELECTED'); // 'SELECTED' | 'WITHOUT_DATA'
  const [bulkRemoving, setBulkRemoving] = useState(false);

  // Busca escolas participantes do ciclo
  const { data: schoolsData, loading, reload } = useApi(
    () => cncaApi.participatingSchools(program.id),
    [program.id],
  );

  // Busca escolas disponíveis na rede geral para adicionar
  const { data: availableData, reload: reloadAvailable } = useApi(
    () => cncaApi.availableSchools(program.id),
    [program.id],
  );

  const schools = schoolsData?.schools || [];
  const totalNetwork = schoolsData?.totalNetworkSchools || 0;
  const totalParticipating = schoolsData?.totalParticipatingSchools || schools.length;
  const withDataCount = schoolsData?.schoolsWithData || schools.filter((s) => s.hasData).length;
  const pendingCount = schoolsData?.schoolsWithoutData ?? Math.max(0, totalParticipating - withDataCount);

  const availableSchools = availableData?.availableSchools || [];

  // Zonas disponíveis dinamicamente para o filtro
  const availableZones = useMemo(() => {
    const set = new Set(schoolsData?.distinctZones || []);
    schools.forEach((s) => {
      if (s.zone) set.add(s.zone);
    });
    return Array.from(set).sort();
  }, [schoolsData, schools]);

  const selectedAvailableSchool = useMemo(() => {
    if (!selectedSchoolId) return null;
    return availableSchools.find((s) => s.id === selectedSchoolId) || null;
  }, [selectedSchoolId, availableSchools]);

  const filteredSchools = useMemo(() => {
    return schools.filter((s) => {
      if (zoneFilter !== 'TODAS' && s.zone !== zoneFilter) return false;
      if (dataFilter === 'COM_DADOS' && !s.hasData) return false;
      if (dataFilter === 'SEM_DADOS' && s.hasData) return false;
      if (!search.trim()) return true;

      const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const name = (s.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const inep = String(s.inep || '');
      const dist = String(s.district || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return name.includes(q) || inep.includes(q) || dist.includes(q);
    });
  }, [schools, search, zoneFilter, dataFilter]);

  // Checkbox: Selecionar Todos / Desmarcar Todos
  const toggleSelectAll = () => {
    if (!filteredSchools.length) return;
    if (selectedSchoolIds.size === filteredSchools.length) {
      setSelectedSchoolIds(new Set());
    } else {
      setSelectedSchoolIds(new Set(filteredSchools.map((s) => s.id)));
    }
  };

  const toggleSelectRow = (id) => {
    const next = new Set(selectedSchoolIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedSchoolIds(next);
  };

  // Adicionar Escola
  const handleAddSchool = async () => {
    if (!selectedSchoolId) {
      error('Por favor, selecione uma escola para adicionar.');
      return;
    }

    setAdding(true);
    try {
      const res = await cncaApi.addSchool(program.id, { schoolId: selectedSchoolId });
      success(res.message || 'Escola participante vinculada com sucesso!');
      setIsAddModalOpen(false);
      setSelectedSchoolId('');
      reload();
      reloadAvailable();
      if (refreshProgram) refreshProgram();
    } catch (err) {
      error(err.message || 'Erro ao adicionar escola participante.');
    } finally {
      setAdding(false);
    }
  };

  // Remoção Individual
  const handleRemoveSchool = async () => {
    if (!schoolToRemove) return;

    setRemoving(true);
    try {
      const res = await cncaApi.removeSchool(program.id, schoolToRemove.id);
      success(res.message || 'Escola desvinculada com sucesso deste ciclo.');
      setSchoolToRemove(null);
      setSelectedSchoolIds((prev) => {
        const next = new Set(prev);
        next.delete(schoolToRemove.id);
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
      } else if (bulkRemoveType === 'WITHOUT_DATA') {
        payload = { onlyWithoutData: true };
      }

      const res = await cncaApi.bulkRemoveSchools(program.id, payload);
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
    return <LoadingBlock label="Carregando escolas participantes do CNCA..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Header Card */}
      <div className="card card-pad">
        <div className="card-header-row" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="card-title">Escolas Participantes — CNCA {program.year}</div>
            <div className="card-subtitle">
              Conjunto dinâmico de unidades escolares vinculadas especificamente a este ciclo avaliativo do CNCA.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pendingCount > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  setBulkRemoveType('WITHOUT_DATA');
                  setBulkRemoveModalOpen(true);
                }}
                style={{ color: '#c2410c', borderColor: '#fed7aa', fontSize: 13 }}
                title="Desvincula do ciclo todas as escolas que não possuem resultados importados"
              >
                🧹 Desvincular Sem Dados ({pendingCount})
              </Button>
            )}
            <Button
              onClick={() => {
                setSelectedSchoolId(availableSchools[0]?.id || '');
                setIsAddModalOpen(true);
              }}
              disabled={availableSchools.length === 0}
            >
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

      {/* Barra de Ações em Massa (quando há escolas selecionadas) */}
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

      {/* Tabela de Escolas Participantes com Checkboxes e Componentes Reais */}
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
                <th style={{ padding: '10px 12px', minWidth: 200 }}>Componentes Avaliados</th>
                <th style={{ padding: '10px 12px', width: 150 }}>Etapas Atendidas</th>
                <th style={{ padding: '10px 12px', width: 140, textAlign: 'center' }}>Status no Ciclo</th>
                <th style={{ padding: '10px 12px', width: 100, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchools.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
                    Nenhuma escola participante encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredSchools.map((s, rowIdx) => {
                  const isSelected = selectedSchoolIds.has(s.id);
                  const componentsList = s.components || s.componentsEvaluated || [];
                  const gradesList = s.grades || s.gradesEvaluated || [];

                  return (
                    <tr
                      key={s.id}
                      style={{
                        background: isSelected ? '#eff6ff' : (rowIdx % 2 === 0 ? '#fff' : '#fafafa'),
                        borderBottom: '1px solid #e2e8f0',
                      }}
                    >
                      {/* Checkbox de seleção */}
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(s.id)}
                        />
                      </td>

                      {/* INEP */}
                      <td style={{ padding: '8px 12px' }}>
                        <span className="mono" style={{ fontWeight: 600 }}>{s.inep || '—'}</span>
                      </td>

                      {/* Nome da Escola */}
                      <td style={{ padding: '8px 12px' }}>
                        <div>
                          <strong>{s.name}</strong>
                          {s.district && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.district}</div>}
                        </div>
                      </td>

                      {/* Zona */}
                      <td style={{ padding: '8px 12px' }}>
                        <Badge cls={s.zone === 'RURAL' ? 'badge-yellow' : s.zone === 'ILHAS' ? 'badge-cyan' : 'badge-blue'}>
                          {s.zone || '—'}
                        </Badge>
                      </td>

                      {/* Componentes Avaliados (Renderização Dinâmica dos 4 Componentes Oficiais) */}
                      <td style={{ padding: '8px 12px' }}>
                        {componentsList.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {componentsList.map((c) => {
                              const def = COMPONENT_LABELS[c] || { label: c, icon: '📊', cls: 'badge-blue' };
                              return (
                                <Badge key={c} cls={def.cls} style={{ fontSize: 11, padding: '2px 7px' }}>
                                  {def.icon} {def.label}
                                </Badge>
                              );
                            })}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Nenhum ainda</span>
                        )}
                      </td>

                      {/* Etapas Atendidas */}
                      <td style={{ padding: '8px 12px' }}>
                        {gradesList.length > 0 ? (
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{gradesList.join(', ')}</span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>1º ao 5º Ano (Elegível)</span>
                        )}
                      </td>

                      {/* Status no Ciclo */}
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {s.hasData ? (
                          <Badge cls="badge-green">🟢 Com dados ({s.resultsCount || componentsList.length})</Badge>
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
          title={`Adicionar Escola Participante — CNCA ${program.year}`}
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsAddModalOpen(false)} disabled={adding}>
                Cancelar
              </Button>
              <Button onClick={handleAddSchool} disabled={adding || !selectedSchoolId}>
                {adding ? 'Vinculando...' : 'Adicionar Escola'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              Selecione uma escola existente no cadastro geral da rede municipal ({totalNetwork} cadastradas) para participar do <strong>CNCA {program.year}</strong>.
            </p>

            <Field label="Selecionar Escola da Rede Geral">
              <Select
                value={selectedSchoolId}
                onChange={(e) => setSelectedSchoolId(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">Selecione uma escola...</option>
                {availableSchools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (INEP: {s.inep || 'S/N'}) — {s.zone}
                  </option>
                ))}
              </Select>
            </Field>

            {selectedAvailableSchool && (
              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-3)' }}>Código INEP:</span>
                  <strong className="mono">{selectedAvailableSchool.inep || 'Não informado'}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-3)' }}>Zona de Localização:</span>
                  <strong>{selectedAvailableSchool.zone}</strong>
                </div>

                {selectedAvailableSchool.district && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-3)' }}>Distrito / Bairro:</span>
                    <span>{selectedAvailableSchool.district}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-3)' }}>Programa:</span>
                  <strong style={{ color: '#0284c7' }}>CNCA (Compromisso Nacional Criança Alfabetizada)</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-3)' }}>Ciclo Avaliativo:</span>
                  <strong>{program.year}</strong>
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
          title="Desvincular Escola do CNCA"
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
              Deseja remover <strong>{schoolToRemove.name}</strong> (INEP: {schoolToRemove.inep || '—'}) das escolas participantes do ciclo <strong>CNCA {program.year}</strong>?
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
              {bulkRemoveType === 'SELECTED' && (
                <>Deseja desvincular as <strong>{selectedSchoolIds.size} escolas selecionadas</strong> deste ciclo do CNCA?</>
              )}
              {bulkRemoveType === 'WITHOUT_DATA' && (
                <>Deseja desvincular <strong>TODAS as {pendingCount} escolas sem dados importados</strong> (creches/não participantes) deste ciclo do CNCA?</>
              )}
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
