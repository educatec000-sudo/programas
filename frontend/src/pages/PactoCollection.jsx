import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import { pactoPublicApi } from '../services/resources.js';
import { useToast } from '../contexts/ToastContext.jsx';
import { Badge, Button, Field, Input, LoadingBlock, Modal, Select } from '../components/ui.jsx';
import { formatGradeLabel } from '../programs/pacto/dashboard.js';
import {
  filterMappingFieldsByMode,
  getCompatibleColumnsForField,
  getCompatibleResultColumns,
} from '../programs/pacto/mapping.js';

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

  const confirm = async (submitAll = false) => {
    if (!file || !preview?.canConfirm || mappingDirty) return;
    setBusy(true);
    try {
      const result = await pactoPublicApi.confirmImport(token, file, {
        mapping,
        previewDigest: preview.previewDigest,
        confirmReplace,
        submitAll,
      });
      notifySuccess(
        submitAll
          ? `${result.count} avaliação(ões) importada(s) e enviada(s) definitivamente com sucesso!`
          : `${result.count} avaliação(ões) importada(s) como rascunho.`,
      );
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
  const [showAllColumns, setShowAllColumns] = useState({});

  const visibleMappingFields = useMemo(() => {
    if (!preview?.mappingFields) return [];
    return filterMappingFieldsByMode(preview.mappingFields, mapping.mode || 'long');
  }, [preview?.mappingFields, mapping.mode]);

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
            variant="secondary"
            onClick={() => confirm(false)}
            disabled={busy || !preview?.canConfirm || mappingDirty || (hasReplacements && !confirmReplace)}
          >
            {busy ? 'Importando...' : `Salvar ${preview?.summary?.validGroups ? `${preview.summary.validGroups} grupo(s)` : ''} como rascunho`}
          </Button>
          <Button
            variant="success"
            onClick={() => confirm(true)}
            disabled={busy || !preview?.canConfirm || mappingDirty || (hasReplacements && !confirmReplace)}
          >
            {busy ? 'Enviando...' : `🚀 Confirmar e enviar ${preview?.summary?.validGroups ? `${preview.summary.validGroups} grupo(s)` : ''} definitivamente`}
          </Button>
        </>
      }
    >
      <div className="pacto-import-intro">
        <strong>CSV ou XLSX estruturado</strong>
        <span>O arquivo será apenas lido nesta etapa. Nenhum dado é salvo antes da confirmação.</span>
        <span>Planilhas de PII, 1º Ano e 2º Ano (Língua Portuguesa, Matemática e Habilidades Iniciais) são reconhecidas e importadas automaticamente. Registros válidos são importados mesmo que outros grupos possuam pendências.</span>
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
          <div className="pacto-import-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, margin: '14px 0' }}>
            <div className="stat-card" style={{ padding: '10px 14px', background: '#f8fafc' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{preview.file.rows}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>linhas no arquivo</div>
            </div>
            <div className="stat-card" style={{ padding: '10px 14px', background: '#f8fafc' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{preview.summary.groups}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>grupos detectados</div>
            </div>
            <div className="stat-card" style={{ padding: '10px 14px', background: '#ecfdf5', borderColor: '#a7f3d0' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>{preview.summary.validGroups}</div>
              <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>🟢 grupos válidos</div>
            </div>
            {preview.summary.pendingGroups > 0 && (
              <div className="stat-card" style={{ padding: '10px 14px', background: '#fffbeb', borderColor: '#fde68a' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#d97706' }}>{preview.summary.pendingGroups}</div>
                <div style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>🟡 com pendências</div>
              </div>
            )}
            {preview.summary.errors > 0 && (
              <div className="stat-card" style={{ padding: '10px 14px', background: '#fef2f2', borderColor: '#fecaca' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{preview.summary.errors}</div>
                <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 600 }}>🔴 erros críticos</div>
              </div>
            )}
          </div>

          <section className="pacto-import-section">
            <div className="card-title">2. Mapeamento de colunas</div>
            <div className="card-subtitle">
              O sistema sugere automaticamente as colunas compatíveis. Ajuste se necessário e clique em “Atualizar prévia”.
            </div>
            <div className="form-grid">
              <Field label="Formato dos resultados" hint="Escolha o layout correspondente à estrutura da sua planilha.">
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
              {visibleMappingFields.map((field) => {
                const currentValue = mapping.columns?.[field.key] || '';
                const seeAll = Boolean(showAllColumns[field.key]);
                const compatibleOptions = seeAll
                  ? sourceOptions
                  : getCompatibleColumnsForField(field.key, sourceOptions, currentValue);

                return (
                  <Field key={field.key} label={field.label} required={field.required} hint={field.hint}>
                    <Select
                      value={currentValue}
                      onChange={(event) => changeMapping('columns', field.key, event.target.value)}
                    >
                      <option value="">Não mapear</option>
                      {compatibleOptions.map((column) => (
                        <option key={column.key} value={column.key}>
                          {column.label}{column.samples?.length ? ` — ex.: ${column.samples.slice(0, 2).join(', ')}` : ''}
                        </option>
                      ))}
                    </Select>
                    {sourceOptions.length > compatibleOptions.length && (
                      <div style={{ textAlign: 'right', marginTop: 2 }}>
                        <button
                          type="button"
                          className="btn-link"
                          style={{ fontSize: 11, color: 'var(--primary)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                          onClick={() => setShowAllColumns((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                        >
                          {seeAll ? 'Mostrar apenas colunas sugeridas' : `+ Ver todas as ${sourceOptions.length} colunas`}
                        </button>
                      </div>
                    )}
                  </Field>
                );
              })}
            </div>

            {(mapping.mode === 'wide') && (
              <details className="pacto-import-details">
                <summary>Mapear colunas de quantidades por habilidade e nível</summary>
                <div className="form-grid pacto-import-result-mapping">
                  {preview.resultFields.map((field) => {
                    const currentCount = mapping.results?.[field.key] || '';
                    const currentPerc = mapping.resultPercentages?.[field.key] || '';
                    const countOptions = getCompatibleResultColumns(field, sourceOptions, false, currentCount);
                    const percOptions = getCompatibleResultColumns(field, sourceOptions, true, currentPerc);

                    return (
                      <Field key={field.key} label={`${field.componentLabel} · ${field.skillLabel} · ${field.levelLabel}`}>
                        <span className="pacto-import-map-label">Quantidade</span>
                        <Select
                          value={currentCount}
                          onChange={(event) => changeMapping('results', field.key, event.target.value)}
                        >
                          <option value="">Não mapear</option>
                          {countOptions.map((column) => (
                            <option key={column.key} value={column.key}>
                              {column.label}{column.samples?.length ? ` — ex.: ${column.samples.slice(0, 2).join(', ')}` : ''}
                            </option>
                          ))}
                        </Select>
                        <span className="pacto-import-map-label">Percentual do arquivo (opcional)</span>
                        <Select
                          value={currentPerc}
                          onChange={(event) => changeMapping('resultPercentages', field.key, event.target.value)}
                        >
                          <option value="">Não mapear</option>
                          {percOptions.map((column) => (
                            <option key={column.key} value={column.key}>
                              {column.label}{column.samples?.length ? ` — ex.: ${column.samples.slice(0, 2).join(', ')}` : ''}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    );
                  })}
                </div>
              </details>
            )}

            {preview.classMatches?.length > 0 && (
              <div className="pacto-import-class-map">
                <strong>Correspondência com turmas desta escola</strong>
                <div className="form-grid">
                  {preview.classMatches.map((source) => (
                    <Field key={source.key} label={`${formatGradeLabel(source.grade)} · ${source.shift || 'turno não informado'} · ${source.className}`} required>
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
            {preview.globalErrors?.length > 0 && <ImportIssues title="Pendências críticas do arquivo" items={preview.globalErrors} />}
            <ImportIssues title="Alertas gerais para conferência" items={preview.warnings} warning />

            {preview.groups.map((group) => (
              <article key={group.id} className={`pacto-import-group ${group.valid ? 'valid' : 'invalid'}`}>
                <div className="card-header-row">
                  <div>
                    <strong>{formatGradeLabel(group.grade)} · Turma {group.className} · {group.assessment}</strong>
                    <div className="card-subtitle">
                      {group.classLabel || 'Turma do sistema ainda não selecionada'} · linhas {group.sourceRows.slice(0, 10).join(', ')}
                      {group.sourceRowCount > 10 ? ` e mais ${group.sourceRowCount - 10}` : ''}
                    </div>
                  </div>
                  <Badge cls={group.valid ? 'badge-green' : 'badge-yellow'}>
                    {group.valid ? '🟢 Válido para importação' : '🟡 Pendência (Não será importado)'}
                  </Badge>
                </div>
                {group.replacesDraft && <div className="alert alert-warn">Existe um rascunho desta avaliação. Os componentes presentes no arquivo serão atualizados somente após confirmação explícita; os demais serão preservados.</div>}
                <ImportIssues title="Pendências deste grupo" items={group.errors} warning={!group.valid} />
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
          <div className={`alert ${preview.canConfirm ? (preview.summary.pendingGroups > 0 ? 'alert-info' : 'alert-success') : 'alert-warn'}`}>
            {preview.canConfirm ? (
              preview.summary.pendingGroups > 0 ? (
                <div>
                  <strong>🟢 {preview.summary.validGroups} grupo(s) válidos serão importados.</strong>
                  <div style={{ marginTop: 4 }}>
                    🟡 {preview.summary.pendingGroups} grupo(s) possuem pendências e não serão importados nesta etapa, permitindo que os válidos sejam salvos sem bloqueio.
                  </div>
                </div>
              ) : (
                'Todos os grupos estão válidos! Você pode salvar como rascunhos para revisar depois ou enviar tudo definitivamente agora.'
              )
            ) : (
              'A confirmação permanece bloqueada porque nenhum grupo válido foi encontrado ou há erro crítico no mapeamento do arquivo.'
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function SubmitAllConfirmModal({ open, onClose, drafts, token, onSubmitted, notifyError, notifySuccess }) {
  const [busy, setBusy] = useState(false);
  const [errorDetails, setErrorDetails] = useState(null);

  const handleSubmitAll = async () => {
    setBusy(true);
    setErrorDetails(null);
    try {
      const result = await pactoPublicApi.submitAll(token);
      notifySuccess(`${result.count} avaliação(ões) enviada(s) definitivamente com sucesso!`);
      onClose();
      onSubmitted();
    } catch (err) {
      if (err.details && Array.isArray(err.details)) {
        setErrorDetails(err.details);
      } else {
        notifyError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="📤 Enviar todas as avaliações definitivamente"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="success" onClick={handleSubmitAll} disabled={busy || !drafts.length}>
            {busy ? 'Enviando...' : `Confirmar envio de ${drafts.length} avaliações`}
          </Button>
        </>
      }
    >
      <div className="alert alert-info" style={{ marginTop: 0 }}>
        Todas as turmas e avaliações listadas abaixo serão validadas e enviadas definitivamente ao sistema. Correções futuras exigirão reabertura pelo administrador do programa.
      </div>

      {errorDetails && (
        <div className="alert alert-error">
          <strong>Pendências que impedem o envio conjunto:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {errorDetails.map((item, index) => (
              <li key={index}>
                <strong>{item.className} · {item.assessment}:</strong> {item.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 9, marginTop: 12 }}>
        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Turma</th>
              <th>Avaliação</th>
              <th>Componentes</th>
              <th>Status atual</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((d) => (
              <tr key={`${d.pactoClass.id}-${d.code}`}>
                <td>
                  <strong>{formatGradeLabel(d.pactoClass.grade)} {d.pactoClass.shift}</strong> — Turma {d.pactoClass.name}
                </td>
                <td><Badge cls="badge-blue">{d.code}</Badge></td>
                <td>
                  {d.components?.map((c) => `${c.component} (${c.evaluated || 0} avaliados)`).join(' · ') || 'Sem componentes'}
                </td>
                <td>
                  <Badge cls={STATUS[d.status]?.cls || 'badge-yellow'}>
                    {STATUS[d.status]?.label || d.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const [submitAllModal, setSubmitAllModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [classForm, setClassForm] = useState({
    grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS,
  });
  const [classRows, setClassRows] = useState([
    { grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS },
  ]);

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

  const allDrafts = useMemo(() => {
    if (!data?.classes) return [];
    return data.classes.flatMap((c) => (
      (c.assessments || [])
        .filter((a) => (c.enabledAssessments || ALL_ASSESSMENTS).includes(a.code))
        .filter((a) => a.status === 'RASCUNHO' || a.status === 'REABERTO')
        .map((a) => ({ ...a, pactoClass: c }))
    ));
  }, [data]);

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

  const handleDeleteDraft = async () => {
    if (!selectedClass || !assessmentCode) return;
    if (!window.confirm(`Tem certeza que deseja apagar o rascunho da avaliação ${assessmentCode} da turma ${selectedClass.name}? Todos os dados salvos nesta etapa serão removidos.`)) {
      return;
    }
    setBusy(true);
    try {
      await pactoPublicApi.deleteDraft(token, selectedClass.id, assessmentCode);
      success(`Rascunho de ${assessmentCode} apagado com sucesso.`);
      if (definition) {
        setForm(emptyForm(definition, null));
      }
      refresh();
    } catch (err) {
      toastError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openNewClass = () => {
    setEditingClass(null);
    setClassRows([
      { grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS },
    ]);
    setClassModal(true);
  };

  const addClassRow = () => {
    setClassRows((current) => [
      ...current,
      { grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS },
    ]);
  };

  const removeClassRow = (index) => {
    setClassRows((current) => current.filter((_, i) => i !== index));
  };

  const updateClassRow = (index, field, value) => {
    setClassRows((current) => current.map((row, i) => (
      i === index ? { ...row, [field]: value } : row
    )));
  };

  const toggleRowAssessment = (index, code) => {
    setClassRows((current) => current.map((row, i) => {
      if (i !== index) return row;
      const enabled = row.enabledAssessments.includes(code)
        ? row.enabledAssessments.filter((c) => c !== code)
        : ALL_ASSESSMENTS.filter((c) => c === code || row.enabledAssessments.includes(c));
      return { ...row, enabledAssessments: enabled };
    }));
  };

  const applyDefaultPreset = () => {
    setClassRows([
      { grade: 0, shift: 'M', name: 'A', enabledAssessments: ALL_ASSESSMENTS },
      { grade: 0, shift: 'T', name: 'B', enabledAssessments: ALL_ASSESSMENTS },
      { grade: 1, shift: 'M', name: 'A', enabledAssessments: ALL_ASSESSMENTS },
      { grade: 1, shift: 'T', name: 'B', enabledAssessments: ALL_ASSESSMENTS },
      { grade: 2, shift: 'M', name: 'A', enabledAssessments: ALL_ASSESSMENTS },
      { grade: 2, shift: 'T', name: 'B', enabledAssessments: ALL_ASSESSMENTS },
    ]);
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
      if (editingClass) {
        const payload = { ...classForm, grade: Number(classForm.grade) };
        const saved = await pactoPublicApi.updateClass(token, editingClass.id, payload);
        success('Turma atualizada com sucesso.');
        setClassModal(false);
        setSelectedClassId(saved.id);
      } else {
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

        const saved = await pactoPublicApi.createClass(token, { classes: validRows });
        const count = Array.isArray(saved) ? saved.length : 1;
        success(`${count} turma(s) adicionada(s) com sucesso!`);
        setClassModal(false);
        if (Array.isArray(saved) && saved.length > 0) {
          setSelectedClassId(saved[0].id);
        } else if (saved?.id) {
          setSelectedClassId(saved.id);
        }
      }
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

        {allDrafts.length > 0 && (
          <section className="card card-pad" style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 65%)', border: '1px solid #86efac', marginBottom: 16 }}>
            <div className="card-header-row" style={{ alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ color: '#166534', fontSize: 15 }}>
                    📤 {allDrafts.length} avaliação(ões) em rascunho prontas para envio
                  </strong>
                  <Badge cls="badge-yellow">{allDrafts.length} rascunho(s)</Badge>
                </div>
                <div style={{ color: 'var(--text-2)', fontSize: 12.5, marginTop: 4 }}>
                  Após a importação ou preenchimento, envie todas as turmas e avaliações juntas sem precisar entrar uma a uma.
                </div>
              </div>
              <Button
                variant="success"
                onClick={() => setSubmitAllModal(true)}
                disabled={busy}
              >
                🚀 Enviar todas ({allDrafts.length})
              </Button>
            </div>
          </section>
        )}

        <div className="alert alert-info">
          Preencha uma avaliação por vez ou utilize a importação do Power BI. Os percentuais são calculados automaticamente e os dados podem ser salvos como rascunho antes do envio definitivo.
        </div>

        <section className="pacto-import-callout">
          <div>
            <strong>Já possui os resultados exportados do Power BI?</strong>
            <span>Importe CSV/XLSX, confira a prévia e salve como rascunhos ou envie tudo de uma só vez. O preenchimento manual continua disponível.</span>
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
                <option key={item.id} value={item.id}>{formatGradeLabel(item.grade)} · Turno {item.shift} · Turma {item.name}</option>
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
                    {existing && (existing.status === 'RASCUNHO' || existing.status === 'REABERTO') && (
                      <Button variant="danger" onClick={handleDeleteDraft} disabled={busy}>
                        {busy ? 'Apagando...' : 'Apagar rascunho'}
                      </Button>
                    )}
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

      <SubmitAllConfirmModal
        open={submitAllModal}
        onClose={() => setSubmitAllModal(false)}
        drafts={allDrafts}
        token={token}
        onSubmitted={refresh}
        notifyError={toastError}
        notifySuccess={success}
      />

      <Modal
        open={classModal}
        onClose={() => setClassModal(false)}
        title={editingClass ? 'Corrigir identificação da turma' : 'Adicionar turmas'}
        size={editingClass ? 'sm' : 'lg'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setClassModal(false)}>Cancelar</Button>
            {editingClass ? (
              <Button onClick={saveClass} disabled={busy || !classForm.name || !classForm.enabledAssessments.length}>
                {busy ? 'Salvando...' : 'Salvar turma'}
              </Button>
            ) : (
              <Button onClick={saveClass} disabled={busy || !classRows.some((r) => r.name.trim().length > 0)}>
                {busy ? 'Salvando...' : `Salvar ${classRows.filter((r) => r.name.trim().length > 0).length > 1 ? `${classRows.filter((r) => r.name.trim().length > 0).length} turmas` : 'turma'}`}
              </Button>
            )}
          </>
        }
      >
        {editingClass ? (
          <>
            {selectedClassIdentificationLocked && (
              <div className="alert alert-info">Ano, turno e turma estão bloqueados porque há envio concluído. Ainda é possível acrescentar avaliações ao link.</div>
            )}
            <Field label="Etapa / Ano" required>
              <Select disabled={Boolean(selectedClassIdentificationLocked)} value={classForm.grade} onChange={(event) => setClassForm((current) => ({ ...current, grade: event.target.value }))}>
                <option value="0">PII</option><option value="1">1º ano</option><option value="2">2º ano</option>
              </Select>
            </Field>
            <Field label="Turno" required>
              <Select disabled={Boolean(selectedClassIdentificationLocked)} value={classForm.shift} onChange={(event) => setClassForm((current) => ({ ...current, shift: event.target.value }))}>
                <option value="M">M</option><option value="T">T</option>
              </Select>
            </Field>
            <Field label="Turma" required>
              <Input disabled={Boolean(selectedClassIdentificationLocked)} maxLength={30} value={classForm.name} onChange={(event) => setClassForm((current) => ({ ...current, name: event.target.value.toUpperCase() }))} placeholder="Ex.: A" />
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
          </>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>Adição rápida de turmas</span>
                <div style={{ fontSize: 12, color: '#64748b' }}>Cadastre várias turmas em uma única etapa.</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="secondary" onClick={applyDefaultPreset}>⚡ Padrão (PII, 1º e 2º A, B)</Button>
                <Button size="sm" onClick={addClassRow}>+ Adicionar linha</Button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '55vh', overflowY: 'auto', paddingRight: 4 }}>
              {classRows.map((row, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                  <div style={{ width: 110 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Etapa / Ano</label>
                    <Select value={row.grade} onChange={(e) => updateClassRow(idx, 'grade', e.target.value)}>
                      <option value="0">PII</option>
                      <option value="1">1º ano</option>
                      <option value="2">2º ano</option>
                    </Select>
                  </div>
                  <div style={{ width: 90 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Turno</label>
                    <Select value={row.shift} onChange={(e) => updateClassRow(idx, 'shift', e.target.value)}>
                      <option value="M">M</option>
                      <option value="T">T</option>
                    </Select>
                  </div>
                  <div style={{ width: 130 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Turma *</label>
                    <Input maxLength={30} value={row.name} onChange={(e) => updateClassRow(idx, 'name', e.target.value.toUpperCase())} placeholder="Ex.: A" />
                  </div>
                  <div style={{ flex: '1 1 200px' }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Avaliações</label>
                    <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                      {ALL_ASSESSMENTS.map((code) => (
                        <label key={code} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={row.enabledAssessments.includes(code)}
                            onChange={() => toggleRowAssessment(idx, code)}
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
                      onClick={() => removeClassRow(idx)}
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
    </div>
  );
}
