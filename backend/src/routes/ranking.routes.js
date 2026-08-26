import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import * as controller from '../controllers/ranking.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('rankings:read'), controller.ranking);
router.post('/consolidate', requirePermission('evaluations:write'), controller.consolidate);
router.get('/evaluations', requirePermission('rankings:read'), controller.evaluations);

export default router;
