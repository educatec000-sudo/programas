import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { parcApi } from '../../services/resources.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { Badge, Button, Field, LoadingBlock, Modal, Select, Input } from '../../components/ui.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

export default function ParcSchoolResults({ program }) {
  const { success, error } = useToast();

  const [cycle, setCycle] = useState('TODOS');
  const [zone, setZone] = useState('TODAS');
  const [status, setStatus] = useState('TODOS');
  const [year, setYear] = useState('');
  const [search, setSearch] = useState('');

  // Seleção múltipla de resultados
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Modal de Detalhes
  const [viewDetailModal, setViewDetailModal] = useState(null);

  // Modal de Exclusão Individual
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingSingle, setDeletingSingle] = useState(false);

  // Modal de Exclusão em Lote
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteType, setBulkDeleteType] = useState('SELECTED'); // 'SELECTED' | 'ALL_FILTERED'
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: filtersData } = useApi(() => parcApi.filters(program.id), [program.id]);

  const queryParams = useMemo(() => ({
    cycle: cycle === 'TODOS' ? undefined : cycle,
    zone: zone === 'TODAS' ? undefined : zone,
    status: status === 'TODOS' ? undefined : status,
    year: year || program.year,
    search: search.trim() || undefined,
  }), [cycle, zone, status, year, program.year, search]);

  const { data: resultsData, loading, refresh: reload } = useApi(
    () => parcApi.schoolResults(program.id, queryParams),
    [program.id, queryParams],
  );

  const results = resultsData?.results || [];

  // Checkbox: Selecionar Todos / Desmarcar Todos
  const toggleSelectAll = () => {
    if (!results.length) return;
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Publicar todos os rascunhos
  async function handlePublishAll() {
    try {
      const res = await parcApi.publishResults(program.id, { cycle: cycle === 'TODOS' ? undefined : cycle });
      success(res.message || 'Resultados em rascunho publicados com sucesso!');
      await reload();
    } catch (err) {
      error(err.message || 'Erro ao publicar resultados.');
    }
  }

  // Exclusão Individual
  async function confirmDeleteSingle() {
    if (!deleteTarget) return;
    setDeletingSingle(true);
    try {
      await parcApi.deleteResult(program.id, deleteTarget.id);
      success(`Resultado da escola "${deleteTarget.school?.name}" excluído.`);
      setDeleteTarget(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      await reload();
    } catch (err) {
      error(err.message || 'Erro ao excluir resultado.');
    } finally {
      setDeletingSingle(false);
    }
  }

  // Exclusão em Lote
  async function confirmBulkDelete() {
    setBulkDeleting(true);
    try {
      let payload = {};
      if (bulkDeleteType === 'SELECTED') {
        payload = { resultIds: Array.from(selectedIds) };
      } else {
        payload = {
          cycle: cycle === 'TODOS' ? undefined : cycle,
          status: status === 'TODOS' ? undefined : status,
          zone: zone === 'TODAS' ? undefined : zone,
        };
      }

      const res = await parcApi.bulkDeleteResults(program.id, payload);
      success(res.message || `${res.deletedCount || 0} resultados excluídos com sucesso!`);
      setBulkDeleteModalOpen(false);
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      error(err.message || 'Erro ao excluir resultados em lote.');
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Barra de Filtros e Ações */}
      <div className="card card-pad filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', background: '#f8fafc' }}>
        <Field label="Ciclo" style={{ margin: 0, minWidth: 150 }}>
          <Select value={cycle} onChange={(e) => setCycle(e.target.value)} style={{ fontSize: 13, height: 36 }}>
            <option value="TODOS">Todos os ciclos</option>
            <option value="ENTRADA">📥 Ciclo de Entrada</option>
            <option value="SAIDA">📤 Ciclo de Saída</option>
          </Select>
        </Field>

        <Field label="Localização / Zona" style={{ margin: 0, minWidth: 150 }}>
          <Select value={zone} onChange={(e) => setZone(e.target.value)} style={{ fontSize: 13, height: 36 }}>
            <option value="TODAS">Todas as zonas</option>
            {(filtersData?.zones || ['URBANA', 'RURAL']).map((z) => (
              <option key={z} value={z}>
                {z === 'SEDE' ? '🏙️ Sede' : z === 'RURAL' ? '🌳 Rural' : z === 'URBANA' ? '🏙️ Urbana' : z === 'ILHAS' ? '⛵ Ilhas' : z === 'ESTRADAS' ? '🛣️ Estradas' : z}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Status" style={{ margin: 0, minWidth: 130 }}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ fontSize: 13, height: 36 }}>
            <option value="TODOS">Todos</option>
            <option value="PUBLICADO">Publicado</option>
            <option value="RASCUNHO">Rascunho</option>
          </Select>
        </Field>

        <Field label="Ano" style={{ margin: 0, minWidth: 100 }}>
          <Select value={year || program.year} onChange={(e) => setYear(e.target.value)} style={{ fontSize: 13, height: 36 }}>
            {(filtersData?.years || [program.year]).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </Field>

        <Field label="Buscar Escola ou INEP" style={{ margin: 0, flex: 1, minWidth: 200 }}>
          <Input
            type="text"
            placeholder="🔎 Buscar escola ou código INEP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: 13, height: 36 }}
          />
        </Field>

        <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end', flexWrap: 'wrap' }}>
          {results.some((r) => r.isDraft) && (
            <Button variant="secondary" onClick={handlePublishAll} style={{ fontSize: 12.5, height: 36 }}>
              ✅ Publicar Rascunhos
            </Button>
          )}

          {results.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                setBulkDeleteType('ALL_FILTERED');
                setBulkDeleteModalOpen(true);
              }}
              style={{ color: '#b91c1c', borderColor: '#fecaca', background: '#fff', fontSize: 12.5, height: 36 }}
              title="Excluir todos os resultados que correspondem aos filtros atuais"
            >
              🧹 Limpar Filtro ({results.length})
            </Button>
          )}
        </div>
      </div>

      {/* Barra de Ações em Lote quando há seleção por checkbox */}
      {selectedIds.size > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            padding: '10px 16px',
            borderRadius: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13.5, color: '#1e40af', fontWeight: 700 }}>
              {selectedIds.size} de {results.length} resultado(s) selecionado(s)
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="danger"
              onClick={() => {
                setBulkDeleteType('SELECTED');
                setBulkDeleteModalOpen(true);
              }}
              disabled={bulkDeleting}
              style={{ fontSize: 13 }}
            >
              🗑️ Excluir Selecionados ({selectedIds.size})
            </Button>
            <Button
              variant="secondary"
              onClick={() => setSelectedIds(new Set())}
              style={{ fontSize: 13 }}
            >
              Desmarcar todos
            </Button>
          </div>
        </div>
      )}

      {/* Tabela de Resultados por Escola */}
      <div className="card card-pad" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="card-title" style={{ fontSize: 15 }}>Resultados Consolidados por Escola ({results.length})</div>
            <div className="card-subtitle" style={{ fontSize: 12 }}>
              Avaliação de Fluência Leitora do 2º Ano (Métricas Oficiais de Entrada e Saída).
            </div>
          </div>
        </div>

        {loading && !resultsData ? (
          <div style={{ padding: 30 }}>
            <LoadingBlock label="Carregando resultados de Fluência do PARC..." />
          </div>
        ) : (
          <div style={{ maxHeight: 600, overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, zIndex: 5, background: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '10px 12px', width: 40, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={results.length > 0 && selectedIds.size === results.length}
                      onChange={toggleSelectAll}
                      title="Selecionar todos os resultados visíveis"
                    />
                  </th>
                  <th style={{ padding: '10px 12px', width: 100 }}>INEP</th>
                  <th style={{ padding: '10px 12px', minWidth: 220 }}>Escola</th>
                  <th style={{ padding: '10px 12px', width: 100 }}>Ciclo</th>
                  <th style={{ padding: '10px 12px', width: 70, textAlign: 'right' }}>Prev.</th>
                  <th style={{ padding: '10px 12px', width: 70, textAlign: 'right' }}>Aval.</th>
                  <th style={{ padding: '10px 12px', width: 80, textAlign: 'right' }}>Part. %</th>
                  <th style={{ padding: '10px 12px', width: 100, textAlign: 'right' }}>Pré-leitor Total</th>
                  <th style={{ padding: '10px 12px', width: 65, textAlign: 'right' }}>N1</th>
                  <th style={{ padding: '10px 12px', width: 65, textAlign: 'right' }}>N2</th>
                  <th style={{ padding: '10px 12px', width: 65, textAlign: 'right' }}>N3</th>
                  <th style={{ padding: '10px 12px', width: 65, textAlign: 'right' }}>N4</th>
                  <th style={{ padding: '10px 12px', width: 90, textAlign: 'right' }}>Iniciante %</th>
                  <th style={{ padding: '10px 12px', width: 90, textAlign: 'right' }}>Fluente %</th>
                  <th style={{ padding: '10px 12px', width: 90, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '10px 12px', width: 120, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={16} style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
                      Nenhum resultado encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  results.map((r, rowIdx) => {
                    const isSelected = selectedIds.has(r.id);

                    return (
                      <tr
                        key={r.id}
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
                            onChange={() => toggleSelectRow(r.id)}
                          />
                        </td>

                        {/* INEP */}
                        <td style={{ padding: '8px 12px' }}>
                          <span className="mono" style={{ fontWeight: 600 }}>{r.school?.inep || '—'}</span>
                        </td>

                        {/* Nome da Escola */}
                        <td style={{ padding: '8px 12px' }}>
                          <div>
                            <strong>{r.school?.name}</strong>
                            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                              {r.school?.zone || '—'} {r.school?.district ? `· ${r.school.district}` : ''}
                            </div>
                          </div>
                        </td>

                        {/* Ciclo */}
                        <td style={{ padding: '8px 12px' }}>
                          <Badge cls={r.cycle === 'SAIDA' ? 'badge-green' : 'badge-blue'}>
                            {r.cycle === 'SAIDA' ? '📤 Saída' : '📥 Entrada'}
                          </Badge>
                        </td>

                        {/* Previstos */}
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          {fmtInt(r.enrolled)}
                        </td>

                        {/* Avaliados */}
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                          {fmtInt(r.evaluated)}
                        </td>

                        {/* Participação */}
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>
                          {fmt(r.participationRate, 1)}%
                        </td>

                        {/* Pré-leitor Total */}
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>
                          {r.preReaderTotal != null ? `${fmt(r.preReaderTotal, 0)}%` : '—'}
                        </td>

                        {/* N1 a N4 */}
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#991b1b', fontSize: 12 }}>
                          {r.preReaderLevel1 != null ? `${fmt(r.preReaderLevel1, 0)}%` : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#c2410c', fontSize: 12 }}>
                          {r.preReaderLevel2 != null ? `${fmt(r.preReaderLevel2, 0)}%` : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#d97706', fontSize: 12 }}>
                          {r.preReaderLevel3 != null ? `${fmt(r.preReaderLevel3, 0)}%` : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#65a30d', fontSize: 12 }}>
                          {r.preReaderLevel4 != null ? `${fmt(r.preReaderLevel4, 0)}%` : '—'}
                        </td>

                        {/* Iniciante */}
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>
                          {r.beginnerReader != null ? `${fmt(r.beginnerReader, 0)}%` : '—'}
                        </td>

                        {/* Fluente */}
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 800 }}>
                          {r.fluentReader != null ? `${fmt(r.fluentReader, 0)}%` : '—'}
                        </td>

                        {/* Status */}
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <Badge cls={r.isDraft ? 'badge-yellow' : 'badge-green'}>
                            {r.isDraft ? 'Rascunho' : 'Publicado'}
                          </Badge>
                        </td>

                        {/* Ações */}
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewDetailModal(r)}
                              title="Ver Raio-X detalhado da escola"
                              style={{ padding: '3px 6px', fontSize: 12 }}
                            >
                              👁️
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(r)}
                              title="Excluir este resultado"
                              style={{ padding: '3px 6px', fontSize: 12, color: '#dc2626' }}
                            >
                              🗑️
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)' }}>
          <span>Exibindo <strong>{results.length}</strong> resultados de avaliação de Fluência Leitora</span>
          {selectedIds.size > 0 && <span><strong>{selectedIds.size}</strong> selecionado(s)</span>}
        </div>
      </div>

      {/* Modal de Exclusão Individual */}
      {deleteTarget && (
        <Modal
          open={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          title="Excluir Resultado de Fluência"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deletingSingle}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={confirmDeleteSingle} disabled={deletingSingle}>
                {deletingSingle ? 'Excluindo...' : 'Confirmar Exclusão'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 13.5, margin: 0 }}>
              Deseja excluir o resultado da avaliação de Fluência da escola <strong>{deleteTarget.school?.name}</strong> ({deleteTarget.cycle === 'SAIDA' ? 'Ciclo de Saída' : 'Ciclo de Entrada'})?
            </p>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Esta ação removerá as métricas registradas para este ciclo. A escola continuará cadastrada no sistema.
            </span>
          </div>
        </Modal>
      )}

      {/* Modal de Exclusão em Lote */}
      {bulkDeleteModalOpen && (
        <Modal
          open={bulkDeleteModalOpen}
          onClose={() => setBulkDeleteModalOpen(false)}
          title="Confirmar Exclusão em Lote"
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setBulkDeleteModalOpen(false)} disabled={bulkDeleting}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={confirmBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? 'Excluindo...' : 'Confirmar Exclusão em Lote'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="alert alert-warn" style={{ margin: 0 }}>
              <strong>Atenção</strong>: Esta operação removerá múltiplos resultados de avaliação do banco de dados.
            </div>

            <p style={{ fontSize: 13.5, margin: 0 }}>
              {bulkDeleteType === 'SELECTED' ? (
                <>Deseja excluir os <strong>{selectedIds.size} resultados selecionados</strong>?</>
              ) : (
                <>Deseja excluir <strong>TODOS os {results.length} resultados</strong> correspondentes aos filtros selecionados?</>
              )}
            </p>

            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Os dados de pontuação e níveis serão apagados. O histórico da operação ficará registrado na auditoria do sistema.
            </span>
          </div>
        </Modal>
      )}

      {/* Modal de Detalhes da Escola */}
      {viewDetailModal && (
        <Modal
          open={Boolean(viewDetailModal)}
          title={`Raio-X de Fluência · ${viewDetailModal.school?.name}`}
          onClose={() => setViewDetailModal(null)}
          size="lg"
          footer={
            <Button onClick={() => setViewDetailModal(null)}>
              Fechar
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Cabeçalho do Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  INEP: <span className="mono">{viewDetailModal.school?.inep || '—'}</span> · {viewDetailModal.school?.zone || '—'} · {viewDetailModal.school?.district || '—'}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
                  Ano Letivo: <strong>{viewDetailModal.year}</strong> · Etapa: <strong>{viewDetailModal.grade}</strong>
                </div>
              </div>
              <Badge cls={viewDetailModal.cycle === 'SAIDA' ? 'badge-green' : 'badge-blue'} style={{ fontSize: 13, padding: '4px 10px' }}>
                {viewDetailModal.cycle === 'SAIDA' ? '📤 Ciclo de Saída' : '📥 Ciclo de Entrada'}
              </Badge>
            </div>

            {/* KPIs da Escola */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Previstos</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtInt(viewDetailModal.enrolled)}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Avaliados</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtInt(viewDetailModal.evaluated)}</div>
              </div>
              <div style={{ background: '#f0fdf4', padding: 10, borderRadius: 6, textAlign: 'center', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 11.5, color: '#166534' }}>Participação</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#166534' }}>{fmt(viewDetailModal.participationRate, 1)}%</div>
              </div>
            </div>

            {/* Distribuição dos Perfis de Fluência */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>
                Perfis de Desempenho Leitor
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>🗣️ Leitor Fluente</span>
                  <strong style={{ fontSize: 16, color: '#10b981' }}>{fmt(viewDetailModal.fluentReader, 1)}%</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#3b82f6', fontWeight: 600 }}>📖 Leitor Iniciante</span>
                  <strong style={{ fontSize: 16, color: '#3b82f6' }}>{fmt(viewDetailModal.beginnerReader, 1)}%</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>📉 Pré-leitor (Total)</span>
                  <strong style={{ fontSize: 16, color: '#ef4444' }}>{fmt(viewDetailModal.preReaderTotal, 1)}%</strong>
                </div>
              </div>
            </div>

            {/* Detalhamento dos Níveis de Pré-Leitor (N1 a N4) */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, background: '#fafafa' }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>
                Detalhamento dos Níveis de Pré-leitor (N1 ao N4)
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <div style={{ padding: 8, background: '#fff', borderRadius: 6, border: '1px solid #fee2e2' }}>
                  <div style={{ fontSize: 11.5, color: '#991b1b', fontWeight: 600 }}>Nível 1 (Não Leu)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444', marginTop: 4 }}>
                    {fmt(viewDetailModal.preReaderLevel1, 1)}%
                  </div>
                </div>

                <div style={{ padding: 8, background: '#fff', borderRadius: 6, border: '1px solid #ffedd5' }}>
                  <div style={{ fontSize: 11.5, color: '#9a3412', fontWeight: 600 }}>Nível 2 (Soletrou)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#f97316', marginTop: 4 }}>
                    {fmt(viewDetailModal.preReaderLevel2, 1)}%
                  </div>
                </div>

                <div style={{ padding: 8, background: '#fff', borderRadius: 6, border: '1px solid #fef3c7' }}>
                  <div style={{ fontSize: 11.5, color: '#92400e', fontWeight: 600 }}>Nível 3 (Silabou)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', marginTop: 4 }}>
                    {fmt(viewDetailModal.preReaderLevel3, 1)}%
                  </div>
                </div>

                <div style={{ padding: 8, background: '#fff', borderRadius: 6, border: '1px solid #ecfccb' }}>
                  <div style={{ fontSize: 11.5, color: '#3f6212', fontWeight: 600 }}>Nível 4 (Leu até 10 Palavras)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#84cc16', marginTop: 4 }}>
                    {fmt(viewDetailModal.preReaderLevel4, 1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
