import React from 'react';

/**
 * Cabeçalho Hero Padrão Oficial dos Programas Educacionais (CPE)
 * Padroniza a estética Hero para todos os programas (Pacto, CNCA, PARC, SisPAE e futuros).
 */
export default function ProgramHeader({
  program = {},
  onCycleChange,
  onAddCycle,
  onDeleteProgram,
  can,
}) {
  const catalogCode = (program?.catalog?.code || program?.code || '').toUpperCase();
  const programName = program?.catalog?.name || program?.name || 'Programa Educacional';

  let title = programName;
  let subtitle = program?.catalog?.description || program?.description;
  let badge = 'CPE - Controle de Programas Educacionais';

  if (catalogCode.includes('PACTO')) {
    title = 'Pacto pela Alfabetização';
    subtitle = subtitle || 'Alfabetização na idade certa, um compromisso de todos.';
    badge = 'Pacto pela Alfabetização';
  } else if (catalogCode.includes('CNCA')) {
    title = 'CNCA – Compromisso Nacional Criança Alfabetizada';
    subtitle = subtitle || 'Acompanhamento dos resultados de alfabetização da rede municipal.';
    badge = 'CNCA - Avaliação Censitária';
  } else if (catalogCode.includes('PARC')) {
    title = 'PARC – Avaliação de Fluência Leitora';
    subtitle = subtitle || 'Avaliação da Fluência Leitora e proficiência dos estudantes da rede.';
    badge = 'PARC - Regime de Colaboração';
  } else if (catalogCode.includes('SISPAE')) {
    title = 'SisPAE – Sistema Paraense de Avaliação Educacional';
    subtitle = subtitle || 'Acompanhamento do desempenho, habilidades e proficiência da rede escolar.';
    badge = 'SisPAE - Avaliação Oficial & Simulados';
  } else {
    title = programName;
    subtitle = subtitle || `${program?.organ ? `${program.organ} · ` : ''}Acompanhamento e gestão dos resultados educacionais.`;
    badge = program?.organ || 'CPE - Programa Educacional';
  }

  const cycles = (program?.cycles && program.cycles.length > 0)
    ? program.cycles
    : [{ id: program?.id, year: program?.year || new Date().getFullYear() }];

  const currentCycleId = program?.id;

  return (
    <div className="cpe-hero-banner program-hero-banner">
      <div className="cpe-hero-content">
        <div className="cpe-hero-badge">
          <span className="cpe-badge-icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
          <span>{badge}</span>
        </div>
        <h1 className="cpe-hero-title">{title}</h1>
        {subtitle && <p className="cpe-hero-subtitle">{subtitle}</p>}
      </div>

      <div className="cpe-hero-controls">
        <div className="cpe-hero-select-box">
          <label className="cpe-hero-label">Ano Letivo / Ciclo</label>
          <select
            value={currentCycleId}
            onChange={(e) => onCycleChange && onCycleChange(e.target.value)}
            className="cpe-hero-select"
          >
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.year}{cycle.periodLabel && cycle.periodLabel !== 'Anual' ? ` (${cycle.periodLabel})` : ''}
              </option>
            ))}
          </select>
        </div>

        {can && (can('programs:write') || can('programs:delete')) && (
          <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
            {can('programs:write') && onAddCycle && (
              <button
                type="button"
                onClick={onAddCycle}
                title="Adicionar novo ciclo anual ao programa"
                className="btn btn-sm"
                style={{
                  height: 38,
                  padding: '0 12px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                + Ciclo
              </button>
            )}
            {can('programs:delete') && onDeleteProgram && (
              <button
                type="button"
                onClick={onDeleteProgram}
                title="Opções avançadas / Excluir programa"
                className="btn btn-sm"
                style={{
                  height: 38,
                  padding: '0 10px',
                  fontSize: 13,
                  color: '#cbd5e1',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                ⚙️
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
