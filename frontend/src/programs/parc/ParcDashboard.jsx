import React, { useState, useMemo } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { parcApi } from '../../services/resources.js';
import { Badge, Field, LoadingBlock, Select } from '../../components/ui.jsx';
import { fmt, fmtInt } from '../../utils/format.js';

/**
 * Componente de Velocímetro / Gauge Semicircular oficial do PARC.
 */
function SemiCircleGauge({ title, value, unit = '%', min = 0, max = 100, color = '#0284c7', isScore = false }) {
  const numericVal = typeof value === 'number' ? value : parseFloat(String(value || '').replace(',', '.'));
  const validVal = Number.isFinite(numericVal) ? numericVal : 0;
  const ratio = Math.max(0, Math.min(1, (validVal - min) / (max - min || 1)));

  // Raio e perímetro do arco semicircular
  const r = 70;
  const cx = 95;
  const cy = 85;
  const arcLength = Math.PI * r; // ~219.91
  const dashOffset = arcLength * (1 - ratio);

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          color: '#475569',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          textAlign: 'center',
          marginBottom: 4,
        }}
      >
        {title}
      </div>

      <div style={{ position: 'relative', width: 190, height: 105, display: 'flex', justifyContent: 'center' }}>
        <svg viewBox="0 0 190 105" width="190" height="105">
          {/* Arco de Fundo Cinza */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="18"
            strokeLinecap="round"
          />
          {/* Arco Colorido de Preenchimento */}
          {ratio > 0 && (
            <path
              d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
              fill="none"
              stroke={color}
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={`${arcLength} ${arcLength}`}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          )}
          {/* Valor Central */}
          <text
            x={cx}
            y={cy - 12}
            textAnchor="middle"
            fontSize="25"
            fontWeight="800"
            fill="#1e293b"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {isScore ? fmt(value, 1) : `${fmt(value, 1)}${unit}`}
          </text>
          {/* Rótulo Mínimo (0 ou 0%) */}
          <text x={cx - r} y={cy + 16} textAnchor="start" fontSize="10.5" fontWeight="600" fill="#94a3b8">
            {min}{unit && !isScore ? unit : ''}
          </text>
          {/* Rótulo Máximo (100% ou 10) */}
          <text x={cx + r} y={cy + 16} textAnchor="end" fontSize="10.5" fontWeight="600" fill="#94a3b8">
            {max}{unit && !isScore ? unit : ''}
          </text>
        </svg>
      </div>
    </div>
  );
}

/**
 * Gráfico de Pizza Oficial do PARC com linhas de chamada e percentuais por nível.
 */
