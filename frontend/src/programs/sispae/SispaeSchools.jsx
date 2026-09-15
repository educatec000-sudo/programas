import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { sispaeApi } from '../../services/resources.js';
import { Badge, LoadingBlock } from '../../components/ui.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

export default function SispaeSchools({ program = {}, onSelectTab }) {
  const [selectedAppId, setSelectedAppId] = useState('');
  const [search, setSearch] = useState('');

  const programId = program?.id;
  const programYear = program?.year || 2026;

  const filters = useMemo(
    () => ({
      year: programYear,
      applicationId: selectedAppId || undefined,
      search: search || undefined,
    }),
    [programYear, selectedAppId, search],
  );

  const { data: schoolsData, loading, error, refetch } = useApi(
    () => (programId ? sispaeApi.schools(programId, filters) : Promise.resolve({ schools: [], applications: [] })),
    [programId, filters],
  );

  const schools = schoolsData?.schools || [];
  const applications = schoolsData?.applications || [];
  const currentApp = schoolsData?.currentApplication;

  if (loading && !schools.length) {
    return <LoadingBlock message="Carregando escolas participantes..." />;
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

        {/* Busca */}
        <div className="program-filter-item" style={{ minWidth: 280, flex: 1 }}>
          <label className="program-filter-label">Buscar Escola ou INEP</label>
          <input
            type="text"
            placeholder="Buscar por escola ou INEP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input program-select"
            style={{ height: 36 }}
          />
        </div>

        {search && (
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 36, marginTop: 'auto' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSearch('')}
              style={{ height: 36, whiteSpace: 'nowrap' }}
            >
              Limpar busca
            </button>
          </div>
        )}
      </div>

      {/* Tabela de Escolas */}
      <div className="card" style={{ padding: 0, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12, textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Escola</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>INEP</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Zona</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Língua Portuguesa</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Matemática</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {schools.length > 0 ? (
                schools.map((sc) => (
                  <tr
                    key={sc.schoolId}
                    style={{
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text)' }}>
                      {sc.schoolName}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-2)', fontFamily: 'monospace' }}>
                      {sc.inep || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-2)' }}>
                      {sc.zone || '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {sc.linguaPortuguesa ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#10b981', fontWeight: 700 }}>✓ Avaliada</span>
                          <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                            ({fmt(sc.linguaPortuguesa.participationRate)}% part.)
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Pendente</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {sc.matematica ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#10b981', fontWeight: 700 }}>✓ Avaliada</span>
                          <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                            ({fmt(sc.matematica.participationRate)}% part.)
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Pendente</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {sc.hasResults ? (
                        <span
                          style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            padding: '3px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          COM DADOS
                        </span>
                      ) : (
                        <span
                          style={{
                            background: 'var(--surface-2)',
                            color: 'var(--text-3)',
                            border: '1px solid var(--border)',
                            padding: '3px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          SEM DADOS
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                    Nenhuma escola encontrada com os filtros aplicados.
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
