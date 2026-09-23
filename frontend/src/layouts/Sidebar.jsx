import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Icon } from '../components/icons.jsx';

export default function Sidebar() {
  const { user, can } = useAuth();
  const location = useLocation();

  const isProgramActive = location.pathname.startsWith('/programas');

  return (
    <aside className="sidebar">
      {/* BRAND HEADER COM LOGO E ESCUDO CPE */}
      <div className="sidebar-brand">
        <div className="logo-icon-wrap">
          {Icon.cpeLogo ? Icon.cpeLogo() : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          )}
        </div>
        <div className="brand-text">
          <div className="title">CPE</div>
          <div className="subtitle">Controle de Programas Educacionais</div>
        </div>
      </div>

      {/* NAVEGAÇÃO PRINCIPAL */}
      <div className="sidebar-scrollable">
        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-link nav-link-home ${isActive ? 'active' : ''}`}
          >
            <span className="icon">{Icon.home()}</span>
            <span>Início</span>
          </NavLink>

          <NavLink
            to="/escolas"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">{Icon.school()}</span>
            <span>Escolas</span>
          </NavLink>

          {/* ITEM DE PROGRAMAS */}
          <NavLink
            to="/programas"
            className={() => `nav-link ${isProgramActive ? 'active' : ''}`}
          >
            <span className="icon">{Icon.shield()}</span>
            <span>Programas</span>
          </NavLink>

          <NavLink
            to="/prospeccao-matriculas"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">{Icon.book()}</span>
            <span>Prospecção 2027</span>
          </NavLink>

          <NavLink
            to="/tecnicos-escola"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">{Icon.users()}</span>
            <span>Técnicos por Escola</span>
          </NavLink>

          <NavLink
            to="/analises"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">{Icon.analytics()}</span>
            <span>Análises & Gráficos</span>
          </NavLink>

          <NavLink
            to="/rankings"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">{Icon.chart()}</span>
            <span>Rankings</span>
          </NavLink>

          <NavLink
            to="/relatorios"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">{Icon.report()}</span>
            <span>Relatórios</span>
          </NavLink>

          <NavLink
            to="/importacoes"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">{Icon.upload()}</span>
            <span>Importações</span>
          </NavLink>
        </nav>
      </div>

      {/* SEÇÃO INFERIOR */}
      <div className="sidebar-bottom">
        <NavLink
          to="/usuarios"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <span className="icon">{Icon.user()}</span>
          <span>Usuários</span>
        </NavLink>

        <NavLink
          to="/perfis"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <span className="icon">{Icon.settings()}</span>
          <span>Configurações</span>
        </NavLink>
      </div>

      {/* DECORAÇÃO DE ONDAS NO RODAPÉ DA SIDEBAR */}
      <div className="sidebar-wave-decoration">
        <svg viewBox="0 0 260 40" fill="none" preserveAspectRatio="none">
          <path
            d="M0 25 C70 40 180 0 260 20 L260 40 L0 40 Z"
            fill="#f59e0b"
            opacity="0.3"
          />
          <path
            d="M0 30 C90 10 170 38 260 22 L260 40 L0 40 Z"
            fill="#2563eb"
            opacity="0.5"
          />
        </svg>
      </div>
    </aside>
  );
}
