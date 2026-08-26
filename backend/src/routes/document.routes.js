import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import { uploadDocumentFile } from '../middlewares/upload.js';
import * as controller from '../controllers/document.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('documents:read'), controller.list);
router.post('/', requirePermission('documents:write'), uploadDocumentFile, controller.create);
router.get('/:id/download', requirePermission('documents:read'), controller.download);
router.delete('/:id', requirePermission('documents:write'), controller.remove);

export default router;
