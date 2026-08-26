import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import * as controller from '../controllers/dashboard.controller.js';

const router = Router();
router.use(authenticate, requirePermission('dashboard:read'));
router.get('/', controller.dashboard);

export default router;
