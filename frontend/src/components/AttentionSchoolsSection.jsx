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
        border: '1px solid rgba(220, 38, 38, 0.3)',
        background: 'var(--surface)',
      }}
    >
      {/* 1. CABEÇALHO DA SEÇÃO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>🚨</span>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--danger)', margin: 0, letterSpacing: '-0.01em' }}>
              {title}
            </h2>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                background: summary.total > 0 ? 'rgba(239, 68, 68, 0.15)' : 'var(--surface-2)',
                color: summary.total > 0 ? 'var(--danger)' : 'var(--text-3)',
                padding: '2px 8px',
                borderRadius: 12,
              }}
            >
              {summary.total} {summary.total === 1 ? 'escola' : 'escolas'}
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '4px 0 0 0' }}>
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
              background: priorityFilter === 'ALL' ? 'var(--text)' : 'var(--surface)',
              color: priorityFilter === 'ALL' ? 'var(--surface)' : 'var(--text-2)',
              borderColor: priorityFilter === 'ALL' ? 'var(--text)' : 'var(--border)',
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
              background: priorityFilter === 'HIGH' ? '#dc2626' : 'var(--surface)',
              color: priorityFilter === 'HIGH' ? '#ffffff' : '#dc2626',
              borderColor: priorityFilter === 'HIGH' ? '#dc2626' : 'rgba(239, 68, 68, 0.4)',
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
              background: priorityFilter === 'MEDIUM' ? '#ea580c' : 'var(--surface)',
              color: priorityFilter === 'MEDIUM' ? '#ffffff' : '#ea580c',
              borderColor: priorityFilter === 'MEDIUM' ? '#ea580c' : 'rgba(234, 88, 12, 0.4)',
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
                background: priorityFilter === 'LOW' ? '#ca8a04' : 'var(--surface)',
                color: priorityFilter === 'LOW' ? '#ffffff' : '#ca8a04',
                borderColor: priorityFilter === 'LOW' ? '#ca8a04' : 'rgba(202, 138, 4, 0.4)',
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
            <span style={{ position: 'absolute', left: 10, top: 8, color: 'var(--text-3)', fontSize: 13 }}>
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
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
          <table className="table" style={{ width: '100%', fontSize: 13, margin: 0 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <th style={{ width: '30%', padding: '10px 14px' }}>Escola</th>
                <th style={{ width: '15%', padding: '10px 14px' }}>Prioridade</th>
                <th style={{ width: '35%', padding: '10px 14px' }}>Motivos Identificados</th>
                <th style={{ width: '12%', textAlign: 'right', padding: '10px 14px' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchools.map((school) => {
                const priorityBg =
                  school.priority === 'HIGH' ? 'rgba(239, 68, 68, 0.06)' : school.priority === 'MEDIUM' ? 'rgba(234, 88, 12, 0.06)' : 'transparent';

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
                      <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13.5 }}>
                        {school.schoolName}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2, display: 'flex', gap: 8 }}>
                        <span>INEP: <strong>{school.inep || '—'}</strong></span>
                        {school.zone && <span>· Zona: <strong>{school.zone}</strong></span>}
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      {getPriorityBadge(school.priority)}
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12.5 }}>
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
                                  color: km.tone === 'critical' ? 'var(--danger)' : 'var(--text-2)',
                                  background: km.tone === 'critical' ? 'rgba(239, 68, 68, 0.15)' : 'var(--surface-2)',
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
                          background: 'rgba(2, 132, 199, 0.1)',
                          borderColor: 'rgba(2, 132, 199, 0.3)',
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
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-2)', background: 'var(--surface-2)', borderRadius: 8 }}>
          Nenhuma escola encontrada com os filtros selecionados.
        </div>
      ) : (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 8,
            color: 'var(--success)',
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}>🎉</div>
          <strong style={{ fontSize: 14 }}>Nenhuma escola em situação de atenção no momento!</strong>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
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
                background: selectedSchool.priority === 'HIGH' ? 'rgba(239, 68, 68, 0.1)' : selectedSchool.priority === 'MEDIUM' ? 'rgba(234, 88, 12, 0.1)' : 'rgba(202, 138, 4, 0.1)',
                borderRadius: 8,
                border: `1px solid ${selectedSchool.priority === 'HIGH' ? 'rgba(239, 68, 68, 0.3)' : selectedSchool.priority === 'MEDIUM' ? 'rgba(234, 88, 12, 0.3)' : 'rgba(202, 138, 4, 0.3)'}`,
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
                  {selectedSchool.schoolName}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                  INEP: <strong>{selectedSchool.inep || '—'}</strong> {selectedSchool.zone ? `· Zona: ${selectedSchool.zone}` : ''}
                </div>
              </div>

              <div>
                {getPriorityBadge(selectedSchool.priority)}
              </div>
            </div>

            {/* Sumário de Indicadores */}
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
              Foram identificados <strong>{selectedSchool.reasons?.length || 0} motivos objetivos</strong> que classificam esta unidade como prioritária para acompanhamento técnico:
            </div>

            {/* Lista Detalhada de Motivos e Desvios */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(selectedSchool.reasons || []).map((reason, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                        {idx + 1}. {reason.indicator}
                      </span>
                      {reason.component && (
                        <span style={{ fontSize: 11, background: 'var(--surface-2)', color: 'var(--text-2)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
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
                      background: 'var(--surface-2)',
                      padding: '8px 12px',
                      borderRadius: 6,
                      marginBottom: 10,
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--text-3)' }}>Valor da Escola:</span>
                      <div style={{ fontWeight: 800, color: reason.severity === 'HIGH' ? 'var(--danger)' : '#ea580c', fontSize: 13.5 }}>
                        {reason.currentValue}
                      </div>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-3)' }}>Referência / Meta:</span>
                      <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: 13.5 }}>
                        {reason.referenceValue}
                      </div>
                    </div>

                    {reason.diff && (
                      <div>
                        <span style={{ color: 'var(--text-3)' }}>Diferença / Desvio:</span>
                        <div style={{ fontWeight: 800, color: 'var(--danger)', fontSize: 13.5 }}>
                          {reason.diff}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Diagnóstico Pedagógico */}
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45, marginBottom: 6 }}>
                    <strong style={{ color: 'var(--text)' }}>Diagnóstico:</strong> {reason.description}
                  </div>

                  {/* Recomendação de Ação */}
                  {reason.recommendation && (
                    <div style={{ fontSize: 12, color: '#0284c7', background: 'rgba(2, 132, 199, 0.1)', padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(2, 132, 199, 0.2)' }}>
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
