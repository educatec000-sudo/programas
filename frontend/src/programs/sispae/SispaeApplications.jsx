import React, { useState } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { sispaeApi } from '../../services/resources.js';
import { Badge, LoadingBlock, Modal } from '../../components/ui.jsx';
import { fmtInt } from '../../utils/format.js';

export default function SispaeApplications({ program = {}, onSelectTab }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('SIMULADO');
  const [stage, setStage] = useState('Alfabetização');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);

  const programId = program?.id;
  const programYear = program?.year || 2026;

  const { data: appsData, loading, error, refetch } = useApi(
    () => (programId ? sispaeApi.applications(programId) : Promise.resolve({ applications: [] })),
    [programId],
  );

  const applications = appsData?.applications || [];

  const handleCreateApplication = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setActionError(null);
    try {
      await sispaeApi.createApplication(programId, {
        name: name.trim(),
        type,
        stage,
        year: programYear,
        description: description.trim() || undefined,
        status: 'PUBLICADA',
      });
      setShowCreateModal(false);
      setName('');
      setDescription('');
      refetch();
    } catch (err) {
      setActionError(err.message || 'Erro ao criar aplicação.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteApplication = async (app) => {
    if (
      !window.confirm(
        `Tem certeza que deseja excluir a aplicação "${app.name}"?\n\nTodos os ${app.resultsCount} resultados vinculados a ela serão excluídos permanentemente.`,
      )
    ) {
      return;
    }
    try {
      await sispaeApi.deleteApplication(programId, app.id);
      refetch();
    } catch (err) {
      alert(err.message || 'Erro ao excluir aplicação.');
    }
  };

  if (loading && !applications.length) {
    return <LoadingBlock message="Carregando aplicações do SisPAE..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Topo com Ações */}
      <div
        className="card"
        style={{
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
            Aplicações Avaliativas do SisPAE
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
            Gerencie os Simulados Preparatórios e as Avaliações Oficiais do programa. Os dados de cada aplicação permanecem estritamente isolados.
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => {
            setActionError(null);
            setShowCreateModal(true);
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontWeight: 700 }}
        >
          <span>➕</span> Nova Aplicação
        </button>
      </div>

      {/* Grid de Cards das Aplicações */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {applications.map((app) => (
          <div
            key={app.id}
            className="card"
            style={{
              padding: 20,
              borderRadius: 12,
              border: `1px solid ${app.type === 'SIMULADO' ? '#fde68a' : '#a7f3d0'}`,
              background: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 16,
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <span
                  style={{
                    background: app.type === 'SIMULADO' ? '#fef3c7' : '#d1fae5',
                    color: app.type === 'SIMULADO' ? '#92400e' : '#065f46',
                    border: `1px solid ${app.type === 'SIMULADO' ? '#fcd34d' : '#6ee7b7'}`,
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  }}
                >
                  {app.type === 'SIMULADO' ? '📝 Simulado' : '🏛️ Avaliação Oficial'}
                </span>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                  Ano {app.year}
                </span>
              </div>

              <h3 style={{ margin: '0 0 6px 0', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                {app.name}
              </h3>

              <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>
                {app.description || 'Sem descrição cadastrada.'}
              </p>
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: '#f8fafc',
                  borderRadius: 8,
                  fontSize: 12.5,
                  marginBottom: 12,
                  border: '1px solid #f1f5f9',
                }}
              >
                <span>Resultados Cadastrados:</span>
                <strong style={{ color: app.resultsCount > 0 ? '#0284c7' : '#94a3b8' }}>
                  {fmtInt(app.resultsCount)} registros
                </strong>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {onSelectTab && (
                  <button
                    className="btn btn-outline"
                    onClick={() => onSelectTab('sispae-import')}
                    style={{ flex: 1, padding: '6px 10px', fontSize: 12, fontWeight: 700 }}
                  >
                    📥 Importar Planilha
                  </button>
                )}
                <button
                  className="btn btn-outline"
                  onClick={() => handleDeleteApplication(app)}
                  style={{ color: '#ef4444', borderColor: '#fecaca', padding: '6px 10px', fontSize: 12 }}
                  title="Excluir aplicação"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de Criação de Aplicação */}
      {showCreateModal && (
        <Modal
          title="Cadastrar Nova Aplicação no SisPAE"
          onClose={() => setShowCreateModal(false)}
        >
          <form onSubmit={handleCreateApplication} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {actionError && (
              <div style={{ padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13 }}>
                {actionError}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                Nome da Aplicação *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Simulado 2 – 2026, Avaliação SisPAE 2026..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Tipo de Aplicação *
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                >
                  <option value="SIMULADO">Simulado Preparatório</option>
                  <option value="AVALIACAO_OFICIAL">Avaliação Oficial SisPAE</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Etapa / Segmento
                </label>
                <input
                  type="text"
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  placeholder="Ex: Alfabetização, Ensino Fundamental..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                Descrição / Observações
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalhes adicionais sobre os objetivos desta aplicação..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowCreateModal(false)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || !name.trim()}
              >
                {saving ? 'Criando...' : 'Salvar Aplicação'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
