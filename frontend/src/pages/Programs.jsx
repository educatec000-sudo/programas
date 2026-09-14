import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { programsApi } from '../services/resources.js';
import { LoadingBlock } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';

function getProgramColor(program) {
  const code = (program.code || '').toUpperCase();
  const name = (program.name || '').toLowerCase();
  if (code.includes('PACTO') || name.includes('pacto')) {
    return { bg: 'rgba(37, 99, 235, 0.12)', color: '#2563eb', border: 'rgba(37, 99, 235, 0.3)' };
  }
  if (code.includes('PARC') || name.includes('parc')) {
    return { bg: 'rgba(2, 132, 199, 0.12)', color: '#0284c7', border: 'rgba(2, 132, 199, 0.3)' };
  }
  if (code.includes('CNCA') || name.includes('cnca') || name.includes('criança') || name.includes('crianca')) {
    return { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' };
  }
  if (code.includes('SISPAE') || name.includes('sispae') || name.includes('paraense')) {
    return { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' };
  }
  return { bg: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', border: 'rgba(99, 102, 241, 0.3)' };
}

function getProgramIcon(program) {
  const code = (program.code || '').toUpperCase();
  const name = (program.name || '').toLowerCase();
  if (code.includes('PACTO') || name.includes('pacto')) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    );
  }
  if (code.includes('PARC') || name.includes('parc')) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    );
  }
  if (code.includes('CNCA') || name.includes('cnca') || name.includes('criança') || name.includes('crianca')) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    );
  }
  if (code.includes('SISPAE') || name.includes('sispae') || name.includes('paraense')) {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5" />
      </svg>
    );
  }
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

export default function Programs() {
  const navigate = useNavigate();

  const { data, loading, error } = useApi(
    () => programsApi.catalogs({ pageSize: 100 }),
    [],
  );

  const programs = data?.data || [];

  return (
    <div className="programs-dashboard-page">
      <PageHeader
        title="Programas Educacionais"
        subtitle="Selecione um programa para acessar seu painel de acompanhamento e avaliações."
        badge="Catálogo Oficial CPE"
      />

      {loading ? (
        <LoadingBlock label="Carregando programas..." />
      ) : error ? (
        <div className="alert alert-error">{error.message}</div>
      ) : programs.length ? (
        <div className="programs-clean-grid">
          {programs.map((program) => {
            const theme = getProgramColor(program);
            const targetId = program.currentCycleId || program.id;
            return (
              <div
                key={program.id}
                className="program-clean-card"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/programas/${targetId}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/programas/${targetId}`);
                  }
                }}
              >
                <div className="program-clean-card-icon" style={{ background: theme.bg, color: theme.color }}>
                  {getProgramIcon(program)}
                </div>
                <div className="program-clean-card-body">
                  <h2 className="program-clean-card-name">{program.name}</h2>
                </div>
                <div className="program-clean-card-arrow">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card card-pad table-empty">
          <div className="empty-icon">▦</div>
          <strong>Nenhum programa cadastrado</strong>
          <span>Cadastre um programa para visualizá-lo aqui.</span>
        </div>
      )}
    </div>
  );
}
