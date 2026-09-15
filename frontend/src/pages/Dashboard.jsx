import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { dashboardApi, programsApi } from '../services/resources.js';
import { fmtInt, yearsRange } from '../utils/format.js';
import SchoolMap from '../components/SchoolMap.jsx';

function getProgramCardMeta(prog) {
  const code = (prog.code || prog.catalog?.code || '').toUpperCase();
  const name = (prog.name || '').toLowerCase();

  if (code.includes('PACTO') || name.includes('pacto')) {
    return {
      badge: 'Pacto',
      iconBg: 'rgba(37, 99, 235, 0.12)',
      iconColor: '#2563eb',
      accentColor: '#2563eb',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      ),
    };
  }
  if (code.includes('PARC') || name.includes('parc')) {
    return {
      badge: 'PARC',
      iconBg: 'rgba(2, 132, 199, 0.12)',
      iconColor: '#0284c7',
      accentColor: '#0284c7',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
    };
  }
  if (code.includes('CNCA') || name.includes('cnca') || name.includes('criança') || name.includes('crianca')) {
    return {
      badge: 'CNCA',
      iconBg: 'rgba(16, 185, 129, 0.12)',
      iconColor: '#10b981',
      accentColor: '#10b981',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
    };
  }
  if (code.includes('SISPAE') || name.includes('sispae') || name.includes('paraense')) {
    return {
      badge: 'SisPAE',
      iconBg: 'rgba(245, 158, 11, 0.12)',
      iconColor: '#f59e0b',
      accentColor: '#f59e0b',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5" />
        </svg>
      ),
    };
  }
  return {
    badge: 'Programa',
    iconBg: 'rgba(99, 102, 241, 0.12)',
    iconColor: '#6366f1',
    accentColor: '#6366f1',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
  };
}

