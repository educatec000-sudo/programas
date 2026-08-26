import { buildReport, REPORT_TYPES } from '../services/report.service.js';
import { buildExport, exportFilename } from '../lib/exporters.js';
import { audit, AuditAction } from '../lib/audit.js';
import { getClientIp } from '../lib/auth.js';
import { wrap } from '../lib/wrap.js';

export const types = wrap(async (_req, res) => {
  res.json(REPORT_TYPES);
});

export const generate = wrap(async (req, res) => {
  const type = req.params.type;
  const format = req.query.format || 'pdf';
  if (!['csv', 'xlsx', 'pdf'].includes(format)) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Formatos suportados: pdf, xlsx, csv' } });
  }

  const dataset = await buildReport(type, req.query);
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
    action: AuditAction.REPORT,
    entity: 'Report',
    entityId: type,
    metadata: { type, format, rows: dataset.rows.length, filters: req.query },
    ip: getClientIp(req),
  });

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(type, ext)}"`);
  res.send(body);
});
