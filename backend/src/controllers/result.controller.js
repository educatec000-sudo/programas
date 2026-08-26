import * as resultService from '../services/result.service.js';
import { wrap } from '../lib/wrap.js';
import { getClientIp } from '../lib/auth.js';
import { parseIdParams } from '../middlewares/validate.js';
import { buildExport, exportFilename } from '../lib/exporters.js';
import { audit, AuditAction } from '../lib/audit.js';

export const list = wrap(async (req, res) => {
  res.json(await resultService.listResults(req.query));
});

export const create = wrap(async (req, res) => {
  const overwrite = req.query.overwrite === 'true';
  res.status(201).json(await resultService.createResult(req.data.body, { overwrite }, req.user, getClientIp(req)));
});

export const createBatch = wrap(async (req, res) => {
  const overwrite = req.query.overwrite === 'true';
  res.status(201).json(await resultService.createResultsBatch(req.data.body.items, { overwrite }, req.user, getClientIp(req)));
});

export const update = wrap(async (req, res) => {
  res.json(await resultService.updateResult(parseIdParams(req), req.data.body, req.user, getClientIp(req)));
});

export const remove = wrap(async (req, res) => {
  await resultService.deleteResult(parseIdParams(req), req.user, getClientIp(req));
  res.json({ message: 'Resultado excluído' });
});

export const exportResults = wrap(async (req, res) => {
  const format = req.query.format || 'csv';
  const results = await resultService.resultsForExport(req.query);
  const columns = [
    { key: 'year', label: 'Ano', format: 'int' },
    { key: 'period', label: 'Período' },
    { key: 'program', label: 'Programa' },
    { key: 'school', label: 'Escola' },
    { key: 'indicator', label: 'Indicador' },
    { key: 'value', label: 'Resultado', format: 'number' },
    { key: 'unit', label: 'Unidade' },
    { key: 'source', label: 'Origem' },
  ];
  const rows = results.map((r) => ({
    year: r.year,
    period: r.period,
    program: r.program.name,
    school: r.school.name,
    indicator: r.indicator.name,
    value: r.value,
    unit: r.indicator.unit || '',
    source: r.source === 'IMPORTACAO' ? 'Importação' : 'Manual',
  }));
  const { body, contentType, ext } = await buildExport({
    title: 'Resultados Lançados',
    subtitle: `${rows.length} registros`,
    columns,
    rows,
    format,
    meta: { user: req.user.name },
  });
  await audit({
    userId: req.user.id,
    userName: req.user.name,
    action: AuditAction.EXPORT,
    entity: 'Result',
    metadata: { format, total: rows.length },
    ip: getClientIp(req),
  });
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename('resultados', ext)}"`);
  res.send(body);
});
