import * as documentService from '../services/document.service.js';
import { wrap } from '../lib/wrap.js';
import { getClientIp } from '../lib/auth.js';
import { z } from 'zod';

const createSchema = z.object({
  title: z.string().trim().min(2, 'título obrigatório').max(200),
  description: z.preprocess((v) => (v === '' ? null : v), z.string().max(500).nullable().optional()),
  entity: z.enum(['Program', 'School']),
  entityId: z.string().uuid(),
});

export const list = wrap(async (req, res) => {
  const { entity, entityId } = req.query;
  if (!entity || !entityId) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Informe entity e entityId' } });
  }
  res.json(await documentService.listDocuments({ entity, entityId }));
});

export const create = wrap(async (req, res) => {
  const data = createSchema.parse({
    ...req.body,
    ...(req.file ? {} : {}),
  });
  const document = await documentService.createDocument({ ...data, file: req.file }, req.user, getClientIp(req));
  res.status(201).json(document);
});

export const download = wrap(async (req, res) => {
  const { filePath, filename } = await documentService.getDownload(req.params.id);
  res.download(filePath, filename);
});

export const remove = wrap(async (req, res) => {
  await documentService.deleteDocument(req.params.id, req.user, getClientIp(req));
  res.json({ message: 'Documento removido' });
});
