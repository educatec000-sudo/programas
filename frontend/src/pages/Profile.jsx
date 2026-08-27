import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { authApi } from '../services/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import { Button, Field, Input, Badge, Alert, ConfirmDialog } from '../components/ui.jsx';
import { fmtDateTime } from '../utils/format.js';

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const { success, error } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [pwError, setPwError] = useState(null);

  const { data: sessions, refresh: refreshSessions } = (function useSessionsHook() {
    const [sessions, setSessions] = React.useState(null);
    React.useEffect(() => {
      authApi.sessions().then(setSessions).catch(() => setSessions([]));
    }, []);
    return {
      data: sessions,
      refresh: () => authApi.sessions().then(setSessions).catch(() => {}),
    };
  })();

  const [revokeTarget, setRevokeTarget] = useState(null);

  const changePassword = async (e) => {
    e.preventDefault();
    setPwError(null);
    if (newPassword !== confirm) { setPwError('As senhas não coincidem'); return; }
    setBusy(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      await refreshUser();
      success('Senha alterada. Outras sessões foram encerradas.');
      setCurrentPassword(''); setNewPassword(''); setConfirm('');
      refreshSessions();
    } catch (err) {
      setPwError(err.details?.[0]?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  const doRevoke = async () => {
    setBusy(true);
    try {
      await authApi.revokeSession(revokeTarget.id);
      success('Sessão encerrada.');
      setRevokeTarget(null);
      refreshSessions();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Meu perfil" subtitle="Dados da conta, troca de senha e sessões ativas" />

      {user?.mustChangePassword && (
        <Alert type="warn">Por segurança, altere a senha temporária antes de acessar o restante do sistema.</Alert>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16, alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="card-title">Dados da conta</div>
          <dl className="kv-list" style={{ marginTop: 10 }}>
            <dt>Nome</dt><dd>{user?.name}</dd>
            <dt>E-mail</dt><dd>{user?.email}</dd>
            <dt>Perfil</dt><dd><Badge cls="badge-blue">{user?.role?.name}</Badge></dd>
            <dt>Nível de acesso</dt><dd>{user?.role?.level >= 100 ? 'Administrador (passe livre)' : user?.role?.level}</dd>
            <dt>Permissões</dt>
            <dd>
              {user?.role?.level >= 100
                ? 'Todas'
                : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {user?.role?.permissions?.slice(0, 12).map((p) => <Badge key={p} cls="badge-gray">{p}</Badge>)}
                    {user?.role?.permissions?.length > 12 && <Badge cls="badge-gray">+{user.role.permissions.length - 12}</Badge>}
                  </div>
                )}
            </dd>
            <dt>Último login</dt><dd>{fmtDateTime(user?.lastLoginAt)}</dd>
          </dl>
          <Button variant="danger" onClick={logout} style={{ marginTop: 16 }}>Encerrar sessão atual</Button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card card-pad">
            <div className="card-title">Alterar senha</div>
            <div className="card-subtitle">Ao alterar, todas as outras sessões serão encerradas</div>
            {pwError && <Alert type="error">{pwError}</Alert>}
            <form onSubmit={changePassword}>
              <Field label="Senha atual" required>
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              </Field>
              <div className="form-grid">
                <Field label="Nova senha" required hint="Mín. 8 caracteres, letras e números">
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                </Field>
                <Field label="Confirmar" required>
                  <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                </Field>
              </div>
              <Button type="submit" disabled={busy}>{busy ? 'Alterando...' : 'Alterar senha'}</Button>
            </form>
          </div>

          <div className="card card-pad">
            <div className="card-title">Sessões ativas</div>
            <div className="card-subtitle">Dispositivos conectados à sua conta</div>
            {!sessions ? (
              <div className="centered" style={{ minHeight: 80 }}>Carregando...</div>
            ) : (
              <ul className="timeline">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <strong style={{ fontSize: 12.5 }}>{describeUA(s.userAgent)}</strong>
                        {s.current && <Badge cls="badge-green">esta sessão</Badge>}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                        IP {s.ip || '—'} · iniciada {fmtDateTime(s.createdAt)} · última atividade {fmtDateTime(s.lastUsedAt)}
                      </div>
                    </div>
                    {!s.current && (
                      <Button size="sm" variant="ghost" onClick={() => setRevokeTarget(s)} title="Encerrar sessão">⛔</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={doRevoke}
        title="Encerrar sessão"
        message="Encerrar esta sessão? O dispositivo precisará autenticar novamente."
        danger
        confirmLabel="Encerrar"
        busy={busy}
      />
    </>
  );
}

function describeUA(ua) {
  if (!ua) return 'Dispositivo desconhecido';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Microsoft Edge';
  if (ua.includes('Chrome')) return 'Google Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return ua.slice(0, 40);
}
