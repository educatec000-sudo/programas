import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import * as controller from '../controllers/result.controller.js';
import {
  createResultSchema,
  createResultsBatchSchema,
  updateResultSchema,
  resultQuerySchema,
} from '../validations/result.validation.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('results:read'), validate({ query: resultQuerySchema }), controller.list);
router.get('/export', requirePermission('results:read'), controller.exportResults);
router.post(
  '/',
  requirePermission('results:write'),
  validate({ body: createResultSchema }),
  controller.create,
);
router.post(
  '/batch',
  requirePermission('results:write'),
  validate({ body: createResultsBatchSchema }),
  controller.createBatch,
);
router.put('/:id', requirePermission('results:write'), validate({ body: updateResultSchema }), controller.update);
router.delete('/:id', requirePermission('results:delete'), controller.remove);

export default router;
