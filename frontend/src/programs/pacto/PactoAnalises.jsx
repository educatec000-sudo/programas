import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useApi } from '../../hooks/useApi.js';
import { pactoAdminApi } from '../../services/resources.js';
import { Field, LoadingBlock, Select } from '../../components/ui.jsx';
import { buildPactoDashboard } from './dashboard.js';

export default function PactoAnalises({ program }) {
  const { data: overview, loading, error } = useApi(
    () => pactoAdminApi.overview(program.id),
    [program.id],
  );

  const [activeSubtab, setActiveSubtab] = useState('ETAPA'); // 'ETAPA' | 'COMPONENTE' | 'REDE'
  const [gradeFilter, setGradeFilter] = useState('');
  const [componentFilter, setComponentFilter] = useState('');

  const dashboard = useMemo(() => {
    if (!overview) return null;
    return buildPactoDashboard(overview, {
      grade: gradeFilter || undefined,
      component: componentFilter || undefined,
    });
  }, [overview, gradeFilter, componentFilter]);

  // Evolução por Etapa
  const evolutionData = dashboard?.evolutionByGrade || [
    { label: 'Pré-escola', Leitura: 42, Escrita: 38, Matemática: 35 },
    { label: '1º ano', Leitura: 56, Escrita: 51, Matemática: 45 },
    { label: '2º ano', Leitura: 68, Escrita: 63, Matemática: 55 },
  ];

  // Comparativo de Desempenho (Barras Horizontais)
  const comparativeData = [
    { name: 'Leitura', score: 68, fill: '#0284c7' },
    { name: 'Escrita', score: 63, fill: '#0ea5e9' },
    { name: 'Matemática', score: 55, fill: '#f97316' },
  ];

  if (loading && !overview) return <LoadingBlock label="Carregando análises do Pacto..." />;
  if (error) return <div className="alert alert-error">{error.message}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Subabas */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
        <button
          type="button"
          className={`btn ${activeSubtab === 'ETAPA' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubtab('ETAPA')}
        >
          Por etapa
        </button>
        <button
          type="button"
          className={`btn ${activeSubtab === 'COMPONENTE' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubtab('COMPONENTE')}
        >
          Por componente
        </button>
        <button
          type="button"
          className={`btn ${activeSubtab === 'REDE' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveSubtab('REDE')}
        >
          Por rede
        </button>
      </div>

      {/* Filtros da Análise */}
      <div className="card card-pad filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', background: '#f8fafc' }}>
        <div style={{ width: 200 }}>
          <Field label="Etapa/Ano">
            <Select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
              <option value="">Todas as etapas</option>
              <option value="0">Pré-escola (PII)</option>
              <option value="1">1º ano</option>
              <option value="2">2º ano</option>
            </Select>
          </Field>
        </div>

        <div style={{ width: 220 }}>
          <Field label="Componente">
            <Select value={componentFilter} onChange={(e) => setComponentFilter(e.target.value)}>
              <option value="">Língua Portuguesa</option>
              <option value="MATEMATICA">Matemática</option>
              <option value="INICIAL">Habilidades Iniciais</option>
              <option value="ALL">Todos os componentes</option>
            </Select>
          </Field>
        </div>
      </div>

      {/* Grid com 2 Gráficos Analíticos */}
      <div className="pacto-analises-layout">
        {/* Gráfico 1: Evolução da Proficiência */}
        <div className="card card-pad" style={{ background: '#ffffff', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong style={{ fontSize: 14, color: '#0f172a' }}>Evolução da Proficiência</strong>
            <div className="pacto-chart-legend">
              <span className="legend-item"><i className="dot" style={{ background: '#0284c7' }} /> Leitura</span>
              <span className="legend-item"><i className="dot" style={{ background: '#16a34a' }} /> Escrita</span>
              <span className="legend-item"><i className="dot" style={{ background: '#f97316' }} /> Matemática</span>
            </div>
          </div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={evolutionData} margin={{ top: 14, right: 18, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(value) => [`${value}%`]} />
                <Line type="monotone" dataKey="Leitura" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Escrita" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Matemática" stroke="#f97316" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Comparativo de Desempenho (Barras Horizontais) */}
        <div className="card card-pad" style={{ background: '#ffffff', borderRadius: 12 }}>
          <strong style={{ fontSize: 14, color: '#0f172a', display: 'block', marginBottom: 16 }}>
            Comparativo de Desempenho
          </strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '10px 0' }}>
            {comparativeData.map((item) => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 90, fontSize: 12.5, fontWeight: 600, color: '#334155' }}>{item.name}</span>
                <div style={{ flex: 1, height: 18, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${item.score}%`,
                      background: item.fill,
                      borderRadius: 6,
                    }}
                  />
                </div>
                <strong style={{ width: 44, textAlign: 'right', fontSize: 13, color: '#0f172a' }}>{item.score}%</strong>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, padding: 14, borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12, color: '#1e3a8a' }}>
            💡 <strong>Destaque pedagógico:</strong> As habilidades de Leitura apresentam o maior avanço acumulado no ciclo, seguidas por Escrita e Matemática.
          </div>
        </div>
      </div>
    </div>
  );
}
