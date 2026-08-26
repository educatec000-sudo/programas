import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { notificationsApi } from '../services/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import { Button, LoadingBlock, Badge, EmptyState } from '../components/ui.jsx';
import { fmtDateTime } from '../utils/format.js';

const TYPE_ICON = { SUCESSO: '✅', ERRO: '⛔', ALERTA: '⚠️', INFO: 'ℹ️' };
const TYPE_BADGE = { SUCESSO: 'badge-green', ERRO: 'badge-red', ALERTA: 'badge-yellow', INFO: 'badge-blue' };

export default function Notifications() {
  const navigate = useNavigate();
  const { data, loading, refresh } = useApi(() => notificationsApi.list({}), []);

  const markAll = async () => {
    await notificationsApi.markAllRead();
    refresh();
  };

  const open = async (n) => {
    if (!n.readAt) {
      await notificationsApi.markRead(n.id).catch(() => {});
      refresh();
    }
    if (n.link) navigate(n.link);
  };

  if (loading) return <LoadingBlock />;

  return (
    <>
      <PageHeader
        title="Notificações"
        subtitle={`${data?.unread || 0} não lida(s) de ${(data?.notifications || []).length}`}
        actions={data?.unread > 0 && <Button variant="secondary" onClick={markAll}>Marcar todas como lidas</Button>}
      />

      <div className="card">
        {(data?.notifications || []).length === 0 ? (
          <EmptyState icon="🔔" title="Você não tem notificações" />
        ) : (
          (data.notifications).map((n) => (
            <div
              key={n.id}
              className="dropdown-item"
              style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: n.readAt ? undefined : 'var(--primary-50)' }}
              onClick={() => open(n)}
            >
              <div style={{ fontSize: 18 }}>{TYPE_ICON[n.type] || 'ℹ️'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ fontSize: 13.5 }}>{n.title}</strong>
                  {!n.readAt && <Badge cls={TYPE_BADGE[n.type]}>nova</Badge>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{n.message}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                  {fmtDateTime(n.createdAt)} {n.link && <span style={{ color: 'var(--primary)' }}>· abrir →</span>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
