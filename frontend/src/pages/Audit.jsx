import React, { useState } from 'react';
import { useApi, useDebounce } from '../hooks/useApi.js';
import { auditApi } from '../services/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { Field, Input, Select, Badge, Tabs } from '../components/ui.jsx';
import { ComparisonBarChart } from '../components/charts.jsx';
import { fmtDateTime, AUDIT_ACTION_LABELS, ENTITY_LABELS } from '../utils/format.js';

export default function Audit() {
  const [tab, setTab] = useState('registros');
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading } = useApi(
    () => auditApi.list({ search: debounced, action, entity, dateFrom, dateTo, page, pageSize: 20 }),
    [debounced, action, entity, dateFrom, dateTo, page],
  );
  const { data: stats } = useApi(() => auditApi.stats(), []);

  const columns = [
    { key: 'createdAt', label: 'Data/Hora', render: (l) => fmtDateTime(l.createdAt) },
    { key: 'action', label: 'Ação', render: (l) => <Badge cls={badgeFor(l.action)}>{AUDIT_ACTION_LABELS[l.action] || l.action}</Badge> },
    { key: 'entity', label: 'Entidade', render: (l) => ENTITY_LABELS[l.entity] || l.entity },
    { key: 'user', label: 'Usuário', render: (l) => l.userName || l.user?.name || 'sistema' },
    { key: 'ip', label: 'IP', render: (l) => <span className="mono" style={{ fontSize: 11.5 }}>{l.ip || '—'}</span> },
    {
      key: 'metadata', label: 'Detalhes',
      render: (l) => {
        if (!l.metadata) return '—';
        const str = typeof l.metadata === 'string' ? l.metadata : JSON.stringify(l.metadata);
        return (
          <span title={str} style={{ fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>
            {str.length > 90 ? `${str.slice(0, 90)}…` : str}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Auditoria"
        subtitle="Registro completo de logins, alterações, importações, exportações e relatórios"
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[{ key: 'registros', label: 'Registros' }, { key: 'estatisticas', label: 'Estatísticas' }]}
      />

      {tab === 'registros' && (
        <>
          <div className="filter-bar">
            <div className="field grow">
              <label>Buscar</label>
              <Input placeholder="Usuário, entidade, IP..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Field label="Ação">
              <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
                <option value="">Todas</option>
                {Object.entries(AUDIT_ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Entidade">
              <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
                <option value="">Todas</option>
                {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="De">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </Field>
            <Field label="Até">
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </Field>
          </div>

          <DataTable
            columns={columns}
            rows={data?.data || []}
            loading={loading}
            pagination={data?.pagination}
            onPageChange={setPage}
            emptyTitle="Nenhum registro de auditoria"
            emptyIcon="🗂"
          />
        </>
      )}

      {tab === 'estatisticas' && (
        <div className="chart-grid">
          <ComparisonBarChart
            title="Ações mais registradas"
            subtitle="Top 20 por volume"
            data={(stats?.byAction || []).map((a) => ({ name: AUDIT_ACTION_LABELS[a.action] || a.action, score: a.count }))}
            domain={[0, 'dataMax + 1']}
          />
          <ComparisonBarChart
            title="Entidades mais auditadas"
            subtitle="Top 20 por volume"
            data={(stats?.byEntity || []).map((e) => ({ name: ENTITY_LABELS[e.entity] || e.entity, score: e.count }))}
            domain={[0, 'dataMax + 1']}
          />
        </div>
      )}
    </>
  );
}

function badgeFor(action) {
  if (action === 'LOGIN' || action === 'LOGOUT') return 'badge-blue';
  if (action === 'CREATE') return 'badge-green';
  if (action === 'UPDATE') return 'badge-yellow';
  if (action === 'DELETE') return 'badge-red';
  if (action.startsWith('IMPORT')) return 'badge-cyan';
  return 'badge-gray';
}
