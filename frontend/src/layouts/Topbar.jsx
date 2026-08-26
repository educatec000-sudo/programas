import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { notificationsApi } from '../services/resources.js';
import { Icon } from '../components/icons.jsx';
import { fmtDateTime } from '../utils/format.js';

export default function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef(null);

  const loadNotifications = async () => {
    try {
      const result = await notificationsApi.list();
      setNotifications(result.notifications);
      setUnread(result.unread);
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

  const initials = (user?.name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="topbar">
      <div className="crumb">CPE — Controle de Programas Educacionais</div>
      <div className="topbar-spacer" />
      <div className="topbar-actions" ref={wrapRef}>
        <div style={{ position: 'relative' }}>
          <button className="icon-btn" onClick={() => { setNotifOpen((v) => !v); setUserOpen(false); }} title="Notificações">
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

        <div style={{ position: 'relative' }}>
          <button
            className="user-chip"
            style={{ border: 'none', background: 'transparent', padding: '4px 6px' }}
            onClick={() => { setUserOpen((v) => !v); setNotifOpen(false); }}
          >
            <div className="avatar">{initials}</div>
            <div className="info" style={{ textAlign: 'left' }}>
              <div className="name">{user?.name?.split(' ')[0]}</div>
              <div className="role">{user?.role?.name}</div>
            </div>
          </button>
          {userOpen && (
            <div className="dropdown">
              <div className="dropdown-header">
                <strong>{user?.name}</strong>
                <div>{user?.email}</div>
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
