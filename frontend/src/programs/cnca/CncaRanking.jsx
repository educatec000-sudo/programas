import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { cncaApi } from '../../services/resources.js';
import { Badge, Field, LoadingBlock, Select } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

export default function CncaRanking({ program }) {
  const [selectedIndicator, setSelectedIndicator] = useState('FLUENCIA_FLUENTES');
  const [grade, setGrade] = useState('TODOS');
  const [assessment, setAssessment] = useState('TODOS');
  const [year, setYear] = useState('');
  const [search, setSearch] = useState('');

  const { data: filtersData } = useApi(() => cncaApi.filters(program.id), [program.id]);

  const queryParams = useMemo(() => ({
    indicator: selectedIndicator,
    year: year || program.year,
    grade,
    assessment,
  }), [selectedIndicator, year, program.year, grade, assessment]);

  const { data: rankingData, loading } = useApi(
    () => cncaApi.ranking(program.id, queryParams),
    [program.id, queryParams],
  );

  const availableIndicators = rankingData?.availableIndicators || [
    { id: 'FLUENCIA_FLUENTES', label: '🗣️ Fluência · % Alunos Fluentes' },
    { id: 'FLUENCIA_PCPM', label: '🗣️ Fluência · PCPM Médio (Palavras/min)' },
    { id: 'MATEMATICA_PROFICIENCIA', label: '📐 Matemática · Proficiência Média' },
    { id: 'MATEMATICA_ADEQUADO', label: '📐 Matemática · % Adequado + Avançado' },
    { id: 'LEITURA_PROFICIENCIA', label: '📖 Leitura · Proficiência Média' },
    { id: 'LEITURA_ADEQUADO', label: '📖 Leitura · % Adequado + Avançado' },
    { id: 'ESCRITA_ALFABETICO', label: '✍️ Escrita · % Nível Alfabético' },
    { id: 'ESCRITA_PROFICIENCIA', label: '✍️ Escrita · Proficiência Média' },
    { id: 'GERAL_PROFICIENCIA', label: '🌐 Média Geral dos Componentes' },
    { id: 'PARTICIPACAO', label: '👥 Taxa de Participação Geral' },
  ];

  const rankingList = rankingData?.ranking || [];
  const currentIndicator = rankingData?.indicator || availableIndicators[0];

  const filteredRanking = useMemo(() => {
    if (!search.trim()) return rankingList;
    const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return rankingList.filter((r) => {
      const name = (r.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const inep = String(r.inep || '');
      return name.includes(q) || inep.includes(q);
    });
  }, [rankingList, search]);

  const podium = rankingData?.podium || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Barra de Seleção do Indicador Oficial e Filtros */}
      <div className="card card-pad filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <Field label="Indicador Oficial de Classificação" style={{ minWidth: 320 }}>
          <Select
            value={selectedIndicator}
            onChange={(e) => setSelectedIndicator(e.target.value)}
            style={{ fontWeight: 600, color: 'var(--primary)', borderColor: 'var(--primary)' }}
          >
            {availableIndicators.map((ind) => (
              <option key={ind.id} value={ind.id}>{ind.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Ano Escolar / Etapa">
          <Select value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="TODOS">Todas as etapas</option>
            {(filtersData?.grades || ['1º Ano', '2º Ano', '3º Ano']).map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </Select>
        </Field>

        <Field label="Avaliação / Edição">
          <Select value={assessment} onChange={(e) => setAssessment(e.target.value)}>
            <option value="TODOS">Todas as edições</option>
            {(filtersData?.assessments || ['Diagnóstica', 'Formativa 1', 'Somativa']).map((a) => (
              <option key={a} value={a}>{a}</option>
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

        <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            className="input"
            placeholder="🔎 Buscar escola ou INEP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220, fontSize: 13 }}
          />
          {(search || grade !== 'TODOS' || assessment !== 'TODOS' || selectedIndicator !== 'FLUENCIA_FLUENTES') && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearch('');
                setGrade('TODOS');
                setAssessment('TODOS');
                setSelectedIndicator('FLUENCIA_FLUENTES');
              }}
              style={{ height: 36, whiteSpace: 'nowrap' }}
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Explicação Transparente do Indicador Selecionado */}
      <div className="alert alert-info" style={{ margin: 0 }}>
        <strong>Classificação Oficial Baseada em:</strong> {currentIndicator?.label}. O ranking reflete com fidelidade os dados oficiais exportados para o CNCA, sem fórmulas arbitrárias.
      </div>

      {loading && !rankingData ? (
        <LoadingBlock label="Calculando classificação oficial das escolas..." />
      ) : (
        <>
          {/* Pódio dos 3 Primeiros Colocados */}
          {podium.length > 0 && !search && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {podium.map((school, idx) => {
                const medals = ['🥇', '🥈', '🥉'];
                const bgColors = ['rgba(245, 158, 11, 0.1)', 'rgba(59, 130, 246, 0.08)', 'rgba(249, 115, 22, 0.1)'];
                const borderColors = ['rgba(245, 158, 11, 0.4)', 'rgba(59, 130, 246, 0.3)', 'rgba(249, 115, 22, 0.4)'];
                const badgeCls = idx === 0 ? 'badge-yellow' : idx === 1 ? 'badge-blue' : 'badge-yellow';

                return (
                  <div
                    key={school.schoolId}
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
                      <strong style={{ fontSize: 15, display: 'block' }}>{school.name}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                        INEP <span className="mono">{school.inep || '—'}</span> {school.zone ? `· ${school.zone}` : ''}
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Resultado Oficial:</span>
                      <strong style={{ fontSize: 18, color: 'var(--primary)' }}>
                        {school.rankValue != null ? `${fmt(school.rankValue, 1)} ${school.unit || ''}` : '—'}
                      </strong>
                    </div>

                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Participação:</span>
                      <span>{fmt(school.participationRate, 1)}% ({school.evaluated}/{school.enrolled})</span>
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
                  Ordenado por {currentIndicator?.label} com critério de desempate por taxa de participação.
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
                      {s.position === 1 ? '🥇 1º' : s.position === 2 ? '🥈 2º' : s.position === 3 ? '🥉 3º' : `${s.position}º`}
                    </span>
                  ),
                },
                { key: 'inep', label: 'INEP', render: (s) => <span className="mono">{s.inep || '—'}</span> },
                { key: 'name', label: 'Escola', render: (s) => <strong>{s.name}</strong> },
                { key: 'zone', label: 'Zona', render: (s) => s.zone || '—' },
                {
                  key: 'participation',
                  label: 'Participação',
                  render: (s) => (
                    <div>
                      <strong>{fmt(s.participationRate, 1)}%</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.evaluated} / {s.enrolled} alunos</div>
                    </div>
                  ),
                },
                {
                  key: 'rankValue',
                  label: `Resultado (${currentIndicator?.unit || ''})`,
                  align: 'right',
                  render: (s) => (
                    <strong style={{ fontSize: 15, color: 'var(--primary)' }}>
                      {s.rankValue != null ? `${fmt(s.rankValue, 1)} ${s.unit || ''}` : '—'}
                    </strong>
                  ),
                },
              ]}
              rows={filteredRanking}
              emptyTitle="Nenhuma escola encontrada no ranking"
              emptyHint="Importe os resultados oficiais na aba 'Importar Planilha Oficial'."
              emptyIcon="🏆"
            />
          </div>
        </>
      )}
    </div>
  );
}
