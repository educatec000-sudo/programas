import React, { useState } from 'react';
import { useToast } from '../../contexts/ToastContext.jsx';
import { Button } from '../../components/ui.jsx';
import { reportsApi } from '../../services/resources.js';

export default function CncaRelatorios({ program }) {
  const { toast, error } = useToast();
  const [busy, setBusy] = useState('');

  const generate = async (type) => {
    setBusy(type);
    try {
      const filename = await reportsApi.generate(type, {
        programId: program.id,
        year: program.year,
        format: 'pdf',
      });
      toast(`Relatório gerado: ${filename}`, { type: 'success', title: 'Download iniciado' });
    } catch (err) {
      error(err.message || 'Erro ao gerar relatório.');
    } finally {
      setBusy('');
    }
  };

  const reports = [
    {
      id: 'programa',
      icon: '📋',
      title: 'Relatório Executivo do CNCA',
      desc: 'Síntese executiva com indicadores de cobertura, proficiência e alfabetização.',
    },
    {
      id: 'ranking',
      icon: '🏆',
      title: 'Ranking Oficial de Escolas',
      desc: 'Classificação completa das escolas municipais participantes do CNCA.',
    },
    {
      id: 'resultados',
      icon: '🧾',
      title: 'Boletim de Resultados por Componente',
      desc: 'Desempenho consolidado nos componentes Leitura, Escrita, Matemática e Fluência.',
    },
    {
      id: 'evolucao',
      icon: '📈',
      title: 'Evolução e Comparativo entre Edições',
      desc: 'Acompanhamento histórico do avanço dos estudantes ao longo das avaliações.',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
      {reports.map((r) => (
        <div key={r.id} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <span style={{ fontSize: 28 }}>{r.icon}</span>
            <div className="card-title" style={{ marginTop: 8 }}>{r.title}</div>
            <div className="card-subtitle" style={{ minHeight: 40, marginTop: 4 }}>{r.desc}</div>
          </div>
          <Button
            size="sm"
            onClick={() => generate(r.id)}
            disabled={Boolean(busy)}
            style={{ width: '100%' }}
          >
            {busy === r.id ? 'Gerando PDF...' : 'Baixar Relatório (PDF)'}
          </Button>
        </div>
      ))}
    </div>
  );
}
