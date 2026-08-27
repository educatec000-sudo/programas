import fs from 'node:fs';
import { prisma } from '../lib/prisma.js';
import { HttpError, notFound } from '../lib/errors.js';
import { audit, AuditAction } from '../lib/audit.js';
import { parsePagination, buildPagination } from '../lib/pagination.js';
import { parseSpreadsheet } from '../modules/imports/parser.js';
import { getStrategy } from '../modules/imports/registry.js';
import { IMPORT_ROW_STATUS } from '../lib/constants.js';
import { notify } from './notification.service.js';
import { schoolsStrategy } from '../modules/imports/schools.strategy.js';
import { autoMapColumns, SCHOOL_FIELD_KEYS } from '../modules/imports/schoolFields.js';

const MAX_ROWS = 5000;
const MAX_STORED_ERRORS = 1000;

function summarize(rows) {
  const summary = {
    totalRows: rows.length,
    validRows: 0,
    newRows: 0,
    updatedRows: 0,
    duplicateRows: 0,
    errorRows: 0,
  };
  for (const r of rows) {
    if (r.status === IMPORT_ROW_STATUS.NOVO) { summary.newRows++; summary.validRows++; }
    else if (r.status === IMPORT_ROW_STATUS.ATUALIZAR) { summary.updatedRows++; summary.validRows++; }
    else if (r.status === IMPORT_ROW_STATUS.DUPLICADO) summary.duplicateRows++;
    else summary.errorRows++;
  }
  return summary;
}

/**
 * Etapa 1 do pipeline: Arquivo -> Leitura -> Validação -> Prévia.
 * Nada é gravado nas tabelas de negócio ainda — as linhas ficam em staging
 * dentro do ImportJob até a confirmação.
 */
export async function createJob({ file, type }, actor, ip) {
  const strategy = getStrategy(type);
  if (!strategy) throw new HttpError(400, `Tipo de importação inválido: ${type}`, 'BAD_REQUEST');
  if (!file) throw new HttpError(400, 'Envie o arquivo no campo "file"', 'BAD_REQUEST');

  const jobBase = {
    type,
    filename: file.originalname,
    userId: actor.id,
  };

  let rows;
  try {
    rows = parseSpreadsheet(file.path);
  } catch (err) {
    const job = await prisma.importJob.create({
      data: { ...jobBase, status: 'FALHOU', error: err.message },
    });
    cleanup(file.path);
    return job;
  } finally {
    cleanup(file.path);
  }

  if (rows.length > MAX_ROWS) {
    const job = await prisma.importJob.create({
      data: {
        ...jobBase,
        status: 'FALHOU',
        totalRows: rows.length,
        error: `Arquivo com ${rows.length} linhas — o limite é ${MAX_ROWS}. Divida o arquivo.`,
      },
    });
    return job;
  }

  const ctx = await strategy.loadContext();
  const seen = new Set();
  const staged = [];

  for (const row of rows) {
    const built = strategy.buildRow(row, ctx);
    const hasErrors = built.errors?.length > 0;
    const status = hasErrors
      ? IMPORT_ROW_STATUS.ERRO
      : strategy.classify(built, ctx, seen);
    staged.push({
      rowNumber: row.rowNumber,
      status,
      data: built.data,
      errors: built.errors || [],
      ...(built.key && { key: built.key }),
    });
  }

  const summary = summarize(staged);

  const job = await prisma.importJob.create({
    data: {
      ...jobBase,
      status: 'PENDENTE',
      ...summary,
      data: staged,
      summary: { strategy: strategy.label, parsedAt: new Date().toISOString() },
    },
  });

  // Erros detalhados em tabela própria (consulta rápida sem ler o JSON)
  const errorRows = staged.filter((r) => r.status === IMPORT_ROW_STATUS.ERRO).slice(0, MAX_STORED_ERRORS);
  if (errorRows.length) {
    await prisma.importError.createMany({
      data: errorRows.flatMap((r) =>
        r.errors.map((e) => ({
          jobId: job.id,
          rowNumber: r.rowNumber,
          field: e.field || null,
          message: e.message,
          value: String(e.value ?? ''),
        })),
      ),
    });
  }

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.IMPORT_PREVIEW,
    entity: 'ImportJob',
    entityId: job.id,
    metadata: { type, filename: job.filename, ...summary },
    ip,
  });

  return job;
}

