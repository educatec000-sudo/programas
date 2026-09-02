import { wrap } from '../../lib/wrap.js';
import { getClientIp } from '../../lib/auth.js';
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
