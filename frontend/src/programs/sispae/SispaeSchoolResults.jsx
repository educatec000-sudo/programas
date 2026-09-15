import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { sispaeApi } from '../../services/resources.js';
import { Badge, LoadingBlock, Modal } from '../../components/ui.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

export default function SispaeSchoolResults({ program = {}, onSelectTab }) {
  const [selectedAppId, setSelectedAppId] = useState('');
  const [component, setComponent] = useState('ALL');
  const [grade, setGrade] = useState('2º Ano');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedResult, setSelectedResult] = useState(null);

  const programId = program?.id;
  const programYear = program?.year || 2026;

  const filters = useMemo(
    () => ({
      year: programYear,
      applicationId: selectedAppId || undefined,
      component: component !== 'ALL' ? component : undefined,
      grade: grade !== 'ALL' ? grade : undefined,
      search: search || undefined,
      page,
      pageSize: 25,
    }),
    [programYear, selectedAppId, component, grade, search, page],
  );

  const { data: resultsData, loading, error, refetch } = useApi(
    () => (programId ? sispaeApi.results(programId, filters) : Promise.resolve({ data: [], total: 0, applications: [] })),
    [programId, filters],
  );

  const results = resultsData?.data || [];
  const applications = resultsData?.applications || [];
  const currentApp = resultsData?.currentApplication;
  const total = resultsData?.total || 0;
  const totalPages = resultsData?.totalPages || 1;

  const handleDeleteResult = async (res) => {
    if (
      !window.confirm(
        `Tem certeza que deseja excluir o resultado da escola "${res.schoolName}" no componente ${res.component}?`,
      )
    ) {
      return;
    }
    try {
      await sispaeApi.deleteResult(programId, res.id);
      refetch();
    } catch (err) {
      alert(err.message || 'Erro ao excluir resultado.');
    }
  };

  if (loading && !results.length) {
    return <LoadingBlock message="Carregando resultados por escola..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Barra de Filtros */}
      <div className="program-filter-panel">
        {/* Seletor de Aplicação */}
        {applications.length > 0 && (
          <div className="program-filter-item">
            <label className="program-filter-label">Aplicação</label>
            <select
              value={selectedAppId || currentApp?.id || ''}
              onChange={(e) => {
                setSelectedAppId(e.target.value);
                setPage(1);
              }}
              className="program-select"
            >
              {applications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name} ({app.type === 'SIMULADO' ? 'Simulado' : 'Oficial'})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Filtro de Componente */}
        <div className="program-filter-item">
          <label className="program-filter-label">Componente</label>
          <select
            value={component}
            onChange={(e) => {
              setComponent(e.target.value);
              setPage(1);
            }}
            className="program-select"
          >
            <option value="ALL">Todos os Componentes</option>
            <option value="LINGUA_PORTUGUESA">📖 Língua Portuguesa</option>
            <option value="MATEMATICA">📐 Matemática</option>
            <option value="CIENCIAS_HUMANAS">🌍 Ciências Humanas</option>
            <option value="CIENCIAS_NATUREZA">🔬 Ciências da Natureza</option>
          </select>
        </div>

        {/* Filtro de Ano Escolar */}
        <div className="program-filter-item">
          <label className="program-filter-label">Ano Escolar</label>
          <select
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
              setPage(1);
            }}
            className="program-select"
          >
            <option value="2º Ano">2º Ano (Alfabetização)</option>
          </select>
        </div>

        {/* Busca */}
        <div className="program-filter-item" style={{ minWidth: 200, flex: 1 }}>
          <label className="program-filter-label">Buscar Escola</label>
          <input
            type="text"
            placeholder="Filtrar escola ou INEP..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="input program-select"
            style={{ height: 36 }}
          />
        </div>

        {(search || component !== 'ALL') && (
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 36, marginTop: 'auto' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setComponent('ALL');
                setSearch('');
                setPage(1);
              }}
              style={{ height: 36, whiteSpace: 'nowrap' }}
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* Tabela de Resultados */}
      <div className="card" style={{ padding: 0, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12, textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Escola</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Componente</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Etapa</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Participação</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Distribuição de Desempenho</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Habilidades</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {results.length > 0 ? (
                results.map((r) => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text)' }}>{r.schoolName}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                        INEP: {r.inep || '—'} {r.zone ? `· ${r.zone}` : ''}
                      </div>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          background: r.component === 'LINGUA_PORTUGUESA' ? 'rgba(2, 132, 199, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                          color: r.component === 'LINGUA_PORTUGUESA' ? '#0284c7' : '#8b5cf6',
                          border: `1px solid ${r.component === 'LINGUA_PORTUGUESA' ? 'rgba(2, 132, 199, 0.3)' : 'rgba(139, 92, 246, 0.3)'}`,
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontWeight: 700,
                        }}
                      >
                        {r.component === 'LINGUA_PORTUGUESA' ? '📖 Língua Portuguesa' : '📐 Matemática'}
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px', color: 'var(--text-2)', fontWeight: 600 }}>
                      {r.grade}
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, color: (r.participationRate || 0) >= 80 ? '#10b981' : '#f59e0b', fontSize: 14 }}>
                        {fmt(r.participationRate)}%
                      </div>
                      {r.evaluated != null && (
                        <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{fmtInt(r.evaluated)} avaliados</div>
                      )}
                    </td>

                    <td style={{ padding: '12px 16px', minWidth: 220 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                        <span style={{ color: '#10b981', fontWeight: 700 }}>Adeq: {fmt(r.adequateRate)}%</span>
                        <span style={{ color: '#f59e0b', fontWeight: 700 }}>Interm: {fmt(r.intermediateRate)}%</span>
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>Defas: {fmt(r.deficitRate)}%</span>
                      </div>
                      {/* Barra Segmentada */}
                      <div style={{ height: 8, background: 'var(--surface-3)', borderRadius: 4, display: 'flex', overflow: 'hidden' }}>
                        <div style={{ width: `${r.adequateRate || 0}%`, background: '#10b981' }} />
                        <div style={{ width: `${r.intermediateRate || 0}%`, background: '#f59e0b' }} />
                        <div style={{ width: `${r.deficitRate || 0}%`, background: '#ef4444' }} />
                      </div>
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span
                        style={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          padding: '3px 8px',
                          borderRadius: 12,
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: 'var(--text-2)',
                        }}
                      >
                        {Array.isArray(r.skills) ? `${r.skills.length} habilidades` : '0'}
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <button
                          className="btn btn-outline"
                          onClick={() => setSelectedResult(r)}
                          style={{ padding: '4px 10px', fontSize: 12, fontWeight: 700, color: '#0284c7' }}
                        >
                          👁️ Detalhes
                        </button>
                        <button
                          onClick={() => handleDeleteResult(r)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            padding: '4px 6px',
                            fontSize: 14,
                          }}
                          title="Excluir resultado"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>
                    Nenhum resultado encontrado nesta aplicação para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div
            style={{
              padding: '12px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid var(--border)',
              background: 'var(--surface-2)',
              fontSize: 13,
            }}
          >
            <span style={{ color: 'var(--text-2)' }}>
              Total: {total} resultados · Página {page} de {totalPages}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                Anterior
              </button>
              <button
                className="btn btn-outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Detalhamento da Escola */}
      {selectedResult && (
        <Modal
          title={`Diagnóstico Pedagógico — ${selectedResult.schoolName}`}
          onClose={() => setSelectedResult(null)}
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Cabeçalho da Escola */}
            <div
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '14px 18px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 12,
              }}
            >
              <div>
                <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 600 }}>INEP</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{selectedResult.inep || '—'}</div>
              </div>
              <div>
                <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 600 }}>Componente</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0284c7' }}>
                  {selectedResult.component === 'LINGUA_PORTUGUESA' ? 'Língua Portuguesa' : 'Matemática'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 600 }}>Participação</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>{fmt(selectedResult.participationRate)}%</div>
              </div>
              <div>
                <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 600 }}>Avaliados</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{fmtInt(selectedResult.evaluated || 0)}</div>
              </div>
            </div>

            {/* Níveis de Desempenho */}
            <div>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                Distribuição por Padrão de Desempenho
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <div style={{ padding: 12, background: 'rgba(16, 185, 129, 0.15)', borderRadius: 8, textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>Adequado</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>{fmt(selectedResult.adequateRate)}%</div>
                </div>
                <div style={{ padding: 12, background: 'rgba(245, 158, 11, 0.15)', borderRadius: 8, textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>Intermediário</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b' }}>{fmt(selectedResult.intermediateRate)}%</div>
                </div>
                <div style={{ padding: 12, background: 'rgba(239, 68, 68, 0.15)', borderRadius: 8, textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>Defasagem</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444' }}>{fmt(selectedResult.deficitRate)}%</div>
                </div>
              </div>
            </div>

            {/* Matriz de Habilidades Detalhada */}
            <div>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                Desempenho por Habilidade / Descritor
              </h4>
              {Array.isArray(selectedResult.skills) && selectedResult.skills.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                  {selectedResult.skills.map((sk) => (
                    <div
                      key={sk.code}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: sk.percentage < 50 ? 'rgba(239, 68, 68, 0.12)' : sk.percentage < 70 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                        border: `1px solid ${sk.percentage < 50 ? 'rgba(239, 68, 68, 0.3)' : sk.percentage < 70 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{sk.code}</div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: sk.percentage < 50 ? '#ef4444' : sk.percentage < 70 ? '#f59e0b' : '#10b981',
                          marginTop: 2,
                        }}
                      >
                        {fmt(sk.percentage)}%
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>
                        {sk.percentage < 50 ? 'Crítico' : sk.percentage < 70 ? 'Alerta' : 'Consolidado'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Nenhuma habilidade registrada para esta escola.</p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-outline" onClick={() => setSelectedResult(null)}>
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
