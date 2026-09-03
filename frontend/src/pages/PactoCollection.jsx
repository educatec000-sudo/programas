import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { pactoPublicApi } from '../services/resources.js';
import { useToast } from '../contexts/ToastContext.jsx';
import { Badge, Button, Field, Input, LoadingBlock, Modal, Select } from '../components/ui.jsx';

const ALL_ASSESSMENTS = ['A0', 'A1', 'A2', 'A3'];

const STATUS = {
  RASCUNHO: { label: 'Rascunho', cls: 'badge-yellow' },
  ENVIADO: { label: 'Enviado', cls: 'badge-green' },
  REABERTO: { label: 'Reaberto para correção', cls: 'badge-blue' },
};

function emptyForm(definition, existing) {
  return {
    components: definition.components.map((component) => {
      const saved = existing?.components.find((item) => item.component === component.code);
      const resultMap = new Map((saved?.results || []).map((item) => [`${item.skill}:${item.level}`, item.count]));
      return {
        component: component.code,
        enrolled: saved?.enrolled ?? '',
        evaluated: saved?.evaluated ?? '',
        results: Object.fromEntries(
          component.skills.flatMap((skill) => skill.levels.map((level) => [
            `${skill.code}:${level.code}`,
            resultMap.get(`${skill.code}:${level.code}`) ?? '',
          ])),
        ),
      };
    }),
  };
}

function toPayload(selectedClass, code, form) {
  return {
    classId: selectedClass.id,
    code,
    components: form.components.map((component) => ({
      component: component.component,
      enrolled: component.enrolled,
      evaluated: component.evaluated,
      results: Object.entries(component.results)
        .filter(([, value]) => value !== '')
        .map(([key, value]) => {
          const [skill, level] = key.split(':');
          return { skill, level, count: value };
        }),
    })),
  };
}

function percentage(count, evaluated) {
  if (count === '' || evaluated === '' || Number(evaluated) <= 0) return null;
  return Math.round((Number(count) / Number(evaluated)) * 100);
}

function ImportIssues({ title, items, warning = false }) {
  if (!items?.length) return null;
  return (
    <div className={`pacto-import-issues ${warning ? 'warning' : 'error'}`}>
      <strong>{title}</strong>
      <ul>{items.map((item, index) => <li key={`${item.code}-${index}`}>{item.message}</li>)}</ul>
    </div>
  );
}

