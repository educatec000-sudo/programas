import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import { notificationsApi } from '../services/resources.js';
import { Icon } from '../components/icons.jsx';
import { fmtDateTime } from '../utils/format.js';

export default function Topbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const wrapRef = useRef(null);

  const loadNotifications = async () => {
    try {
      const result = await notificationsApi.list();
      setNotifications(result.notifications || []);
      setUnread(result.unread || 0);
    } catch {
      /* silencioso */
    }
  };

  useEffect(() => {
    loadNotifications();
    const t = setInterval(loadNotifications, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setNotifOpen(false);
        setUserOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const markAll = async () => {
    await notificationsApi.markAllRead();
    loadNotifications();
  };

  const openNotification = async (n) => {
    if (!n.readAt) {
      await notificationsApi.markRead(n.id).catch(() => {});
      loadNotifications();
    }
    if (n.link) {
      navigate(n.link);
      setNotifOpen(false);
    }
  };

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/escolas?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const displayName = user?.name || 'Administrador CPE';
  const displayRole = user?.role?.name || 'Administrador';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'AC';

  return (
    <header className="topbar">
      {/* BARRA DE PESQUISA GLOBAL */}
      <div className="topbar-search-wrap">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchSubmit}
          placeholder="Buscar escolas, programas, turmas..."
          className="topbar-search-input"
        />
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-actions" ref={wrapRef}>
        {/* BOTÃO DE MODO ESCURO (DARK MODE TOGGLE) */}
        <button
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
          aria-label="Alternar modo escuro"
        >
          {isDark ? (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        {/* NOTIFICAÇÕES */}
        <div style={{ position: 'relative' }}>
          <button
            className="icon-btn"
            onClick={() => { setNotifOpen((v) => !v); setUserOpen(false); }}
            title="Notificações"
          >
            {Icon.bell()}
            {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
          </button>
          {notifOpen && (
            <div className="dropdown">
              <div className="dropdown-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Notificações</span>
                {unread > 0 && (
                  <a href="#" onClick={(e) => { e.preventDefault(); markAll(); }}>marcar todas como lidas</a>
                )}
              </div>
              <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                {notifications.length === 0 && (
                  <div style={{ padding: '22px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                    Sem notificações
                  </div>
                )}
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="dropdown-item"
                    onClick={() => openNotification(n)}
                    style={{ background: n.readAt ? undefined : 'var(--primary-50)', cursor: 'pointer' }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {n.type === 'SUCESSO' ? '✅' : n.type === 'ERRO' ? '⛔' : n.type === 'ALERTA' ? '⚠️' : 'ℹ️'} {n.title}
                      </div>
                      <div className="when" style={{ color: 'var(--text-2)' }}>{n.message}</div>
                      <div className="when">{fmtDateTime(n.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* USER PROFILE CHIP */}
        <div style={{ position: 'relative' }}>
          <button
            className="user-chip-custom"
            onClick={() => { setUserOpen((v) => !v); setNotifOpen(false); }}
          >
            <div className="avatar-emerald">{initials}</div>
            <div className="user-text-info">
              <div className="user-name">{displayName}</div>
              <div className="user-role">{displayRole}</div>
            </div>
            <span className="user-chevron">{Icon.chevronDown()}</span>
          </button>
          {userOpen && (
            <div className="dropdown">
              <div className="dropdown-header">
                <strong>{displayName}</strong>
                <div>{user?.email || 'admin@cpe.gov.br'}</div>
              </div>
              <div className="dropdown-item" onClick={() => { navigate('/perfil'); setUserOpen(false); }}>
                {Icon.user()} Meu perfil e sessões
              </div>
              <div className="dropdown-item" onClick={() => { navigate('/notificacoes'); setUserOpen(false); }}>
                {Icon.bell()} Todas as notificações
              </div>
              <div className="dropdown-footer">
                <button className="btn btn-secondary btn-sm btn-block" onClick={() => logout()}>
                  {Icon.logout()} Encerrar sessão
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
