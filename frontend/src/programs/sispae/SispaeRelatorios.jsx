import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { sispaeApi } from '../../services/resources.js';
import { LoadingBlock } from '../../components/ui.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

export default function SispaeRelatorios({ program = {} }) {
  const [selectedAppId, setSelectedAppId] = useState('');

  const programId = program?.id;
  const programYear = program?.year || 2026;

  const filters = useMemo(
    () => ({
      year: programYear,
      applicationId: selectedAppId || undefined,
    }),
    [programYear, selectedAppId],
  );

  const { data: dashboard, loading } = useApi(
    () => (programId ? sispaeApi.dashboard(programId, filters) : Promise.resolve(null)),
    [programId, filters],
  );

  const currentApp = dashboard?.currentApplication;
  const applications = dashboard?.applications || [];
  const kpis = dashboard?.kpis || {};
  const componentsSummary = dashboard?.componentsSummary || [];
  const topSchools = dashboard?.topSchools || [];
  const attentionSchools = dashboard?.attentionSchools || [];

  const handlePrint = () => {
    window.print();
  };

  if (loading && !dashboard) {
    return <LoadingBlock message="Gerando relatório executivo do SisPAE..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Topo com Filtro de Aplicação e Botão Imprimir */}
      <div className="program-filter-panel">
        <div className="program-filter-item">
          <label className="program-filter-label">Aplicação</label>
          <select
            value={selectedAppId || currentApp?.id || ''}
            onChange={(e) => setSelectedAppId(e.target.value)}
            className="program-select"
          >
            {applications.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name} ({app.type === 'SIMULADO' ? 'Simulado' : 'Oficial'})
              </option>
            ))}
          </select>
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
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        {/* Cabeçalho do Relatório */}
        <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0284c7', textTransform: 'uppercase', letterSpacing: 1 }}>
                SECRETARIA MUNICIPAL DE EDUCAÇÃO · SEMED
              </div>
              <h1 style={{ margin: '4px 0 2px 0', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                SisPAE — Sistema Paraense de Avaliação Educacional {programYear}
              </h1>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#475569' }}>
                Relatório Executivo · {currentApp?.name} ({currentApp?.type === 'SIMULADO' ? 'Simulado Preparatório' : 'Avaliação Oficial'})
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11.5, color: '#64748b' }}>
              <div>Data de Emissão: {new Date().toLocaleDateString('pt-BR')}</div>
              <div>CPE — Controle de Programas Educacionais</div>
            </div>
          </div>
        </div>

        {/* Resumo de Indicadores Gerais */}
        <div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 15, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
            1. Indicadores Globais de Participação e Desempenho
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>ESCOLAS PARTICIPANTES</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{fmtInt(kpis.totalSchools || 0)}</div>
            </div>
            <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>ESTUDANTES AVALIADOS</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{fmtInt(kpis.evaluated || 0)}</div>
            </div>
            <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>TAXA DE PARTICIPAÇÃO</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>{fmt(kpis.participationRate)}%</div>
            </div>
            <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>APRENDIZADO ADEQUADO</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0284c7' }}>{fmt(kpis.adequateRate)}%</div>
            </div>
          </div>
        </div>

        {/* Resumo por Componente */}
        <div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 15, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
            2. Desempenho Consolidado por Componente Curricular
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                <th style={{ padding: 10, fontWeight: 700 }}>Componente</th>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'center' }}>Escolas</th>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'center' }}>Avaliados</th>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'center' }}>Participação</th>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'center' }}>% Adequado</th>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'center' }}>% Intermediário</th>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'center' }}>% Defasagem</th>
              </tr>
            </thead>
            <tbody>
              {componentsSummary.map((c) => (
                <tr key={c.code} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: 10, fontWeight: 700, color: '#0f172a' }}>{c.label}</td>
                  <td style={{ padding: 10, textAlign: 'center' }}>{c.schoolsCount}</td>
                  <td style={{ padding: 10, textAlign: 'center' }}>{fmtInt(c.evaluated)}</td>
                  <td style={{ padding: 10, textAlign: 'center', fontWeight: 700 }}>{fmt(c.participationRate)}%</td>
                  <td style={{ padding: 10, textAlign: 'center', fontWeight: 800, color: '#059669' }}>{fmt(c.adequateRate)}%</td>
                  <td style={{ padding: 10, textAlign: 'center', fontWeight: 600, color: '#d97706' }}>{fmt(c.intermediateRate)}%</td>
                  <td style={{ padding: 10, textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>{fmt(c.deficitRate)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Destaques e Atenções */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13.5, fontWeight: 700, color: '#047857' }}>
              🏆 Top Escolas da Rede
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {topSchools.slice(0, 5).map((s, idx) => (
                <div key={s.schoolId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 10px', background: '#f0fdf4', borderRadius: 6 }}>
                  <span><strong>{idx + 1}º</strong> {s.schoolName}</span>
                  <strong style={{ color: '#047857' }}>{fmt(s.overallAdequateRate)}%</strong>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13.5, fontWeight: 700, color: '#b91c1c' }}>
              ⚠️ Escolas em Situação Prioritária
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {attentionSchools.slice(0, 5).map((s, idx) => (
                <div key={s.schoolId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 10px', background: '#fef2f2', borderRadius: 6 }}>
                  <span>{s.schoolName}</span>
                  <strong style={{ color: '#dc2626' }}>{fmt(s.overallDeficitRate)}% def.</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
