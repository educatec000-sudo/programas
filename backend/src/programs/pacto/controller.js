import { unlink } from 'node:fs/promises';
import { wrap } from '../../lib/wrap.js';
import { getClientIp } from '../../lib/auth.js';
import { HttpError } from '../../lib/errors.js';
import * as service from './service.js';

export const adminOverview = wrap(async (req, res) => {
  res.json(await service.getAdminOverview(req.data.params.id));
});

export const exportReport = wrap(async (req, res) => {
  const report = await service.exportPactoReport(req.data.params.id, req.user, getClientIp(req));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
  res.send(report.content);
});

export const generateLink = wrap(async (req, res) => {
  res.status(201).json(
    await service.generateSchoolLink(
      req.data.params.id,
      req.data.params.schoolId,
      req.data.body,
      req.user,
      getClientIp(req),
      req.get('origin'),
    ),
  );
});

export const revokeLink = wrap(async (req, res) => {
  res.json(
    await service.revokeSchoolLink(
      req.data.params.id,
      req.data.params.schoolId,
      req.user,
      getClientIp(req),
    ),
  );
});

export const createAdminClass = wrap(async (req, res) => {
  res.status(201).json(
    await service.createAdminClass(req.data.params.id, req.data.body, req.user, getClientIp(req)),
  );
});

export const updateAdminClass = wrap(async (req, res) => {
  res.json(
    await service.updateAdminClass(
      req.data.params.id,
      req.data.params.classId,
      req.data.body,
      req.user,
      getClientIp(req),
    ),
  );
});

export const reopenAssessment = wrap(async (req, res) => {
  res.json(
    await service.reopenAssessment(
      req.data.params.id,
      req.data.params.assessmentId,
      req.user,
      getClientIp(req),
    ),
  );
});

export const deleteAdminAssessment = wrap(async (req, res) => {
  res.json(
    await service.deleteAdminAssessment(
      req.data.params.id,
      req.data.params.assessmentId,
      req.user,
      getClientIp(req),
    ),
  );
});

export const publicBootstrap = wrap(async (req, res) => {
  res.json(await service.getPublicBootstrap(req.data.params.token));
});

export const createPublicClass = wrap(async (req, res) => {
  res.status(201).json(
    await service.createPublicClass(req.data.params.token, req.data.body, getClientIp(req)),
  );
});

export const updatePublicClass = wrap(async (req, res) => {
  res.json(
    await service.updatePublicClass(
      req.data.params.token,
      req.data.params.classId,
      req.data.body,
      getClientIp(req),
    ),
  );
});

export const saveDraft = wrap(async (req, res) => {
  res.json(
    await service.savePublicAssessment(req.data.params.token, req.data.body, getClientIp(req)),
  );
});

export const submitAssessment = wrap(async (req, res) => {
  res.json(
    await service.submitPublicAssessment(req.data.params.token, req.data.body, getClientIp(req)),
  );
});

export const submitAllAssessments = wrap(async (req, res) => {
  res.json(
    await service.submitAllPublicAssessments(req.data.params.token, getClientIp(req)),
  );
});

export const deletePublicDraft = wrap(async (req, res) => {
  res.json(
    await service.deletePublicDraft(
      req.data.params.token,
      req.data.params.classId,
      req.data.params.code,
      getClientIp(req),
    ),
  );
});

function parseImportMapping(value) {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
    if (parsed.mode != null && !['long', 'wide'].includes(parsed.mode)) throw new Error();
    for (const section of ['columns', 'results', 'resultPercentages', 'classes']) {
      const entries = Object.entries(parsed[section] || {});
      if (entries.length > 100 || (parsed[section] && (Array.isArray(parsed[section]) || typeof parsed[section] !== 'object'))) {
        throw new Error();
      }
      if (entries.some(([key, source]) => (
        key.length > 200
        || (source !== null && (typeof source !== 'string' || source.length > 300))
      ))) throw new Error();
    }
    return {
      ...(parsed.mode && { mode: parsed.mode }),
      columns: { ...(parsed.columns || {}) },
      results: { ...(parsed.results || {}) },
      resultPercentages: { ...(parsed.resultPercentages || {}) },
      classes: { ...(parsed.classes || {}) },
    };
  } catch {
    throw new HttpError(400, 'O mapeamento enviado é inválido.', 'PACTO_IMPORT_MAPPING_INVALID');
  }
}

async function removeTemporaryUpload(file) {
  if (!file?.path) return;
  try {
    await unlink(file.path);
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error('[PACTO_IMPORT_CLEANUP]', error?.message);
  }
}

export const previewImport = wrap(async (req, res) => {
  try {
    if (!req.file) {
      throw new HttpError(400, 'Selecione um arquivo CSV ou XLSX.', 'PACTO_IMPORT_FILE_REQUIRED');
    }
    res.json(
      await service.previewPublicImport(
        req.data.params.token,
        req.file,
        parseImportMapping(req.body?.mapping),
      ),
    );
  } finally {
    await removeTemporaryUpload(req.file);
  }
});

export const confirmImport = wrap(async (req, res) => {
  try {
    if (!req.file) {
      throw new HttpError(400, 'Selecione um arquivo CSV ou XLSX.', 'PACTO_IMPORT_FILE_REQUIRED');
    }
    const previewDigest = String(req.body?.previewDigest || '');
    if (!/^[a-f0-9]{64}$/.test(previewDigest)) {
      throw new HttpError(400, 'A confirmação não corresponde a uma prévia válida.', 'PACTO_IMPORT_PREVIEW_REQUIRED');
    }
    res.json(
      await service.confirmPublicImport(
        req.data.params.token,
        req.file,
        {
          mapping: parseImportMapping(req.body?.mapping),
          previewDigest,
          confirmReplace: req.body?.confirmReplace === true || req.body?.confirmReplace === 'true',
          submitAll: req.body?.submitAll === true || req.body?.submitAll === 'true',
        },
        getClientIp(req),
      ),
    );
  } finally {
    await removeTemporaryUpload(req.file);
  }
});
