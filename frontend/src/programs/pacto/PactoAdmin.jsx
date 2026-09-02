import React, { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { pactoAdminApi } from '../../services/resources.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import DataTable from '../../components/DataTable.jsx';
import { Badge, Button, Field, Input, LoadingBlock, Modal, Select } from '../../components/ui.jsx';
import { fmtDateTime } from '../../utils/format.js';

const STATUS = {
  NAO_INICIADA: { label: 'Não iniciada', cls: 'badge-gray' },
  EM_PREENCHIMENTO: { label: 'Em preenchimento', cls: 'badge-yellow' },
  PARCIAL: { label: 'Envios parciais', cls: 'badge-blue' },
  CONCLUIDA: { label: 'Concluída', cls: 'badge-green' },
};

const ASSESSMENT_STATUS = {
  RASCUNHO: { label: 'Rascunho', cls: 'badge-yellow' },
  ENVIADO: { label: 'Enviado', cls: 'badge-green' },
  REABERTO: { label: 'Reaberto', cls: 'badge-blue' },
};

function futureDate(days = 30) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function PactoAdmin({ program }) {
  const { can } = useAuth();
  const { success, error: toastError } = useToast();
  const { data, loading, error, refresh } = useApi(() => pactoAdminApi.overview(program.id), [program.id]);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [linkModal, setLinkModal] = useState(null);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [expiresAt, setExpiresAt] = useState(futureDate());
  const [classModal, setClassModal] = useState(false);
  const [editingAdminClass, setEditingAdminClass] = useState(null);
  const [assessmentDetail, setAssessmentDetail] = useState(null);
  const [classForm, setClassForm] = useState({ schoolId: '', grade: 1, shift: 'M', name: '' });
  const [busy, setBusy] = useState(false);

  const school = useMemo(
    () => data?.schools?.find((item) => item.id === selectedSchool) || null,
    [data, selectedSchool],
  );

  if (loading) return <LoadingBlock label="Carregando coleta do Pacto..." />;
  if (error) return <div className="alert alert-error">{error.message}</div>;
  if (!data) return null;

  const generateLink = async () => {
    setBusy(true);
    try {
      const endOfDay = new Date(`${expiresAt}T23:59:59`);
      const result = await pactoAdminApi.generateLink(program.id, linkModal.id, endOfDay.toISOString());
      setGeneratedLink(result.url);
      success('Link exclusivo gerado. Copie-o antes de fechar esta janela.');
      refresh();
    } catch (err) {
      toastError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      success('Link copiado para a área de transferência.');
    } catch {
      toastError('Não foi possível copiar automaticamente. Selecione o endereço e copie manualmente.');
    }
  };

  const revokeLink = async (item) => {
    if (!window.confirm(`Revogar o link de ${item.name}?`)) return;
    try {
      await pactoAdminApi.revokeLink(program.id, item.id);
      success('Link revogado.');
      refresh();
    } catch (err) {
      toastError(err.message);
    }
  };

  const saveAdminClass = async () => {
    setBusy(true);
    try {
      const payload = {
        grade: Number(classForm.grade),
        shift: classForm.shift,
        name: classForm.name,
      };
      if (editingAdminClass) {
        await pactoAdminApi.updateClass(program.id, editingAdminClass.id, payload);
        success('Turma atualizada no programa.');
      } else {
        await pactoAdminApi.createClass(program.id, { schoolId: classForm.schoolId, ...payload });
        success('Turma cadastrada no programa.');
      }
      setClassModal(false);
      setEditingAdminClass(null);
      setClassForm({ schoolId: '', grade: 1, shift: 'M', name: '' });
      refresh();
    } catch (err) {
      toastError(err.details?.map((item) => item.message).join(' · ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  const openNewAdminClass = () => {
    setEditingAdminClass(null);
    setClassForm({ schoolId: '', grade: 1, shift: 'M', name: '' });
    setClassModal(true);
  };

  const openEditAdminClass = (item) => {
    setEditingAdminClass(item);
    setClassForm({ schoolId: item.schoolId, grade: item.grade, shift: item.shift, name: item.name });
    setSelectedSchool(null);
    setClassModal(true);
  };

  const reopen = async (assessmentId) => {
    if (!window.confirm('Reabrir esta avaliação para correção pela escola?')) return;
    try {
      await pactoAdminApi.reopenAssessment(program.id, assessmentId);
      success('Avaliação reaberta para correção.');
      refresh();
    } catch (err) {
      toastError(err.message);
    }
  };

  return (
    <>
      <div className="alert alert-info">
        Coleta oficial do Pacto pela Alfabetização 2026. Cada link identifica uma única escola e não concede acesso administrativo ao CPE.
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon">🏫</div><div><div className="stat-value">{data.totals.schools}</div><div className="stat-label">Escolas vinculadas</div></div></div>
        <div className="stat-card"><div className="stat-icon">○</div><div><div className="stat-value">{data.totals.notStarted}</div><div className="stat-label">Não iniciadas</div></div></div>
        <div className="stat-card"><div className="stat-icon">◐</div><div><div className="stat-value">{data.totals.inProgress}</div><div className="stat-label">Em preenchimento/parciais</div></div></div>
        <div className="stat-card"><div className="stat-icon">✓</div><div><div className="stat-value">{data.totals.completed}</div><div className="stat-label">Escolas concluídas</div></div></div>
        <div className="stat-card"><div className="stat-icon">%</div><div><div className="stat-value">{data.totals.completionPercentage}%</div><div className="stat-label">Conclusão dos envios</div></div></div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
        {can('reports:read') && (
          <Button variant="secondary" onClick={() => pactoAdminApi.exportReport(program.id).catch((err) => toastError(err.message))}>
            Exportar dados CSV
          </Button>
        )}
        {can('programs:write') && (
          <Button variant="secondary" onClick={openNewAdminClass}>+ Cadastrar turma</Button>
        )}
      </div>

      <DataTable
        columns={[
          { key: 'inep', label: 'INEP', render: (item) => <span className="mono">{item.inep || '—'}</span> },
          { key: 'name', label: 'Escola', render: (item) => <strong>{item.name}</strong> },
          { key: 'classesCount', label: 'Turmas', align: 'center' },
          { key: 'inProgressAssessmentsCount', label: 'Em preenchimento', align: 'center' },
          { key: 'pendingAssessmentsCount', label: 'Pendentes', align: 'center' },
          { key: 'sentAssessmentsCount', label: 'Enviadas', align: 'center' },
          { key: 'completionPercentage', label: 'Conclusão', align: 'center', render: (item) => `${item.completionPercentage}%` },
          {
            key: 'status', label: 'Status',
            render: (item) => {
              const info = STATUS[item.status];
              return <Badge cls={info?.cls}>{info?.label || item.status}</Badge>;
            },
          },
          { key: 'lastSubmittedAt', label: 'Último envio', render: (item) => item.lastSubmittedAt ? fmtDateTime(item.lastSubmittedAt) : '—' },
          {
            key: 'link', label: 'Link',
            render: (item) => item.collectionLink
              ? <Badge cls="badge-green">Ativo até {new Date(item.collectionLink.expiresAt).toLocaleDateString('pt-BR')}</Badge>
              : <Badge cls="badge-gray">Não gerado</Badge>,
          },
          {
            key: 'actions', label: '', align: 'right',
            render: (item) => (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={(event) => event.stopPropagation()}>
                <Button size="sm" variant="secondary" onClick={() => setSelectedSchool(item.id)}>Visualizar</Button>
                {can('programs:write') && <Button size="sm" onClick={() => { setLinkModal(item); setGeneratedLink(null); setExpiresAt(futureDate()); }}>Gerar link</Button>}
                {can('programs:write') && item.collectionLink && <Button size="sm" variant="ghost" onClick={() => revokeLink(item)}>Revogar</Button>}
              </div>
            ),
          },
        ]}
        rows={data.schools}
        emptyTitle="Nenhuma escola vinculada ao Pacto"
        emptyHint="Use a aba Escolas participantes para realizar os vínculos antes de gerar links."
        emptyIcon="🏫"
      />

      <div className="card card-pad" style={{ marginTop: 18 }}>
        <div className="card-title">Distribuição consolidada dos envios</div>
        <div className="card-subtitle">Percentuais agregados por ano, avaliação e habilidade. Não representam nota geral nem ranking.</div>
        <DataTable
          columns={[
            { key: 'grade', label: 'Ano', render: (item) => `${item.grade}º ano` },
            { key: 'assessment', label: 'Avaliação', render: (item) => <strong>{item.assessment}</strong> },
            { key: 'componentLabel', label: 'Componente' },
            { key: 'skillLabel', label: 'Habilidade' },
            { key: 'evaluated', label: 'Avaliados', align: 'center' },
            {
              key: 'levels', label: 'Distribuição',
              render: (item) => (
                <div style={{ minWidth: 320 }}>
                  <div className="pacto-distribution-bar" aria-label={`Distribuição percentual de ${item.skillLabel}`}>
                    {item.levels.map((level) => (
                      <span
                        key={level.code}
                        className={`pacto-distribution-${level.color || 'gray'}`}
                        style={{ width: `${level.percentage || 0}%` }}
                        title={`${level.label}: ${level.percentage == null ? 'sem percentual' : `${level.percentage}%`}`}
                      />
                    ))}
                  </div>
                  {item.levels.map((level) => (
                    <div key={level.code} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 52px', gap: 8, fontSize: 11.5, marginBottom: 4 }}>
                      <span>{level.label}</span><strong>{level.count}</strong><strong>{level.percentage == null ? '—' : `${level.percentage}%`}</strong>
                    </div>
                  ))}
                </div>
              ),
            },
          ]}
          rows={data.analytics || []}
          emptyTitle="Ainda não há avaliações enviadas"
          emptyHint="Rascunhos não entram na consolidação."
          emptyIcon="📊"
        />
      </div>

      <Modal
        open={Boolean(school)}
        onClose={() => setSelectedSchool(null)}
        title={school ? `Coleta — ${school.name}` : 'Coleta da escola'}
        size="xl"
        footer={<Button variant="secondary" onClick={() => setSelectedSchool(null)}>Fechar</Button>}
      >
        {!school?.classes.length ? (
          <div className="empty-state"><div className="big">🏫</div>Nenhuma turma cadastrada.</div>
        ) : school.classes.map((item) => (
          <div key={item.id} className="card card-pad" style={{ marginBottom: 12 }}>
            <div className="card-header-row">
              <div>
                <div className="card-title">{item.grade}º ano · Turno {item.shift} · Turma {item.name}</div>
                <div className="card-subtitle">Cadastro: {item.source === 'ESCOLA' ? 'gestor da escola' : 'administração'}</div>
              </div>
              {can('programs:write') && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={item.assessments.some((assessment) => assessment.status === 'ENVIADO')}
                  title={item.assessments.some((assessment) => assessment.status === 'ENVIADO') ? 'Reabra todas as avaliações enviadas antes de corrigir a turma.' : undefined}
                  onClick={() => openEditAdminClass(item)}
                >
                  Corrigir turma
                </Button>
              )}
            </div>
            {!item.assessments.length ? <div className="table-empty">Nenhuma avaliação iniciada.</div> : (
              <table className="table">
                <thead><tr><th>Avaliação</th><th>Status</th><th>Envio</th><th>Alertas</th><th /></tr></thead>
                <tbody>
                  {item.assessments.map((assessment) => {
                    const info = ASSESSMENT_STATUS[assessment.status];
                    return (
                      <tr key={assessment.id}>
                        <td><strong>{assessment.code}</strong></td>
                        <td><Badge cls={info?.cls}>{info?.label}</Badge></td>
                        <td>{assessment.submittedAt ? fmtDateTime(assessment.submittedAt) : '—'}</td>
                        <td>{assessment.warnings.length ? <Badge cls="badge-yellow">{assessment.warnings.length} alerta(s)</Badge> : '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                            <Button size="sm" variant="secondary" onClick={() => setAssessmentDetail({ assessment, pactoClass: item })}>Ver dados</Button>
                            {can('evaluations:write') && assessment.status === 'ENVIADO' && (
                              <Button size="sm" variant="secondary" onClick={() => reopen(assessment.id)}>Reabrir</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </Modal>

      <Modal
        open={Boolean(assessmentDetail)}
        onClose={() => setAssessmentDetail(null)}
        title={assessmentDetail ? `${assessmentDetail.assessment.definition.label} · Turma ${assessmentDetail.pactoClass.name}` : 'Dados da avaliação'}
        size="xl"
        footer={<Button variant="secondary" onClick={() => setAssessmentDetail(null)}>Fechar</Button>}
      >
        {assessmentDetail?.assessment.warnings.map((warning) => (
          <div key={`${warning.code}:${warning.component}`} className="alert alert-warn">{warning.message}</div>
        ))}
        {assessmentDetail?.assessment.definition.components.map((componentDefinition) => {
          const component = assessmentDetail.assessment.components.find((item) => item.component === componentDefinition.code);
          if (!component) return <div key={componentDefinition.code} className="alert alert-warn">{componentDefinition.label}: dados ainda não informados.</div>;
          const resultMap = new Map(component.results.map((item) => [`${item.skill}:${item.level}`, item]));
          return (
            <div key={componentDefinition.code} className="card card-pad" style={{ marginBottom: 12 }}>
              <div className="card-title">{componentDefinition.label}</div>
              <div className="card-subtitle">{component.enrolled} matriculados · {component.evaluated} avaliados</div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Habilidade</th><th>Nível 1</th><th>Nível 2</th><th>Nível 3</th></tr></thead>
                  <tbody>
                    {componentDefinition.skills.map((skill) => (
                      <tr key={skill.code}>
                        <td><strong>{skill.label}</strong></td>
                        {skill.levels.map((level) => {
                          const value = resultMap.get(`${skill.code}:${level.code}`);
                          return (
                            <td key={level.code}>
                              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{level.label}</span>
                              {value ? <strong>{value.count} ({value.percentage == null ? '—' : `${value.percentage}%`})</strong> : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </Modal>

      <Modal
        open={Boolean(linkModal)}
        onClose={() => { setLinkModal(null); setGeneratedLink(null); }}
        title={`Link de preenchimento — ${linkModal?.name || ''}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setLinkModal(null); setGeneratedLink(null); }}>Fechar</Button>
            {!generatedLink && <Button onClick={generateLink} disabled={busy || !expiresAt}>{busy ? 'Gerando...' : 'Gerar link exclusivo'}</Button>}
          </>
        }
      >
        {generatedLink ? (
          <>
            <div className="alert alert-warn">Por segurança, o endereço completo é mostrado somente agora. Gerar outro link revogará este.</div>
            <Field label="Endereço exclusivo">
              <div style={{ display: 'flex', gap: 8 }}>
                <Input value={generatedLink} readOnly />
                <Button onClick={copyLink}>Copiar</Button>
              </div>
            </Field>
          </>
        ) : (
          <Field label="Válido até" required hint="Um link anterior ativo desta escola será revogado.">
            <Input type="date" min={new Date().toISOString().slice(0, 10)} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </Field>
        )}
      </Modal>

      <Modal
        open={classModal}
        onClose={() => { setClassModal(false); setEditingAdminClass(null); }}
        title={editingAdminClass ? 'Corrigir turma do Pacto 2026' : 'Cadastrar turma no Pacto 2026'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setClassModal(false); setEditingAdminClass(null); }}>Cancelar</Button>
            <Button onClick={saveAdminClass} disabled={busy || !classForm.schoolId || !classForm.name}>{busy ? 'Salvando...' : editingAdminClass ? 'Salvar correção' : 'Cadastrar'}</Button>
          </>
        }
      >
        <Field label="Escola" required>
          <Select disabled={Boolean(editingAdminClass)} value={classForm.schoolId} onChange={(event) => setClassForm((form) => ({ ...form, schoolId: event.target.value }))}>
            <option value="">Selecione</option>
            {data.schools.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <Field label="Ano" required>
          <Select value={classForm.grade} onChange={(event) => setClassForm((form) => ({ ...form, grade: event.target.value }))}>
            <option value="1">1º ano</option><option value="2">2º ano</option>
          </Select>
        </Field>
        <Field label="Turno" required>
          <Select value={classForm.shift} onChange={(event) => setClassForm((form) => ({ ...form, shift: event.target.value }))}>
            <option value="M">M</option><option value="T">T</option>
          </Select>
        </Field>
        <Field label="Turma" required>
          <Input value={classForm.name} maxLength={30} onChange={(event) => setClassForm((form) => ({ ...form, name: event.target.value.toUpperCase() }))} placeholder="Ex.: A" />
        </Field>
      </Modal>
    </>
  );
}
