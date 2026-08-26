import * as schoolService from '../services/school.service.js';
import { wrap } from '../lib/wrap.js';
import { getClientIp } from '../lib/auth.js';
import { parseIdParams } from '../middlewares/validate.js';
import { buildExport, exportFilename } from '../lib/exporters.js';
import { audit, AuditAction } from '../lib/audit.js';

export const list = wrap(async (req, res) => {
  res.json(await schoolService.listSchools(req.query));
});

export const stats = wrap(async (_req, res) => {
  res.json(await schoolService.getSchoolsStats());
});

export const filters = wrap(async (_req, res) => {
  res.json(await schoolService.listFilterOptions());
});

export const municipalities = wrap(async (_req, res) => {
  res.json(await schoolService.listMunicipalities());
});

export const get = wrap(async (req, res) => {
  res.json(await schoolService.getSchool(parseIdParams(req)));
});

export const create = wrap(async (req, res) => {
  res.status(201).json(await schoolService.createSchool(req.data.body, req.user, getClientIp(req)));
});

export const update = wrap(async (req, res) => {
  res.json(await schoolService.updateSchool(parseIdParams(req), req.data.body, req.user, getClientIp(req)));
});

export const remove = wrap(async (req, res) => {
  await schoolService.deleteSchool(parseIdParams(req), req.user, getClientIp(req));
  res.json({ message: 'Escola removida (exclusão lógica)' });
});

export const batchRemove = wrap(async (req, res) => {
  const result = await schoolService.deleteSchools(req.data.body.ids, req.user, getClientIp(req));
  res.json({ message: `${result.deleted} escola(s) removida(s) (exclusão lógica)`, ...result });
});

export const history = wrap(async (req, res) => {
  res.json(await schoolService.schoolHistory(parseIdParams(req), req.query));
});

export const exportSchools = wrap(async (req, res) => {
  const format = req.query.format || 'csv';
  const { data } = await schoolService.listSchools({ ...req.query, page: 1, pageSize: 200 });
  const columns = [
    { key: 'inep', label: 'INEP' },
    { key: 'name', label: 'Nome' },
    { key: 'schoolType', label: 'Tipo' },
    { key: 'municipality', label: 'Município' },
    { key: 'uf', label: 'UF' },
    { key: 'addressFull', label: 'Endereço' },
    { key: 'district', label: 'Bairro' },
    { key: 'cep', label: 'CEP' },
    { key: 'zone', label: 'Zona' },
    { key: 'adminDependency', label: 'Dependência' },
    { key: 'situation', label: 'Situação' },
    { key: 'phone', label: 'Telefone' },
    { key: 'responsible', label: 'Responsável' },
    { key: 'email', label: 'E-mail' },
    { key: 'latitude', label: 'Latitude', format: 'number' },
    { key: 'longitude', label: 'Longitude', format: 'number' },
    { key: 'techniciansNames', label: 'Técnicos Responsáveis' },
  ];
  const rows = data.map((s) => ({
    ...s,
    addressFull: [s.address, s.addressNumber].filter(Boolean).join(', ') || '',
  }));
  const rowsWithTech = rows.map((s) => ({
    ...s,
    techniciansNames: s.technicians.map((t) => t.name).join(', '),
  }));
  const { body, contentType, ext } = await buildExport({
    title: 'Cadastro de Escolas',
    subtitle: `${rowsWithTech.length} escolas${req.query.zone ? ` · zona ${req.query.zone}` : ''}${req.query.hasTechnician === 'true' ? ' · com técnico' : ''}${req.query.hasTechnician === 'false' ? ' · sem técnico' : ''}`,
    columns,
    rows: rowsWithTech,
    format,
    meta: { user: req.user.name },
  });
  await audit({
    userId: req.user.id,
    userName: req.user.name,
    action: AuditAction.EXPORT,
    entity: 'School',
    metadata: { format, total: rowsWithTech.length, filters: req.query },
    ip: getClientIp(req),
  });
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename('escolas', ext)}"`);
  res.send(body);
});
