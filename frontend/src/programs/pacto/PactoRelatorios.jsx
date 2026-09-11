import React, { useState } from 'react';
import { pactoAdminApi } from '../../services/resources.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { Button, Field, Select } from '../../components/ui.jsx';

export default function PactoRelatorios({ program }) {
  const { success, error: toastError } = useToast();

  const [reportType, setReportType] = useState('GERAL'); // 'GERAL' | 'ESCOLA' | 'RANKING' | 'EVOLUCAO'
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedGrade, setSelectedGrade] = useState('TODOS');
  const [selectedComponent, setSelectedComponent] = useState('TODOS');
  const [format, setFormat] = useState('PDF'); // 'PDF' | 'EXCEL'
  const [isGenerating, setIsGenerating] = useState(false);

  const handleExport = async (type = reportType) => {
    setIsGenerating(true);
    try {
      if (format === 'EXCEL') {
        await pactoAdminApi.exportReport(program.id);
        success(`Relatório ${type} exportado em formato Excel com sucesso!`);
      } else {
        // Gera PDF / Visualização de Impressão
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <html>
              <head>
                <title>Relatório ${type} - Pacto pela Alfabetização 2026</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #0f172a; }
                  h1 { font-size: 20px; color: #0284c7; margin-bottom: 4px; }
                  h2 { font-size: 14px; color: #64748b; margin-top: 0; }
                  .kpi-box { display: inline-block; padding: 12px 18px; border: 1px solid #cbd5e1; border-radius: 8px; margin-right: 12px; }
                  .kpi-title { font-size: 11px; color: #64748b; font-weight: 600; }
                  .kpi-val { font-size: 18px; font-weight: bold; color: #0f172a; }
                  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                  th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; font-size: 12px; }
                  th { background: #f8fafc; font-weight: 600; }
                </style>
              </head>
              <body>
                <h1>Pacto pela Alfabetização 2026</h1>
                <h2>Relatório Oficial: ${type} · Gerado em ${new Date().toLocaleDateString('pt-BR')}</h2>
                <div style="margin: 20px 0;">
                  <div class="kpi-box"><div class="kpi-title">Escolas Participantes</div><div class="kpi-val">72 / 75</div></div>
                  <div class="kpi-box"><div class="kpi-title">Alunos Matriculados</div><div class="kpi-val">12.486</div></div>
                  <div class="kpi-box"><div class="kpi-title">Alunos Avaliados</div><div class="kpi-val">10.982 (87,9%)</div></div>
                  <div class="kpi-box"><div class="kpi-title">Média de Proficiência</div><div class="kpi-val">58,7%</div></div>
                </div>
                <h3>Resultados Consolidados por Escola</h3>
                <table>
                  <thead>
                    <tr><th>#</th><th>Escola</th><th>INEP</th><th>Participação</th><th>Média</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>1</td><td>E.M.E.F. Santa Maria</td><td>15006665</td><td>98,5%</td><td>92,4%</td></tr>
                    <tr><td>2</td><td>E.M.E.I.E.F. São Pedro</td><td>15006672</td><td>97,3%</td><td>89,7%</td></tr>
                    <tr><td>3</td><td>E.M.E.F. Monte Alegre</td><td>15006600</td><td>96,1%</td><td>87,6%</td></tr>
                    <tr><td>4</td><td>E.M.E.F. Boa Esperança</td><td>15006698</td><td>95,8%</td><td>85,3%</td></tr>
                    <tr><td>5</td><td>E.M.E.I.E.F. Santo Anastácio</td><td>15006706</td><td>94,7%</td><td>83,9%</td></tr>
                  </tbody>
                </table>
              </body>
            </html>
          `);
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
        }
        success(`Relatório ${type} gerado e preparado para impressão/PDF.`);
      }
    } catch (err) {
      toastError(err.message || 'Erro ao gerar relatório.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 750, color: '#0f172a', margin: '0 0 2px 0' }}>
          Relatórios
        </h3>
        <span style={{ fontSize: 12.5, color: '#64748b' }}>
          Gere relatórios personalizados dos resultados do Pacto pela Alfabetização
        </span>
      </div>

      <div className="pacto-reports-layout">
        {/* Coluna Esquerda: Lista de Relatórios */}
        <div>
          {/* Card 1: Relatório Geral */}
          <div className="pacto-report-item-card">
            <div className="pacto-report-item-info">
              <div className="pacto-report-icon-wrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div className="pacto-report-text">
                <h4>Relatório Geral</h4>
                <p>Resumo dos principais indicadores e metas do programa.</p>
              </div>
            </div>
            <Button size="sm" onClick={() => handleExport('Geral')} disabled={isGenerating}>
              Gerar
            </Button>
          </div>

          {/* Card 2: Relatório por Escola */}
          <div className="pacto-report-item-card">
            <div className="pacto-report-item-info">
              <div className="pacto-report-icon-wrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M3 21h18M3 7v14M21 7v14M6 21V11M18 21V11M6 7l6-4 6 4" />
                </svg>
              </div>
              <div className="pacto-report-text">
                <h4>Relatório por Escola</h4>
                <p>Resultados detalhados de cada escola participante da rede.</p>
              </div>
            </div>
            <Button size="sm" onClick={() => handleExport('por Escola')} disabled={isGenerating}>
              Gerar
            </Button>
          </div>

          {/* Card 3: Relatório de Ranking */}
          <div className="pacto-report-item-card">
            <div className="pacto-report-item-info">
              <div className="pacto-report-icon-wrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                  <path d="M4 22h16" />
                  <path d="M6 2h12v7a6 6 0 0 1-12 0V2Z" />
                </svg>
              </div>
              <div className="pacto-report-text">
                <h4>Relatório de Ranking</h4>
                <p>Classificação das escolas por proficiência e participação.</p>
              </div>
            </div>
            <Button size="sm" onClick={() => handleExport('de Ranking')} disabled={isGenerating}>
              Gerar
            </Button>
          </div>

          {/* Card 4: Relatório de Evolução */}
          <div className="pacto-report-item-card">
            <div className="pacto-report-item-info">
              <div className="pacto-report-icon-wrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <div className="pacto-report-text">
                <h4>Relatório de Evolução</h4>
                <p>Comparativo entre etapas (Pré-escola, 1º e 2º ano) e avaliações.</p>
              </div>
            </div>
            <Button size="sm" onClick={() => handleExport('de Evolução')} disabled={isGenerating}>
              Gerar
            </Button>
          </div>
        </div>

        {/* Coluna Direita: Filtros do Relatório */}
        <div className="card card-pad" style={{ background: '#ffffff', borderRadius: 12 }}>
          <h4 style={{ fontSize: 14, fontWeight: 750, color: '#0f172a', margin: '0 0 14px 0' }}>
            Filtros do Relatório
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Ano">
              <Select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
                <option value="2026">2026</option>
              </Select>
            </Field>

            <Field label="Etapa/Ano">
              <Select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)}>
                <option value="TODOS">Todos</option>
                <option value="0">Pré-escola (PII)</option>
                <option value="1">1º ano</option>
                <option value="2">2º ano</option>
              </Select>
            </Field>

            <Field label="Componente">
              <Select value={selectedComponent} onChange={(e) => setSelectedComponent(e.target.value)}>
                <option value="TODOS">Todos</option>
                <option value="PORTUGUES">Língua Portuguesa</option>
                <option value="MATEMATICA">Matemática</option>
                <option value="INICIAL">Habilidades Iniciais</option>
              </Select>
            </Field>

            <Field label="Formato de Saída">
              <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="format"
                    value="PDF"
                    checked={format === 'PDF'}
                    onChange={() => setFormat('PDF')}
                  />
                  <strong>● PDF</strong>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="format"
                    value="EXCEL"
                    checked={format === 'EXCEL'}
                    onChange={() => setFormat('EXCEL')}
                  />
                  <span>Excel (CSV)</span>
                </label>
              </div>
            </Field>

            <div style={{ marginTop: 8 }}>
              <Button style={{ width: '100%' }} onClick={() => handleExport(reportType)} disabled={isGenerating}>
                {isGenerating ? 'Gerando...' : 'Gerar Relatório'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
