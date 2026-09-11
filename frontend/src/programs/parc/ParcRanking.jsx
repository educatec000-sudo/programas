import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { parcApi } from '../../services/resources.js';
import { Badge, Field, LoadingBlock, Select } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

export default function ParcRanking({ program }) {
  const [selectedCycle, setSelectedCycle] = useState('ENTRADA');
  const [selectedIndicator, setSelectedIndicator] = useState('FLUENTE');
  const [zone, setZone] = useState('TODAS');
  const [year, setYear] = useState('');
  const [search, setSearch] = useState('');

  const { data: filtersData } = useApi(() => parcApi.filters(program.id), [program.id]);

  const isEvolution = selectedCycle === 'EVOLUCAO';

  const availableIndicators = useMemo(() => {
    if (isEvolution) {
      return [
        { id: 'DELTA_FLUENTE', label: '🚀 Ganho em Leitores Fluentes (Saída - Entrada)', unit: 'p.p.' },
        { id: 'DELTA_REDUCAO_PRE_LEITOR', label: '🎯 Redução de Pré-leitores (Entrada - Saída)', unit: 'p.p.' },
        { id: 'DELTA_INICIANTE_FLUENTE', label: '📈 Ganho de Leitores (Iniciante + Fluente)', unit: 'p.p.' },
      ];
    }
    return [
      { id: 'FLUENTE', label: '🗣️ % Leitor Fluente', unit: '%' },
      { id: 'INICIANTE_MAIS_FLUENTE', label: '📖 % Leitor Iniciante + Fluente', unit: '%' },
      { id: 'MENOR_PRE_LEITOR', label: '📉 Menor % Pré-leitor (Total)', unit: '%' },
      { id: 'PARTICIPACAO', label: '👥 Taxa de Participação', unit: '%' },
    ];
  }, [isEvolution]);

  // Se o indicador atual não for válido para a seleção de ciclo, ajusta para o primeiro
  const effectiveIndicator = useMemo(() => {
    const found = availableIndicators.find((i) => i.id === selectedIndicator);
    return found ? selectedIndicator : availableIndicators[0].id;
  }, [availableIndicators, selectedIndicator]);

  const queryParams = useMemo(() => ({
    cycle: selectedCycle,
    indicator: effectiveIndicator,
    zone: zone === 'TODAS' ? undefined : zone,
    year: year || program.year,
  }), [selectedCycle, effectiveIndicator, zone, year, program.year]);

  const { data: rankingData, loading } = useApi(
    () => parcApi.ranking(program.id, queryParams),
    [program.id, queryParams],
  );

  const rankingList = rankingData?.ranking || [];
  const podium = rankingData?.podium || rankingList.slice(0, 3);
  const currentIndicator = rankingData?.indicator || availableIndicators.find((i) => i.id === effectiveIndicator) || availableIndicators[0];

  const filteredRanking = useMemo(() => {
    if (!search.trim()) return rankingList;
    const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return rankingList.filter((r) => {
      const name = (r.name || r.school?.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const inep = String(r.inep || r.school?.inep || '');
      const zoneStr = (r.zone || r.school?.zone || '').toLowerCase();
      return name.includes(q) || inep.includes(q) || zoneStr.includes(q);
    });
  }, [rankingList, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Barra de Filtros e Indicadores do Ranking */}
      <div className="card card-pad filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', background: '#f8fafc' }}>
        <Field label="Ciclo / Modo de Classificação" style={{ minWidth: 220 }}>
          <Select
            value={selectedCycle}
            onChange={(e) => {
              setSelectedCycle(e.target.value);
              setSelectedIndicator(e.target.value === 'EVOLUCAO' ? 'DELTA_FLUENTE' : 'FLUENTE');
            }}
            style={{ fontWeight: 600, color: 'var(--primary)', borderColor: 'var(--primary)' }}
          >
            <option value="ENTRADA">📥 Ciclo de Entrada (Diagnóstica)</option>
            <option value="SAIDA">📤 Ciclo de Saída (Final)</option>
            <option value="EVOLUCAO">🚀 Ranking de Evolução (Entrada × Saída)</option>
          </Select>
        </Field>

        <Field label="Indicador de Classificação" style={{ minWidth: 320 }}>
          <Select
            value={effectiveIndicator}
            onChange={(e) => setSelectedIndicator(e.target.value)}
            style={{ fontWeight: 600 }}
          >
            {availableIndicators.map((ind) => (
              <option key={ind.id} value={ind.id}>{ind.label}</option>
            ))}
          </Select>
        </Field>

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

        <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
          <input
            type="text"
            className="input"
            placeholder="🔎 Buscar escola ou INEP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 240, fontSize: 13 }}
          />
        </div>
      </div>

      {/* Alerta explicativo */}
      <div className="alert alert-info" style={{ margin: 0 }}>
        <strong>Classificação Oficial PARC:</strong> {currentIndicator?.label}. Apenas escolas com dados de avaliação válidos e computados no ciclo selecionado participam do ranking.
      </div>

      {loading && !rankingData ? (
        <LoadingBlock label="Calculando classificação oficial do PARC..." />
      ) : (
        <>
          {/* Pódio dos 3 Primeiros Colocados */}
          {podium.length > 0 && !search && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {podium.map((school, idx) => {
                const medals = ['🥇', '🥈', '🥉'];
                const bgColors = ['#fffbeb', '#f8fafc', '#fff7ed'];
                const borderColors = ['#fde68a', '#e2e8f0', '#fed7aa'];
                const badgeCls = idx === 0 ? 'badge-yellow' : idx === 1 ? 'badge-gray' : 'badge-yellow';
                const sName = school.name || school.school?.name || 'Escola';
                const sInep = school.inep || school.school?.inep || '—';
                const sZone = school.zone || school.school?.zone || '';

                return (
                  <div
                    key={school.schoolId || school.id || `podium-${idx}`}
                    className="card card-pad"
                    style={{
                      background: bgColors[idx],
                      borderColor: borderColors[idx],
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 28 }}>{medals[idx]}</span>
                      <Badge cls={badgeCls} style={{ fontSize: 13, fontWeight: 700 }}>
                        {school.position}º Lugar
                      </Badge>
                    </div>

                    <div>
                      <strong style={{ fontSize: 15, color: 'var(--text-1)', display: 'block' }}>{sName}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                        INEP <span className="mono">{sInep}</span> {sZone ? `· ${sZone}` : ''}
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Resultado:</span>
                      <strong style={{ fontSize: 18, color: 'var(--primary)' }}>
                        {school.rankValue != null ? `${fmt(school.rankValue, 1)} ${school.unit || currentIndicator?.unit || ''}` : '—'}
                      </strong>
                    </div>

                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Participação:</span>
                      <span>{fmt(school.participationRate, 1)}% ({school.evaluated != null ? school.evaluated : '—'}/{school.enrolled != null ? school.enrolled : '—'})</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tabela Completa do Ranking */}
          <div className="card card-pad">
            <div className="card-header-row" style={{ marginBottom: 14 }}>
              <div>
                <div className="card-title">Classificação Completa da Rede ({filteredRanking.length} escolas)</div>
                <div className="card-subtitle">
                  Ordenado por {currentIndicator?.label || 'desempenho'} com critério de desempate por taxa de participação.
                </div>
              </div>
            </div>

            <DataTable
              columns={[
                {
                  key: 'position',
                  label: 'Posição',
                  align: 'center',
                  render: (s) => (
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      {s.badge || (s.position === 1 ? '🥇 1º' : s.position === 2 ? '🥈 2º' : s.position === 3 ? '🥉 3º' : `${s.position}º`)}
                    </span>
                  ),
                },
                {
                  key: 'inep',
                  label: 'INEP',
                  render: (s) => <span className="mono">{s.inep || s.school?.inep || '—'}</span>,
                },
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
                  key: 'participation',
                  label: 'Participação',
                  render: (s) => (
                    <div>
                      <strong>{fmt(s.participationRate, 1)}%</strong>
                      {s.evaluated != null && s.enrolled != null ? (
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.evaluated} / {s.enrolled} alunos</div>
                      ) : null}
                    </div>
                  ),
                },
                {
                  key: 'rankValue',
                  label: `Resultado (${currentIndicator?.unit || '%'})`,
                  align: 'right',
                  render: (s) => (
                    <strong style={{ fontSize: 15, color: 'var(--primary)' }}>
                      {s.rankValue != null ? `${fmt(s.rankValue, 1)} ${s.unit || currentIndicator?.unit || ''}` : '—'}
                    </strong>
                  ),
                },
              ]}
              rows={filteredRanking}
              emptyTitle="Nenhuma escola encontrada no ranking"
              emptyHint={isEvolution ? 'O ranking de evolução exige resultados de Entrada e Saída cadastrados.' : 'Importe os resultados na aba de importação.'}
              emptyIcon="🏆"
            />
          </div>
        </>
      )}
    </div>
  );
}
