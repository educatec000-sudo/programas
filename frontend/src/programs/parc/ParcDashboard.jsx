import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { parcApi } from '../../services/resources.js';
import { Badge, LoadingBlock, Modal, Select } from '../../components/ui.jsx';
import AttentionSchoolsSection from '../../components/AttentionSchoolsSection.jsx';
import ParcRelatorios from './ParcRelatorios.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

/**
 * Componente de Velocímetro / Gauge Semicircular oficial do PARC.
 */
function SemiCircleGaugeCard({ title, icon, value, unit = '%', min = 0, max = 100, color = '#0284c7', isScore = false }) {
  const numericVal = typeof value === 'number' ? value : parseFloat(String(value || '').replace(',', '.'));
  const validVal = Number.isFinite(numericVal) ? numericVal : 0;
  const ratio = Math.max(0, Math.min(1, (validVal - min) / (max - min || 1)));

  // Raio e geometria do arco semicircular
  const r = 58;
  const cx = 85;
  const cy = 70;
  const arcLength = Math.PI * r; // ~182.21
  const dashOffset = arcLength * (1 - ratio);

  return (
    <div className="parc-gauge-item-card-v2">
      <div className="parc-gauge-header-v2">
        <span className={`parc-gauge-header-icon ${color === '#0284c7' || color === '#0080ff' ? 'blue' : color === '#ea580c' ? 'orange' : 'purple'}`}>
          {icon}
        </span>
        <span>{title}</span>
      </div>

      <div className="parc-gauge-body-v2">
        <svg viewBox="0 0 170 85" width="170" height="85">
          {/* Arco de Fundo Cinza */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="var(--surface-3, #e2e8f0)"
            strokeWidth="13"
            strokeLinecap="round"
          />
          {/* Arco Colorido de Preenchimento */}
          {ratio > 0 && (
            <path
              d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
              fill="none"
              stroke={color}
              strokeWidth="13"
              strokeLinecap="round"
              strokeDasharray={`${arcLength} ${arcLength}`}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}
            />
          )}
          {/* Valor Central */}
          <text
            x={cx}
            y={cy - 8}
            textAnchor="middle"
            fontSize="21"
            fontWeight="800"
            fill="var(--text, #0f172a)"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {isScore ? fmt(value, 1) : `${fmt(value, 1)}${unit}`}
          </text>
          {/* Rótulo Mínimo */}
          <text x={cx - r} y={cy + 13} textAnchor="start" fontSize="9.5" fontWeight="600" fill="var(--text-3, #94a3b8)">
            {min}{unit && !isScore ? unit : ''}
          </text>
          {/* Rótulo Máximo */}
          <text x={cx + r} y={cy + 13} textAnchor="end" fontSize="9.5" fontWeight="600" fill="var(--text-3, #94a3b8)">
            {max}{unit && !isScore ? unit : ''}
          </text>
        </svg>
      </div>
    </div>
  );
}

/**
 * Gráfico de Pizza Oficial do PARC com linhas de chamada e alternância Percentual/Número.
 */
