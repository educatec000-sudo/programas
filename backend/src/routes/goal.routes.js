import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import * as controller from '../controllers/goal.controller.js';
import { createGoalSchema, updateGoalSchema } from '../validations/result.validation.js';
import { paginationQuery } from '../validations/common.validation.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const listQuery = paginationQuery.extend({
  scope: z.enum(['GERAL', 'PROGRAMA', 'ESCOLA', 'INDICADOR']).optional(),
  programId: z.string().uuid().optional(),
  schoolId: z.string().uuid().optional(),
  indicatorId: z.string().uuid().optional(),
  year: z.coerce.number().int().optional(),
  period: z.string().max(30).optional(),
});

const lookupQuery = z.object({
  programId: z.string().uuid().optional(),
  schoolId: z.string().uuid().optional(),
  indicatorId: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100),
  period: z.string().trim().max(30).optional(),
});

router.get('/', requirePermission('goals:read'), validate({ query: listQuery }), controller.list);
router.get('/lookup', requirePermission('goals:read'), validate({ query: lookupQuery }), controller.lookup);
router.post('/', requirePermission('goals:write'), validate({ body: createGoalSchema }), controller.create);
router.put('/:id', requirePermission('goals:write'), validate({ body: updateGoalSchema }), controller.update);
router.delete('/:id', requirePermission('goals:delete'), controller.remove);

export default router;
