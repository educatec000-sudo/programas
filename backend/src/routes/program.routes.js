import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import * as controller from '../controllers/program.controller.js';
import {
  createProgramSchema,
  updateProgramSchema,
  addProgramSchoolsSchema,
  updateProgramSchoolSchema,
  addProgramIndicatorsSchema,
  updateProgramIndicatorSchema,
  createProgramCriterionSchema,
  programSchoolParamsSchema,
  programEvaluationQuerySchema,
} from '../validations/program.validation.js';
import { paginationQuery } from '../validations/common.validation.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const listQuery = paginationQuery.extend({
  year: z.coerce.number().int().optional(),
  status: z.enum(['PLANEJAMENTO', 'EM_EXECUCAO', 'CONCLUIDO', 'SUSPENSO', 'CANCELADO']).optional(),
  includeCoverage: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
});

router.get('/', requirePermission('programs:read'), validate({ query: listQuery }), controller.list);
router.post('/', requirePermission('programs:write'), validate({ body: createProgramSchema }), controller.create);
router.get('/:id', requirePermission('programs:read'), controller.get);
router.put('/:id', requirePermission('programs:write'), validate({ body: updateProgramSchema }), controller.update);
router.delete('/:id', requirePermission('programs:delete'), controller.remove);
router.get('/:id/history', requirePermission('programs:read'), validate({ query: paginationQuery }), controller.history);
router.get(
  '/:id/schools/:schoolId/evaluation',
  requirePermission('programs:read'),
  requirePermission('results:read'),
  requirePermission('rankings:read'),
  validate({ params: programSchoolParamsSchema, query: programEvaluationQuerySchema }),
  controller.schoolEvaluation,
);
router.post(
  '/:id/criteria',
  requirePermission('programs:write'),
  requirePermission('indicators:write'),
  validate({ body: createProgramCriterionSchema }),
  controller.createCriterion,
);

router.post(
  '/:id/schools',
  requirePermission('programs:write'),
  validate({ body: addProgramSchoolsSchema }),
  controller.addSchools,
);
router.put(
  '/:id/schools/:schoolId',
  requirePermission('programs:write'),
  validate({ body: updateProgramSchoolSchema }),
  controller.updateSchoolLink,
);
router.delete('/:id/schools/:schoolId', requirePermission('programs:write'), controller.removeSchool);

router.post(
  '/:id/indicators',
  requirePermission('programs:write'),
  validate({ body: addProgramIndicatorsSchema }),
  controller.addIndicators,
);
router.put(
  '/:id/indicators/:indicatorId',
  requirePermission('programs:write'),
  validate({ body: updateProgramIndicatorSchema }),
  controller.updateProgramIndicator,
);
router.delete('/:id/indicators/:indicatorId', requirePermission('programs:write'), controller.removeIndicator);

export default router;
