import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { pactoAdminApi } from '../../services/resources.js';
import { Badge, Button, Field, Input, LoadingBlock, Select } from '../../components/ui.jsx';
import DataTable from '../../components/DataTable.jsx';
import { buildPactoDashboard, formatGradeLabel } from './dashboard.js';
import { fmt } from '../../utils/format.js';

export default function PactoRanking({ program, onSelectTab }) {
  const { data: overview, loading, error } = useApi(
    () => pactoAdminApi.overview(program.id),
    [program.id],
  );

  const [rankingMode, setRankingMode] = useState('PROFICIENCIA'); // 'PROFICIENCIA' | 'EVOLUCAO'
  const [gradeFilter, setGradeFilter] = useState('');
  const [componentFilter, setComponentFilter] = useState('');
  const [displayScope, setDisplayScope] = useState('ALL'); // 'TOP5' | 'ALL'
  const [search, setSearch] = useState('');

  const dashboard = useMemo(() => {
    if (!overview) return null;
    return buildPactoDashboard(overview, {
      grade: gradeFilter || undefined,
      component: componentFilter || undefined,
    });
  }, [overview, gradeFilter, componentFilter]);

  const schoolRanking = dashboard?.schoolRanking || [];

  // Ordenação de acordo com o modo selecionado
  const sortedRanking = useMemo(() => {
    let list = [...schoolRanking];

    if (rankingMode === 'EVOLUCAO') {
      list.sort((a, b) => (
        (b.participationPercentage ?? 0) - (a.participationPercentage ?? 0) ||
        (b.completenessPercentage ?? 0) - (a.completenessPercentage ?? 0) ||
        (b.score ?? 0) - (a.score ?? 0)
      ));
      list.forEach((s, idx) => {
        s.displayPosition = idx + 1;
        s.displayPositionBadge = idx === 0 ? '🥇 1º' : idx === 1 ? '🥈 2º' : idx === 2 ? '🥉 3º' : `${idx + 1}º`;
      });
    } else {
      list.forEach((s) => {
        s.displayPosition = s.position;
        s.displayPositionBadge = s.positionBadge;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      list = list.filter((s) => {
        const name = (s.school || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const inep = String(s.inep || '');
        return name.includes(q) || inep.includes(q);
      });
    }

    if (displayScope === 'TOP5') {
      return list.slice(0, 5);
    }
    return list;
  }, [schoolRanking, rankingMode, search, displayScope]);

  if (loading && !overview) return <LoadingBlock label="Carregando ranking do Pacto..." />;
  if (error) return <div className="alert alert-error">{error.message}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Subabas: Por Proficiência | Por Evolução / Participação */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
        <button
          type="button"
          className={`btn ${rankingMode === 'PROFICIENCIA' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setRankingMode('PROFICIENCIA')}
        >
          🏆 Por Proficiência Consolidada
        </button>
        <button
          type="button"
          className={`btn ${rankingMode === 'EVOLUCAO' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setRankingMode('EVOLUCAO')}
        >
          📈 Por Participação & Cobertura
        </button>
      </div>

      {/* Barra de Filtros do Ranking */}
      <div className="card card-pad filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', background: '#f8fafc' }}>
        <div style={{ flex: '1 1 200px' }}>
          <Field label="Buscar Escola">
            <Input
              type="search"
              placeholder="🔎 Nome da escola ou INEP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>

        <div style={{ width: 180 }}>
          <Field label="Etapa/Ano">
            <Select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
              <option value="">Todas as etapas</option>
              <option value="0">Pré-escola (PII)</option>
              <option value="1">1º ano</option>
              <option value="2">2º ano</option>
            </Select>
          </Field>
        </div>

        <div style={{ width: 200 }}>
          <Field label="Componente">
            <Select value={componentFilter} onChange={(e) => setComponentFilter(e.target.value)}>
              <option value="">Língua Portuguesa</option>
              <option value="MATEMATICA">Matemática</option>
              <option value="INICIAL">Habilidades Iniciais</option>
              <option value="ALL">Todos os componentes</option>
            </Select>
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
          <Button
            size="sm"
            variant={displayScope === 'TOP5' ? 'primary' : 'secondary'}
            onClick={() => setDisplayScope('TOP5')}
          >
            Top 5
          </Button>
          <Button
            size="sm"
            variant={displayScope === 'ALL' ? 'primary' : 'secondary'}
            onClick={() => setDisplayScope('ALL')}
          >
            Todas ({schoolRanking.length})
          </Button>
        </div>
      </div>

      {/* Grid Principal: Tabela à Esquerda + Visualizador à Direita */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        {/* Tabela do Ranking */}
        <div className="card card-pad" style={{ background: '#ffffff', borderRadius: 12 }}>
          <DataTable
            columns={[
              {
                key: 'position',
                label: 'Posição',
                width: 80,
                align: 'center',
                render: (item, idx) => (
                  <strong style={{ fontSize: 13.5 }}>
                    {item.displayPositionBadge || (idx === 0 ? '🥇 1º' : idx === 1 ? '🥈 2º' : idx === 2 ? '🥉 3º' : `${idx + 1}º`)}
                  </strong>
                ),
              },
              {
                key: 'school',
                label: 'Escola Municipal',
                render: (item) => (
                  <div>
                    <strong style={{ color: '#0f172a', fontSize: 13 }}>{item.school}</strong>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      INEP: <span className="mono">{item.inep || '—'}</span> · Abaetetuba/PA
                    </div>
                  </div>
                ),
              },
              {
                key: 'score',
                label: 'Média',
                align: 'center',
                render: (item) => (
                  <strong style={{ color: '#0284c7', fontSize: 13.5 }}>
                    {item.score != null ? `${fmt(item.score)}%` : '—'}
                  </strong>
                ),
              },
              {
                key: 'participationPercentage',
                label: 'Participação',
                align: 'center',
                render: (item) => (
                  <span style={{ fontWeight: 600, color: (item.participationPercentage ?? 0) >= 90 ? '#15803d' : '#b45309' }}>
                    {item.participationPercentage != null ? `${fmt(item.participationPercentage)}%` : '—'}
                  </span>
                ),
              },
              {
                key: 'completeness',
                label: 'Conclusão',
                align: 'center',
                render: (item) => (
                  <Badge cls={item.isComplete !== false ? 'badge-green' : 'badge-yellow'}>
                    {item.isComplete !== false ? '● Completa' : '⚠️ Pendente'}
                  </Badge>
                ),
              },
            ]}
            rows={sortedRanking}
            rowKey={(item, idx) => item.schoolId || idx}
            emptyTitle="Nenhuma escola encontrada no ranking"
            emptyHint="Verifique os filtros aplicados."
          />
        </div>

        {/* Card Ilustrativo e Destaques à Direita */}
        <div className="card card-pad" style={{ background: '#ffffff', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#eff6ff', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-2.34" />
              <path d="M18 14.66V17c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1v-2.34" />
              <path d="M6 2h12v7a6 6 0 0 1-12 0V2Z" />
            </svg>
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 750, color: '#0f172a', margin: '0 0 8px 0' }}>
            Classificação Geral da Rede Municipal
          </h3>
          <p style={{ fontSize: 12.5, color: '#64748b', maxWidth: 280, margin: '0 0 18px 0', lineHeight: 1.4 }}>
            O ranking do Pacto calcula a média ponderada com base no alcance de níveis de proficiência em Leitura, Escrita e Matemática na avaliação vigente.
          </p>

          <Button
            variant="secondary"
            onClick={() => setDisplayScope('ALL')}
          >
            Ver Todas as Escolas ({schoolRanking.length})
          </Button>
        </div>
      </div>
    </div>
  );
}
