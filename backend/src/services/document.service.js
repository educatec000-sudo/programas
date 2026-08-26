import path from 'node:path';
import fs from 'node:fs';
import { prisma } from '../lib/prisma.js';
import { HttpError, notFound } from '../lib/errors.js';
import { audit, AuditAction } from '../lib/audit.js';
import { uploadRoot } from '../middlewares/upload.js';

const ALLOWED_ENTITIES = ['Program', 'School'];

export async function listDocuments({ entity, entityId }) {
  if (!ALLOWED_ENTITIES.includes(entity)) {
    throw new HttpError(400, `Entidade inválida para documentos: ${entity}`, 'BAD_REQUEST');
  }
  return prisma.document.findMany({
    where: { entity, entityId, deletedAt: null },
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createDocument({ title, description, entity, entityId, file }, actor, ip) {
  if (!ALLOWED_ENTITIES.includes(entity)) {
    throw new HttpError(400, `Entidade inválida para documentos: ${entity}`, 'BAD_REQUEST');
  }
  if (!file) throw new HttpError(400, 'Envie o arquivo no campo "file"', 'BAD_REQUEST');

  const exists =
    entity === 'Program'
      ? await prisma.program.findFirst({ where: { id: entityId, deletedAt: null } })
      : await prisma.school.findFirst({ where: { id: entityId, deletedAt: null } });
  if (!exists) throw notFound('Registro vinculado não encontrado');

  const relativePath = path.relative(uploadRoot, file.path);
  const document = await prisma.document.create({
    data: {
      title,
      description: description || null,
      entity,
      entityId,
      filename: file.originalname,
      path: relativePath,
      mimeType: file.mimetype || 'application/octet-stream',
      sizeBytes: file.size,
      uploadedById: actor.id,
    },
  });

  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.CREATE,
    entity: 'Document',
    entityId: document.id,
    metadata: { title, linkedEntity: entity, linkedId: entityId },
    ip,
  });
  return document;
}

export async function getDownload(id) {
  const document = await prisma.document.findFirst({ where: { id, deletedAt: null } });
  if (!document) throw notFound('Documento não encontrado');
  const filePath = path.join(uploadRoot, document.path);
  if (!fs.existsSync(filePath)) throw notFound('Arquivo físico não encontrado no servidor');
  return { filePath, filename: document.filename };
}

export async function deleteDocument(id, actor, ip) {
  const document = await prisma.document.findFirst({ where: { id, deletedAt: null } });
  if (!document) throw notFound('Documento não encontrado');
  await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    userId: actor.id,
    userName: actor.name,
    action: AuditAction.DELETE,
    entity: 'Document',
    entityId: id,
    metadata: { title: document.title },
    ip,
  });
}
