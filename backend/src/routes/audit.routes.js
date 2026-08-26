import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import * as controller from '../controllers/audit.controller.js';

const router = Router();
router.use(authenticate, requirePermission('audit:read'));

router.get('/', controller.list);
router.get('/stats', controller.stats);

export default router;
