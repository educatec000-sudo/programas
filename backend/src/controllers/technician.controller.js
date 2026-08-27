import * as technicianService from '../services/technician.service.js';
import { parseIdParams } from '../middlewares/validate.js';
import { buildExport, exportFilename } from '../lib/exporters.js';
import { audit, AuditAction } from '../lib/audit.js';
import { getClientIp } from '../lib/auth.js';
import { wrap } from '../lib/wrap.js';

export const stats = wrap(async (_req, res) => {
  res.json(await technicianService.getStats());
});

export const geral = wrap(async (req, res) => {
  res.json(await technicianService.listGeral(req.data.query));
});

export const technicians = wrap(async (req, res) => {
  res.json(await technicianService.listTechnicians(req.data.query));
});

export const bySchool = wrap(async (req, res) => {
  res.json(await technicianService.getBySchool(parseIdParams(req)));
});

export const byTechnician = wrap(async (req, res) => {
  res.json(await technicianService.getByTechnician(parseIdParams(req)));
});

export const create = wrap(async (req, res) => {
  const result = await technicianService.createLinks(req.data.body, req.user, getClientIp(req));
  res.status(201).json(result);
});

export const update = wrap(async (req, res) => {
  res.json(await technicianService.updateLink(parseIdParams(req), req.data.body, req.user, getClientIp(req)));
});

export const remove = wrap(async (req, res) => {
  await technicianService.deleteLink(parseIdParams(req), req.user, getClientIp(req));
  res.json({ message: 'Vínculo removido' });
});

export const exportGeral = wrap(async (req, res) => {
  const format = req.query.format || 'csv';
  if (!['csv', 'xlsx', 'pdf'].includes(format)) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Formatos suportados: pdf, xlsx, csv' } });
  }
  const rows = await technicianService.geralForExport(req.query);
  const columns = [
    { key: 'inep', label: 'INEP' },
    { key: 'name', label: 'Escola' },
    { key: 'zone', label: 'Zona' },
    { key: 'situation', label: 'Situação' },
    { key: 'technicians', label: 'Técnicos Responsáveis' },
    { key: 'count', label: 'Qtd. Técnicos', format: 'int' },
  ];
  const { body, contentType, ext } = await buildExport({
    title: 'Técnicos por Escola',
    subtitle: `${rows.length} escolas · ${req.query.unassigned === 'true' ? 'somente sem técnico' : 'todas as escolas'}`,
    columns,
    rows,
    format,
    meta: { user: req.user.name },
  });

  await audit({
    userId: req.user.id,
    userName: req.user.name,
    action: AuditAction.EXPORT,
    entity: 'SchoolTechnician',
    metadata: { format, total: rows.length, filters: req.query },
    ip: getClientIp(req),
  });

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename('tecnicos_escolas', ext)}"`);
  res.send(body);
});
