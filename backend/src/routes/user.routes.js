import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import * as controller from '../controllers/user.controller.js';
import {
  createUserSchema,
  updateUserSchema,
  adminResetPasswordSchema,
} from '../validations/user.validation.js';
import { paginationQuery } from '../validations/common.validation.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const listQuery = paginationQuery.extend({
  roleId: z.string().uuid().optional(),
  active: z.enum(['true', 'false']).optional(),
});

router.get('/', requirePermission('users:read'), validate({ query: listQuery }), controller.list);
router.post('/', requirePermission('users:write'), validate({ body: createUserSchema }), controller.create);
router.get('/:id', requirePermission('users:read'), controller.get);
router.put('/:id', requirePermission('users:write'), validate({ body: updateUserSchema }), controller.update);
router.delete('/:id', requirePermission('users:delete'), controller.remove);
router.post(
  '/:id/reset-password',
  requirePermission('users:write'),
  validate({ body: adminResetPasswordSchema }),
  controller.resetPassword,
);
router.post('/:id/unlock', requirePermission('users:write'), controller.unlock);

export default router;
