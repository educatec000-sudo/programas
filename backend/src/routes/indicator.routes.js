import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import * as controller from '../controllers/indicator.controller.js';
import {
  createIndicatorSchema,
  updateIndicatorSchema,
  createCategorySchema,
} from '../validations/indicator.validation.js';
import { paginationQuery } from '../validations/common.validation.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const listQuery = paginationQuery.extend({
  categoryId: z.string().uuid().optional(),
  status: z.enum(['ATIVO', 'INATIVO']).optional(),
});

router.get('/', requirePermission('indicators:read'), validate({ query: listQuery }), controller.list);
router.get('/categories', requirePermission('indicators:read'), controller.listCategories);
router.post(
  '/categories',
  requirePermission('indicators:write'),
  validate({ body: createCategorySchema }),
  controller.createCategory,
);
router.put(
  '/categories/:id',
  requirePermission('indicators:write'),
  validate({ body: createCategorySchema.partial() }),
  controller.updateCategory,
);
router.delete('/categories/:id', requirePermission('indicators:write'), controller.deleteCategory);

router.post('/', requirePermission('indicators:write'), validate({ body: createIndicatorSchema }), controller.create);
router.get('/:id', requirePermission('indicators:read'), controller.get);
router.put('/:id', requirePermission('indicators:write'), validate({ body: updateIndicatorSchema }), controller.update);
router.delete('/:id', requirePermission('indicators:delete'), controller.remove);

export default router;