/** Etapa 2: Confirmação — grava apenas linhas válidas, em transação. */
export async function confirmJob(id, actor, ip) {
  const job = await prisma.importJob.findUnique({ where: { id } });
  if (!job) throw notFound('Importação não encontrada');
  if (job.status !== 'PENDENTE') {
    throw new HttpError(409, `Esta importação está com status ${job.status} e não pode ser confirmada`, 'CONFLICT');
  }

  const strategy = getStrategy(job.type);
  const staged = job.data || [];
  const validRows = staged.filter(
    (r) => r.status === IMPORT_ROW_STATUS.NOVO || r.status === IMPORT_ROW_STATUS.ATUALIZAR,
  );

  let applied = { created: 0, updated: 0 };
  let failure = null;
  if (validRows.length && strategy) {
    try {
      const ctx = await strategy.loadContext();
      applied = await strategy.apply(validRows, ctx, { actor });
    } catch (err) {
      failure = err.message;
    }
  }

  const rowFailures = Array.isArray(applied.failures) ? applied.failures : [];
  const partial = !failure && rowFailures.length > 0;
  if (rowFailures.length) {
    await prisma.importError.createMany({
      data: rowFailures.slice(0, MAX_STORED_ERRORS).map((item) => ({
        jobId: id,
        rowNumber: Number(item.rowNumber) || 0,
        message: item.message || 'Falha ao gravar a linha',
        field: null,
        value: '',
      })),
    });
  }

  const updated = await prisma.importJob.update({
    where: { id },
    data: {
      status: failure ? 'FALHOU' : partial ? 'PARCIAL' : 'IMPORTADO',
      error: failure || (partial ? `${rowFailures.length} linha(s) falharam durante a gravação` : null),
      errorRows: job.errorRows + rowFailures.length,
      confirmedAt: new Date(),
      finishedAt: new Date(),
      summary: {
        ...(job.summary || {}),
        confirmedBy: actor.name,
        created: applied.created,
        updated: applied.updated,
        failedDuringApply: rowFailures.length,
      },
    },
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.IMPORT_CONFIRM,
    entity: 'ImportJob',
    entityId: id,
    metadata: { type: job.type, linhas: validRows.length, ...applied, failure },
    ip,
  });

  await notify(actor.id, {
    type: failure ? 'ERRO' : partial ? 'ALERTA' : 'SUCESSO',
    title: failure
      ? `Importação falhou: ${job.filename}`
      : partial
        ? `Importação parcial: ${job.filename}`
        : `Importação concluída: ${job.filename}`,
    message: failure
      ? `Erro ao gravar os dados: ${failure}`
      : `${applied.created} registro(s) criado(s), ${applied.updated} atualizado(s) e ${rowFailures.length} falha(s) em ${job.filename}.`,
    link: '/importacoes',
  });

  return { job: updated, ...applied };
}

export async function cancelJob(id, actor, ip) {
  const job = await prisma.importJob.findUnique({ where: { id } });
  if (!job) throw notFound('Importação não encontrada');
  if (job.status !== 'PENDENTE') throw new HttpError(409, 'Somente importações pendentes podem ser canceladas', 'CONFLICT');
  const updated = await prisma.importJob.update({
    where: { id },
    data: { status: 'CANCELADO', finishedAt: new Date() },
  });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.IMPORT_CANCEL,
    entity: 'ImportJob',
    entityId: id,
    ip,
  });
  return updated;
}

export async function listJobs(query) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const { type, status } = query;
  const where = {
    ...(type && { type }),
    ...(status && { status }),
  };
  const [total, jobs] = await Promise.all([
    prisma.importJob.count({ where }),
    prisma.importJob.findMany({
      where,
      select: {
        id: true, type: true, filename: true, status: true,
        totalRows: true, validRows: true, newRows: true, updatedRows: true,
        duplicateRows: true, errorRows: true, error: true,
        createdAt: true, confirmedAt: true, finishedAt: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip, take,
    }),
  ]);
  return { data: jobs, pagination: buildPagination(total, page, pageSize) };
}

export async function getJob(id) {
  const job = await prisma.importJob.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true } },
      errors: { take: 200, orderBy: { rowNumber: 'asc' } },
    },
  });
  if (!job) throw notFound('Importação não encontrada');
  return job;
}

function cleanup(path) {
  try { if (path) fs.unlinkSync(path); } catch { /* ignora */ }
}

// ============================================================
// Módulo Estatística — Importação de escolas com Mapeamento
// de Colunas:  1) analyze  →  2) execute (mapeamento)  →  3) confirm
// ============================================================

/**
 * ETAPA 1 — Analisa a planilha: cabeçalhos detectados, sugestão de mapeamento
 * (aliases), amostra de dados e total de linhas. Nada é gravado e o arquivo
 * temporário é eliminado na mesma requisição (compatível com Vercel).
 */