function PactoImportModal({ open, onClose, token, onImported, notifyError, notifySuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [mappingDirty, setMappingDirty] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setMapping({});
    setMappingDirty(false);
    setConfirmReplace(false);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const showError = (err) => {
    const details = Array.isArray(err?.details) ? err.details.map((item) => item.message).filter(Boolean) : [];
    notifyError(details.length ? details.join(' · ') : err.message);
  };

  const loadPreview = async (nextMapping = mapping) => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await pactoPublicApi.previewImport(token, file, nextMapping || {});
      setPreview(result);
      setMapping(result.mapping || {});
      setMappingDirty(false);
      setConfirmReplace(false);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const changeMapping = (section, key, value) => {
    setMapping((current) => ({
      ...current,
      [section]: { ...(current?.[section] || {}), [key]: value || null },
    }));
    setMappingDirty(true);
  };

  const confirm = async () => {
    if (!file || !preview?.canConfirm || mappingDirty) return;
    setBusy(true);
    try {
      const result = await pactoPublicApi.confirmImport(token, file, {
        mapping,
        previewDigest: preview.previewDigest,
        confirmReplace,
      });
      notifySuccess(`${result.count} avaliação(ões) importada(s) como rascunho.`);
      reset();
      onClose();
      onImported();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const hasReplacements = preview?.groups?.some((group) => group.replacesDraft);
  const sourceOptions = preview?.availableColumns || [];

  return (
    <Modal
      open={open}
      onClose={close}
      title="Importar resultados do Power BI"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>Cancelar</Button>
          {preview && (
            <Button variant="secondary" onClick={() => loadPreview(mapping)} disabled={busy || !file}>
              {busy ? 'Lendo...' : 'Atualizar prévia'}
            </Button>
          )}
          <Button
            variant="success"
            onClick={confirm}
            disabled={busy || !preview?.canConfirm || mappingDirty || (hasReplacements && !confirmReplace)}
          >
            {busy ? 'Importando...' : 'Confirmar e salvar rascunhos'}
          </Button>
        </>
      }
    >
      <div className="pacto-import-intro">
        <strong>CSV ou XLSX estruturado</strong>
        <span>O arquivo será apenas lido nesta etapa. Nenhum dado é salvo antes da confirmação.</span>
        <span>Arquivos separados de Língua Portuguesa ou Matemática também são aceitos; o componente ausente permanece pendente no rascunho.</span>
      </div>

      <Field label="1. Selecione o arquivo exportado" required hint="Formatos aceitos: .csv e .xlsx. Não use PDF ou imagem.">
        <input
          className="input"
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            setPreview(null);
            setMapping({});
            setMappingDirty(false);
            setConfirmReplace(false);
          }}
        />
      </Field>
      {!preview && (
        <Button onClick={() => loadPreview({})} disabled={!file || busy}>
          {busy ? 'Lendo arquivo...' : 'Ler arquivo e gerar prévia'}
        </Button>
      )}

      {preview && (
        <>
          <div className="pacto-import-summary">
            <div><strong>{preview.file.rows}</strong><span>linhas lidas</span></div>
            <div><strong>{preview.file.tables}</strong><span>tabelas</span></div>
            <div><strong>{preview.summary.groups}</strong><span>grupos detectados</span></div>
            <div><strong>{preview.summary.validGroups}</strong><span>grupos válidos</span></div>
            <div><strong>{preview.summary.errors}</strong><span>bloqueios</span></div>
            <div><strong>{preview.summary.warnings}</strong><span>alertas</span></div>
          </div>

          <section className="pacto-import-section">
            <div className="card-title">2. Mapeamento de colunas</div>
            <div className="card-subtitle">
              O sistema preenche o que reconheceu. Corrija seleções incompletas e clique em “Atualizar prévia”.
            </div>
            <div className="form-grid">
              <Field label="Formato dos resultados">
                <Select
                  value={mapping.mode || 'long'}
                  onChange={(event) => {
                    setMapping((current) => ({ ...current, mode: event.target.value }));
                    setMappingDirty(true);
                  }}
                >
                  <option value="long">Uma linha por nível (formato longo)</option>
                  <option value="wide">Um nível por coluna (formato largo)</option>
                </Select>
              </Field>
              <div />
              {preview.mappingFields.map((field) => (
                <Field key={field.key} label={field.label} required={field.required}>
                  <Select
                    value={mapping.columns?.[field.key] || ''}
                    onChange={(event) => changeMapping('columns', field.key, event.target.value)}
                  >
                    <option value="">Não mapear</option>
                    {sourceOptions.map((column) => (
                      <option key={column.key} value={column.key}>
                        {column.label}{column.samples?.length ? ` — ex.: ${column.samples.slice(0, 2).join(', ')}` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>

            {(mapping.mode === 'wide') && (
              <details className="pacto-import-details">
                <summary>Mapear colunas de quantidades por habilidade e nível</summary>
                <div className="form-grid pacto-import-result-mapping">
                  {preview.resultFields.map((field) => (
                    <Field key={field.key} label={`${field.componentLabel} · ${field.skillLabel} · ${field.levelLabel}`}>
                      <span className="pacto-import-map-label">Quantidade</span>
                      <Select
                        value={mapping.results?.[field.key] || ''}
                        onChange={(event) => changeMapping('results', field.key, event.target.value)}
                      >
                        <option value="">Não mapear</option>
                        {sourceOptions.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
                      </Select>
                      <span className="pacto-import-map-label">Percentual do arquivo (opcional)</span>
                      <Select
                        value={mapping.resultPercentages?.[field.key] || ''}
                        onChange={(event) => changeMapping('resultPercentages', field.key, event.target.value)}
                      >
                        <option value="">Não mapear</option>
                        {sourceOptions.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
                      </Select>
                    </Field>
                  ))}
                </div>
              </details>
            )}

            {preview.classMatches?.length > 0 && (
              <div className="pacto-import-class-map">
                <strong>Correspondência com turmas desta escola</strong>
                <div className="form-grid">
                  {preview.classMatches.map((source) => (
                    <Field key={source.key} label={`${source.grade}º ano · ${source.shift || 'turno não informado'} · ${source.className}`} required>
                      <Select
                        value={mapping.classes?.[source.key] || ''}
                        onChange={(event) => changeMapping('classes', source.key, event.target.value)}
                      >
                        <option value="">Selecione a turma</option>
                        {source.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </Select>
                    </Field>
                  ))}
                </div>
              </div>
            )}
            {mappingDirty && <div className="alert alert-warn">O mapeamento foi alterado. Atualize a prévia antes de confirmar.</div>}
          </section>

          <section className="pacto-import-section">
            <div className="card-title">3. Prévia dos dados</div>
            <div className="card-subtitle">Confira todos os grupos e todas as quantidades. Percentuais são recalculados pelo sistema.</div>
            <ImportIssues title="Pendências que bloqueiam a importação" items={preview.errors} />
            <ImportIssues title="Alertas para conferência" items={preview.warnings} warning />

            {preview.groups.map((group) => (
              <article key={group.id} className={`pacto-import-group ${group.valid ? 'valid' : 'invalid'}`}>
                <div className="card-header-row">
                  <div>
                    <strong>{group.grade}º ano · Turma {group.className} · {group.assessment}</strong>
                    <div className="card-subtitle">
                      {group.classLabel || 'Turma do sistema ainda não selecionada'} · linhas {group.sourceRows.slice(0, 10).join(', ')}
                      {group.sourceRowCount > 10 ? ` e mais ${group.sourceRowCount - 10}` : ''}
                    </div>
                  </div>
                  <Badge cls={group.valid ? 'badge-green' : 'badge-red'}>{group.valid ? 'Válido' : 'Revisar'}</Badge>
                </div>
                {group.replacesDraft && <div className="alert alert-warn">Existe um rascunho desta avaliação. Os componentes presentes no arquivo serão atualizados somente após confirmação explícita; os demais serão preservados.</div>}
                <ImportIssues title="Bloqueios deste grupo" items={group.errors} />
                <ImportIssues title="Alertas deste grupo" items={group.warnings} warning />
                {group.components.map((component) => (
                  <div key={component.component} className="table-wrap pacto-import-table">
                    <div className="pacto-results-caption">
                      {component.label} · {component.enrolled ?? '—'} matriculados · {component.evaluated ?? '—'} avaliados
                    </div>
                    <table className="table">
                      <thead><tr><th>Habilidade</th><th>Nível 1</th><th>Nível 2</th><th>Nível 3</th></tr></thead>
                      <tbody>{component.skills.map((skill) => (
                        <tr key={skill.skill}>
                          <td><strong>{skill.label}</strong></td>
                          {skill.levels.map((level) => (
                            <td key={level.level}>
                              <span className="pacto-result-level">{level.label}</span>
                              <strong>{level.count ?? '—'}{level.percentage == null ? '' : ` · ${level.percentage}%`}</strong>
                              {level.sourcePercentage != null && <small>Arquivo: {level.sourcePercentage}%</small>}
                            </td>
                          ))}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ))}
              </article>
            ))}
          </section>

          {hasReplacements && (
            <label className="checkbox-row pacto-import-replace-confirm">
              <input type="checkbox" checked={confirmReplace} onChange={(event) => setConfirmReplace(event.target.checked)} />
              <span>Confirmo que revisei a prévia e autorizo atualizar os componentes importados nos rascunhos indicados.</span>
            </label>
          )}
          <div className={`alert ${preview.canConfirm ? 'alert-success' : 'alert-warn'}`}>
            {preview.canConfirm
              ? 'Prévia válida. Ao confirmar, todas as avaliações serão gravadas juntas como RASCUNHO e ainda precisarão do envio final.'
              : 'A confirmação permanece bloqueada até que todas as pendências sejam corrigidas.'}
          </div>
        </>
      )}
    </Modal>
  );
}

function SavedResultsTables({ pactoClass, definitions }) {
  const assessments = (pactoClass.assessments || []).filter((assessment) => (
    (pactoClass.enabledAssessments || ALL_ASSESSMENTS).includes(assessment.code) && assessment.components.some((component) => component.results.length)
  ));
  if (!assessments.length) return null;

  return (
    <section className="card card-pad">
      <div className="card-title">Resultados já salvos</div>
      <div className="card-subtitle">Dados reais recarregados da API para esta escola e turma.</div>
      {assessments.map((assessment) => {
        const definition = definitions.find((item) => item.code === assessment.code);
        if (!definition) return null;
        const status = STATUS[assessment.status];
        return (
          <div key={assessment.id} className="pacto-saved-assessment">
            <div className="card-header-row">
              <strong>{definition.label}</strong>
              <Badge cls={status?.cls}>{status?.label || assessment.status}</Badge>
            </div>
            {assessment.components.map((component) => {
              const componentDefinition = definition.components.find((item) => item.code === component.component);
              if (!componentDefinition) return null;
              const resultMap = new Map(component.results.map((item) => [`${item.skill}:${item.level}`, item]));
              return (
                <div key={component.id} className="table-wrap" style={{ marginTop: 10 }}>
                  <div className="pacto-results-caption">
                    {componentDefinition.label} · {component.enrolled} matriculados · {component.evaluated} avaliados
                  </div>
                  <table className="table">
                    <thead><tr><th>Habilidade</th><th colSpan="3">Distribuição registrada</th></tr></thead>
                    <tbody>
                      {componentDefinition.skills.map((skill) => (
                        <tr key={skill.code}>
                          <td><strong>{skill.label}</strong></td>
                          {skill.levels.map((level) => {
                            const result = resultMap.get(`${skill.code}:${level.code}`);
                            return (
                              <td key={level.code}>
                                <span className="pacto-result-level">{level.label}</span>
                                {result ? <strong>{result.count} · {result.percentage == null ? '—' : `${result.percentage}%`}</strong> : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

export default function PactoCollection() {
  const { token } = useParams();
  const { success, error: toastError, toast } = useToast();
  const { data, loading, error, refresh } = useApi(() => pactoPublicApi.bootstrap(token), [token]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [assessmentCode, setAssessmentCode] = useState('A0');
  const [form, setForm] = useState({ components: [] });
  const [busy, setBusy] = useState(false);
  const [classModal, setClassModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [classForm, setClassForm] = useState({
    grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS,
  });

  const selectedClass = useMemo(
    () => data?.classes?.find((item) => item.id === selectedClassId) || null,
    [data, selectedClassId],
  );
  const availableAssessments = useMemo(() => {
    const enabled = new Set(selectedClass?.enabledAssessments || []);
    return (data?.config?.assessments || []).filter((item) => enabled.has(item.code));
  }, [data, selectedClass]);
  const definition = useMemo(
    () => data?.definitions?.[selectedClass?.grade]?.find((item) => (
      item.code === assessmentCode && availableAssessments.some((available) => available.code === item.code)
    )) || null,
    [data, selectedClass, assessmentCode, availableAssessments],
  );
  const existing = useMemo(
    () => selectedClass?.assessments.find((item) => item.code === assessmentCode) || null,
    [selectedClass, assessmentCode],
  );
  const selectedClassIdentificationLocked = Boolean(
    selectedClass?.assessments.some((assessment) => assessment.status === 'ENVIADO'),
  );

  useEffect(() => {
    if (!selectedClassId && data?.classes?.length) setSelectedClassId(data.classes[0].id);
  }, [data, selectedClassId]);

  useEffect(() => {
    if (availableAssessments.length && !availableAssessments.some((item) => item.code === assessmentCode)) {
      setAssessmentCode(availableAssessments[0].code);
    }
  }, [availableAssessments, assessmentCode]);

  useEffect(() => {
    if (definition) setForm(emptyForm(definition, existing));
  }, [definition, existing]);

  if (loading) return <div className="public-collection-page"><LoadingBlock label="Validando link de coleta..." /></div>;
  if (error) {
    return (
      <div className="public-collection-page">
        <div className="public-collection-shell public-collection-error">
          <div className="public-collection-brand">CPE</div>
          <h1>Não foi possível abrir a coleta</h1>
          <p>{error.message}</p>
          <p>Solicite um novo link ao administrador do programa.</p>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const locked = existing?.status === 'ENVIADO';

  const updateParticipation = (componentCode, field, value) => {
    setForm((current) => ({
      components: current.components.map((component) => (
        component.component === componentCode ? { ...component, [field]: value } : component
      )),
    }));
  };

  const updateResult = (componentCode, key, value) => {
    setForm((current) => ({
      components: current.components.map((component) => (
        component.component === componentCode
          ? { ...component, results: { ...component.results, [key]: value } }
          : component
      )),
    }));
  };

  const persist = async (submit) => {
    if (!selectedClass || !definition) return;
    if (submit && !window.confirm(`Enviar definitivamente a avaliação ${assessmentCode}? Correções posteriores exigirão reabertura pelo administrador.`)) return;
    setBusy(true);
    try {
      const payload = toPayload(selectedClass, assessmentCode, form);
      const result = submit
        ? await pactoPublicApi.submit(token, payload)
        : await pactoPublicApi.saveDraft(token, payload);
      if (result.warnings?.length) {
        toast(result.warnings.map((item) => item.message).join(' · '), {
          type: 'warning',
          title: submit ? 'Enviado com alerta' : 'Rascunho salvo com alerta',
        });
      } else {
        success(submit ? 'Avaliação enviada com sucesso.' : 'Rascunho salvo.');
      }
      refresh();
    } catch (err) {
      const details = err.details?.map((item) => item.message).join(' · ');
      toastError(details || err.message);
    } finally {
      setBusy(false);
    }
  };

  const openNewClass = () => {
    setEditingClass(null);
    setClassForm({ grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS });
    setClassModal(true);
  };

  const openEditClass = () => {
    if (!selectedClass) return;
    setEditingClass(selectedClass);
    setClassForm({
      grade: selectedClass.grade,
      shift: selectedClass.shift,
      name: selectedClass.name,
      enabledAssessments: selectedClass.enabledAssessments || ALL_ASSESSMENTS,
    });
    setClassModal(true);
  };

  const toggleClassAssessment = (code) => {
    setClassForm((current) => ({
      ...current,
      enabledAssessments: current.enabledAssessments.includes(code)
        ? current.enabledAssessments.filter((item) => item !== code)
        : ALL_ASSESSMENTS.filter((item) => item === code || current.enabledAssessments.includes(item)),
    }));
  };

  const saveClass = async () => {
    setBusy(true);
    try {
      const payload = { ...classForm, grade: Number(classForm.grade) };
      const saved = editingClass
        ? await pactoPublicApi.updateClass(token, editingClass.id, payload)
        : await pactoPublicApi.createClass(token, payload);
      success(editingClass ? 'Turma atualizada.' : 'Turma adicionada.');
      setClassModal(false);
      setSelectedClassId(saved.id);
      refresh();
    } catch (err) {
      toastError(err.details?.map((item) => item.message).join(' · ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="public-collection-page">
      <header className="public-collection-header">
        <div className="public-collection-brand">CPE</div>
        <div>
          <strong>{data.program.name}</strong>
          <span>Coleta oficial {data.program.year}</span>
        </div>
      </header>

      <main className="public-collection-shell">
        <section className="public-school-card">
          <div>
            <span>Escola vinculada ao link</span>
            <h1>{data.school.name}</h1>
            <p>INEP {data.school.inep || 'não informado'} · link válido até {new Date(data.link.expiresAt).toLocaleDateString('pt-BR')}</p>
          </div>
          <Badge cls="badge-green">Link verificado</Badge>
        </section>

        <div className="alert alert-info">
          Preencha uma avaliação por vez. Os percentuais são calculados automaticamente e os dados podem ser salvos como rascunho antes do envio.
        </div>

        <section className="pacto-import-callout">
          <div>
            <strong>Já possui os resultados exportados do Power BI?</strong>
            <span>Importe CSV/XLSX, confira o mapeamento e a prévia e salve A0, A1, A2 e A3 como rascunhos. O preenchimento manual continua disponível.</span>
          </div>
          <Button variant="secondary" onClick={() => setImportModal(true)}>Importar resultados do Power BI</Button>
        </section>

        <section className="card card-pad">
          <div className="card-header-row">
            <div>
              <div className="card-title">1. Turma</div>
              <div className="card-subtitle">Selecione uma turma existente ou adicione outra turma desta escola.</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {selectedClass && (
                <Button
                  size="sm"
                  variant="secondary"
                  title="Corrigir a identificação ou configurar as avaliações disponíveis"
                  onClick={openEditClass}
                >
                  Configurar turma
                </Button>
              )}
              <Button size="sm" onClick={openNewClass}>+ Adicionar turma</Button>
            </div>
          </div>
          {data.classes.length ? (
            <Select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>
              {data.classes.map((item) => (
                <option key={item.id} value={item.id}>{item.grade}º ano · Turno {item.shift} · Turma {item.name}</option>
              ))}
            </Select>
          ) : (
            <div className="empty-state"><div className="big">🏫</div>Nenhuma turma cadastrada. Use “Adicionar turma” para começar.</div>
          )}
        </section>

        {selectedClass && (
          <>
            <section className="card card-pad">
              <div className="card-title">2. Etapa da avaliação</div>
              <div className="card-subtitle">São exibidas somente as avaliações habilitadas para a turma; cada uma possui envio independente.</div>
              <div className="pacto-assessment-selector">
                {availableAssessments.map((item) => {
                  const saved = selectedClass.assessments.find((assessment) => assessment.code === item.code);
                  const info = saved ? STATUS[saved.status] : null;
                  return (
                    <button
                      type="button"
                      key={item.code}
                      className={`pacto-assessment-button ${assessmentCode === item.code ? 'active' : ''}`}
                      onClick={() => setAssessmentCode(item.code)}
                    >
                      <strong>{item.code}</strong>
                      <span>{info?.label || 'Não iniciada'}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {definition && (
              <section className="card card-pad">
                <div className="card-header-row">
                  <div>
                    <div className="card-title">3. {definition.label}</div>
                    <div className="card-subtitle">Informe quantidades inteiras. A soma dos três níveis de cada habilidade deve fechar com os alunos avaliados.</div>
                  </div>
                  {existing && <Badge cls={STATUS[existing.status]?.cls}>{STATUS[existing.status]?.label}</Badge>}
                </div>

                {locked && (
                  <div className="alert alert-success">Esta avaliação já foi enviada. Para corrigir, solicite a reabertura ao administrador do CPE.</div>
                )}

                {definition.components.map((componentDefinition) => {
                  const component = form.components.find((item) => item.component === componentDefinition.code);
                  if (!component) return null;
                  const overEnrollment = component.evaluated !== '' && component.enrolled !== '' && Number(component.evaluated) > Number(component.enrolled);
                  return (
                    <div key={componentDefinition.code} className="pacto-component">
                      <h2>{componentDefinition.label}</h2>
                      <div className="form-grid">
                        <Field label="Nº de alunos matriculados" required>
                          <Input disabled={locked} type="number" min="0" step="1" value={component.enrolled} onChange={(event) => updateParticipation(component.component, 'enrolled', event.target.value)} />
                        </Field>
                        <Field label="Nº de alunos avaliados" required>
                          <Input disabled={locked} type="number" min="0" step="1" value={component.evaluated} onChange={(event) => updateParticipation(component.component, 'evaluated', event.target.value)} />
                        </Field>
                      </div>
                      {overEnrollment && <div className="alert alert-warn">A quantidade avaliada está acima da matriculada. O envio é permitido, mas confira os números.</div>}

                      <div className="pacto-skill-list">
                        {componentDefinition.skills.map((skill) => {
                          const values = skill.levels.map((level) => component.results[`${skill.code}:${level.code}`]);
                          const allFilled = values.every((value) => value !== '');
                          const sum = values.reduce((total, value) => total + (value === '' ? 0 : Number(value)), 0);
                          const matches = allFilled && component.evaluated !== '' && sum === Number(component.evaluated);
                          return (
                            <div key={skill.code} className="pacto-skill-card">
                              <div className="pacto-skill-header">
                                <strong>{skill.label}</strong>
                                {allFilled && component.evaluated !== '' && (
                                  <span className={matches ? 'pacto-sum-ok' : 'pacto-sum-error'}>
                                    Soma {sum} de {component.evaluated} avaliados
                                  </span>
                                )}
                              </div>
                              <div className="pacto-level-grid">
                                {skill.levels.map((level) => {
                                  const key = `${skill.code}:${level.code}`;
                                  const value = component.results[key];
                                  const pct = percentage(value, component.evaluated);
                                  return (
                                    <Field key={level.code} label={level.label} hint={pct == null ? 'Percentual automático' : `${pct}% dos avaliados`}>
                                      <Input disabled={locked} type="number" min="0" step="1" value={value} onChange={(event) => updateResult(component.component, key, event.target.value)} />
                                    </Field>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {!locked && (
                  <div className="public-collection-actions">
                    <Button variant="secondary" onClick={() => persist(false)} disabled={busy}>{busy ? 'Salvando...' : 'Salvar rascunho'}</Button>
                    <Button variant="success" onClick={() => persist(true)} disabled={busy}>{busy ? 'Enviando...' : `Conferir e enviar ${assessmentCode}`}</Button>
                  </div>
                )}
              </section>
            )}

            <SavedResultsTables
              pactoClass={selectedClass}
              definitions={data.definitions?.[selectedClass.grade] || []}
            />
          </>
        )}
      </main>

      <footer className="public-collection-footer">CPE · Pacto pela Alfabetização 2026 · acesso exclusivo da escola</footer>

      <PactoImportModal
        open={importModal}
        onClose={() => setImportModal(false)}
        token={token}
        onImported={refresh}
        notifyError={toastError}
        notifySuccess={success}
      />

      <Modal
        open={classModal}
        onClose={() => setClassModal(false)}
        title={editingClass ? 'Corrigir identificação da turma' : 'Adicionar turma'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setClassModal(false)}>Cancelar</Button>
            <Button onClick={saveClass} disabled={busy || !classForm.name || !classForm.enabledAssessments.length}>{busy ? 'Salvando...' : 'Salvar turma'}</Button>
          </>
        }
      >
        {editingClass && selectedClassIdentificationLocked && (
          <div className="alert alert-info">Ano, turno e turma estão bloqueados porque há envio concluído. Ainda é possível acrescentar avaliações ao link.</div>
        )}
        <Field label="Ano" required>
          <Select disabled={Boolean(editingClass && selectedClassIdentificationLocked)} value={classForm.grade} onChange={(event) => setClassForm((current) => ({ ...current, grade: event.target.value }))}>
            <option value="1">1º ano</option><option value="2">2º ano</option>
          </Select>
        </Field>
        <Field label="Turno" required>
          <Select disabled={Boolean(editingClass && selectedClassIdentificationLocked)} value={classForm.shift} onChange={(event) => setClassForm((current) => ({ ...current, shift: event.target.value }))}>
            <option value="M">M</option><option value="T">T</option>
          </Select>
        </Field>
        <Field label="Turma" required>
          <Input disabled={Boolean(editingClass && selectedClassIdentificationLocked)} maxLength={30} value={classForm.name} onChange={(event) => setClassForm((current) => ({ ...current, name: event.target.value.toUpperCase() }))} placeholder="Ex.: A" />
        </Field>
        <Field label="Avaliações disponíveis" required hint="A página mostrará somente as avaliações selecionadas para esta turma.">
          <div className="pacto-assessment-checks">
            {ALL_ASSESSMENTS.map((code) => {
              const started = editingClass?.assessments?.some((assessment) => assessment.code === code);
              return (
                <label key={code} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={classForm.enabledAssessments.includes(code)}
                    disabled={started}
                    onChange={() => toggleClassAssessment(code)}
                  />
                  <span><strong>{code}</strong>{started ? ' · já iniciada' : ''}</span>
                </label>
              );
            })}
          </div>
        </Field>
      </Modal>
    </div>
  );
}
