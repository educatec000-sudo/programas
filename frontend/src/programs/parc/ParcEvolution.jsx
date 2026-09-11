import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { parcApi } from '../../services/resources.js';
import { Badge, Field, LoadingBlock, Select } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

export default function ParcEvolution({ program }) {
  const [zone, setZone] = useState('TODAS');
  const [year, setYear] = useState('');
  const [search, setSearch] = useState('');

  const { data: filtersData } = useApi(() => parcApi.filters(program.id), [program.id]);

  const queryParams = useMemo(() => ({
    cycle: 'EVOLUCAO',
    indicator: 'DELTA_FLUENTE',
    zone: zone === 'TODAS' ? undefined : zone,
    year: year || program.year,
  }), [zone, year, program.year]);

  const { data: rankingData, loading } = useApi(
    () => parcApi.ranking(program.id, queryParams),
    [program.id, queryParams],
  );

  const evolutionList = rankingData?.ranking || [];

  const filteredList = useMemo(() => {
    if (!search.trim()) return evolutionList;
    const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return evolutionList.filter((r) => {
      const name = (r.name || r.school?.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const inep = String(r.inep || r.school?.inep || '');
      const zoneStr = (r.zone || r.school?.zone || '').toLowerCase();
      return name.includes(q) || inep.includes(q) || zoneStr.includes(q);
    });
  }, [evolutionList, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Barra de Filtros */}
      <div className="card card-pad filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', background: '#f8fafc' }}>
        <Field label="Localização / Zona" style={{ minWidth: 160 }}>
          <Select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="TODAS">Todas as zonas</option>
            {(filtersData?.zones || ['URBANA', 'RURAL']).map((z) => (
              <option key={z} value={z}>
                {z === 'SEDE' ? '🏙️ Sede' : z === 'RURAL' ? '🌳 Rural' : z === 'URBANA' ? '🏙️ Urbana' : z === 'ILHAS' ? '⛵ Ilhas' : z === 'ESTRADAS' ? '🛣️ Estradas' : z}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Ano">
          <Select value={year || program.year} onChange={(e) => setYear(e.target.value)}>
            {(filtersData?.years || [program.year]).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </Field>

        <div style={{ flex: 1, minWidth: 240 }}>
          <Field label="Buscar Escola ou INEP">
            <input
              type="text"
              className="input"
              placeholder="🔎 Buscar escola ou código INEP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* Alerta explicativo */}
      <div className="alert alert-info" style={{ margin: 0 }}>
        <strong>Painel de Evolução (Entrada × Saída):</strong> Apresenta a progressão da aprendizagem leitora comparando os resultados do início e do encerramento do ano letivo de 2026.
      </div>

      {/* Tabela de Evolução */}
      <div className="card card-pad">
        <div className="card-header-row" style={{ marginBottom: 14 }}>
          <div>
            <div className="card-title">Matriz de Evolução por Escola ({filteredList.length})</div>
            <div className="card-subtitle">
              Ganhos percentuais e redução de déficit leitor ao longo do ciclo escolar.
            </div>
          </div>
        </div>

        {loading && !rankingData ? (
          <LoadingBlock label="Calculando evolução da rede..." />
        ) : (
          <DataTable
            columns={[
              {
                key: 'position',
                label: 'Posição',
                align: 'center',
                render: (s) => (
                  <span style={{ fontWeight: 700, fontSize: 13 }}>
                    {s.position === 1 ? '🥇 1º' : s.position === 2 ? '🥈 2º' : s.position === 3 ? '🥉 3º' : `${s.position}º`}
                  </span>
                ),
              },
              { key: 'inep', label: 'INEP', render: (s) => <span className="mono">{s.inep || s.school?.inep || '—'}</span> },
              {
                key: 'name',
                label: 'Escola',
                render: (s) => (
                  <div>
                    <strong>{s.name || s.school?.name || '—'}</strong>
                    {s.district || s.school?.district ? (
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{s.district || s.school?.district}</div>
                    ) : null}
                  </div>
                ),
              },
              {
                key: 'zone',
                label: 'Zona',
                render: (s) => {
                  const z = s.zone || s.school?.zone;
                  if (!z) return '—';
                  return (
                    <Badge cls={z === 'SEDE' || z === 'URBANA' ? 'badge-blue' : z === 'ILHAS' ? 'badge-cyan' : 'badge-green'}>
                      {z}
                    </Badge>
                  );
                },
              },
              {
                key: 'fluentComparison',
                label: '🗣️ Leitores Fluentes (Entrada ➔ Saída)',
                align: 'center',
                render: (s) => (
                  <div>
                    <span>{fmt(s.entradaFluent, 1)}% ➔ <strong>{fmt(s.saidaFluent, 1)}%</strong></span>
                  </div>
                ),
              },
              {
                key: 'deltaFluent',
                label: '🚀 Ganho em Fluentes',
                align: 'right',
                render: (s) => (
                  <strong style={{ color: (s.deltaFluent || 0) >= 0 ? '#10b981' : '#ef4444', fontSize: 14 }}>
                    {(s.deltaFluent || 0) >= 0 ? '+' : ''}{fmt(s.deltaFluent, 1)} p.p.
                  </strong>
                ),
              },
              {
                key: 'preReaderComparison',
                label: '📉 Pré-leitores (Entrada ➔ Saída)',
                align: 'center',
                render: (s) => (
                  <div>
                    <span>{fmt(s.entradaPreReader, 1)}% ➔ <strong>{fmt(s.saidaPreReader, 1)}%</strong></span>
                  </div>
                ),
              },
              {
                key: 'deltaPreReaderReduction',
                label: '🎯 Redução de Pré-leitores',
                align: 'right',
                render: (s) => (
                  <strong style={{ color: (s.deltaPreReaderReduction || 0) >= 0 ? '#10b981' : '#ef4444', fontSize: 14 }}>
                    {(s.deltaPreReaderReduction || 0) >= 0 ? '-' : '+'}{fmt(Math.abs(s.deltaPreReaderReduction || 0), 1)} p.p.
                  </strong>
                ),
              },
              {
                key: 'status',
                label: 'Diagnóstico',
                align: 'center',
                render: (s) => {
                  if ((s.deltaFluent || 0) >= 20 || (s.deltaPreReaderReduction || 0) >= 25) {
                    return <Badge cls="badge-green">🚀 Avanço Alto</Badge>;
                  }
                  if ((s.deltaFluent || 0) > 0 || (s.deltaPreReaderReduction || 0) > 0) {
                    return <Badge cls="badge-blue">📈 Evolução</Badge>;
                  }
                  return <Badge cls="badge-yellow">⚠️ Estável / Alerta</Badge>;
                },
              },
            ]}
            rows={filteredList}
            emptyTitle="Nenhum dado comparativo disponível"
            emptyHint="Para visualizar a evolução, certifique-se de que foram importados dados tanto do Ciclo de Entrada quanto do Ciclo de Saída."
            emptyIcon="🚀"
          />
        )}
      </div>
    </div>
  );
}
