import { Router } from 'express';
import { requirePermission } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as controller from './controller.js';
import {
  adminClassSchema,
  generateLinkSchema,
  programAssessmentParamsSchema,
  programClassParamsSchema,
  programParamsSchema,
  programSchoolParamsSchema,
  updateClassSchema,
} from './validation.js';

const router = Router({ mergeParams: true });

router.get(
  '/overview',
  requirePermission('programs:read'),
  validate({ params: programParamsSchema }),
  controller.adminOverview,
);
router.get(
  '/report.csv',
  requirePermission('reports:read'),
  validate({ params: programParamsSchema }),
  controller.exportReport,
);
router.post(
  '/schools/:schoolId/link',
  requirePermission('programs:write'),
  validate({ params: programSchoolParamsSchema, body: generateLinkSchema }),
  controller.generateLink,
);
router.delete(
  '/schools/:schoolId/link',
  requirePermission('programs:write'),
  validate({ params: programSchoolParamsSchema }),
  controller.revokeLink,
);
router.post(
  '/classes',
  requirePermission('programs:write'),
  validate({ params: programParamsSchema, body: adminClassSchema }),
  controller.createAdminClass,
);
router.put(
  '/classes/:classId',
  requirePermission('programs:write'),
  validate({ params: programClassParamsSchema, body: updateClassSchema }),
  controller.updateAdminClass,
);
router.post(
  '/assessments/:assessmentId/reopen',
  requirePermission('evaluations:write'),
  validate({ params: programAssessmentParamsSchema }),
  controller.reopenAssessment,
);

export default router;
