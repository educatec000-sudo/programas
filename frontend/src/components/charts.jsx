import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
} from 'recharts';
import { CLASSIFICATION_INFO } from '../utils/format.js';

export const CHART_COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#d97706', '#16a34a', '#dc2626', '#475569', '#c026d3'];

const tooltipStyle = {
  borderRadius: 10,
  border: '1px solid var(--border)',
  boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
  fontSize: 12.5,
  fontFamily: 'inherit',
};

function ChartFrame({ title, subtitle, right, children, height = 260 }) {
  return (
    <div className="card card-pad">
      <div className="card-header-row">
        <div>
          <div className="card-title">{title}</div>
          {subtitle && <div className="card-subtitle">{subtitle}</div>}
        </div>
        {right}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

export function EvolutionChart({ title, subtitle, data, right, height }) {
  return (
    <ChartFrame title={title || 'Evolução temporal'} subtitle={subtitle} right={right} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
          <defs>
            <linearGradient id="gradScore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
          <YAxis domain={[0, 120]} tick={{ fontSize: 11.5, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v, name) => [name === 'score' ? `${v}% da meta` : v, name === 'score' ? 'Pontuação' : name]}
          />
          <Area type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2.5} fill="url(#gradScore)" dot={{ r: 3.5 }} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function ComparisonBarChart({ title, subtitle, data, nameKey = 'name', valueKey = 'score', right, height, domain }) {
  return (
    <ChartFrame title={title} subtitle={subtitle} right={right} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey={nameKey}
            tick={{ fontSize: 10.5, fill: '#64748b' }}
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
            interval={0}
            angle={data.length > 7 ? -28 : 0}
            textAnchor={data.length > 7 ? 'end' : 'middle'}
            height={data.length > 7 ? 52 : 30}
          />
          <YAxis domain={domain || [0, 120]} tick={{ fontSize: 11.5, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}`, 'Pontuação']} />
          <Bar dataKey={valueKey} radius={[6, 6, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={
                  entry.color ||
                  (entry[valueKey] >= 100
                    ? '#16a34a'
                    : entry[valueKey] >= 80
                      ? '#65a30d'
                      : entry[valueKey] >= 60
                        ? '#d97706'
                        : '#dc2626')
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function ClassificationDonut({ title, subtitle, distribution, right, height }) {
  const data = Object.entries(distribution || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({
      name: `${k} — ${CLASSIFICATION_INFO[k]?.label || k}`,
      value: v,
      color: CLASSIFICATION_INFO[k]?.color || '#94a3b8',
    }));
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <ChartFrame
      title={title || 'Distribuição de classificações'}
      subtitle={subtitle || (total ? `${total} escolas avaliadas` : '')}
      right={right}
      height={height}
    >
      {total === 0 ? (
        <div className="centered" style={{ minHeight: 160 }}>Sem dados no período</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={3}
              strokeWidth={0}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [`${v} escola(s)`, name]} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

export function MultiLineChart({ title, subtitle, series, labels, right, height }) {
  // series: [{ name, color, points: [y...] }], labels: [x...]
  const data = labels.map((label, i) => {
    const point = { label };
    for (const s of series) point[s.name] = s.points[i];
    return point;
  });
  return (
    <ChartFrame title={title} subtitle={subtitle} right={right} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
          <YAxis domain={[0, 120]} tick={{ fontSize: 11.5, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}`, 'Pontuação']} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={s.color || CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2.2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
