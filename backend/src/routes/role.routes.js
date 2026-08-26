import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import * as controller from '../controllers/role.controller.js';
import { createRoleSchema, updateRoleSchema } from '../validations/user.validation.js';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('roles:read'), controller.list);
router.get('/permissions', requirePermission('roles:read'), controller.permissions);
router.post('/', requirePermission('roles:write'), validate({ body: createRoleSchema }), controller.create);
router.put('/:id', requirePermission('roles:write'), validate({ body: updateRoleSchema }), controller.update);

export default router;
