import * as importService from '../services/import.service.js';
import { getStrategy } from '../modules/imports/registry.js';
import { wrap } from '../lib/wrap.js';
import { getClientIp } from '../lib/auth.js';
import { buildExport } from '../lib/exporters.js';
import { z } from 'zod';

const typeEnum = z.enum(['ESCOLAS', 'PROGRAMAS', 'INDICADORES', 'RESULTADOS']);

const uploadSchema = z.object({
  type: typeEnum,
});

function serializeJob(job, { includeData = false } = {}) {
  const base = {
    id: job.id,
    type: job.type,
    filename: job.filename,
    status: job.status,
    totalRows: job.totalRows,
    validRows: job.validRows,
    newRows: job.newRows,
    updatedRows: job.updatedRows,
    duplicateRows: job.duplicateRows,
    errorRows: job.errorRows,
    error: job.error,
    summary: job.summary,
    createdAt: job.createdAt,
    confirmedAt: job.confirmedAt,
    finishedAt: job.finishedAt,
  };
  if (job.user) base.user = job.user;
  if (includeData) base.rows = job.data || [];
  if (job.errors) base.errorsTable = job.errors;
  return base;
}

export const upload = wrap(async (req, res) => {
  const { type } = uploadSchema.parse(req.body || {});
  const job = await importService.createJob({ file: req.file, type }, req.user, getClientIp(req));
  res.status(201).json(serializeJob(job, { includeData: true }));
});

export const analyzeSchools = wrap(async (req, res) => {
  res.status(200).json(await importService.analyzeSchoolsFile({ file: req.file }, req.user, getClientIp(req)));
});

export const executeSchools = wrap(async (req, res) => {
  let rawMapping = {};
  try {
    rawMapping = req.body?.mapping ? JSON.parse(req.body.mapping) : {};
  } catch {
    rawMapping = null;
  }
  const mapping = z.record(z.string().max(40), z.string().max(200)).parse(rawMapping);
  const job = await importService.executeSchoolsImport(
    { file: req.file, mapping },
    req.user,
    getClientIp(req),
  );
  res.status(201).json(serializeJob(job, { includeData: true }));
});

export const list = wrap(async (req, res) => {
  res.json(await importService.listJobs(req.query));
});

export const get = wrap(async (req, res) => {
  res.json(serializeJob(await importService.getJob(req.params.id), { includeData: true }));
});

export const confirm = wrap(async (req, res) => {
  const result = await importService.confirmJob(req.params.id, req.user, getClientIp(req));
  res.json({
    created: result.created,
    updated: result.updated,
    duplicates: result.job.duplicateRows,
    errors: result.job.errorRows,
    status: result.job.status,
  });
});

export const cancel = wrap(async (req, res) => {
  res.json(serializeJob(await importService.cancelJob(req.params.id, req.user, getClientIp(req))));
});

export const template = wrap(async (req, res) => {
  const type = typeEnum.parse(req.query.type);
  const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
  const strategy = getStrategy(type);
  const columns = strategy.headers.map((h) => ({ key: h, label: h }));
  const rows = strategy.examples.map((ex) =>
    Object.fromEntries(strategy.headers.map((h, i) => [h, ex[i] ?? ''])),
  );
  const { body, contentType, ext } = await buildExport({
    title: `Modelo ${strategy.label}`,
    subtitle: 'Modelo de importação CPE',
    columns,
    rows,
    format,
  });
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="CPE_modelo_${type.toLowerCase()}.${ext}"`);
  res.send(body);
});
