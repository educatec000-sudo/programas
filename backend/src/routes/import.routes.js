import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import { uploadImportFile } from '../middlewares/upload.js';
import * as controller from '../controllers/import.controller.js';

const router = Router();
router.use(authenticate);

router.post('/', requirePermission('imports:write'), uploadImportFile, controller.upload);
router.post('/schools/analyze', requirePermission('imports:write'), uploadImportFile, controller.analyzeSchools);
router.post('/schools/execute', requirePermission('imports:write'), controller.executeSchools);
router.get('/', requirePermission('imports:read'), controller.list);
router.get('/template', requirePermission('imports:read'), controller.template);
router.get('/:id', requirePermission('imports:read'), controller.get);
router.post('/:id/confirm', requirePermission('imports:write'), controller.confirm);
router.post('/:id/cancel', requirePermission('imports:write'), controller.cancel);

export default router;
