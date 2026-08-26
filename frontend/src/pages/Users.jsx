import React, { useState } from 'react';
import { useApi, useDebounce } from '../hooks/useApi.js';
import { usersApi, rolesApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Button, Field, Input, Select, Modal, Badge, ConfirmDialog, Alert } from '../components/ui.jsx';
import { fmtDateTime } from '../utils/format.js';

const emptyForm = { name: '', email: '', password: '', roleId: '', phone: '', active: true, mustChangePassword: false };

export default function Users() {
  const { user: currentUser } = useAuth();
  const { success, error } = useToast();

  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const [roleId, setRoleId] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading, refresh } = useApi(
    () => usersApi.list({ search: debounced, roleId, page, pageSize: 15 }),
    [debounced, roleId, page],
  );
  const { data: roles } = useApi(() => rolesApi.list(), []);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const openCreate = () => { setForm({ ...emptyForm, roleId: roles?.[0]?.id || '' }); setEditing(null); setFormError(null); setModalOpen(true); };
  const openEdit = (u) => {
    setForm({ name: u.name, email: u.email, password: '', roleId: u.role.id, phone: u.phone || '', active: u.active, mustChangePassword: u.mustChangePassword });
    setEditing(u.id);
    setFormError(null);
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        const payload = { name: form.name, email: form.email, roleId: form.roleId, phone: form.phone, active: form.active, mustChangePassword: form.mustChangePassword };
        await usersApi.update(editing, payload);
        success('Usuário atualizado.');
      } else {
        await usersApi.create(form);
        success('Usuário criado.');
      }
      setModalOpen(false);
      refresh();
    } catch (err) {
      setFormError(err.details?.map((d) => `${d.field}: ${d.message}`).join(' · ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await usersApi.remove(deleteTarget.id);
      success(`Usuário "${deleteTarget.name}" desativado e suas sessões encerradas.`);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async () => {
    setBusy(true);
    try {
      await usersApi.resetPassword(resetTarget.id, { newPassword, mustChangePassword: true });
      success('Senha redefinida. O usuário deverá trocá-la no próximo login.');
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      error(err.details?.map((d) => d.message).join(' · ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (u) => {
    try {
      await usersApi.unlock(u.id);
      success(`Usuário "${u.name}" desbloqueado.`);
      refresh();
    } catch (err) {
      error(err.message);
    }
  };

  const columns = [
    { key: 'name', label: 'Nome', render: (u) => (
      <div>
        <strong>{u.name}</strong> {u.id === currentUser.id && <Badge cls="badge-blue">você</Badge>}
        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{u.email}</div>
      </div>
    ) },
    { key: 'role', label: 'Perfil', render: (u) => <Badge cls="badge-gray">{u.role.name}</Badge> },
    { key: 'locked', label: 'Situação', render: (u) => {
      if (u.lockedUntil && new Date(u.lockedUntil) > new Date())
        return <Badge cls="badge-red">Bloqueado até {fmtDateTime(u.lockedUntil)}</Badge>;
      return u.active ? <Badge cls="badge-green">Ativo</Badge> : <Badge cls="badge-gray">Inativo</Badge>;
    } },
    { key: 'lastLoginAt', label: 'Último login', render: (u) => fmtDateTime(u.lastLoginAt) },
    { key: 'createdAt', label: 'Criado em', render: (u) => fmtDateTime(u.createdAt) },
    {
      key: 'actions', label: '', align: 'right',
      render: (u) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant="secondary" onClick={() => openEdit(u)}>Editar</Button>
          <Button size="sm" variant="ghost" title="Redefinir senha" onClick={() => setResetTarget(u)}>🔑</Button>
          {(u.lockedUntil && new Date(u.lockedUntil) > new Date()) && (
            <Button size="sm" variant="ghost" title="Desbloquear" onClick={() => unlock(u)}>🔓</Button>
          )}
          {u.id !== currentUser.id && u.active && (
            <Button size="sm" variant="ghost" title="Desativar" onClick={() => setDeleteTarget(u)}>🗑</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Usuários"
        subtitle="Controle de acesso com perfis, bloqueio automático e auditoria"
        actions={<Button onClick={openCreate}>+ Novo usuário</Button>}
      />

      <div className="filter-bar">
        <div className="field grow">
          <label>Buscar</label>
          <Input placeholder="Nome ou e-mail..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Field label="Perfil">
          <Select value={roleId} onChange={(e) => { setRoleId(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {(roles || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
      </div>

      <DataTable
        columns={columns}
        rows={data?.data || []}
        loading={loading}
        pagination={data?.pagination}
        onPageChange={setPage}
        emptyTitle="Nenhum usuário encontrado"
        emptyIcon="👤"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar usuário' : 'Novo usuário'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={submit} disabled={busy}>{busy ? 'Salvando...' : 'Salvar'}</Button>
          </>
        }
      >
        {formError && <Alert type="error">{formError}</Alert>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field label="Nome completo" required>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </Field>
            <Field label="E-mail" required>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
            </Field>
            <Field label="Perfil" required>
              <Select value={form.roleId} onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))} required>
                <option value="">Selecione...</option>
                {(roles || []).map((r) => <option key={r.id} value={r.id}>{r.name} (nível {r.level})</option>)}
              </Select>
            </Field>
            <Field label="Telefone">
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </Field>
            {!editing && (
              <Field label="Senha inicial" required hint="Mín. 8 caracteres com letras e números">
                <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
              </Field>
            )}
          </div>
          <label className="checkbox-row" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
            Usuário ativo
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.mustChangePassword} onChange={(e) => setForm((f) => ({ ...f, mustChangePassword: e.target.checked }))} />
            Obrigar troca de senha no próximo login
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Desativar usuário"
        message={`Desativar "${deleteTarget?.name}"? Todas as sessões serão encerradas imediatamente.`}
        danger
        confirmLabel="Desativar"
        busy={busy}
      />

      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Redefinir senha — ${resetTarget?.name}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>Cancelar</Button>
            <Button onClick={submitReset} disabled={busy || !newPassword}>Redefinir</Button>
          </>
        }
      >
        <Field label="Nova senha" required hint="O usuário será obrigado a trocá-la no próximo login">
          <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="mín. 8 caracteres, letras e números" />
        </Field>
      </Modal>
    </>
  );
}
