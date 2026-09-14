import React from 'react';

/**
 * Cabeçalho Hero Padrão do CPE — Aplicado a todas as páginas do sistema.
 * Segue rigorosamente a identidade visual e estética do Dashboard Principal.
 */
export default function PageHeader({
  title,
  subtitle,
  actions,
  badge = 'CPE - Controle de Programas Educacionais',
  badgeIcon,
}) {
  return (
    <div className="cpe-hero-banner page-hero-banner">
      <div className="cpe-hero-content">
        <div className="cpe-hero-badge">
          <span className="cpe-badge-icon">
            {badgeIcon || (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            )}
          </span>
          <span>{badge}</span>
        </div>
        <h1 className="cpe-hero-title">{title}</h1>
        {subtitle && <p className="cpe-hero-subtitle">{subtitle}</p>}
      </div>

      {actions && (
        <div className="cpe-hero-controls page-hero-actions">
          {actions}
        </div>
      )}
    </div>
  );
}