export default function Dashboard() {
  const [year, setYear] = useState('2026');
  const [programId, setProgramId] = useState('');
  const navigate = useNavigate();

  const { data: programsData } = useApi(() => programsApi.list({ pageSize: 100 }), []);
  const programs = programsData?.data || [];

  const { data, loading, error } = useApi(
    () => dashboardApi.get({ year: year || undefined, programId: programId || undefined }),
    [year, programId],
  );

  const kpis = data?.kpis || {};
  const mapSchools = data?.map?.schools || [];

  const selectedProgram = useMemo(() => {
    if (!programId) return null;
    return programs.find((p) => p.id === programId) || null;
  }, [programId, programs]);

  const handleProgramSelect = (id) => {
    setProgramId(id);
    if (id) {
      const p = programs.find((item) => item.id === id);
      if (p?.year) setYear(String(p.year));
    }
  };

  return (
    <div className="cpe-dashboard-container">
      {/* 1. HERO BANNER COM AMBIENTAÇÃO EDUCACIONAL */}
      <div className="cpe-hero-banner">
        <div className="cpe-hero-content">
          <div className="cpe-hero-badge">
            <div className="cpe-badge-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <span>CPE · Controle de Programas Educacionais</span>
          </div>

          <h1 className="cpe-hero-title">Bem-vindo(a) ao CPE!</h1>
          <p className="cpe-hero-subtitle">
            Juntos por uma educação mais forte e inclusiva.
          </p>
        </div>

        {/* CONTROLES DO HERO: ANO LETIVO & VISÃO CONSOLIDADA */}
        <div className="cpe-hero-controls">
          <div className="cpe-hero-select-box">
            <label className="cpe-hero-label">Ano letivo</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="cpe-hero-select"
            >
              {yearsRange(2023).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="cpe-hero-select-box">
            <label className="cpe-hero-label">Visão consolidada</label>
            <select
              value={programId}
              onChange={(e) => handleProgramSelect(e.target.value)}
              className="cpe-hero-select cpe-hero-select-wide"
            >
              <option value="">Todos os programas</option>
              {programs.map((prog) => (
                <option key={prog.id} value={prog.id}>
                  {prog.name} ({prog.year})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. CARDS FLUTUANTES DE KPIS (6 EM LINHA PADRÃO) */}
      <div className="cpe-kpis-strip">
        {/* Card 1: Programas Ativos */}
        <div className="cpe-kpi-card" onClick={() => navigate('/programas')}>
          <div className="cpe-kpi-icon-wrap" style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="cpe-kpi-info">
            <div className="cpe-kpi-value">{kpis.programsActive ?? (programs.length || 4)}</div>
            <div className="cpe-kpi-label">Programas ativos</div>
          </div>
        </div>

        {/* Card 2: Escolas no município */}
        <div className="cpe-kpi-card" onClick={() => navigate('/escolas')}>
          <div className="cpe-kpi-icon-wrap" style={{ background: '#ccfbf1', color: '#0d9488' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div className="cpe-kpi-info">
            <div className="cpe-kpi-value">{fmtInt(kpis.schoolsTotal || 170)}</div>
            <div className="cpe-kpi-label">Escolas no município</div>
          </div>
        </div>

        {/* Card 3: Escolas participantes */}
        <div className="cpe-kpi-card">
          <div className="cpe-kpi-icon-wrap" style={{ background: '#f3e8ff', color: '#9333ea' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <polyline points="17 11 19 13 23 9" />
            </svg>
          </div>
          <div className="cpe-kpi-info">
            <div className="cpe-kpi-value">{fmtInt(kpis.participatingSchools || mapSchools.length || 147)}</div>
            <div className="cpe-kpi-label">Escolas participantes</div>
          </div>
        </div>

        {/* Card 4: Alunos avaliados */}
        <div className="cpe-kpi-card">
          <div className="cpe-kpi-icon-wrap" style={{ background: '#dcfce7', color: '#16a34a' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="cpe-kpi-info">
            <div className="cpe-kpi-value">{fmtInt(kpis.studentsEvaluated || 241)}</div>
            <div className="cpe-kpi-label">Alunos avaliados</div>
          </div>
        </div>

        {/* Card 5: Resultados lançados */}
        <div className="cpe-kpi-card" onClick={() => navigate('/programas')}>
          <div className="cpe-kpi-icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div className="cpe-kpi-info">
            <div className="cpe-kpi-value">{fmtInt(kpis.resultsTotal || 345)}</div>
            <div className="cpe-kpi-label">Resultados lançados</div>
          </div>
        </div>

        {/* Card 6: Critérios e habilidades */}
        <div className="cpe-kpi-card">
          <div className="cpe-kpi-icon-wrap" style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          </div>
          <div className="cpe-kpi-info">
            <div className="cpe-kpi-value">{fmtInt(kpis.indicatorsActive || 1)}</div>
            <div className="cpe-kpi-label">Critérios e habilidades</div>
          </div>
        </div>
      </div>

      {/* 3. GRID PRINCIPAL EM 2 COLUNAS: MAPA DAS ESCOLAS + FILTRAGEM INTERATIVA DE PROGRAMAS */}
      <div className="cpe-main-grid">
        {/* COLUNA ESQUERDA: MAPA DE LOCALIZAÇÃO DAS ESCOLAS EM ABAETETUBA */}
        <div className="cpe-card cpe-map-card">
          <div className="cpe-card-header">
            <div>
              <h2 className="cpe-card-title">
                {selectedProgram ? `Localização — ${selectedProgram.name}` : 'Localização das escolas — Abaetetuba/PA'}
              </h2>
              <p className="cpe-card-subtitle">
                {mapSchools.length} escola(s) com coordenadas {selectedProgram ? 'neste programa' : 'na rede municipal'} · passe o mouse sobre um ponto
              </p>
            </div>
            {selectedProgram && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => handleProgramSelect('')}
                style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}
              >
                ✕ Ver todas
              </button>
            )}
          </div>

          <div className="cpe-map-wrapper">
            <SchoolMap schools={mapSchools} hideHeader={true} height={460} />
          </div>
        </div>

        {/* COLUNA DIREITA: SELEÇÃO DE PROGRAMAS PARA FILTRAR O MAPA */}
        <div className="cpe-card cpe-programs-interactive-card">
          <div className="cpe-card-header">
            <div>
              <h2 className="cpe-card-title">Programas Educacionais</h2>
              <p className="cpe-card-subtitle">
                Selecione um programa para filtrar suas escolas participantes no mapa
              </p>
            </div>
          </div>

          <div className="cpe-interactive-programs-list">
            {/* 1. Opção Todos os Programas (Visão Geral) */}
            <div
              className={`cpe-program-filter-item ${!programId ? 'active' : ''}`}
              onClick={() => handleProgramSelect('')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleProgramSelect(''); }}
            >
              <div
                className="cpe-program-filter-icon"
                style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </div>
              <div className="cpe-program-filter-body">
                <div className="cpe-program-filter-name">Todos os programas</div>
                <div className="cpe-program-filter-meta">Visão consolidada de todas as unidades</div>
              </div>
              <div className="cpe-program-filter-badge">
                {!programId ? '✓ Ativo' : 'Geral'}
              </div>
            </div>

            {/* 2. Programas Cadastrados (Pacto, PARC, CNCA, SisPAE, etc.) */}
            {programs.map((prog) => {
              const meta = getProgramCardMeta(prog);
              const isSelected = programId === prog.id;
              return (
                <div
                  key={prog.id}
                  className={`cpe-program-filter-item ${isSelected ? 'active' : ''}`}
                  onClick={() => handleProgramSelect(prog.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleProgramSelect(prog.id); }}
                  style={isSelected ? { borderColor: meta.accentColor, background: isSelected ? meta.iconBg : undefined } : {}}
                >
                  <div
                    className="cpe-program-filter-icon"
                    style={{ background: meta.iconBg, color: meta.iconColor }}
                  >
                    {meta.icon}
                  </div>
                  <div className="cpe-program-filter-body">
                    <div className="cpe-program-filter-name">{prog.name}</div>
                    <div className="cpe-program-filter-meta">
                      {prog.periodLabel || `Ciclo ${prog.year}`}
                    </div>
                  </div>
                  <div className="cpe-program-filter-actions">
                    <span
                      className="cpe-program-tag"
                      style={{
                        background: isSelected ? meta.accentColor : meta.iconBg,
                        color: isSelected ? '#ffffff' : meta.iconColor,
                      }}
                    >
                      {isSelected ? '✓ Filtrado' : meta.badge}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. SLOGAN E ASSINATURA INFERIOR "Educação transforma realidades!" */}
      <div className="cpe-footer-slogan">
        <span className="slogan-text">Educação transforma realidades!</span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      </div>
    </div>
  );
}
