import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Icon } from '../components/icons.jsx';
import { programsApi } from '../services/resources.js';

export default function Sidebar() {
  const { user, can } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [programsOpen, setProgramsOpen] = useState(true);
  const [programsList, setProgramsList] = useState([]);

  useEffect(() => {
    programsApi
      .list()
      .then((res) => setProgramsList(res.data || []))
      .catch(() => {});
  }, []);

  // Procura os IDs dos programas Pacto, PARC e CNCA
  const pactoProg = programsList.find(
    (p) =>
      p.catalog?.code === 'PACTO-ALFABETIZACAO' ||
      p.code?.startsWith('PACTO') ||
      p.name?.toLowerCase().includes('pacto'),
  );
  const parcProg = programsList.find(
    (p) =>
      p.catalog?.code === 'PARC' ||
      p.code?.startsWith('PARC') ||
      p.name?.toLowerCase().includes('parc'),
  );
  const cncaProg = programsList.find(
    (p) =>
      p.catalog?.code === 'CNCA' ||
      p.code?.startsWith('CNCA') ||
      p.name?.toLowerCase().includes('cnca') ||
      p.name?.toLowerCase().includes('criança alfabetizada'),
  );

  const pactoUrl = pactoProg ? `/programas/${pactoProg.id}` : '/programas';
  const parcUrl = parcProg ? `/programas/${parcProg.id}` : '/programas';
  const cncaUrl = cncaProg ? `/programas/${cncaProg.id}` : '/programas';

  const isProgramActive = (targetId, fallbackMatch) => {
    if (targetId && location.pathname.includes(targetId)) return true;
    if (fallbackMatch && location.pathname.includes(fallbackMatch)) return true;
    return false;
  };

  const isAnyProgramPage =
    location.pathname.startsWith('/programas') ||
    isProgramActive(pactoProg?.id, 'pacto') ||
    isProgramActive(parcProg?.id, 'parc') ||
    isProgramActive(cncaProg?.id, 'cnca');

  return (
    <aside className="sidebar">
      {/* BRAND HEADER */}
      <div className="sidebar-brand">
        <div className="logo-icon-wrap">
          {Icon.cpeLogo()}
        </div>
        <div className="brand-text">
          <div className="title">CPE</div>
          <div className="subtitle">Controle de Programas Educacionais</div>
        </div>
      </div>

      {/* MAIN NAVIGATION */}
      <div className="sidebar-scrollable">
        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
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

          {/* PROGRAMAS COM SUBMENU RETRÁTIL */}
          <div className="nav-group">
            <div
              className={`nav-link nav-group-header ${isAnyProgramPage ? 'parent-active' : ''}`}
              onClick={() => setProgramsOpen((prev) => !prev)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <span className="icon">{Icon.shield()}</span>
              <span>Programas</span>
              <span className="nav-chevron">
                {programsOpen ? Icon.chevronUp() : Icon.chevronDown()}
              </span>
            </div>

            {programsOpen && (
              <div className="nav-submenu">
                <NavLink
                  to={pactoUrl}
                  className={() =>
                    `nav-sub-item ${
                      isProgramActive(pactoProg?.id, 'pacto') ? 'active-sub' : ''
                    }`
                  }
                >
                  Pacto pela Alfabetização
                </NavLink>

                <NavLink
                  to={parcUrl}
                  className={() =>
                    `nav-sub-item ${
                      isProgramActive(parcProg?.id, 'parc') ? 'active-sub' : ''
                    }`
                  }
                >
                  PARC
                </NavLink>

                <NavLink
                  to={cncaUrl}
                  className={() =>
                    `nav-sub-item ${
                      isProgramActive(cncaProg?.id, 'cnca') ? 'active-sub' : ''
                    }`
                  }
                >
                  CNCA
                </NavLink>
              </div>
            )}
          </div>

          <NavLink
            to="/programas"
            className={({ isActive }) =>
              `nav-link ${isActive && !location.pathname.includes('/programas/') ? 'active' : ''}`
            }
          >
            <span className="icon">{Icon.indicator()}</span>
            <span>Indicadores</span>
          </NavLink>

          <NavLink
            to="/resultados"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">{Icon.result()}</span>
            <span>Resultados</span>
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
            <span>Análises</span>
          </NavLink>

          <NavLink
            to="/rankings"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">{Icon.chart()}</span>
            <span>Gráficos</span>
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

      {/* BOTTOM SECTION */}
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
    </aside>
  );
}

