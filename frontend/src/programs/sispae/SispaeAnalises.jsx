import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { sispaeApi } from '../../services/resources.js';
import { LoadingBlock } from '../../components/ui.jsx';
import { fmt } from '../../utils/format.js';

export default function SispaeAnalises({ program = {}, onSelectTab }) {
  const [selectedAppId, setSelectedAppId] = useState('');
  const [component, setComponent] = useState('ALL');
  const [search, setSearch] = useState('');

  const programId = program?.id;
  const programYear = program?.year || 2026;

  const filters = useMemo(
    () => ({
      year: programYear,
      applicationId: selectedAppId || undefined,
      component: component !== 'ALL' ? component : undefined,
      search: search || undefined,
    }),
    [programYear, selectedAppId, component, search],
  );

  const { data: analisesData, loading, error, refetch } = useApi(
    () => (programId ? sispaeApi.analises(programId, filters) : Promise.resolve({ matrix: [], skills: [], applications: [] })),
    [programId, filters],
  );

  const matrix = analisesData?.matrix || [];
  const skills = analisesData?.skills || [];
  const applications = analisesData?.applications || [];
  const currentApp = analisesData?.currentApplication;

  // Habilidades críticas da rede (< 50%)
  const criticalSkills = useMemo(() => {
    return skills.filter((s) => s.average < 50);
  }, [skills]);

  // Habilidades em alerta (50-70%)
  const alertSkills = useMemo(() => {
    return skills.filter((s) => s.average >= 50 && s.average < 70);
  }, [skills]);

  // Habilidades consolidadas (>= 70%)
  const consolidatedSkills = useMemo(() => {
    return skills.filter((s) => s.average >= 70);
  }, [skills]);

  if (loading && !matrix.length) {
    return <LoadingBlock message="Gerando diagnósticos pedagógicos do SisPAE..." />;
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

        {/* Filtro de Componente */}
        <div className="program-filter-item">
          <label className="program-filter-label">Componente</label>
          <select
            value={component}
            onChange={(e) => setComponent(e.target.value)}
            className="program-select"
          >
            <option value="ALL">Todos os Componentes</option>
            <option value="LINGUA_PORTUGUESA">📖 Língua Portuguesa</option>
            <option value="MATEMATICA">📐 Matemática</option>
          </select>
        </div>

        {/* Busca */}
        <div className="program-filter-item" style={{ minWidth: 200, flex: 1 }}>
          <label className="program-filter-label">Buscar Escola</label>
          <input
            type="text"
            placeholder="Filtrar escola..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input program-select"
            style={{ height: 36 }}
          />
        </div>
      </div>

      {/* Cards de Resumo Pedagógico da Rede */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <div className="card" style={{ padding: '16px 20px', borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#991b1b', textTransform: 'uppercase' }}>
            ⚠️ Habilidades Críticas (&lt; 50%)
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>
            {criticalSkills.length} descritores
          </div>
          <div style={{ fontSize: 11.5, color: '#7f1d1d', marginTop: 2 }}>
            demandam reforço emergencial
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderRadius: 10, border: '1px solid #fde68a', background: '#fffbeb' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e', textTransform: 'uppercase' }}>
            ⚡ Habilidades em Alerta (50-70%)
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
            {alertSkills.length} descritores
          </div>
          <div style={{ fontSize: 11.5, color: '#78350f', marginTop: 2 }}>
            em desenvolvimento intermediário
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderRadius: 10, border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#065f46', textTransform: 'uppercase' }}>
            🎯 Habilidades Consolidadas (≥ 70%)
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#16a34a', marginTop: 4 }}>
            {consolidatedSkills.length} descritores
          </div>
          <div style={{ fontSize: 11.5, color: '#064e3b', marginTop: 2 }}>
            domínio satisfatório pela rede
          </div>
        </div>
      </div>

      {/* Matriz de Calor de Habilidades por Escola */}
      <div className="card" style={{ padding: 0, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
            Matriz de Habilidades por Escola (Mapa de Calor)
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: 'var(--text-2)' }}>
            Valores representam a taxa de acerto (%) de cada escola por descritor/habilidade avaliada.
          </p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>
                <th style={{ padding: '10px 14px', fontWeight: 700, position: 'sticky', left: 0, background: 'var(--surface-2)', zIndex: 2, minWidth: 220 }}>
                  Escola
                </th>
                {skills.map((sk) => (
                  <th key={`${sk.component}_${sk.code}`} style={{ padding: '10px 8px', textAlign: 'center', minWidth: 55 }} title={sk.label}>
                    <div style={{ fontWeight: 800, color: sk.component === 'LINGUA_PORTUGUESA' ? '#0284c7' : '#8b5cf6' }}>
                      {sk.code}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600 }}>
                      {fmt(sk.average)}%
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.length > 0 ? (
                matrix.map((row) => (
                  <tr key={row.schoolId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text)', position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }}>
                      {row.schoolName}
                    </td>
                    {skills.map((sk) => {
                      const compSkills = row.skillsByComponent[sk.component] || {};
                      const val = compSkills[sk.code];
                      let bgColor = 'transparent';
                      let textColor = 'var(--text-3)';

                      if (val != null) {
                        if (val < 50) {
                          bgColor = 'rgba(239, 68, 68, 0.16)';
                          textColor = '#ef4444';
                        } else if (val < 70) {
                          bgColor = 'rgba(245, 158, 11, 0.16)';
                          textColor = '#f59e0b';
                        } else {
                          bgColor = 'rgba(16, 185, 129, 0.16)';
                          textColor = '#10b981';
                        }
                      }

                      return (
                        <td
                          key={`${row.schoolId}_${sk.component}_${sk.code}`}
                          style={{
                            padding: '10px 8px',
                            textAlign: 'center',
                            fontWeight: 700,
                            background: bgColor,
                            color: textColor,
                          }}
                        >
                          {val != null ? `${fmt(val)}%` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={skills.length + 1} style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>
                    Nenhum dado pedagógico registrado nesta aplicação.
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
