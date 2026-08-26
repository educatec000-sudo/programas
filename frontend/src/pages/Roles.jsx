import React, { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { rolesApi } from '../services/resources.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { Button, Badge, LoadingBlock, Modal, Field, Input, Select } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

const RESOURCE_LABELS = {
  dashboard: 'Dashboard', schools: 'Escolas', programs: 'Programas', indicators: 'Indicadores',
  results: 'Resultados', goals: 'Metas', rankings: 'Rankings', evaluations: 'Avaliações',
  analytics: 'Análises', reports: 'Relatórios', imports: 'Importações', technicians: 'Técnicos por Escola',
  users: 'Usuários', roles: 'Perfis', audit: 'Auditoria', documents: 'Documentos',
};
const ACTION_LABELS = { read: 'Consultar', write: 'Editar', delete: 'Excluir', export: 'Exportar', import: 'Importar (legado)' };

export default function Roles() {
  const { can } = useAuth();
  const { success, error } = useToast();
  const { data: roles, loading, refresh } = useApi(() => rolesApi.list(), []);
  const { data: permissionGroups } = useApi(() => rolesApi.permissions(), []);

  const [editing, setEditing] = useState(null); // role | { isNew: true }
  const [form, setForm] = useState({ name: '', description: '', level: 10, canBeTechnician: false });
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);

  const openEdit = (role) => {
    setEditing(role);
    setForm({
      name: role.name,
      description: role.description || '',
      level: role.level,
      canBeTechnician: Boolean(role.canBeTechnician),
    });
    setSelected(new Set(role.permissions));
  };
  const openCreate = () => {
    setEditing({ isNew: true });
    setForm({ name: '', description: '', level: 10, canBeTechnician: false });
    setSelected(new Set());
  };

  const toggle = (key) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        level: Number(form.level),
        canBeTechnician: form.canBeTechnician,
        permissionKeys: [...selected],
      };
      if (editing.isNew) await rolesApi.create(payload);
      else await rolesApi.update(editing.id, payload);
      success('Perfil salvo com sucesso.');
      setEditing(null);
      refresh();
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingBlock />;

  const totalPermissions = permissionGroups
    ? Object.values(permissionGroups).reduce((acc, list) => acc + list.length, 0)
    : 0;

  return (
    <>
      <PageHeader
        title="Perfis e Permissões"
        subtitle="RBAC configurável — cada perfil recebe permissões granulares por recurso"
        actions={can('roles:write') && <Button onClick={openCreate}>+ Novo perfil</Button>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {(roles || []).map((role) => (
          <div key={role.id} className="card card-pad">
            <div className="card-header-row">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="stat-icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary-dark)', width: 38, height: 38 }}>
                  {Icon.shield()}
                </div>
                <div>
                  <div className="card-title">{role.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    Nível {role.level} · {role.usersCount} usuário(s)
                  </div>
                </div>
              </div>
              {role.level >= 100 && <Badge cls="badge-blue">Passe livre</Badge>}
            </div>
            <p style={{ color: 'var(--text-2)', fontSize: 12.5, minHeight: 34 }}>{role.description}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12, minHeight: 24 }}>
              {role.level >= 100 ? (
                <Badge cls="badge-green">Todas as permissões ({totalPermissions || role.permissions.length})</Badge>
              ) : (
                <>
                  {role.permissions.slice(0, 8).map((p) => (
                    <Badge key={p} cls="badge-gray">{p}</Badge>
                  ))}
                  {role.permissions.length > 8 && <Badge cls="badge-gray">+{role.permissions.length - 8}</Badge>}
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
              {role.canBeTechnician ? (
                <Badge cls="badge-cyan" title="Usuários deste perfil podem ser vinculados como técnicos de escolas">
                  👥 pode ser técnico
                </Badge>
              ) : (
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>não atua como técnico</span>
              )}
              {can('roles:write') && role.level < 100 && (
                <Button size="sm" variant="secondary" onClick={() => openEdit(role)}>Configurar</Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.isNew ? 'Novo perfil' : `Permissões — ${editing?.name}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>Cancelar</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'Salvando...' : 'Salvar perfil'}</Button>
          </>
        }
      >
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <Field label="Nome do perfil" required>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={!editing?.isNew} />
          </Field>
          <Field label="Nível" hint="Nível 100 = administrador (passe livre)">
            <Select value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))} disabled={!editing?.isNew}>
              <option value={10}>10 — básico</option>
              <option value={20}>20 — leitura ampliada</option>
              <option value={40}>40 — operacional</option>
              <option value={70}>70 — coordenação</option>
              <option value={100}>100 — administração</option>
            </Select>
          </Field>
        </div>
        <Field label="Descrição">
          <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>

        <label className="checkbox-row" style={{ margin: '4px 0 16px' }}>
          <input
            type="checkbox"
            checked={form.canBeTechnician}
            onChange={(e) => setForm((f) => ({ ...f, canBeTechnician: e.target.checked }))}
            style={{ width: 17, height: 17 }}
          />
          <div>
            <strong>Usuários deste perfil podem ser técnicos de escolas</strong>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
              Habilita a seleção destes usuários em Técnicos por Escola
            </div>
          </div>
        </label>

        <div className="card-title" style={{ marginTop: 8, marginBottom: 6 }}>
          Permissões ({selected.size} selecionada{selected.size === 1 ? '' : 's'})
        </div>
        {Object.entries(permissionGroups || {}).map(([resource, perms]) => (
          <div key={resource} className="permission-group">
            <h4>{RESOURCE_LABELS[resource] || resource}</h4>
            <div className="permission-items">
              {perms.map((p) => {
                const action = p.key.split(':')[1];
                return (
                  <label key={p.key} className="checkbox-row" title={p.description}>
                    <input
                      type="checkbox"
                      checked={selected.has(p.key)}
                      onChange={() => toggle(p.key)}
                      style={{ width: 16, height: 16 }}
                    />
                    {ACTION_LABELS[action] || action}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </Modal>
    </>
  );
}
