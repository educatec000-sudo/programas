import React, { useState, useMemo } from 'react';
import { Badge, Button, Modal } from './ui.jsx';

/**
 * Componente Reutilizável Padrão Oficial do CPE:
 * 🚨 Escolas que precisam de atenção
 *
 * Funciona de forma totalmente determinística, baseada em dados e regras objetivas
 * específicas de cada programa educacional (Pacto, CNCA, PARC, SisPAE e futuros).
 */
export default function AttentionSchoolsSection({
  attentionData,
  title = 'Escolas que precisam de atenção',
  subtitle = 'Identificação automática de unidades escolares que demandam acompanhamento técnico e intervenção pedagógica prioritária.',
  onSelectTab,
}) {
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSchool, setSelectedSchool] = useState(null);

  const allSchools = Array.isArray(attentionData)
    ? attentionData
    : (attentionData?.schools || []);

  const summary = attentionData?.summary || {
    total: allSchools.length,
    high: allSchools.filter((s) => s.priority === 'HIGH').length,
    medium: allSchools.filter((s) => s.priority === 'MEDIUM').length,
    low: allSchools.filter((s) => s.priority === 'LOW').length,
  };

  const filteredSchools = useMemo(() => {
    return allSchools.filter((s) => {
      if (priorityFilter !== 'ALL' && s.priority !== priorityFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchName = (s.schoolName || '').toLowerCase().includes(term);
        const matchInep = String(s.inep || '').includes(term);
        if (!matchName && !matchInep) return false;
      }
      return true;
    });
  }, [allSchools, priorityFilter, searchTerm]);

  const getPriorityBadge = (priority) => {
    if (priority === 'HIGH') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 800,
            background: '#fef2f2',
            color: '#dc2626',
            border: '1px solid #fecaca',
          }}
        >
          <span style={{ fontSize: 13 }}>🔴</span>
          <span>Alta Prioridade</span>
        </span>
      );
    }
    if (priority === 'MEDIUM') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 800,
            background: '#fff7ed',
            color: '#c2410c',
            border: '1px solid #fed7aa',
          }}
        >
          <span style={{ fontSize: 13 }}>🟠</span>
          <span>Média Prioridade</span>
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 800,
          background: '#fefce8',
          color: '#a16207',
          border: '1px solid #fef08a',
        }}
      >
        <span style={{ fontSize: 13 }}>🟡</span>
        <span>Baixa Prioridade</span>
      </span>
    );
  };

  const getSeverityPill = (severity) => {
    if (severity === 'HIGH') {
      return (
        <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: 4 }}>
          Crítico
        </span>
      );
    }
    if (severity === 'MEDIUM') {
      return (
        <span style={{ fontSize: 11, fontWeight: 700, color: '#c2410c', background: '#ffedd5', padding: '2px 8px', borderRadius: 4 }}>
          Atenção
        </span>
      );
    }
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: '#854d0e', background: '#fef9c3', padding: '2px 8px', borderRadius: 4 }}>
        Alerta
      </span>
    );
  };

  return (
    <div
      className="card card-pad"
      style={{
        border: '1px solid #fecaca',
        background: 'linear-gradient(180deg, #fffafa 0%, #ffffff 100%)',
        boxShadow: '0 4px 16px rgba(220, 38, 38, 0.04)',
      }}
    >
      {/* 1. CABEÇALHO DA SEÇÃO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>🚨</span>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#991b1b', margin: 0, letterSpacing: '-0.01em' }}>
              {title}
            </h2>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                background: summary.total > 0 ? '#fee2e2' : '#f1f5f9',
                color: summary.total > 0 ? '#dc2626' : '#64748b',
                padding: '2px 8px',
                borderRadius: 12,
              }}
            >
              {summary.total} {summary.total === 1 ? 'escola' : 'escolas'}
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: '#64748b', margin: '4px 0 0 0' }}>
            {subtitle}
          </p>
        </div>

        {/* CONTADORES RÁPIDOS E FILTROS DE PRIORIDADE */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setPriorityFilter('ALL')}
            className="btn btn-sm"
            style={{
              fontWeight: 700,
              fontSize: 12,
              background: priorityFilter === 'ALL' ? '#0f172a' : '#ffffff',
              color: priorityFilter === 'ALL' ? '#ffffff' : '#475569',
              borderColor: priorityFilter === 'ALL' ? '#0f172a' : '#cbd5e1',
            }}
          >
            Todas ({summary.total})
          </button>
          <button
            type="button"
            onClick={() => setPriorityFilter('HIGH')}
            className="btn btn-sm"
            style={{
              fontWeight: 700,
              fontSize: 12,
              background: priorityFilter === 'HIGH' ? '#dc2626' : '#ffffff',
              color: priorityFilter === 'HIGH' ? '#ffffff' : '#dc2626',
              borderColor: priorityFilter === 'HIGH' ? '#dc2626' : '#fecaca',
            }}
          >
            🔴 Alta ({summary.high})
          </button>
          <button
            type="button"
            onClick={() => setPriorityFilter('MEDIUM')}
            className="btn btn-sm"
            style={{
              fontWeight: 700,
              fontSize: 12,
              background: priorityFilter === 'MEDIUM' ? '#ea580c' : '#ffffff',
              color: priorityFilter === 'MEDIUM' ? '#ffffff' : '#ea580c',
              borderColor: priorityFilter === 'MEDIUM' ? '#ea580c' : '#fed7aa',
            }}
          >
            🟠 Média ({summary.medium})
          </button>
          {summary.low > 0 && (
            <button
              type="button"
              onClick={() => setPriorityFilter('LOW')}
              className="btn btn-sm"
              style={{
                fontWeight: 700,
                fontSize: 12,
                background: priorityFilter === 'LOW' ? '#ca8a04' : '#ffffff',
                color: priorityFilter === 'LOW' ? '#ffffff' : '#ca8a04',
                borderColor: priorityFilter === 'LOW' ? '#ca8a04' : '#fef08a',
              }}
            >
              🟡 Baixa ({summary.low})
            </button>
          )}
        </div>
      </div>

      {/* 2. BARRA DE BUSCA RÁPIDA */}
      {allSchools.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar por nome da escola ou INEP..."
              className="input"
              style={{ height: 34, fontSize: 12.5, paddingLeft: 30 }}
            />
            <span style={{ position: 'absolute', left: 10, top: 8, color: '#94a3b8', fontSize: 13 }}>
              🔍
            </span>
          </div>
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="btn btn-sm"
              style={{ height: 34, fontSize: 12 }}
            >
              Limpar busca
            </button>
          )}
        </div>
      )}

      {/* 3. TABELA DE ESCOLAS EM ATENÇÃO */}
      {filteredSchools.length > 0 ? (
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #f1f5f9' }}>
          <table className="table" style={{ width: '100%', fontSize: 13, background: '#ffffff', margin: 0 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ width: '30%', padding: '10px 14px' }}>Escola</th>
                <th style={{ width: '15%', padding: '10px 14px' }}>Prioridade</th>
                <th style={{ width: '35%', padding: '10px 14px' }}>Motivos Identificados</th>
                <th style={{ width: '12%', textAlign: 'right', padding: '10px 14px' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchools.map((school) => {
                const priorityBg =
                  school.priority === 'HIGH' ? 'rgba(254, 242, 242, 0.4)' : school.priority === 'MEDIUM' ? 'rgba(255, 247, 237, 0.4)' : '#ffffff';

                return (
                  <tr
                    key={school.schoolId || school.inep}
                    style={{
                      background: priorityBg,
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    onClick={() => setSelectedSchool(school)}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
                        {school.schoolName}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2, display: 'flex', gap: 8 }}>
                        <span>INEP: <strong>{school.inep || '—'}</strong></span>
                        {school.zone && <span>· Zona: <strong>{school.zone}</strong></span>}
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      {getPriorityBadge(school.priority)}
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontWeight: 600, color: '#334155', fontSize: 12.5 }}>
                          {school.reasonsSummary}
                        </div>
                        {Array.isArray(school.keyMetrics) && school.keyMetrics.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                            {school.keyMetrics.map((km, idx) => (
                              <span
                                key={idx}
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: km.tone === 'critical' ? '#dc2626' : '#475569',
                                  background: km.tone === 'critical' ? '#fee2e2' : '#f1f5f9',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                }}
                              >
                                {km.label}: <strong>{km.value}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSchool(school);
                        }}
                        className="btn btn-sm"
                        style={{
                          height: 30,
                          padding: '0 10px',
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#0284c7',
                          background: '#f0f9ff',
                          borderColor: '#bae6fd',
                        }}
                      >
                        Ver Detalhes →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : allSchools.length > 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8 }}>
          Nenhuma escola encontrada com os filtros selecionados.
        </div>
      ) : (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            color: '#15803d',
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}>🎉</div>
          <strong style={{ fontSize: 14 }}>Nenhuma escola em situação de atenção no momento!</strong>
          <div style={{ fontSize: 12.5, color: '#166534', marginTop: 2 }}>
            Todas as escolas com avaliações enviadas estão apresentando taxas de participação e proficiência dentro dos parâmetros esperados.
          </div>
        </div>
      )}

      {/* 4. MODAL / DETALHAMENTO COMPLETO DA ESCOLA EM ATENÇÃO */}
      {selectedSchool && (
        <Modal
          open={Boolean(selectedSchool)}
          onClose={() => setSelectedSchool(null)}
          title={`Diagnóstico Técnico · ${selectedSchool.schoolName}`}
          maxWidth={760}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header da Escola com Prioridade e INEP */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                padding: '12px 16px',
                background: selectedSchool.priority === 'HIGH' ? '#fef2f2' : selectedSchool.priority === 'MEDIUM' ? '#fff7ed' : '#fefce8',
                borderRadius: 8,
                border: `1px solid ${selectedSchool.priority === 'HIGH' ? '#fecaca' : selectedSchool.priority === 'MEDIUM' ? '#fed7aa' : '#fef08a'}`,
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                  {selectedSchool.schoolName}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  INEP: <strong>{selectedSchool.inep || '—'}</strong> {selectedSchool.zone ? `· Zona: ${selectedSchool.zone}` : ''}
                </div>
              </div>

              <div>
                {getPriorityBadge(selectedSchool.priority)}
              </div>
            </div>

            {/* Sumário de Indicadores */}
            <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
              Foram identificados <strong>{selectedSchool.reasons?.length || 0} motivos objetivos</strong> que classificam esta unidade como prioritária para acompanhamento técnico:
            </div>

            {/* Lista Detalhada de Motivos e Desvios */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(selectedSchool.reasons || []).map((reason, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '14px 16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                        {idx + 1}. {reason.indicator}
                      </span>
                      {reason.component && (
                        <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                          {reason.component}
                        </span>
                      )}
                    </div>
                    {getSeverityPill(reason.severity)}
                  </div>

                  {/* Comparativo: Valor Atual vs Referência */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                      gap: 8,
                      background: '#f8fafc',
                      padding: '8px 12px',
                      borderRadius: 6,
                      marginBottom: 10,
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <span style={{ color: '#64748b' }}>Valor da Escola:</span>
                      <div style={{ fontWeight: 800, color: reason.severity === 'HIGH' ? '#dc2626' : '#c2410c', fontSize: 13.5 }}>
                        {reason.currentValue}
                      </div>
                    </div>

                    <div>
                      <span style={{ color: '#64748b' }}>Referência / Meta:</span>
                      <div style={{ fontWeight: 700, color: '#15803d', fontSize: 13.5 }}>
                        {reason.referenceValue}
                      </div>
                    </div>

                    {reason.diff && (
                      <div>
                        <span style={{ color: '#64748b' }}>Diferença / Desvio:</span>
                        <div style={{ fontWeight: 800, color: '#dc2626', fontSize: 13.5 }}>
                          {reason.diff}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Diagnóstico Pedagógico */}
                  <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.45, marginBottom: 6 }}>
                    <strong>Diagnóstico:</strong> {reason.description}
                  </div>

                  {/* Recomendação de Ação */}
                  {reason.recommendation && (
                    <div style={{ fontSize: 12, color: '#0369a1', background: '#f0f9ff', padding: '6px 10px', borderRadius: 6, border: '1px solid #e0f2fe' }}>
                      💡 <strong>Ação Técnica Recomendada:</strong> {reason.recommendation}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Rodapé com Fechamento */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="secondary" onClick={() => setSelectedSchool(null)}>
                Fechar Detalhamento
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
