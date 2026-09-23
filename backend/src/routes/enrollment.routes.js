import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { uploadImportFile } from '../middlewares/upload.js';
import * as controller from '../controllers/enrollment.controller.js';
import {
  yearsQuerySchema,
  updateRuleSetSchema,
  schoolSettingSchema,
  projectionRunSchema,
  projectedSchoolsQuerySchema,
  schoolIdParamsSchema,
} from '../validations/enrollment.validation.js';

const router = Router();
router.use(authenticate);

router.get('/overview', requirePermission('schools:read'), validate({ query: yearsQuerySchema }), controller.overview);
router.get('/datasets', requirePermission('schools:read'), validate({ query: yearsQuerySchema }), controller.datasets);
router.get('/settings', requirePermission('schools:read'), validate({ query: yearsQuerySchema }), controller.settings);
router.put('/settings/rules', requirePermission('programs:write'), validate({ body: updateRuleSetSchema }), controller.updateRules);
router.put('/settings/schools/:schoolId', requirePermission('schools:write'), validate({ params: schoolIdParamsSchema, body: schoolSettingSchema }), controller.updateSchoolSetting);
router.post('/import/preview', requirePermission('imports:write'), uploadImportFile, controller.previewImport);
router.post('/import/confirm', requirePermission('imports:write'), controller.confirmImport);
router.post('/projection/run', requirePermission('programs:write'), validate({ body: projectionRunSchema }), controller.runProjection);
router.get('/schools', requirePermission('schools:read'), validate({ query: projectedSchoolsQuerySchema }), controller.schools);
router.get('/schools/export', requirePermission('reports:read'), validate({ query: projectedSchoolsQuerySchema }), controller.exportSchools);
router.get('/stages/export', requirePermission('reports:read'), validate({ query: yearsQuerySchema }), controller.exportStages);
router.get('/schools/:schoolId', requirePermission('schools:read'), validate({ params: schoolIdParamsSchema, query: yearsQuerySchema }), controller.schoolDetail);

export default router;
