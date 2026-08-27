import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import * as controller from '../controllers/school.controller.js';
import { createSchoolSchema, updateSchoolSchema, batchDeleteSchema } from '../validations/school.validation.js';
import { paginationQuery } from '../validations/common.validation.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const listQuery = paginationQuery.extend({
  pageSize: z.coerce.number().int().min(1).max(1000).optional(),
  zone: z.enum(['URBANA', 'RURAL', 'SEDE', 'ESTRADAS', 'ILHAS']).optional(),
  situation: z.enum(['ATIVA', 'PARALISADA', 'INATIVA']).optional(),
  district: z.string().max(120).optional(),
  schoolType: z.string().max(120).optional(),
  hasCoordinates: z.enum(['true', 'false']).optional(),
  programId: z.string().uuid().optional(),
  technicianId: z.string().uuid().optional(),
  hasTechnician: z.enum(['true', 'false']).optional(),
});

router.get('/', requirePermission('schools:read'), validate({ query: listQuery }), controller.list);
router.get('/stats', requirePermission('schools:read'), controller.stats);
router.get('/filters', requirePermission('schools:read'), controller.filters);
router.get('/export', requirePermission('schools:export'), controller.exportSchools);
router.post('/', requirePermission('schools:write'), validate({ body: createSchoolSchema }), controller.create);
router.post(
  '/batch-delete',
  requirePermission('schools:delete'),
  validate({ body: batchDeleteSchema }),
  controller.batchRemove,
);
router.get('/:id', requirePermission('schools:read'), controller.get);
router.put('/:id', requirePermission('schools:write'), validate({ body: updateSchoolSchema }), controller.update);
router.delete('/:id', requirePermission('schools:delete'), controller.remove);
router.get('/:id/history', requirePermission('schools:read'), controller.history);

export default router;
