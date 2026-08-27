import React, { useRef, useState } from 'react';
import { importsApi } from '../services/resources.js';
import { useToast } from '../contexts/ToastContext.jsx';
import { Button, Modal, Alert } from './ui.jsx';
import { ROW_STATUS } from '../utils/format.js';

/** Campos ajustáveis no plano B (só aparece se a detecção automática falhar). */
const FIELD_LIST = [
  { key: 'inep', label: 'Código INEP' },
  { key: 'address', label: 'Endereço' },
  { key: 'addressNumber', label: 'Número' },
  { key: 'addressComplement', label: 'Complemento' },
  { key: 'district', label: 'Bairro' },
  { key: 'cep', label: 'CEP' },
  { key: 'zone', label: 'Zona' },
  { key: 'schoolType', label: 'Tipo de escola' },
  { key: 'adminDependency', label: 'Dependência' },
  { key: 'situation', label: 'Situação' },
  { key: 'phone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
  { key: 'responsible', label: 'Gestor / Responsável' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
  { key: 'notes', label: 'Observações' },
];

const TYPE_LABEL = { ESCOLAS: 'Escolas', PROGRAMAS: 'Programas', INDICADORES: 'Indicadores', RESULTADOS: 'Resultados' };

/**
 * Importação simplificada:
 *   Selecionar planilha → (detecção automática) → Resumo → Importar → Resultado.
 * O mapeamento de colunas só aparece se a detecção automática não encontrar
 * a coluna obrigatória (Nome), ou pelo link discreto "Ajustar colunas".
 */
export default function ImportWizard({ type = 'ESCOLAS', open, onClose, onImported }) {
  const { toast, success, error } = useToast();
  const fileRef = useRef(null);

  const [phase, setPhase] = useState('select'); // select | preview | adjust | result
  const [busy, setBusy] = useState(false);
  const [analyze, setAnalyze] = useState(null); // análise (ESCOLAS)
  const [mapping, setMapping] = useState({});
  const [job, setJob] = useState(null);
  const [fileInfo, setFileInfo] = useState(null); // { name, totalRows }
  const [sourceFile, setSourceFile] = useState(null); // necessário para reenviar após o mapeamento
  const [result, setResult] = useState(null);

  const isSchools = type === 'ESCOLAS';
  const label = TYPE_LABEL[type] || type;

  const reset = () => {
    setPhase('select');
    setBusy(false);
    setAnalyze(null);
    setMapping({});
    setJob(null);
    setFileInfo(null);
    setSourceFile(null);
    setResult(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  // ---------- seleciona o arquivo ----------
  const onFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      if (isSchools) {
        setSourceFile(file);
        const an = await importsApi.analyzeSchools(file);
        const suggested = an.suggestedMapping || {};
        setAnalyze(an);
        setMapping(suggested);
        setFileInfo({ name: an.filename, totalRows: an.totalRows });
        if (!suggested.name) {
          // plano B: coluna do nome não detectada — pedir só ela
          setPhase('adjust');
          toast('Não reconhecemos a coluna do nome. Selecione qual é.', { type: 'warning' });
        } else {
          // fluxo direto: detecção automática completa
          const executed = await importsApi.executeSchools(file, suggested);
          setJob(executed);
          setPhase('preview');
        }
      } else {
        const executed = await importsApi.upload(file, type);
        setJob(executed);
        setFileInfo({ name: executed.filename, totalRows: executed.totalRows });
        setPhase('preview');
      }
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---------- revalidar com mapeamento ajustado ----------
  const runWithMapping = async () => {
    if (!mapping.name) return;
    setBusy(true);
    try {
      if (job?.status === 'PENDENTE') {
        await importsApi.cancel(job.id).catch(() => {});
      }
      if (!sourceFile) throw new Error('Selecione novamente a planilha.');
      const executed = await importsApi.executeSchools(sourceFile, mapping);
      setJob(executed);
      setPhase('preview');
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---------- confirmar ----------
  const confirm = async () => {
    setBusy(true);
    try {
      const res = await importsApi.confirm(job.id);
      setResult(res);
      const message =
        `${res.created} ${label.toLowerCase()} cadastrada(s), ${res.updated} atualizada(s)` +
        `${res.duplicates ? `, ${res.duplicates} duplicada(s) ignorada(s)` : ''}` +
        `${res.errors ? `, ${res.errors} com erro` : ''}.`;
      if (res.status === 'PARCIAL') {
        toast(message, { type: 'warning', title: 'Importação parcial' });
      } else {
        success(message, { title: 'Importação concluída' });
      }
      onImported?.(res);
      setPhase('result');
    } catch (err) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelJob = async () => {
    if (job?.status === 'PENDENTE') {
      await importsApi.cancel(job.id).catch(() => {});
    }
    close();
  };

  // ---------- derivados ----------
  const pending = job?.status === 'PENDENTE';
  const failed = job?.status === 'FALHOU';
  const errorRows = (job?.rows || []).filter((r) => r.status === 'ERRO');

  const footer =
    phase === 'select' ? (
      <>
        <Button variant="secondary" onClick={close} disabled={busy}>Cancelar</Button>
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Analisando planilha...' : 'Selecionar planilha'}
        </Button>
      </>
    ) : phase === 'adjust' ? (
      <>
        <Button variant="secondary" onClick={reset} disabled={busy}>← Outro arquivo</Button>
        <Button onClick={runWithMapping} disabled={busy || !mapping.name}>
          {busy ? 'Validando...' : 'Continuar'}
        </Button>
      </>
    ) : phase === 'result' ? (
      <Button onClick={close}>Concluir</Button>
    ) : failed ? (
      <>
        <Button variant="secondary" onClick={close}>Fechar</Button>
        <Button onClick={reset}>Tentar outro arquivo</Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onClick={cancelJob} disabled={busy}>Cancelar</Button>
        <Button variant="success" onClick={confirm} disabled={busy || !pending || job.validRows === 0}>
          {busy ? 'Importando...' : `Importar agora`}
        </Button>
      </>
    );

  return (
    <Modal open={open} onClose={close} title={`Importar ${label}`} size={failed ? '' : 'lg'} footer={footer}>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {/* ---------- 1. selecionar ---------- */}
      {phase === 'select' && (
        <div style={{ textAlign: 'center', padding: '26px 10px' }}>
          <div style={{ fontSize: 40 }}>📄</div>
          <p style={{ margin: '10px 0 18px', color: 'var(--text-2)', fontSize: 14 }}>
            Selecione sua planilha (<strong>.xlsx</strong> ou <strong>.csv</strong>) — as colunas são
            reconhecidas automaticamente.
          </p>
          <Button onClick={() => fileRef.current?.click()} disabled={busy} block>
            {busy ? 'Analisando planilha...' : 'Selecionar planilha'}
          </Button>
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-3)' }}>
            INEP existente atualiza · INEP novo cadastra · nada é gravado antes da confirmação ·{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                importsApi.template(type, 'xlsx').catch((err) => error(err.message));
              }}
            >
              baixar modelo
            </a>
          </div>
        </div>
      )}

      {/* ---------- plano B: coluna do nome não detectada ---------- */}
      {phase === 'adjust' && analyze && (
        <>
          <Alert type="warn">
            Analisamos <strong>{analyze.totalRows}</strong> linhas e <strong>{analyze.headers.length}</strong> colunas,
            mas não identificamos qual contém o <strong>nome da escola</strong>. Selecione abaixo.
          </Alert>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '14px 0' }}>
            <strong style={{ fontSize: 13 }}>Nome da escola *</strong>
            <select
              className="select"
              style={{ flex: 1 }}
              value={mapping.name || ''}
              onChange={(e) => setMapping((m) => ({ ...m, name: e.target.value || undefined }))}
            >
              <option value="">Selecione a coluna...</option>
              {analyze.headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--text-2)' }}>
              Outras colunas (opcional — já preenchidas quando reconhecidas)
            </summary>
            <div className="form-grid" style={{ marginTop: 10 }}>
              {FIELD_LIST.map((f) => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-2)', minWidth: 120 }}>{f.label}</label>
                  <select
                    className="select"
                    style={{ flex: 1, fontSize: 12.5, padding: '4px 26px 4px 8px' }}
                    value={mapping[f.key] || ''}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))
                    }
                  >
                    <option value="">—</option>
                    {analyze.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </details>
        </>
      )}

      {/* ---------- 2. resumo ---------- */}
      {phase === 'preview' && job && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{fileInfo?.name}</strong>
              <span style={{ color: 'var(--text-3)', fontSize: 12.5 }}> · {job.totalRows} linhas lidas</span>
            </div>
            {isSchools && (
              <a
                href="#"
                style={{ fontSize: 12 }}
                onClick={(e) => {
                  e.preventDefault();
                  setPhase('adjust');
                }}
              >
                Ajustar colunas
              </a>
            )}
          </div>

          {job.summary?.mapping && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
              {Object.entries(job.summary.mapping).map(([field, header]) => (
                <span key={field} className="badge badge-green" title={`campo do sistema: ${field}`}>✓ {header}</span>
              ))}
            </div>
          )}

          {job.error ? (
            <Alert type="error">{job.error}</Alert>
          ) : (
            <>
              <div className="import-summary">
                <div className="cell" style={{ borderColor: 'var(--success)', borderWidth: 2 }}>
                  <div className="num" style={{ color: 'var(--success)' }}>{job.newRows}</div>
                  <div className="lbl">Novas</div>
                </div>
                <div className="cell" style={{ borderColor: 'var(--primary)', borderWidth: 2 }}>
                  <div className="num" style={{ color: 'var(--primary)' }}>{job.updatedRows}</div>
                  <div className="lbl">Atualizações</div>
                </div>
                <div className="cell">
                  <div className="num" style={{ color: 'var(--warning)' }}>{job.duplicateRows}</div>
                  <div className="lbl">Duplicadas</div>
                </div>
                <div className="cell" style={{ borderColor: job.errorRows ? 'var(--danger)' : 'var(--border)', borderWidth: job.errorRows ? 2 : 1 }}>
                  <div className="num" style={{ color: job.errorRows ? 'var(--danger)' : 'var(--text-3)' }}>{job.errorRows}</div>
                  <div className="lbl">Com erro</div>
                </div>
              </div>

              {pending && job.validRows === 0 && (
                <Alert type="warn">Nenhuma linha válida para importar. Corrija o arquivo e tente novamente.</Alert>
              )}

              {errorRows.length > 0 && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--danger-bg)', borderRadius: 9, fontSize: 12.5, color: '#b91c1c' }}>
                  {errorRows.slice(0, 8).map((r) => (
                    <div key={r.rowNumber}>
                      Linha {r.rowNumber}
                      {r.data?.name ? ` · ${String(r.data.name).slice(0, 40)}` : ''}
                      {(r.errors || []).length > 0 &&
                        ` · ${(r.errors || []).map((e) => `${e.field ? `${e.field}: ` : ''}${e.message}`).join(' · ')}`}
                    </div>
                  ))}
                  {errorRows.length > 8 && <div>+ {errorRows.length - 8} outra(s) linha(s) com erro (serão ignoradas)</div>}
                </div>
              )}

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--text-2)' }}>
                  Ver todas as linhas
                </summary>
                <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 9, marginTop: 8 }}>
                  <table className="data-table">
                    <thead>
                      <tr><th>Linha</th><th>Status</th><th>Dados</th></tr>
                    </thead>
                    <tbody>
                      {job.rows.slice(0, 200).map((r) => {
                        const info = ROW_STATUS[r.status];
                        const dataStr = r.data
                          ? Object.entries(r.data)
                              .filter(([k, v]) => v !== null && v !== undefined && v !== '' && !k.startsWith('_'))
                              .slice(0, 5)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' · ')
                          : '—';
                        return (
                          <tr key={r.rowNumber}>
                            <td>{r.rowNumber}</td>
                            <td><span className={`badge ${info?.cls || 'badge-gray'}`}>{info?.label || r.status}</span></td>
                            <td style={{ fontSize: 12 }}>
                              {dataStr}
                              {(r.errors || []).length > 0 && (
                                <span style={{ color: 'var(--danger)' }}> — {(r.errors || []).map((e) => e.message).join(' · ')}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </>
      )}

      {/* ---------- 3. resultado ---------- */}
      {phase === 'result' && result && (
        <div style={{ textAlign: 'center', padding: '26px 10px' }}>
          <div style={{ fontSize: 44 }}>{result.status === 'PARCIAL' ? '⚠️' : '✅'}</div>
          <h3 style={{ margin: '10px 0 6px' }}>
            Importação {result.status === 'PARCIAL' ? 'parcial' : 'concluída'}
          </h3>
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 4 }}>
            Total: <strong>{job?.totalRows ?? '—'}</strong> linha(s) processada(s)
          </p>
          <p style={{ color: 'var(--text-2)', fontSize: 14 }}>
            <strong style={{ color: 'var(--success)' }}>{result.created}</strong> cadastrada(s) ·{' '}
            <strong style={{ color: 'var(--primary)' }}>{result.updated}</strong> atualizada(s)
            {result.duplicates ? (
              <>
                {' '}· <strong style={{ color: 'var(--warning)' }}>{result.duplicates}</strong> duplicada(s) ignorada(s)
              </>
            ) : null}
            {result.errors ? (
              <>
                {' '}· <strong style={{ color: 'var(--danger)' }}>{result.errors}</strong> com erro
              </>
            ) : null}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Linhas com erro não foram gravadas — corrija na planilha e reimporte quando quiser.
          </p>
        </div>
      )}
    </Modal>
  );
}
