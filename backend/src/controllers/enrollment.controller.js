import * as enrollmentService from '../services/enrollment.service.js';
import { wrap } from '../lib/wrap.js';
import { getClientIp } from '../lib/auth.js';
import { buildExport, exportFilename } from '../lib/exporters.js';
import { audit, AuditAction } from '../lib/audit.js';
import {
  previewEnrollmentImportSchema,
  confirmEnrollmentImportSchema,
} from '../validations/enrollment.validation.js';

export const overview = wrap(async (req, res) => {
  res.json(await enrollmentService.getOverview(req.data.query));
});

export const datasets = wrap(async (req, res) => {
  res.json(await enrollmentService.listDatasets(req.data.query));
});

export const settings = wrap(async (req, res) => {
  res.json(await enrollmentService.getSettings(req.data.query));
});

export const updateRules = wrap(async (req, res) => {
  res.json(await enrollmentService.updateRuleSet(req.data.body, req.user, getClientIp(req)));
});

export const updateSchoolSetting = wrap(async (req, res) => {
  res.json(await enrollmentService.upsertSchoolSetting(req.data.params.schoolId, req.data.body, req.user, getClientIp(req)));
});

export const previewImport = wrap(async (req, res) => {
  const body = previewEnrollmentImportSchema.parse(req.body || {});
  const result = await enrollmentService.previewEnrollmentImport({ file: req.file, ...body }, req.user, getClientIp(req));
  res.status(201).json(result);
});

export const confirmImport = wrap(async (req, res) => {
  const body = confirmEnrollmentImportSchema.parse(req.body || {});
  res.json(await enrollmentService.confirmEnrollmentImport(body, req.user, getClientIp(req)));
});

export const runProjection = wrap(async (req, res) => {
  res.status(201).json(await enrollmentService.runProjection(req.data.body, req.user, getClientIp(req)));
});

export const schools = wrap(async (req, res) => {
  res.json(await enrollmentService.listProjectedSchools(req.data.query));
});

export const schoolDetail = wrap(async (req, res) => {
  res.json(await enrollmentService.getSchoolProjectionDetail(req.data.params.schoolId, req.data.query));
});

export const exportSchools = wrap(async (req, res) => {
  const format = req.query.format || 'xlsx';
  const dataset = await enrollmentService.buildSchoolsReport(req.query);
  const { body, contentType, ext } = await buildExport({
    title: dataset.title,
    subtitle: dataset.subtitle,
    columns: dataset.columns,
    rows: dataset.rows,
    format,
    meta: { user: req.user.name },
  });
  await audit({
    userId: req.user.id,
    userName: req.user.name,
    action: AuditAction.EXPORT,
    entity: 'ProjectionRun',
    entityId: 'schools-report',
    metadata: { format, filters: req.query, rows: dataset.rows.length },
    ip: getClientIp(req),
  });
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename('prospeccao_escolas', ext)}"`);
  res.send(body);
});

export const exportStages = wrap(async (req, res) => {
  const format = req.query.format || 'xlsx';
  const dataset = await enrollmentService.buildStagesReport(req.query);
  const { body, contentType, ext } = await buildExport({
    title: dataset.title,
    subtitle: dataset.subtitle,
    columns: dataset.columns,
    rows: dataset.rows,
    format,
    meta: { user: req.user.name },
  });
  await audit({
    userId: req.user.id,
    userName: req.user.name,
    action: AuditAction.EXPORT,
    entity: 'ProjectionRun',
    entityId: 'stages-report',
    metadata: { format, filters: req.query, rows: dataset.rows.length },
    ip: getClientIp(req),
  });
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename('prospeccao_etapas', ext)}"`);
  res.send(body);
});
