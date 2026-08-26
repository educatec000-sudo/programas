import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import * as controller from '../controllers/analytics.controller.js';

const router = Router();
router.use(authenticate, requirePermission('analytics:read'));

router.get('/overview', controller.overview);
router.get('/evolution', controller.evolution);
router.get('/distribution', controller.distribution);
router.get('/compare-schools', controller.compareSchoolsEndpoint);
router.get('/compare-programs', controller.compareProgramsEndpoint);
router.get('/goals', controller.goals);
router.get('/top-schools', controller.topSchools);

export default router;
