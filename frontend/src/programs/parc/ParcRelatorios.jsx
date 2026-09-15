import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { parcApi } from '../../services/resources.js';
import { LoadingBlock, Select } from '../../components/ui.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

export default function ParcRelatorios({ program = {} }) {
  const [cycle, setCycle] = useState('ENTRADA');
  const [zone, setZone] = useState('TODAS');

  const programId = program?.id;
  const programYear = program?.year || 2026;

  const filters = useMemo(
    () => ({
      cycle: cycle === 'TODOS' ? undefined : cycle,
      zone: zone === 'TODAS' ? undefined : zone,
      year: programYear,
    }),
    [cycle, zone, programYear],
  );

  const { data: dashboard, loading } = useApi(
    () => (programId ? parcApi.dashboard(programId, filters) : Promise.resolve(null)),
    [programId, filters],
  );

  const { data: filtersData } = useApi(
    () => (programId ? parcApi.filters(programId) : Promise.resolve(null)),
    [programId],
  );

  const kpis = dashboard?.kpis || {};
  const pieSlices = dashboard?.pieSlices || [];
  const zoneBreakdown = dashboard?.zoneBreakdown || [];
  const attentionSchools = dashboard?.attentionSchools?.schools || [];

  const handlePrint = () => {
    window.print();
  };

  if (loading && !dashboard) {
    return <LoadingBlock message="Gerando relatório executivo do PARC..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Topo com Filtros e Botão Imprimir */}
      <div className="program-filter-panel">
        <div className="program-filter-item">
          <label className="program-filter-label">Ciclo / Edição</label>
          <Select
            value={cycle}
            onChange={(e) => setCycle(e.target.value)}
            className="program-select"
          >
            <option value="ENTRADA">Ciclo de Entrada</option>
            <option value="SAIDA">Ciclo de Saída</option>
            <option value="TODOS">Todos os Ciclos</option>
          </Select>
        </div>

        <div className="program-filter-item">
          <label className="program-filter-label">Localização / Zona</label>
          <Select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="program-select"
          >
            <option value="TODAS">Todas as zonas</option>
            {(filtersData?.zones || ['SEDE', 'ILHAS', 'ESTRADAS']).map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </Select>
        </div>

        <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
          <button
            className="btn btn-primary"
            onClick={handlePrint}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px', fontWeight: 700, height: 36 }}
          >
            <span>🖨️</span> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* Relatório Imprimível */}
      <div
        className="card"
        id="relatorio-executivo"
        style={{
          padding: '32px 36px',
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        {/* Cabeçalho do Relatório */}
        <div style={{ borderBottom: '2px solid var(--border)', paddingBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0284c7', textTransform: 'uppercase', letterSpacing: 1 }}>
                SECRETARIA MUNICIPAL DE EDUCAÇÃO · SEMED ABAETETUBA
              </div>
              <h1 style={{ margin: '4px 0 2px 0', fontSize: 22, fontWeight: 800 }}>
                PARC — Programa de Alfabetização na Idade Certa {programYear}
              </h1>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>
                Relatório Executivo Oficial de Fluência Leitora · {cycle === 'SAIDA' ? 'Ciclo de Saída' : 'Ciclo de Entrada'} (2º Ano)
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--text-3)' }}>
              <div>Data de Emissão: {new Date().toLocaleDateString('pt-BR')}</div>
              <div>CPE — Controle de Programas Educacionais</div>
            </div>
          </div>
        </div>

        {/* Resumo de Indicadores Gerais */}
        <div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 15, fontWeight: 800, textTransform: 'uppercase' }}>
            1. Indicadores Globais de Fluência Leitora
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>ESTUDANTES PREVISTOS</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtInt(kpis.totalEnrolled || 0)}</div>
            </div>
            <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>ESTUDANTES AVALIADOS</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtInt(kpis.totalEvaluated || 0)}</div>
            </div>
            <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>TAXA DE PARTICIPAÇÃO</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--success)' }}>{fmt(kpis.participationRate, 1)}%</div>
            </div>
            <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>ÍNDICE DE FLUÊNCIA (IFL)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#ea580c' }}>{fmt(kpis.ifl, 1)} / 10</div>
            </div>
          </div>
        </div>

        {/* Distribuição por Níveis de Fluência */}
        <div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 15, fontWeight: 800, textTransform: 'uppercase' }}>
            2. Distribuição por Níveis de Fluência Leitora
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: 10, fontWeight: 700 }}>Nível de Fluência</th>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'center' }}>Classificação</th>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'center' }}>Total Alunos</th>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'center' }}>Percentual (%)</th>
              </tr>
            </thead>
            <tbody>
              {pieSlices.map((slice) => (
                <tr key={slice.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: slice.color, display: 'inline-block' }} />
                    {slice.label}
                  </td>
                  <td style={{ padding: 10, textAlign: 'center' }}>
                    {slice.id === 'fluentReader' ? 'Fluente' : slice.id === 'beginnerReader' ? 'Iniciante' : 'Pré-leitor'}
                  </td>
                  <td style={{ padding: 10, textAlign: 'center', fontWeight: 700 }}>{fmtInt(slice.count)}</td>
                  <td style={{ padding: 10, textAlign: 'center', fontWeight: 800 }}>{fmt(slice.percentage, 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Resumo por Localização e Pontos de Atenção */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13.5, fontWeight: 700, color: '#0284c7' }}>
              📍 Desempenho por Segmento Territorial
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {zoneBreakdown.map((zb) => (
                <div key={zb.zone} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <span><strong>{zb.zone}</strong> ({zb.schoolsCount} escolas)</span>
                  <span>Part.: <strong>{fmt(zb.participationRate, 1)}%</strong> · Fluentes: <strong>{fmt(zb.fluentReader, 1)}%</strong></span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13.5, fontWeight: 700, color: 'var(--danger)' }}>
              ⚠️ Escolas Prioritárias para Intervenção
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {attentionSchools.slice(0, 5).map((s, idx) => (
                <div key={s.schoolId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 10px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 6, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <span><strong>{idx + 1}º</strong> {s.schoolName}</span>
                  <strong style={{ color: 'var(--danger)' }}>{s.priorityLabel}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