export async function analyzeSchoolsFile({ file }, actor, ip) {
  if (!file) throw new HttpError(400, 'Envie o arquivo no campo "file"', 'BAD_REQUEST');

  let rows;
  try {
    rows = parseSpreadsheet(file.path);
  } catch (err) {
    cleanup(file.path);
    throw new HttpError(422, err.message, 'PARSE_ERROR');
  }
  cleanup(file.path);

  if (!rows.length) {
    cleanup(file.path);
    throw new HttpError(422, 'A planilha não possui linhas de dados (apenas cabeçalho?)', 'PARSE_ERROR');
  }
  if (rows.length > MAX_ROWS) {
    cleanup(file.path);
    throw new HttpError(422, `Arquivo com ${rows.length} linhas — o limite é ${MAX_ROWS}. Divida o arquivo.`, 'PARSE_ERROR');
  }

  // união ordenada dos cabeçalhos + amostras
  const headers = [];
  const samples = {};
  for (const row of rows) {
    for (const key of Object.keys(row.raw)) {
      if (!headers.includes(key)) headers.push(key);
      const value = row.raw[key];
      if (value !== '' && value !== undefined && value !== null && (samples[key]?.length || 0) < 3) {
        (samples[key] = samples[key] || []).push(String(value));
      }
    }
  }

  const { mapping, unmapped } = autoMapColumns(headers);

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.IMPORT_PREVIEW,
    entity: 'ImportJob',
    metadata: { stage: 'ANALISE', filename: file.originalname, totalRows: rows.length, suggestedMapping: mapping, unmapped },
    ip,
  });

  return {
    filename: file.originalname,
    totalRows: rows.length,
    headers,
    suggestedMapping: mapping,
    unmappedColumns: unmapped,
    columns: headers.map((header) => ({
      header,
      samples: samples[header] || [],
    })),
    missingRequired: ['name'].filter((f) => !mapping[f]),
  };
}

/**
 * ETAPA 2 — Recebe novamente a planilha junto com o mapeamento, classifica as
 * linhas (NOVO/ATUALIZAR/DUPLICADO/ERRO) e cria o ImportJob em staging.
 * Arquivo e processamento permanecem na mesma requisição serverless.
 */
export async function executeSchoolsImport({ file, mapping }, actor, ip) {
  if (!file) throw new HttpError(400, 'Envie novamente a planilha', 'BAD_REQUEST');

  let rows;
  try {
    rows = parseSpreadsheet(file.path);
  } catch (err) {
    throw new HttpError(422, err.message, 'PARSE_ERROR');
  } finally {
    cleanup(file.path);
  }
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r.raw)))];

  // mapeamento válido: chaves conhecidas + cabeçalhos existentes no arquivo
  const cleanMapping = {};
  for (const [fieldKey, header] of Object.entries(mapping || {})) {
    if (SCHOOL_FIELD_KEYS.includes(fieldKey) && headers.includes(header)) {
      cleanMapping[fieldKey] = header;
    }
  }
  if (!cleanMapping.name) {
    throw new HttpError(
      422,
      'Mapeie a coluna "Nome da escola" — campo obrigatório para importar.',
      'VALIDATION_ERROR',
    );
  }

  const usedHeaders = new Set(Object.values(cleanMapping));
  const unmappedColumns = headers.filter((h) => !usedHeaders.has(h));

  // pipeline de validação/classificação (staging)
  const ctx = await schoolsStrategy.loadContext();
  const seen = new Set();
  const staged = [];
  for (const row of rows) {
    const built = schoolsStrategy.buildRow(row, ctx, cleanMapping);
    const status = built.errors?.length
      ? IMPORT_ROW_STATUS.ERRO
      : schoolsStrategy.classify(built, ctx, seen);
    staged.push({
      rowNumber: row.rowNumber,
      status,
      data: built.data,
      errors: built.errors || [],
      ...(built.key && { key: built.key }),
    });
  }
  const summary = summarize(staged);

  const job = await prisma.importJob.create({
    data: {
      type: 'ESCOLAS',
      filename: file.originalname,
      status: 'PENDENTE',
      userId: actor.id,
      ...summary,
      data: staged,
      summary: {
        originalFilename: file.originalname,
        mapping: cleanMapping,
        unmappedColumns,
        mappedBy: actor.name,
      },
    },
  });

  const errorRows = staged.filter((r) => r.status === IMPORT_ROW_STATUS.ERRO).slice(0, MAX_STORED_ERRORS);
  if (errorRows.length) {
    await prisma.importError.createMany({
      data: errorRows.flatMap((r) =>
        r.errors.map((e) => ({
          jobId: job.id,
          rowNumber: r.rowNumber,
          field: e.field || null,
          message: e.message,
          value: '',
        })),
      ),
    });
  }

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.IMPORT_PREVIEW,
    entity: 'ImportJob',
    entityId: job.id,
    metadata: { stage: 'MAPEAMENTO', filename: file.originalname, mapping: cleanMapping, unmappedColumns, ...summary },
    ip,
  });

  // As linhas validadas ficam no PostgreSQL; o arquivo temporário já foi removido.
  return job;
}
