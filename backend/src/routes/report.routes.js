import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import * as controller from '../controllers/report.controller.js';

const router = Router();
router.use(authenticate, requirePermission('reports:read'));

router.get('/types', controller.types);
router.get('/:type', controller.generate);

export default router;
