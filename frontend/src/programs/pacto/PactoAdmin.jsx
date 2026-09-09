import React, { useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { pactoAdminApi, pactoPublicApi } from '../../services/resources.js';
import { resolvePactoPublicLink } from './link.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import DataTable from '../../components/DataTable.jsx';
import { Badge, Button, Field, Input, LoadingBlock, Modal, Select } from '../../components/ui.jsx';
import { fmtDateTime } from '../../utils/format.js';
import { formatGradeLabel } from './dashboard.js';

const STATUS = {
  NAO_INICIADA: { label: 'Não iniciada', cls: 'badge-gray' },
  EM_PREENCHIMENTO: { label: 'Em preenchimento', cls: 'badge-yellow' },
  PARCIAL: { label: 'Envios parciais', cls: 'badge-blue' },
  CONCLUIDA: { label: 'Concluída', cls: 'badge-green' },
};

const ALL_ASSESSMENTS = ['A0', 'A1', 'A2', 'A3'];

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
  const [linkVerification, setLinkVerification] = useState(null);
  const [expiresAt, setExpiresAt] = useState(futureDate());
  const [classModal, setClassModal] = useState(false);
  const [editingAdminClass, setEditingAdminClass] = useState(null);
  const [assessmentDetail, setAssessmentDetail] = useState(null);
  const [classForm, setClassForm] = useState({
    schoolId: '', grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS,
  });
  const [classRows, setClassRows] = useState([
    { grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS },
  ]);
  const [busy, setBusy] = useState(false);

  const school = useMemo(
    () => data?.schools?.find((item) => item.id === selectedSchool) || null,
    [data, selectedSchool],
  );

  if (loading) return <LoadingBlock label="Carregando coleta do Pacto..." />;
  if (error) return <div className="alert alert-error">{error.message}</div>;
  if (!data) return null;

  const editingIdentificationLocked = Boolean(
    editingAdminClass?.assessments?.some((assessment) => assessment.status === 'ENVIADO'),
  );

  const generateLink = async () => {
    setBusy(true);
    try {
      const endOfDay = new Date(`${expiresAt}T23:59:59`);
      const result = await pactoAdminApi.generateLink(program.id, linkModal.id, endOfDay.toISOString());
      const publicLink = resolvePactoPublicLink(result.path, window.location.origin);
      const verification = await pactoPublicApi.bootstrap(publicLink.token);
      if (verification.school.id !== linkModal.id || verification.program.id !== program.id) {
        throw new Error('A verificação do link retornou outra escola ou outro programa. O endereço não será exibido.');
      }
      setGeneratedLink(publicLink.url);
      setLinkVerification({
        schoolName: verification.school.name,
        schoolInep: verification.school.inep,
        programName: verification.program.name,
        classesCount: verification.classes.length,
      });
      success('Link exclusivo gerado e verificado na API pública do Pacto.');
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
      if (editingAdminClass) {
        const payload = {
          grade: Number(classForm.grade),
          shift: classForm.shift,
          name: classForm.name,
          enabledAssessments: classForm.enabledAssessments,
        };
        await pactoAdminApi.updateClass(program.id, editingAdminClass.id, payload);
        success('Turma atualizada no programa.');
      } else {
        if (!classForm.schoolId) {
          toastError('Selecione uma escola.');
          setBusy(false);
          return;
        }
        const validRows = classRows
          .filter((row) => row.name && row.name.trim().length > 0)
          .map((row) => ({
            grade: Number(row.grade),
            shift: row.shift,
            name: row.name.trim().toUpperCase(),
            enabledAssessments: row.enabledAssessments?.length ? row.enabledAssessments : ALL_ASSESSMENTS,
          }));

        if (!validRows.length) {
          toastError('Preencha o nome de pelo menos uma turma.');
          setBusy(false);
          return;
        }

        const keys = new Set();
        for (const row of validRows) {
          const k = `${row.grade}-${row.shift}-${row.name}`;
          if (keys.has(k)) {
            toastError(`A turma ${formatGradeLabel(row.grade)} ${row.shift} - ${row.name} está duplicada no formulário.`);
            setBusy(false);
            return;
          }
          keys.add(k);
        }

        await pactoAdminApi.createClass(program.id, {
          schoolId: classForm.schoolId,
          classes: validRows,
        });
        success(`${validRows.length} turma(s) cadastrada(s) no programa com sucesso!`);
      }
      setClassModal(false);
      setEditingAdminClass(null);
      setClassForm({ schoolId: '', grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS });
      refresh();
    } catch (err) {
      toastError(err.details?.map((item) => item.message).join(' · ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  const openNewAdminClass = () => {
    setEditingAdminClass(null);
    setClassForm({ schoolId: '', grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS });
    setClassRows([
      { grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS },
    ]);
    setClassModal(true);
  };

  const addAdminClassRow = () => {
    setClassRows((current) => [
      ...current,
      { grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS },
    ]);
  };

  const removeAdminClassRow = (index) => {
    setClassRows((current) => current.filter((_, i) => i !== index));
  };

  const updateAdminClassRow = (index, field, value) => {
    setClassRows((current) => current.map((row, i) => (
      i === index ? { ...row, [field]: value } : row
    )));
  };

  const toggleAdminRowAssessment = (index, code) => {
    setClassRows((current) => current.map((row, i) => {
      if (i !== index) return row;
      const enabled = row.enabledAssessments.includes(code)
        ? row.enabledAssessments.filter((c) => c !== code)
        : ALL_ASSESSMENTS.filter((c) => c === code || row.enabledAssessments.includes(c));
      return { ...row, enabledAssessments: enabled };
    }));
  };

  const applyAdminDefaultPreset = () => {
    setClassRows([
      { grade: 0, shift: 'M', name: 'A', enabledAssessments: ALL_ASSESSMENTS },
      { grade: 0, shift: 'T', name: 'B', enabledAssessments: ALL_ASSESSMENTS },
      { grade: 1, shift: 'M', name: 'A', enabledAssessments: ALL_ASSESSMENTS },
      { grade: 1, shift: 'T', name: 'B', enabledAssessments: ALL_ASSESSMENTS },
      { grade: 2, shift: 'M', name: 'A', enabledAssessments: ALL_ASSESSMENTS },
      { grade: 2, shift: 'T', name: 'B', enabledAssessments: ALL_ASSESSMENTS },
    ]);
  };

  const toggleAdminAssessment = (code) => {
    setClassForm((current) => ({
      ...current,
      enabledAssessments: current.enabledAssessments.includes(code)
        ? current.enabledAssessments.filter((item) => item !== code)
        : ALL_ASSESSMENTS.filter((item) => item === code || current.enabledAssessments.includes(item)),
    }));
  };

  const openEditAdminClass = (item) => {
    setEditingAdminClass(item);
    setClassForm({
      schoolId: item.schoolId,
      grade: item.grade,
      shift: item.shift,
      name: item.name,
      enabledAssessments: item.enabledAssessments || ALL_ASSESSMENTS,
    });
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

  const removeAssessment = async (assessmentId) => {
    if (!window.confirm('Excluir este rascunho de avaliação? Todos os dados registrados nesta etapa serão removidos.')) return;
    try {
      await pactoAdminApi.deleteAssessment(program.id, assessmentId);
      success('Rascunho excluído com sucesso.');
      setSelectedSchool(null);
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
                {can('programs:write') && <Button size="sm" onClick={() => { setLinkModal(item); setGeneratedLink(null); setLinkVerification(null); setExpiresAt(futureDate()); }}>Gerar link</Button>}
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
            { key: 'grade', label: 'Etapa / Ano', render: (item) => formatGradeLabel(item.grade) },
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
                <div className="card-title">{formatGradeLabel(item.grade)} · Turno {item.shift} · Turma {item.name}</div>
                <div className="card-subtitle">
                  Cadastro: {item.source === 'ESCOLA' ? 'gestor da escola' : 'administração'} · Avaliações no link: {(item.enabledAssessments || ALL_ASSESSMENTS).join(', ')}
                </div>
              </div>
              {can('programs:write') && (
                <Button
                  size="sm"
                  variant="secondary"
                  title="Corrigir a identificação ou configurar as avaliações disponíveis no link"
                  onClick={() => openEditAdminClass(item)}
                >
                  Configurar turma
                </Button>
              )}
            </div>
            <table className="table">
              <thead><tr><th>Avaliação</th><th>Status</th><th>Envio</th><th>Alertas</th><th /></tr></thead>
              <tbody>
                {(item.enabledAssessments || ALL_ASSESSMENTS).map((code) => {
                  const assessment = item.assessments.find((saved) => saved.code === code);
                  const info = assessment ? ASSESSMENT_STATUS[assessment.status] : null;
                  return (
                    <tr key={code}>
                      <td><strong>{code}</strong></td>
                      <td>{assessment ? <Badge cls={info?.cls}>{info?.label}</Badge> : <Badge cls="badge-gray">Pendente</Badge>}</td>
                      <td>{assessment?.submittedAt ? fmtDateTime(assessment.submittedAt) : '—'}</td>
                      <td>{assessment?.warnings.length ? <Badge cls="badge-yellow">{assessment.warnings.length} alerta(s)</Badge> : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {assessment && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                            <Button size="sm" variant="secondary" onClick={() => setAssessmentDetail({ assessment, pactoClass: item })}>Ver dados</Button>
                            {can('evaluations:write') && assessment.status === 'ENVIADO' && (
                              <Button size="sm" variant="secondary" onClick={() => reopen(assessment.id)}>Reabrir</Button>
                            )}
                            {can('evaluations:write') && assessment.status !== 'ENVIADO' && (
                              <Button size="sm" variant="danger" onClick={() => removeAssessment(assessment.id)}>Excluir rascunho</Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
        onClose={() => { setLinkModal(null); setGeneratedLink(null); setLinkVerification(null); }}
        title={`Link de preenchimento — ${linkModal?.name || ''}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setLinkModal(null); setGeneratedLink(null); setLinkVerification(null); }}>Fechar</Button>
            {!generatedLink && <Button onClick={generateLink} disabled={busy || !expiresAt}>{busy ? 'Gerando...' : 'Gerar link exclusivo'}</Button>}
          </>
        }
      >
        {generatedLink ? (
          <>
            <div className="alert alert-warn">Por segurança, o endereço completo é mostrado somente agora. Gerar outro link revogará este.</div>
            {linkVerification && (
              <div className="alert alert-success">
                Link conferido pela API pública: <strong>{linkVerification.schoolName}</strong>
                {linkVerification.schoolInep ? ` · INEP ${linkVerification.schoolInep}` : ''}
                {` · ${linkVerification.programName} · ${linkVerification.classesCount} turma(s)`}
              </div>
            )}
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
        title={editingAdminClass ? 'Corrigir turma do Pacto 2026' : 'Cadastrar turmas no Pacto 2026'}
        size={editingAdminClass ? 'sm' : 'lg'}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setClassModal(false); setEditingAdminClass(null); }}>Cancelar</Button>
            {editingAdminClass ? (
              <Button onClick={saveAdminClass} disabled={busy || !classForm.schoolId || !classForm.name || !classForm.enabledAssessments.length}>
                {busy ? 'Salvando...' : 'Salvar correção'}
              </Button>
            ) : (
              <Button onClick={saveAdminClass} disabled={busy || !classForm.schoolId || !classRows.some((r) => r.name.trim().length > 0)}>
                {busy ? 'Salvando...' : `Cadastrar ${classRows.filter((r) => r.name.trim().length > 0).length > 1 ? `${classRows.filter((r) => r.name.trim().length > 0).length} turmas` : 'turma'}`}
              </Button>
            )}
          </>
        }
      >
        {editingAdminClass ? (
          <>
            {editingIdentificationLocked && (
              <div className="alert alert-info">A identificação está bloqueada porque há envio concluído. Ainda é possível acrescentar avaliações ao link; para alterar ano, turno ou turma, reabra os envios.</div>
            )}
            <Field label="Escola" required>
              <Select disabled value={classForm.schoolId}>
                {data.schools.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Etapa / Ano" required>
              <Select disabled={editingIdentificationLocked} value={classForm.grade} onChange={(event) => setClassForm((form) => ({ ...form, grade: event.target.value }))}>
                <option value="0">PII</option>
                <option value="1">1º ano</option>
                <option value="2">2º ano</option>
              </Select>
            </Field>
            <Field label="Turno" required>
              <Select disabled={editingIdentificationLocked} value={classForm.shift} onChange={(event) => setClassForm((form) => ({ ...form, shift: event.target.value }))}>
                <option value="M">M</option><option value="T">T</option>
              </Select>
            </Field>
            <Field label="Turma" required>
              <Input disabled={editingIdentificationLocked} value={classForm.name} maxLength={30} onChange={(event) => setClassForm((form) => ({ ...form, name: event.target.value.toUpperCase() }))} placeholder="Ex.: A" />
            </Field>
            <Field label="Avaliações disponíveis no link" required hint="Somente as avaliações selecionadas serão exibidas para esta turma.">
              <div className="pacto-assessment-checks">
                {ALL_ASSESSMENTS.map((code) => {
                  const started = editingAdminClass?.assessments?.some((assessment) => assessment.code === code);
                  return (
                    <label key={code} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={classForm.enabledAssessments.includes(code)}
                        disabled={started}
                        onChange={() => toggleAdminAssessment(code)}
                      />
                      <span><strong>{code}</strong>{started ? ' · já iniciada' : ''}</span>
                    </label>
                  );
                })}
              </div>
            </Field>
          </>
        ) : (
          <div>
            <Field label="Escola participante" required hint="Selecione a escola que receberá as turmas cadastradas.">
              <Select value={classForm.schoolId} onChange={(event) => setClassForm((form) => ({ ...form, schoolId: event.target.value }))}>
                <option value="">Selecione uma escola</option>
                {data.schools.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 12px 0', background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>Adição rápida de turmas</span>
                <div style={{ fontSize: 12, color: '#64748b' }}>Cadastre várias turmas da escola em uma única etapa.</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="secondary" onClick={applyAdminDefaultPreset}>⚡ Padrão (PII, 1º e 2º A, B)</Button>
                <Button size="sm" onClick={addAdminClassRow}>+ Adicionar linha</Button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '48vh', overflowY: 'auto', paddingRight: 4 }}>
              {classRows.map((row, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                  <div style={{ width: 110 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Etapa / Ano</label>
                    <Select value={row.grade} onChange={(e) => updateAdminClassRow(idx, 'grade', e.target.value)}>
                      <option value="0">PII</option>
                      <option value="1">1º ano</option>
                      <option value="2">2º ano</option>
                    </Select>
                  </div>
                  <div style={{ width: 90 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Turno</label>
                    <Select value={row.shift} onChange={(e) => updateAdminClassRow(idx, 'shift', e.target.value)}>
                      <option value="M">M</option>
                      <option value="T">T</option>
                    </Select>
                  </div>
                  <div style={{ width: 130 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Turma *</label>
                    <Input maxLength={30} value={row.name} onChange={(e) => updateAdminClassRow(idx, 'name', e.target.value.toUpperCase())} placeholder="Ex.: A" />
                  </div>
                  <div style={{ flex: '1 1 200px' }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Avaliações</label>
                    <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                      {ALL_ASSESSMENTS.map((code) => (
                        <label key={code} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={row.enabledAssessments.includes(code)}
                            onChange={() => toggleAdminRowAssessment(idx, code)}
                          />
                          <strong>{code}</strong>
                        </label>
                      ))}
                    </div>
                  </div>
                  {classRows.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => removeAdminClassRow(idx)}
                      title="Remover linha"
                      style={{ marginTop: 22, color: '#dc2626', borderColor: '#fca5a5' }}
                    >
                      🗑
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
