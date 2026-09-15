import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { sispaeApi } from '../../services/resources.js';
import { Badge, LoadingBlock } from '../../components/ui.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

export default function SispaeRanking({ program = {}, onSelectTab }) {
  const [selectedAppId, setSelectedAppId] = useState('');
  const [component, setComponent] = useState('ALL');
  const [indicator, setIndicator] = useState('ADEQUADO');
  const [search, setSearch] = useState('');

  const programId = program?.id;
  const programYear = program?.year || 2026;

  const filters = useMemo(
    () => ({
      year: programYear,
      applicationId: selectedAppId || undefined,
      component: component !== 'ALL' ? component : undefined,
      indicator,
      search: search || undefined,
    }),
    [programYear, selectedAppId, component, indicator, search],
  );

  const { data: rankingData, loading, error, refetch } = useApi(
    () => (programId ? sispaeApi.ranking(programId, filters) : Promise.resolve({ ranking: [], applications: [] })),
    [programId, filters],
  );

  const ranking = rankingData?.ranking || [];
  const applications = rankingData?.applications || [];
  const currentApp = rankingData?.currentApplication;

  const top3 = ranking.slice(0, 3);

  if (loading && !ranking.length) {
    return <LoadingBlock message="Calculando ranking do SisPAE..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Barra de Filtros e Controles */}
      <div className="program-filter-panel">
        {/* Seletor de Aplicação */}
        {applications.length > 0 && (
          <div className="program-filter-item">
            <label className="program-filter-label">Aplicação</label>
            <select
              value={selectedAppId || currentApp?.id || ''}
              onChange={(e) => setSelectedAppId(e.target.value)}
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
            onChange={(e) => setComponent(e.target.value)}
            className="program-select"
          >
            <option value="ALL">Geral (Todos os Componentes)</option>
            <option value="LINGUA_PORTUGUESA">📖 Língua Portuguesa</option>
            <option value="MATEMATICA">📐 Matemática</option>
          </select>
        </div>

        {/* Critério de Classificação */}
        <div className="program-filter-item">
          <label className="program-filter-label">Classificar por</label>
          <select
            value={indicator}
            onChange={(e) => setIndicator(e.target.value)}
            className="program-select"
          >
            <option value="ADEQUADO">🎯 % Aprendizado Adequado</option>
            <option value="PROFICIENCIA">📈 Proficiência Média</option>
            <option value="PARTICIPACAO">👥 Taxa de Participação</option>
            <option value="MENOR_DEFASAGEM">📉 Menor % de Defasagem</option>
          </select>
        </div>

        {/* Busca */}
        <div className="program-filter-item" style={{ minWidth: 200, flex: 1 }}>
          <label className="program-filter-label">Buscar Escola</label>
          <input
            type="text"
            placeholder="Buscar escola..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input program-select"
            style={{ height: 36 }}
          />
        </div>

        {(search || component !== 'ALL' || indicator !== 'ADEQUADO') && (
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 36, marginTop: 'auto' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setComponent('ALL');
                setIndicator('ADEQUADO');
                setSearch('');
              }}
              style={{ height: 36, whiteSpace: 'nowrap' }}
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* Pódio dos Top 3 */}
      {top3.length >= 3 && !search && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {/* 2º Lugar */}
          <div
            className="card"
            style={{
              padding: 20,
              borderRadius: 12,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 4 }}>🥈</div>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase' }}>
              2º Lugar
            </span>
            <h4 style={{ margin: '6px 0 2px 0', fontSize: 15, fontWeight: 700 }}>
              {top3[1]?.schoolName}
            </h4>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
              INEP: {top3[1]?.inep || '—'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0284c7' }}>
              {fmt(top3[1]?.adequateRate)}% <span style={{ fontSize: 12, color: 'var(--text-3)' }}>adequado</span>
            </div>
          </div>

          {/* 1º Lugar (Destaque Maior) */}
          <div
            className="card"
            style={{
              padding: 24,
              borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.14) 0%, rgba(5, 150, 105, 0.22) 100%)',
              border: '2px solid #10b981',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              transform: 'translateY(-6px)',
              boxShadow: '0 8px 20px rgba(16, 185, 129, 0.18)',
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 4 }}>🥇</div>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#10b981', textTransform: 'uppercase' }}>
              1º Lugar · Destaque da Rede
            </span>
            <h4 style={{ margin: '6px 0 2px 0', fontSize: 17, fontWeight: 800 }}>
              {top3[0]?.schoolName}
            </h4>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
              INEP: {top3[0]?.inep || '—'}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#10b981' }}>
              {fmt(top3[0]?.adequateRate)}% <span style={{ fontSize: 13, color: 'var(--text-2)' }}>adequado</span>
            </div>
          </div>

          {/* 3º Lugar */}
          <div
            className="card"
            style={{
              padding: 20,
              borderRadius: 12,
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 4 }}>🥉</div>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase' }}>
              3º Lugar
            </span>
            <h4 style={{ margin: '6px 0 2px 0', fontSize: 15, fontWeight: 700 }}>
              {top3[2]?.schoolName}
            </h4>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
              INEP: {top3[2]?.inep || '—'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0284c7' }}>
              {fmt(top3[2]?.adequateRate)}% <span style={{ fontSize: 12, color: 'var(--text-3)' }}>adequado</span>
            </div>
          </div>
        </div>
      )}

      {/* Tabela Completa do Ranking */}
      <div className="card" style={{ padding: 0, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12, textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700, width: 80, textAlign: 'center' }}>Posição</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Escola</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>INEP</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Participação</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>% Adequado</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>% Intermediário</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>% Defasagem</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length > 0 ? (
                ranking.map((row, idx) => (
                  <tr
                    key={row.schoolId}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, fontSize: 14 }}>
                      {row.badge}
                    </td>

                    <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                      {row.schoolName}
                    </td>

                    <td style={{ padding: '12px 16px', color: 'var(--text-3)', fontFamily: 'monospace' }}>
                      {row.inep || '—'}
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: row.participationRate >= 80 ? '#10b981' : '#f59e0b' }}>
                      {fmt(row.participationRate)}%
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{ fontWeight: 800, color: '#10b981', fontSize: 14 }}>
                        {fmt(row.adequateRate)}%
                      </span>
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#d97706' }}>
                      {fmt(row.intermediateRate)}%
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#ef4444' }}>
                      {fmt(row.deficitRate)}%
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>
                    Nenhuma escola classificada nesta aplicação.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
