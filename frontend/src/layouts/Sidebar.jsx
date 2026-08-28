import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Icon } from '../components/icons.jsx';

/** Menu lateral — itens filtrados por permissão (RBAC). */
export default function Sidebar() {
  const { user, can } = useAuth();

  const sections = [
    {
      label: 'Estatística',
      items: [
        { to: '/', label: 'Dashboard', icon: Icon.dashboard(), permission: 'dashboard:read', end: true },
        { to: '/programas', label: 'Programas', icon: Icon.program(), permission: 'programs:read' },
        { to: '/escolas', label: 'Escolas', icon: Icon.school(), permission: 'schools:read' },
        { to: '/avaliacoes', label: 'Avaliações', icon: Icon.check(), permission: 'rankings:read' },
        { to: '/resultados', label: 'Resultados', icon: Icon.result(), permission: 'results:read' },
        { to: '/rankings', label: 'Rankings', icon: Icon.trophy(), permission: 'rankings:read' },
        { to: '/relatorios', label: 'Relatórios', icon: Icon.report(), permission: 'reports:read' },
        { to: '/importacoes', label: 'Importação de dados', icon: Icon.upload(), permission: 'imports:read' },
      ],
    },
    {
      label: 'Gestão operacional',
      items: [
        { to: '/tecnicos-escola', label: 'Técnicos por Escola', icon: Icon.users(), permission: 'technicians:read' },
      ],
    },
    {
      label: 'Administração',
      items: [
        { to: '/usuarios', label: 'Usuários', icon: Icon.users(), permission: 'users:read' },
        { to: '/perfis', label: 'Perfis e Permissões', icon: Icon.shield(), permission: 'roles:read' },
        { to: '/auditoria', label: 'Auditoria', icon: Icon.audit(), permission: 'audit:read' },
      ],
    },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="logo">CPE</div>
        <div>
          <div className="title">CPE</div>
          <div className="subtitle">Programas Educacionais</div>
        </div>
      </div>

      {sections.map((section, i) => {
        const visible = section.items.filter((item) => !item.permission || can(item.permission));
        if (!visible.length) return null;
        return (
          <nav key={i} className="sidebar-section">
            {section.label && <div className="sidebar-section-label">{section.label}</div>}
            {visible.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <span className="icon">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        );
      })}

      <div className="sidebar-footer">
        PostgreSQL · Prisma · sessão segura
        <br />
        {user?.email}
      </div>
    </aside>
  );
}
