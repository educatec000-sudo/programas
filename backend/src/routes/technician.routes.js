import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authenticate, requirePermission } from '../middlewares/auth.js';
import * as controller from '../controllers/technician.controller.js';
import {
  createLinksSchema,
  updateLinkSchema,
  geralQuerySchema,
  techniciansQuerySchema,
} from '../validations/technician.validation.js';

const router = Router();
router.use(authenticate);

// rotas literais antes de quaisquer parâmetros
router.get('/stats', requirePermission('technicians:read'), controller.stats);
router.get('/export', requirePermission('technicians:export'), controller.exportGeral);
router.get(
  '/technicians',
  requirePermission('technicians:read'),
  validate({ query: techniciansQuerySchema }),
  controller.technicians,
);
router.get('/escola/:id', requirePermission('technicians:read'), controller.bySchool);
router.get('/tecnico/:id', requirePermission('technicians:read'), controller.byTechnician);

router.get(
  '/',
  requirePermission('technicians:read'),
  validate({ query: geralQuerySchema }),
  controller.geral,
);
router.post('/', requirePermission('technicians:write'), validate({ body: createLinksSchema }), controller.create);
router.put('/:id', requirePermission('technicians:write'), validate({ body: updateLinkSchema }), controller.update);
router.delete('/:id', requirePermission('technicians:delete'), controller.remove);

export default router;