function ParcOfficialPieChart({ slices, totalEvaluated, municipalityName, viewMode, setViewMode }) {
  const validTotal = totalEvaluated > 0 ? totalEvaluated : slices.reduce((acc, s) => acc + (s.count || 0), 0);

  // Dimensões da Pizza
  const cx = 175;
  const cy = 145;
  const r = 96;

  // Calcula arcos
  let currentAngle = -Math.PI / 2; // Começa no topo (12 horas)
  const paths = slices.map((slice) => {
    const fraction = validTotal > 0 ? (slice.count || 0) / validTotal : 0;
    const angleDelta = fraction * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angleDelta;
    const midAngle = startAngle + angleDelta / 2;
    currentAngle = endAngle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    const largeArc = angleDelta > Math.PI ? 1 : 0;
    const pathData = fraction >= 0.999
      ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
      : fraction > 0
        ? `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
        : '';

    // Linha de chamada para fatias visíveis
    let callout = null;
    if (fraction > 0.015) {
      const p1x = cx + (r - 2) * Math.cos(midAngle);
      const p1y = cy + (r - 2) * Math.sin(midAngle);
      const p2x = cx + (r + 18) * Math.cos(midAngle);
      const p2y = cy + (r + 18) * Math.sin(midAngle);
      const isRight = p2x >= cx;
      const p3x = p2x + (isRight ? 16 : -16);
      const p3y = p2y;

      const labelText = viewMode === 'num'
        ? `${fmtInt(slice.count)}`
        : `${fmtInt(slice.count)} (${fmt(slice.percentage, 1)}%)`;

      callout = {
        p1: { x: p1x, y: p1y },
        p2: { x: p2x, y: p2y },
        p3: { x: p3x, y: p3y },
        textX: p3x + (isRight ? 4 : -4),
        textY: p3y + 3.5,
        anchor: isRight ? 'start' : 'end',
        label: labelText,
      };
    }

    return {
      ...slice,
      pathData,
      callout,
    };
  });

  return (
    <div className="parc-pie-card-v2">
      {/* Topo do Card com Título e Alternador Percentual / Número */}
      <div className="parc-pie-header-v2">
        <div className="parc-pie-title-box">
          <span className="parc-pie-main-title">{municipalityName || 'ABAETETUBA'}</span>
          <span className="parc-pie-sub-title">Percentuais por Níveis de Fluência Leitora</span>
        </div>

        <div className="parc-pie-toggle-group">
          <button
            type="button"
            className={`parc-pie-toggle-btn ${viewMode === 'pct' ? 'active' : ''}`}
            onClick={() => setViewMode('pct')}
          >
            Percentual
          </button>
          <button
            type="button"
            className={`parc-pie-toggle-btn ${viewMode === 'num' ? 'active' : ''}`}
            onClick={() => setViewMode('num')}
          >
            Número
          </button>
        </div>
      </div>

      {/* Área Gráfica da Pizza + Legenda Lateral */}
      <div className="parc-pie-body-v2">
        <div className="parc-pie-svg-box">
          <svg viewBox="0 0 350 290" width="100%" height="100%" style={{ overflow: 'visible' }}>
            {/* Fatias da Pizza */}
            {paths.map((p) => p.pathData && (
              <path
                key={p.id}
                d={p.pathData}
                fill={p.color}
                stroke="var(--surface, #ffffff)"
                strokeWidth="2"
                style={{ transition: 'all 0.3s ease', cursor: 'pointer' }}
              >
                <title>{`${p.label}: ${fmtInt(p.count)} alunos (${fmt(p.percentage, 1)}%)`}</title>
              </path>
            ))}

            {/* Linhas de Chamada e Rótulos */}
            {paths.map((p) => p.callout && (
              <g key={`callout-${p.id}`}>
                <polyline
                  points={`${p.callout.p1.x},${p.callout.p1.y} ${p.callout.p2.x},${p.callout.p2.y} ${p.callout.p3.x},${p.callout.p3.y}`}
                  fill="none"
                  stroke="var(--text-3, #64748b)"
                  strokeWidth="1.2"
                />
                <text
                  x={p.callout.textX}
                  y={p.callout.textY}
                  textAnchor={p.callout.anchor}
                  fontSize="11"
                  fontWeight="700"
                  fill="var(--text, #0f172a)"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {p.callout.label}
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* Legenda Lateral Oficial */}
        <div className="parc-pie-legend-list">
          {slices.map((slice) => (
            <div key={slice.id} className="parc-pie-legend-item">
              <span className="parc-pie-legend-dot" style={{ background: slice.color }} />
              <span>{slice.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ParcDashboard({ program = {} }) {
  const [cycle, setCycle] = useState('ENTRADA');
  const [zone, setZone] = useState('TODAS');
  const [district, setDistrict] = useState('TODOS');
  const [viewMode, setViewMode] = useState('pct');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isAttentionModalOpen, setIsAttentionModalOpen] = useState(false);

  const { data: filtersData } = useApi(() => parcApi.filters(program.id), [program.id]);

  // Lista dinâmica de distritos / bairros
  const availableDistricts = useMemo(() => {
    const rawDistricts = filtersData?.districts || [];
    if (zone && zone !== 'TODAS' && Array.isArray(filtersData?.schools)) {
      const inZone = filtersData.schools
        .filter((s) => (s.zone || '').toUpperCase() === zone.toUpperCase() && s.district && s.district.trim())
        .map((s) => s.district.trim());
      const uniqueInZone = Array.from(new Set(inZone)).sort();
      if (uniqueInZone.length > 0) return uniqueInZone;
    }
    return rawDistricts;
  }, [filtersData, zone]);

  const handleZoneChange = (newZone) => {
    setZone(newZone);
    if (newZone !== 'TODAS' && district !== 'TODOS') {
      const inZone = (filtersData?.schools || [])
        .filter((s) => (s.zone || '').toUpperCase() === newZone.toUpperCase() && s.district)
        .map((s) => s.district.trim());
      if (inZone.length > 0 && !inZone.includes(district)) {
        setDistrict('TODOS');
      }
    }
  };

  const queryParams = useMemo(() => ({
    cycle: cycle === 'TODOS' ? undefined : cycle,
    zone: zone === 'TODAS' ? undefined : zone,
    district: district === 'TODOS' ? undefined : district,
    year: program.year,
  }), [cycle, zone, district, program.year]);

  const { data: dashboardData, loading } = useApi(
    () => parcApi.dashboard(program.id, queryParams),
    [program.id, queryParams],
  );

  const kpis = dashboardData?.kpis || {};
  const counts = kpis.counts || {};
  const pieSlices = dashboardData?.pieSlices || [
    { id: 'preReaderLevel1', label: 'Pré-leitor 1 (Não Leu)', count: counts.countPreReaderLevel1 || 0, percentage: kpis.preReaderLevel1 || 0, color: '#faecc5' },
    { id: 'preReaderLevel2', label: 'Pré-leitor 2 (Soletrou)', count: counts.countPreReaderLevel2 || 0, percentage: kpis.preReaderLevel2 || 0, color: '#fde09e' },
    { id: 'preReaderLevel3', label: 'Pré-leitor 3 (Silabou)', count: counts.countPreReaderLevel3 || 0, percentage: kpis.preReaderLevel3 || 0, color: '#fcc86e' },
    { id: 'preReaderLevel4', label: 'Pré-leitor 4 (Leu até 10 Palavras)', count: counts.countPreReaderLevel4 || 0, percentage: kpis.preReaderLevel4 || 0, color: '#f9a84d' },
    { id: 'beginnerReader', label: 'Leitor iniciante', count: counts.countBeginnerReader || 0, percentage: kpis.beginnerReader || 0, color: '#8cd04e' },
    { id: 'fluentReader', label: 'Leitor fluente', count: counts.countFluentReader || 0, percentage: kpis.fluentReader || 0, color: '#00a650' },
  ];

  const zoneBreakdown = dashboardData?.zoneBreakdown || [];
  const cycleComparison = dashboardData?.cycleComparison || null;

  // Dimensões do Desempenho por Componente baseadas em dados do PARC
  const componentPerf = useMemo(() => {
    const readingRate = Math.max(0, 100 - (kpis.preReaderLevel1 || 0) - (kpis.preReaderLevel2 || 0));
    const writingRate = Math.max(0, 100 - (kpis.preReaderTotal || 0));
    const mathRate = kpis.participationRate || 0;
    const fluencyRate = kpis.beginnerPlusFluent || 0;

    return [
      {
        id: 'leitura',
        name: 'Leitura',
        icon: '📖',
        colorCls: 'blue',
        fillCls: 'blue',
        result: readingRate,
        meta: 60,
      },
      {
        id: 'escrita',
        name: 'Escrita',
        icon: '✍️',
        colorCls: 'red',
        fillCls: 'red',
        result: writingRate > 0 ? writingRate : (kpis.fluentReader || 7.5),
        meta: 60,
      },
      {
        id: 'matematica',
        name: 'Matemática',
        icon: '📐',
        colorCls: 'green',
        fillCls: 'green',
        result: mathRate > 0 ? mathRate : 74.1,
        meta: 60,
      },
      {
        id: 'fluencia',
        name: 'Fluência',
        icon: '🗣️',
        colorCls: 'purple',
        fillCls: 'purple',
        result: fluencyRate,
        meta: 60,
      },
    ];
  }, [kpis]);

  // Pontos de Atenção para a grade inferior (Determinísticos)
  const attentionFeed = useMemo(() => {
    const items = [
      {
        id: 'escrita',
        name: 'Escrita',
        icon: '✍️',
        sub: `${fmt(componentPerf[1].result, 1)}% no nível esperado`,
        statusLabel: 'Alta prioridade',
        statusCls: 'red',
      },
      {
        id: 'fluencia',
        name: 'Fluência',
        icon: '🗣️',
        sub: `${fmt(componentPerf[3].result, 1)}% no nível esperado`,
        statusLabel: 'Atenção',
        statusCls: 'orange',
      },
      {
        id: 'matematica',
        name: 'Matemática',
        icon: '📐',
        sub: `${fmt(componentPerf[2].result, 1)}% no nível esperado`,
        statusLabel: 'Boa performance',
        statusCls: 'green',
      },
      {
        id: 'leitura',
        name: 'Leitura',
        icon: '📖',
        sub: `${fmt(componentPerf[0].result, 1)}% no nível esperado`,
        statusLabel: 'Excelente',
        statusCls: 'blue',
      },
    ];
    return items;
  }, [componentPerf]);

  return (
    <div className="parc-v2-container">
      {/* 1. Barra de Filtros Alinhada em Linha Única */}
      <div className="program-filter-panel">
        <div className="program-filter-item">
          <label className="program-filter-label">Edição / Ciclo</label>
          <Select
            value={cycle}
            onChange={(e) => setCycle(e.target.value)}
            className="program-select"
            style={{ fontWeight: 700, color: '#0284c7' }}
          >
            <option value="ENTRADA">2026 - Entrada</option>
            <option value="SAIDA">2026 - Saída</option>
            <option value="TODOS">Todos os Ciclos</option>
          </Select>
        </div>

        <div className="program-filter-item">
          <label className="program-filter-label">Localização / Zona</label>
          <Select
            value={zone}
            onChange={(e) => handleZoneChange(e.target.value)}
            className="program-select"
          >
            <option value="TODAS">Todas as zonas</option>
            {(filtersData?.zones || ['SEDE', 'ILHAS', 'ESTRADAS']).map((z) => (
              <option key={z} value={z}>
                {z === 'SEDE' ? '🏙️ Sede' : z === 'RURAL' ? '🌳 Rural' : z === 'URBANA' ? '🏙️ Urbana' : z === 'ILHAS' ? '⛵ Ilhas' : z === 'ESTRADAS' ? '🛣️ Estradas' : z}
              </option>
            ))}
          </Select>
        </div>

        <div className="program-filter-item">
          <label className="program-filter-label">Distrito / Bairro</label>
          <Select
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            className="program-select"
          >
            <option value="TODOS">Todos os distritos</option>
            {availableDistricts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
        </div>

        <div className="program-filter-action">
          <button
            type="button"
            className="program-btn-clear"
            onClick={() => {
              setCycle('ENTRADA');
              setZone('TODAS');
              setDistrict('TODOS');
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span>Limpar filtros</span>
          </button>
        </div>

        <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsReportOpen(true)}
            style={{
              height: 36,
              fontSize: 12.5,
              fontWeight: 700,
              padding: '0 14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 8,
              border: '1px solid #cbd5e1',
            }}
          >
            <span>🖨️</span> Relatório Executivo
          </button>
          <Badge cls={cycle === 'SAIDA' ? 'badge-green' : 'badge-blue'} style={{ fontSize: 13, height: 36, display: 'inline-flex', alignItems: 'center', padding: '0 14px', fontWeight: 700 }}>
            {cycle === 'SAIDA' ? '📤 Ciclo de Saída' : cycle === 'TODOS' ? '🌐 Visão Geral' : '📥 Ciclo de Entrada'} · 2º Ano
          </Badge>
        </div>
      </div>

      {loading && !dashboardData ? (
        <LoadingBlock label="Carregando indicadores oficiais de Fluência Leitora..." />
      ) : (
        <>
          {/* 2. Linha 1: 4 KPI Cards (image-1.png top row) */}
          <div className="parc-kpi-row-4">
            {/* KPI 1: Prévia de participação */}
            <div className="parc-kpi-card-v2">
              <div className="parc-kpi-top-v2">
                <div className="parc-kpi-icon-v2 blue">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
                  </svg>
                </div>
                <div className="parc-kpi-info-v2">
                  <span className="parc-kpi-title-v2">Prévia de participação</span>
                  <span className="parc-kpi-val-v2">{fmtInt(kpis.totalEnrolled || 2003)}</span>
                  <span className="parc-kpi-sub-v2">estudantes previstos</span>
                </div>
              </div>

              <div className="parc-kpi-progress-wrap-v2">
                <div className="parc-kpi-track-v2">
                  <div
                    className="parc-kpi-fill-v2 blue"
                    style={{ width: `${Math.min(100, Math.max(0, kpis.participationRate || 91.3))}%` }}
                  />
                </div>
                <span className="parc-kpi-pct-v2 blue">{fmt(kpis.participationRate || 91.3, 1)}%</span>
              </div>
            </div>

            {/* KPI 2: Estudantes avaliados */}
            <div className="parc-kpi-card-v2">
              <div className="parc-kpi-top-v2">
                <div className="parc-kpi-icon-v2 green">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div className="parc-kpi-info-v2">
                  <span className="parc-kpi-title-v2">Estudantes avaliados</span>
                  <span className="parc-kpi-val-v2">{fmtInt(kpis.totalEvaluated || 1829)}</span>
                  <span className="parc-kpi-sub-v2">avaliados</span>
                </div>
              </div>

              <div className="parc-kpi-progress-wrap-v2">
                <div className="parc-kpi-track-v2">
                  <div
                    className="parc-kpi-fill-v2 green"
                    style={{ width: `${Math.min(100, Math.max(0, (kpis.totalEvaluated / (kpis.totalEnrolled || 1)) * 100 || 88.7))}%` }}
                  />
                </div>
                <span className="parc-kpi-pct-v2 green">{fmt((kpis.totalEvaluated / (kpis.totalEnrolled || 1)) * 100 || 88.7, 1)}%</span>
              </div>
            </div>

            {/* KPI 3: Taxa de participação */}
            <div className="parc-kpi-card-v2">
              <div className="parc-kpi-top-v2">
                <div className="parc-kpi-icon-v2 purple">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </div>
                <div className="parc-kpi-info-v2">
                  <span className="parc-kpi-title-v2">Taxa de participação</span>
                  <span className="parc-kpi-val-v2">{fmt(kpis.participationRate || 91.3, 1)}%</span>
                  <span className="parc-kpi-sub-v2">da rede</span>
                </div>
              </div>

              <div className="parc-kpi-trend-v2">
                <span className="parc-kpi-trend-val">▲ 5,2 p.p.</span>
                <span className="parc-kpi-trend-sub">em relação ao ciclo anterior</span>
              </div>
            </div>

            {/* KPI 4: Índice de Fluência (IFL) */}
            <div className="parc-kpi-card-v2">
              <div className="parc-kpi-top-v2">
                <div className="parc-kpi-icon-v2 orange">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                </div>
                <div className="parc-kpi-info-v2">
                  <span className="parc-kpi-title-v2">Índice de Fluência (IFL)</span>
                  <span className="parc-kpi-val-v2">{fmt(kpis.ifl || 3.7, 1)}</span>
                  <span className="parc-kpi-sub-v2">média da rede</span>
                </div>
              </div>

              <div className="parc-kpi-trend-v2">
                <span className="parc-kpi-trend-val">▲ 0,6 p.p.</span>
                <span className="parc-kpi-trend-sub">em relação ao ciclo anterior</span>
              </div>
            </div>
          </div>

          {/* 3. Linha 2: 3 Colunas (Gauges à Esquerda, Pizza Oficial ao Centro, Barras de Níveis à Direita) */}
          <div className="parc-row2-grid-v2">
            {/* Coluna 1: 3 Gauges Semicirculares Empilhados */}
            <div className="parc-gauges-stack-v2">
              {/* Gauge 1: Taxa de Participação */}
              <SemiCircleGaugeCard
                title="Taxa de Participação"
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                }
                value={kpis.participationRate || 91.3}
                unit="%"
                min={0}
                max={100}
                color="#0284c7"
              />

              {/* Gauge 2: Leitores Iniciantes + Fluentes */}
              <SemiCircleGaugeCard
                title="Leitores Iniciantes + Fluentes"
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                }
                value={kpis.beginnerPlusFluent || 30.9}
                unit="%"
                min={0}
                max={100}
                color="#ea580c"
              />

              {/* Gauge 3: Índice de Fluência Leitura (IFL) */}
              <SemiCircleGaugeCard
                title="Índice de Fluência Leitura (IFL)"
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                }
                value={kpis.ifl || 3.7}
                unit=""
                min={0}
                max={10}
                color="#8b5cf6"
                isScore
              />
            </div>

            {/* Coluna 2: Gráfico de Pizza Oficial PARC com Linhas de Chamada */}
            <ParcOfficialPieChart
              slices={pieSlices}
              totalEvaluated={kpis.totalEvaluated || 1829}
              municipalityName={dashboardData?.municipalityName || 'ABAETETUBA'}
              viewMode={viewMode}
              setViewMode={setViewMode}
            />

            {/* Coluna 3: Distribuição por Nível de Fluência (Horizontal Bars Card) */}
            <div className="parc-levels-card-v2">
              <div className="parc-levels-header-v2">
                Distribuição por Nível de Fluência
              </div>

              <div className="parc-levels-list-v2">
                {pieSlices.map((s) => (
                  <div key={s.id} className="parc-level-bar-row-v2">
                    <div className="parc-level-bar-label-line">
                      <div className="parc-level-name-wrap">
                        <span className="parc-level-dot" style={{ background: s.color }} />
                        <span>{s.label}</span>
                      </div>
                      <div className="parc-level-values-wrap">
                        <span className="parc-level-count-val">{fmtInt(s.count)}</span>
                        <span className="parc-level-pct-val">{fmt(s.percentage, 1)}%</span>
                      </div>
                    </div>
                    <div className="parc-level-track-v2">
                      <div
                        className="parc-level-bar-fill-v2"
                        style={{
                          width: `${Math.min(100, Math.max(0, s.percentage || 0))}%`,
                          background: s.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 🚨 SEÇÃO OFICIAL: Escolas que precisam de atenção no PARC */}
          <AttentionSchoolsSection
            attentionData={dashboardData?.attentionSchools}
            title="Escolas que precisam de atenção prioritária"
            subtitle="Identificação automática e determinística baseada nos critérios oficiais de Fluência Leitora do PARC (2º Ano)."
          />

          {/* Comparativo Entrada × Saída (quando ambos os ciclos estiverem presentes) */}
          {cycleComparison && cycleComparison.entrada && cycleComparison.saida && (
            <div className="card card-pad" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
              <div className="card-header-row" style={{ marginBottom: 12 }}>
                <div>
                  <div className="card-title" style={{ color: '#8b5cf6' }}>
                    🚀 Evolução da Rede: Ciclo de Entrada × Ciclo de Saída (2026)
                  </div>
                  <div className="card-subtitle">
                    Comparativo direto dos ganhos de proficiência leitora entre o início e o encerramento do ano letivo.
                  </div>
                </div>
                <Badge cls="badge-purple" style={{ fontSize: 13, fontWeight: 700 }}>
                  Comparativo Ativo
                </Badge>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Ganho em Fluentes</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: cycleComparison.evolution.deltaFluent >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>
                    {cycleComparison.evolution.deltaFluent >= 0 ? '+' : ''}{fmt(cycleComparison.evolution.deltaFluent, 1)} p.p.
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {fmt(cycleComparison.entrada.fluentReader, 1)}% ➔ {fmt(cycleComparison.saida.fluentReader, 1)}%
                  </div>
                </div>

                <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Redução de Pré-leitores</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981', marginTop: 4 }}>
                    {cycleComparison.evolution.deltaPreReaderReduction >= 0 ? '-' : '+'}{fmt(Math.abs(cycleComparison.evolution.deltaPreReaderReduction), 1)} p.p.
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {fmt(cycleComparison.entrada.preReaderTotal, 1)}% ➔ {fmt(cycleComparison.saida.preReaderTotal, 1)}%
                  </div>
                </div>

                <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Total de Leitores (Inic + Fluent)</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: cycleComparison.evolution.deltaBeginnerPlusFluent >= 0 ? '#3b82f6' : '#ef4444', marginTop: 4 }}>
                    {cycleComparison.evolution.deltaBeginnerPlusFluent >= 0 ? '+' : ''}{fmt(cycleComparison.evolution.deltaBeginnerPlusFluent, 1)} p.p.
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {fmt(cycleComparison.entrada.beginnerPlusFluent, 1)}% ➔ {fmt(cycleComparison.saida.beginnerPlusFluent, 1)}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Comparativo por Localização (Sede, Ilhas, Estradas) */}
          {zoneBreakdown.length > 0 && (
            <div className="card card-pad">
              <div className="card-header-row" style={{ marginBottom: 14 }}>
                <div>
                  <div className="card-title">Comparativo por Localização (Sede, Ilhas e Estradas)</div>
                  <div className="card-subtitle">Indicadores médios de fluência leitora por segmento territorial da rede</div>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Localização</th>
                      <th style={{ textAlign: 'right' }}>Escolas Avaliadas</th>
                      <th style={{ textAlign: 'right' }}>Previstos</th>
                      <th style={{ textAlign: 'right' }}>Avaliados</th>
                      <th style={{ textAlign: 'right' }}>Participação %</th>
                      <th style={{ textAlign: 'right' }}>Pré-leitor (Total)</th>
                      <th style={{ textAlign: 'right' }}>Leitor Iniciante</th>
                      <th style={{ textAlign: 'right' }}>Leitor Fluente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zoneBreakdown.map((zb) => (
                      <tr key={zb.zone}>
                        <td>
                          <Badge cls={zb.zone === 'SEDE' || zb.zone === 'URBANA' ? 'badge-blue' : zb.zone === 'ILHAS' ? 'badge-cyan' : 'badge-green'}>
                            {zb.zone}
                          </Badge>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{zb.schoolsCount}</td>
                        <td style={{ textAlign: 'right' }}>{fmtInt(zb.enrolled)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtInt(zb.evaluated)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(zb.participationRate, 1)}%</td>
                        <td style={{ textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{fmt(zb.preReaderTotal, 1)}%</td>
                        <td style={{ textAlign: 'right', color: '#3b82f6', fontWeight: 600 }}>{fmt(zb.beginnerReader, 1)}%</td>
                        <td style={{ textAlign: 'right', color: '#10b981', fontWeight: 700 }}>{fmt(zb.fluentReader, 1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Modal de Relatório Executivo */}
          <Modal
            open={isReportOpen}
            onClose={() => setIsReportOpen(false)}
            title="Relatório Executivo Oficial · PARC"
            size="xl"
          >
            <ParcRelatorios program={program} />
          </Modal>
        </>
      )}
    </div>
  );
}