function ParcOfficialPieChart({ slices, totalEvaluated, municipalityName }) {
  const validTotal = totalEvaluated > 0 ? totalEvaluated : slices.reduce((acc, s) => acc + (s.count || 0), 0);

  // Dimensões do SVG
  const width = 640;
  const height = 400;
  const cx = 230;
  const cy = 200;
  const r = 135;

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

    // Linha de chamada para fatias com dados
    let callout = null;
    if (fraction > 0.015) {
      const p1x = cx + (r - 2) * Math.cos(midAngle);
      const p1y = cy + (r - 2) * Math.sin(midAngle);
      const p2x = cx + (r + 26) * Math.cos(midAngle);
      const p2y = cy + (r + 26) * Math.sin(midAngle);
      const isRight = p2x >= cx;
      const p3x = p2x + (isRight ? 18 : -18);
      const p3y = p2y;

      callout = {
        p1: { x: p1x, y: p1y },
        p2: { x: p2x, y: p2y },
        p3: { x: p3x, y: p3y },
        textX: p3x + (isRight ? 5 : -5),
        textY: p3y + 4,
        anchor: isRight ? 'start' : 'end',
        label: `${fmtInt(slice.count)} (${fmt(slice.percentage, 1)}%)`,
      };
    }

    return {
      ...slice,
      pathData,
      callout,
    };
  });

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        flex: 1,
        minWidth: 460,
      }}
    >
      {/* Título do Gráfico */}
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', letterSpacing: 0.5 }}>
          {municipalityName || 'ABAETETUBA'}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', letterSpacing: 0.5 }}>
          PERCENTUAIS POR NÍVEIS DE FLUÊNCIA LEITORA
        </div>
      </div>

      {/* Área Gráfica + Legenda */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', width: '100%', gap: 16 }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: 440, height: 350 }}>
          <svg viewBox="0 0 460 360" width="100%" height="100%" style={{ overflow: 'visible' }}>
            {/* Fatias da Pizza */}
            {paths.map((p) => p.pathData && (
              <path
                key={p.id}
                d={p.pathData}
                fill={p.color}
                stroke="#ffffff"
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
                  stroke="#64748b"
                  strokeWidth="1.2"
                />
                <text
                  x={p.callout.textX}
                  y={p.callout.textY}
                  textAnchor={p.callout.anchor}
                  fontSize="12"
                  fontWeight="700"
                  fill="#0f172a"
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {p.callout.label}
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* Legenda Lateral Oficial */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 230, paddingLeft: 10 }}>
          {slices.map((slice) => (
            <div key={slice.id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
              <span
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: '50%',
                  background: slice.color,
                  border: '1px solid rgba(0,0,0,0.1)',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: '#334155', fontWeight: 600 }}>{slice.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ParcDashboard({ program }) {
  const [cycle, setCycle] = useState('ENTRADA');
  const [zone, setZone] = useState('TODAS');
  const [district, setDistrict] = useState('TODOS');
  const [year, setYear] = useState('');

  const { data: filtersData } = useApi(() => parcApi.filters(program.id), [program.id]);

  // Lista dinâmica e reativa de distritos / bairros
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
    year: year || program.year,
  }), [cycle, zone, district, year, program.year]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Barra Superior de Título Oficial e Filtros */}
      <div className="card card-pad" style={{ background: '#f8fafc', padding: '16px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            AVALIAÇÃO DE FLUÊNCIA LEITORA
          </h2>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', justifyContent: 'flex-start' }}>
          <Field label="Edição" style={{ minWidth: 180, margin: 0 }}>
            <Select
              value={cycle}
              onChange={(e) => setCycle(e.target.value)}
              style={{ fontWeight: 700, color: '#0284c7', borderColor: '#0284c7' }}
            >
              <option value="ENTRADA">2026 - Entrada</option>
              <option value="SAIDA">2026 - Saída</option>
              <option value="TODOS">Todos os Ciclos</option>
            </Select>
          </Field>

          <Field label="Localização / Zona" style={{ minWidth: 170, margin: 0 }}>
            <Select value={zone} onChange={(e) => handleZoneChange(e.target.value)}>
              <option value="TODAS">Todas as zonas</option>
              {(filtersData?.zones || ['SEDE', 'ILHAS', 'ESTRADAS']).map((z) => (
                <option key={z} value={z}>
                  {z === 'SEDE' ? '🏙️ Sede' : z === 'RURAL' ? '🌳 Rural' : z === 'URBANA' ? '🏙️ Urbana' : z === 'ILHAS' ? '⛵ Ilhas' : z === 'ESTRADAS' ? '🛣️ Estradas' : z}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Distrito / Bairro" style={{ minWidth: 200, margin: 0 }}>
            <Select value={district} onChange={(e) => setDistrict(e.target.value)}>
              <option value="TODOS">Todos os distritos</option>
              {availableDistricts.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
          </Field>

          <div style={{ marginLeft: 'auto', alignSelf: 'center', display: 'flex', gap: 8 }}>
            <Badge cls={cycle === 'SAIDA' ? 'badge-green' : 'badge-blue'} style={{ fontSize: 13, padding: '6px 12px', fontWeight: 700 }}>
              {cycle === 'SAIDA' ? '📤 Ciclo de Saída' : cycle === 'TODOS' ? '🌐 Visão Geral' : '📥 Ciclo de Entrada'} · 2º Ano
            </Badge>
          </div>
        </div>
      </div>

      {loading && !dashboardData ? (
        <LoadingBlock label="Carregando indicadores oficiais de Fluência Leitora..." />
      ) : (
        <>
          {/* Layout Principal em 2 Colunas: Coluna de Gauges à Esquerda + Gráfico de Pizza Oficial à Direita */}
          <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: 16, alignItems: 'stretch' }}>
            {/* Coluna Esquerda: Previstos / Avaliados + 3 Gauges Oficiais */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Cards Previstos e Avaliados */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: '12px 10px',
                    textAlign: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
                    {fmtInt(kpis.totalEnrolled || 0)}
                  </div>
                  <div style={{ fontSize: 11, fontStyle: 'italic', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginTop: 2 }}>
                    PREVISTOS
                  </div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: '12px 10px',
                    textAlign: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
                    {fmtInt(kpis.totalEvaluated || 0)}
                  </div>
                  <div style={{ fontSize: 11, fontStyle: 'italic', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginTop: 2 }}>
                    AVALIADOS
                  </div>
                </div>
              </div>

              {/* Gauge 1: TAXA DE PARTICIPAÇÃO */}
              <SemiCircleGauge
                title="TAXA DE PARTICIPAÇÃO"
                value={kpis.participationRate || 0}
                unit="%"
                min={0}
                max={100}
                color="#0080ff"
              />

              {/* Gauge 2: LEITORES INICIANTES + FLUENTES */}
              <SemiCircleGauge
                title="LEITORES INICIANTES + FLUENTES"
                value={kpis.beginnerPlusFluent || 0}
                unit="%"
                min={0}
                max={100}
                color="#ea580c"
              />

              {/* Gauge 3: ÍNDICE DE FLUÊNCIA LEITORA (IFL) */}
              <SemiCircleGauge
                title="ÍNDICE DE FLUÊNCIA LEITORA (IFL)"
                value={kpis.ifl || 0}
                unit=""
                min={0}
                max={10}
                color="#ea580c"
                isScore
              />
            </div>

            {/* Coluna Direita: Gráfico de Pizza Oficial */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <ParcOfficialPieChart
                slices={pieSlices}
                totalEvaluated={kpis.totalEvaluated || 0}
                municipalityName={dashboardData?.municipalityName || 'ABAETETUBA'}
              />
            </div>
          </div>

          {/* Comparativo Entrada × Saída (quando ambos os ciclos estiverem presentes) */}
          {cycleComparison && cycleComparison.entrada && cycleComparison.saida && (
            <div className="card card-pad" style={{ background: '#faf5ff', borderColor: '#d8b4fe' }}>
              <div className="card-header-row" style={{ marginBottom: 12 }}>
                <div>
                  <div className="card-title" style={{ color: '#6b21a8' }}>
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
                <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e9d5ff' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Ganho em Fluentes</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: cycleComparison.evolution.deltaFluent >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>
                    {cycleComparison.evolution.deltaFluent >= 0 ? '+' : ''}{fmt(cycleComparison.evolution.deltaFluent, 1)} p.p.
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {fmt(cycleComparison.entrada.fluentReader, 1)}% ➔ {fmt(cycleComparison.saida.fluentReader, 1)}%
                  </div>
                </div>

                <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e9d5ff' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Redução de Pré-leitores</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981', marginTop: 4 }}>
                    {cycleComparison.evolution.deltaPreReaderReduction >= 0 ? '-' : '+'}{fmt(Math.abs(cycleComparison.evolution.deltaPreReaderReduction), 1)} p.p.
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {fmt(cycleComparison.entrada.preReaderTotal, 1)}% ➔ {fmt(cycleComparison.saida.preReaderTotal, 1)}%
                  </div>
                </div>

                <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e9d5ff' }}>
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
                  <div className="card-subtitle">Indicadores médios por segmento de rede territorial</div>
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
        </>
      )}
    </div>
  );
}
