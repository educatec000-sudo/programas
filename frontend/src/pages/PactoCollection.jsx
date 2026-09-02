import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { pactoPublicApi } from '../services/resources.js';
import { useToast } from '../contexts/ToastContext.jsx';
import { Badge, Button, Field, Input, LoadingBlock, Modal, Select } from '../components/ui.jsx';

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

export default function PactoCollection() {
  const { token } = useParams();
  const { success, error: toastError, toast } = useToast();
  const { data, loading, error, refresh } = useApi(() => pactoPublicApi.bootstrap(token), [token]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [assessmentCode, setAssessmentCode] = useState('A0');
  const [form, setForm] = useState({ components: [] });
  const [busy, setBusy] = useState(false);
  const [classModal, setClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [classForm, setClassForm] = useState({ grade: 1, shift: 'M', name: '' });

  const selectedClass = useMemo(
    () => data?.classes?.find((item) => item.id === selectedClassId) || null,
    [data, selectedClassId],
  );
  const definition = useMemo(
    () => data?.definitions?.[selectedClass?.grade]?.find((item) => item.code === assessmentCode) || null,
    [data, selectedClass, assessmentCode],
  );
  const existing = useMemo(
    () => selectedClass?.assessments.find((item) => item.code === assessmentCode) || null,
    [selectedClass, assessmentCode],
  );

  useEffect(() => {
    if (!selectedClassId && data?.classes?.length) setSelectedClassId(data.classes[0].id);
  }, [data, selectedClassId]);

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
    setClassForm({ grade: 1, shift: 'M', name: '' });
    setClassModal(true);
  };

  const openEditClass = () => {
    if (!selectedClass) return;
    setEditingClass(selectedClass);
    setClassForm({ grade: selectedClass.grade, shift: selectedClass.shift, name: selectedClass.name });
    setClassModal(true);
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
                  disabled={selectedClass.assessments.some((assessment) => assessment.status === 'ENVIADO')}
                  title={selectedClass.assessments.some((assessment) => assessment.status === 'ENVIADO') ? 'Solicite a reabertura das avaliações enviadas antes de corrigir a turma.' : undefined}
                  onClick={openEditClass}
                >
                  Corrigir turma
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
              <div className="card-subtitle">A0, A1, A2 e A3 possuem envios independentes.</div>
              <div className="pacto-assessment-selector">
                {data.config.assessments.map((item) => {
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
          </>
        )}
      </main>

      <footer className="public-collection-footer">CPE · Pacto pela Alfabetização 2026 · acesso exclusivo da escola</footer>

      <Modal
        open={classModal}
        onClose={() => setClassModal(false)}
        title={editingClass ? 'Corrigir identificação da turma' : 'Adicionar turma'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setClassModal(false)}>Cancelar</Button>
            <Button onClick={saveClass} disabled={busy || !classForm.name}>{busy ? 'Salvando...' : 'Salvar turma'}</Button>
          </>
        }
      >
        <Field label="Ano" required>
          <Select value={classForm.grade} onChange={(event) => setClassForm((current) => ({ ...current, grade: event.target.value }))}>
            <option value="1">1º ano</option><option value="2">2º ano</option>
          </Select>
        </Field>
        <Field label="Turno" required>
          <Select value={classForm.shift} onChange={(event) => setClassForm((current) => ({ ...current, shift: event.target.value }))}>
            <option value="M">M</option><option value="T">T</option>
          </Select>
        </Field>
        <Field label="Turma" required>
          <Input maxLength={30} value={classForm.name} onChange={(event) => setClassForm((current) => ({ ...current, name: event.target.value.toUpperCase() }))} placeholder="Ex.: A" />
        </Field>
      </Modal>
    </div>
  );
}
